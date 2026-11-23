// Reconnexion AWS au clic sur « AWS expirée » : seul le script npm de la configuration est lancé.
import { afterAll, describe, expect, it } from "vitest";
import type { Config } from "../src/server/config.ts";
import { reconnectAws, reconnectTarget } from "../src/server/sources/aws-reconnect.ts";
import { makeConfig, remove, tempDir, writeFiles } from "./helpers.ts";

// fausse clé construite à l'exécution, pour ne pas déclencher le contrôle des secrets du commit
const FAKE_KEY = `ASIA${"ABCDEFGHIJKLMNOP"}`;
const project = tempDir();
writeFiles(project, {
  "package.json": JSON.stringify({
    name: "demo",
    scripts: { "aws:login": "echo connected", broken: `echo 'token ${FAKE_KEY} refusé' >&2 && exit 3` },
  }),
});
afterAll(() => remove(project));

const withReconnect = (reconnect?: Config["aws"]["reconnect"]): Config => {
  const cfg = makeConfig(project);
  return { ...cfg, aws: { ...cfg.aws, reconnect } };
};

describe("reconnectTarget", () => {
  it("refuse quand rien n'est configuré", () => expect(reconnectTarget(withReconnect())).toHaveProperty("error"));

  it.each([
    ["espace", "connect ToAws"],
    ["point-virgule", "aws:login; rm -rf ~"],
    ["substitution", "$(whoami)"],
    ["vide", ""],
  ])("refuse un nom de script invalide : %s", (_l, script) => expect(reconnectTarget(withReconnect({ projectPath: project, script }))).toHaveProperty("error"));

  it("refuse un dossier sans package.json", () => expect(reconnectTarget(withReconnect({ projectPath: "/tmp/n2-nope-does-not-exist", script: "aws:login" }))).toHaveProperty("error"));

  it("accepte le dossier et le script configurés", () => expect(reconnectTarget(withReconnect({ projectPath: project, script: "aws:login" }))).toEqual({ cwd: project, script: "aws:login" }));
});

describe("reconnectAws", () => {
  it("réussit quand le script se termine sans erreur", async () => {
    expect(await reconnectAws(withReconnect({ projectPath: project, script: "aws:login" }))).toEqual({ ok: true });
  });

  it("renvoie la fin de la sortie, sans secret, quand le script échoue", async () => {
    const r = await reconnectAws(withReconnect({ projectPath: project, script: "broken" }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatchObject({ key: "srv_npm_script_failed", params: { code: "3" } });
    expect(r.error.params?.detail).toContain("ASIA••••");
    expect(JSON.stringify(r.error)).not.toContain(FAKE_KEY);
  });

  it("un second appel pendant la connexion attend la même commande", async () => {
    const cfg = withReconnect({ projectPath: project, script: "aws:login" });
    const a = reconnectAws(cfg);
    expect(reconnectAws(cfg)).toBe(a);
    await a;
  });
});
