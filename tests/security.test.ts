// Garde-fous : liens ouverts dans Chrome, fichiers ouverts dans l'IDE, masquage des secrets.
import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { isAllowedUrl, registerDocUrl } from "../src/server/open.ts";
import { redact } from "../src/server/run.ts";
import { resolveProjectFile } from "../src/server/sources/codemap.ts";
import { demoMonorepo, makeConfig, remove } from "./helpers.ts";

const root = demoMonorepo();
const cfg = { ...makeConfig(root), deploy: { pipelinePrefix: "demo-", envUrl: "https://preview-{slug}.demo.example/" } };
afterAll(() => remove(root));

describe("isAllowedUrl : seuls les sites attendus s'ouvrent dans Chrome", () => {
  it.each([
    "https://github.com/demo/demo/pull/1",
    "https://demo.atlassian.net/browse/DEMO-1",
    "https://sentry.io/x",
    "https://demo.sentry.io/issues/1",
    "https://eu-west-1.console.aws.amazon.com/cloudwatch/home",
    "https://www.npmjs.com/package/react",
    "https://teams.microsoft.com/l/meetup-join/19%3ameeting_x/0",
    "https://outlook.office.com/calendar/view/week",
    "https://microsoft.com/devicelogin",
    "https://demo.slack.com/archives/C1/p1700000000123456",
    "https://preview-abc-123.demo.example/",
    "https://eu-west-1.console.aws.amazon.com/codesuite/codepipeline/pipelines/x/view",
  ])("accepte %s", (url) => expect(isAllowedUrl(cfg, url)).toBe(true));

  it.each([
    ["http (pas https)", "http://github.com/x"],
    ["autre site", "https://evil.example/x"],
    ["faux sous-domaine", "https://github.com.evil.example/x"],
    ["autre site Atlassian", "https://other.atlassian.net/x"],
    ["faux sous-domaine Microsoft", "https://teams.microsoft.com.evil.example/x"],
    ["autre site Microsoft", "https://evil.microsoft.com.example/x"],
    ["faux domaine Slack", "https://demo.slack.com.evil.example/x"],
    ["autre sous-domaine de l'environnement", "https://evil.demo.example/"],
    ["faux environnement", "https://preview-x.demo.example.evil.example/"],
    ["schéma javascript", "javascript:alert(1)"],
    ["schéma file", "file:///etc/passwd"],
    ["pas une URL", "github.com"],
    ["trop long", `https://github.com/${"a".repeat(2100)}`],
  ])("refuse : %s", (_label, url) => expect(isAllowedUrl(cfg, url)).toBe(false));

  it("sans deploy.envUrl, aucun environnement de branche ne s'ouvre", () => {
    expect(isAllowedUrl(makeConfig(root), "https://preview-abc-123.demo.example/")).toBe(false);
  });

  it("refuse ce qui n'est pas une chaîne", () => {
    for (const v of [undefined, null, 42, { url: "https://github.com" }]) expect(isAllowedUrl(cfg, v)).toBe(false);
  });

  it("accepte un lien de doc seulement après qu'il a été lu dans le registre npm, et à l'identique", () => {
    const doc = "https://docs.example-lib.dev/guide";
    expect(isAllowedUrl(cfg, doc)).toBe(false);
    registerDocUrl(doc);
    expect(isAllowedUrl(cfg, doc)).toBe(true);
    expect(isAllowedUrl(cfg, `${doc}/autre`)).toBe(false);
  });
});

describe("resolveProjectFile : l'IDE n'ouvre que des fichiers du projet", () => {
  it("accepte un fichier du projet et une ligne valide", () => {
    const r = resolveProjectFile(cfg, "apps/web/README.md", 3);
    expect(r?.path.endsWith("apps/web/README.md")).toBe(true);
    expect(r?.line).toBe(3);
  });

  it.each([
    ["remontée ../", "../../etc/hosts", 1],
    ["chemin absolu hors projet", "/etc/hosts", 1],
    ["fichier inexistant", "apps/web/nope.ts", 1],
    ["ligne 0", "apps/web/README.md", 0],
    ["ligne négative", "apps/web/README.md", -1],
    ["ligne non entière", "apps/web/README.md", 1.5],
    ["ligne injectée", "apps/web/README.md", "1; rm -rf /"],
    ["octet nul", "apps/web/README.md\0.ts", 1],
    ["pas une chaîne", 42, 1],
  ])("refuse : %s", (_label, file, line) => expect(resolveProjectFile(cfg, file, line)).toBeNull());

  it("refuse un lien symbolique qui sort du projet", () => {
    symlinkSync("/etc/hosts", join(root, "sortie"));
    expect(resolveProjectFile(cfg, "sortie", 1)).toBeNull();
  });
});

describe("redact : les messages d'erreur envoyés au navigateur ne contiennent pas de secret", () => {
  // Les faux secrets sont assemblés à l'exécution : rien qui ressemble à un token dans le code versionné.
  const fake = (prefix: string, n = 30) => `${prefix}${"A1b2".repeat(n).slice(0, n)}`;

  it.each([
    ["token GitHub", fake("gh" + "p_")],
    ["token OAuth GitHub", fake("gh" + "o_")],
    ["PAT GitHub", fake("github" + "_pat_")],
    ["token Sentry", fake("sntr" + "ys_")],
    ["token Atlassian", fake("ATA" + "TT")],
    ["token Slack", fake("xo" + "xp-")],
  ])("masque un %s", (_label, secret) => {
    const out = redact(`échec : ${secret} refusé`);
    expect(out).not.toContain(secret);
    expect(out).toContain("••••");
  });

  it("masque une clé AWS et un en-tête Bearer", () => {
    const key = `AKIA${"ABCDEFGHIJKLMNOP"}`;
    const out = redact(`key=${key} Authorization: Bearer abc.def.ghi`);
    expect(out).not.toContain(key);
    expect(out).not.toContain("abc.def.ghi");
  });

  it("masque un jeton Microsoft (JWT) et un lien d'agenda publié", () => {
    const jwt = `${"ey" + "J0eXAiOiJKV1Qi"}.${"ey" + "JhdWQiOiJodHRwcyJ9"}.c2lnbmF0dXJl`;
    const ics = `https://outlook.office365.com/${"owa" + "/calendar"}/abc123@example.com/def456/calendar.ics`;
    const out = redact(`échec ${jwt} sur ${ics}`);
    expect(out).not.toContain(jwt);
    expect(out).not.toContain("abc123");
  });

  it("tronque les messages très longs", () => {
    expect(redact("x".repeat(1000)).length).toBeLessThanOrEqual(400);
  });
});
