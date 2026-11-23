// Le hook pre-commit doit refuser les fichiers sensibles et tout ce qui ressemble à un secret.
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { gitInit, remove, tempDir, writeFiles } from "./helpers.ts";

const SCRIPT = join(import.meta.dirname, "..", "scripts", "check-secrets.sh");
let repo: string;
afterEach(() => remove(repo));

/** `words` : liste de noms interdits (comme ~/.config/n2/forbidden-words) ; jamais ta vraie liste pendant les tests */
function stage(files: Record<string, string>, words = "") {
  repo = tempDir("n2-hook-");
  mkdirSync(join(repo, "scripts"));
  copyFileSync(SCRIPT, join(repo, "scripts", "check-secrets.sh"));
  writeFiles(repo, files);
  gitInit(repo);
  execFileSync("git", ["add", "-f", "-A"], { cwd: repo });
  const env = { ...process.env, N2_FORBIDDEN_WORDS_FILE: "/dev/null", N2_FORBIDDEN_WORDS: words };
  return spawnSync("sh", ["scripts/check-secrets.sh", "--staged"], { cwd: repo, encoding: "utf8", env });
}

// Faux secrets assemblés à l'exécution : le fichier de test lui-même passe le garde-fou.
const fake = (prefix: string) => `${prefix}${"Q".repeat(32)}`;

describe("check-secrets.sh --staged", () => {
  it("laisse passer du code sans secret", () => {
    expect(stage({ "src/a.ts": "export const a = 1;\n" }).status).toBe(0);
  });

  it.each(["config.local.json", ".env", ".env.production", "secrets/id_ed25519", "cert.pem", "deploy.key", ".sentryclirc"])(
    "bloque le fichier sensible %s",
    (file) => {
      const r = stage({ [file]: "x\n" });
      expect(r.status).toBe(1);
      expect(r.stdout).toContain("fichiers sensibles");
    },
  );

  it.each([
    ["token GitHub", () => `const t = "${fake("gh" + "p_")}";`],
    ["token Sentry", () => `token: ${fake("sntr" + "yu_")}`],
    ["token Atlassian", () => `x = ${fake("ATA" + "TT")}`],
    ["clé AWS", () => `aws = "AKIA${"Z".repeat(16)}"`],
    ["clé privée", () => `-----BEGIN ${"OPENSSH"} PRIVATE KEY-----`],
  ])("bloque un %s dans le contenu", (_label, line) => {
    const r = stage({ "src/a.ts": `${line()}\n` });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("secret");
  });
});

describe("noms interdits (liste hors du dépôt)", () => {
  // une liste inventée : la vraie est dans ~/.config/n2/forbidden-words et dans le secret N2_FORBIDDEN_WORDS de la CI
  const words = "# commentaire ignoré\n@acme-corp\\.example\n[Pp]rojet-[Ss]ecret\n";

  it.each([
    ["email pro", "// contact : quelqu.un@acme-corp.example"],
    ["nom du projet", 'const prefix = "projet-secret-";'],
    ["nom du projet, autre casse", 'const PREFIX = "PROJET-SECRET-";'],
  ])("bloque %s quand il est dans la liste", (_label, line) => {
    const r = stage({ "src/a.ts": `${line}\n` }, words);
    expect(r.status).toBe(1);
  });

  it("sans liste : seuls les secrets sont vérifiés, et le script le dit", () => {
    const r = stage({ "src/a.ts": 'const prefix = "projet-secret-";\n' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Aucune liste de noms interdits");
  });
});
