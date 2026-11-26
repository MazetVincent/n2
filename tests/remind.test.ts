// « Remind me » : lecture du Markdown, modifications ligne à ligne, conflits, et écriture du fichier côté serveur.
import { existsSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyRemindChange, groupRemind, inlineParts, parseRemind, RemindConflict, RemindUnsafe } from "../src/features/remind/logic.ts";
import { readPreferences, applyPreferences } from "../src/features/prefs/logic.ts";
import { remove, tempDir } from "./helpers.ts";

const hash = (s: string) => `h${s.length}`;

const md = `# Remind me

- [ ] Relire le cache
  - sous-point gardé avec son rappel
- [x] Mettre à jour Biome
- Point sans case

## Plus tard

* [X] Essayer bun test
+ [ ] Demander à l'équipe

\`\`\`
- [ ] pas un rappel (bloc de code)
\`\`\`

Un paragraphe.
`;

describe("parseRemind", () => {
  it("lit les rappels au premier niveau, avec leur section et leur état", () => {
    expect(parseRemind(md)).toEqual([
      { line: 2, text: "Relire le cache", done: false, section: null },
      { line: 4, text: "Mettre à jour Biome", done: true, section: null },
      { line: 5, text: "Point sans case", done: false, section: null },
      { line: 9, text: "Essayer bun test", done: true, section: "Plus tard" },
      { line: 10, text: "Demander à l'équipe", done: false, section: "Plus tard" },
    ]);
  });

  it("un fichier vide n'a aucun rappel", () => {
    expect(parseRemind("")).toEqual([]);
  });
});

describe("applyRemindChange", () => {
  it("ajoute après le dernier rappel, sur une seule ligne, sans toucher au texte qui suit", () => {
    expect(applyRemindChange("- [ ] a", { op: "add", text: "  b\n  c " }, hash)).toBe("- [ ] a\n- [ ] b c");
    expect(applyRemindChange("- [ ] a\n\nUn paragraphe.\n", { op: "add", text: "b" }, hash)).toBe("- [ ] a\n- [ ] b\n\nUn paragraphe.\n");
    expect(applyRemindChange("# Titre\n\nNotes.\n", { op: "add", text: "b" }, hash)).toBe("# Titre\n\nNotes.\n- [ ] b\n");
  });

  it("ajoute dans la première section : après ses rappels (et leurs sous-points), sinon avant le premier « ## »", () => {
    const out = applyRemindChange(md, { op: "add", text: "nouveau" }, hash);
    expect(out.split("\n").slice(2, 7)).toEqual(["- [ ] Relire le cache", "  - sous-point gardé avec son rappel", "- [x] Mettre à jour Biome", "- Point sans case", "- [ ] nouveau"]);
    expect(parseRemind(out).find((i) => i.text === "nouveau")?.section).toBeNull();
    expect(applyRemindChange("# Remind me\n\n## Plus tard\n\n- [ ] x\n", { op: "add", text: "nouveau" }, hash)).toBe("# Remind me\n\n- [ ] nouveau\n\n## Plus tard\n\n- [ ] x\n");
  });

  it("un fichier vide reçoit un titre", () => {
    expect(applyRemindChange("", { op: "add", text: "premier" }, hash)).toBe("# Remind me\n\n- [ ] premier\n");
  });

  it("coche et décoche sans toucher au reste ; un point sans case en reçoit une", () => {
    const done = applyRemindChange(md, { op: "toggle", line: 2, text: "Relire le cache", done: true }, hash);
    expect(done.split("\n")[2]).toBe("- [x] Relire le cache");
    expect(done.split("\n").filter((_, i) => i !== 2)).toEqual(md.split("\n").filter((_, i) => i !== 2));
    expect(applyRemindChange(md, { op: "toggle", line: 9, text: "Essayer bun test", done: false }, hash).split("\n")[9]).toBe("* [ ] Essayer bun test");
    expect(applyRemindChange(md, { op: "toggle", line: 5, text: "Point sans case", done: true }, hash).split("\n")[5]).toBe("- [x] Point sans case");
  });

  it("cocher pose l'état voulu : déjà coché ailleurs, rien ne change (pas de bascule à l'envers)", () => {
    expect(applyRemindChange(md, { op: "toggle", line: 4, text: "Mettre à jour Biome", done: true }, hash)).toBe(md);
  });

  it("supprime un rappel avec ses sous-points", () => {
    const out = applyRemindChange(md, { op: "remove", line: 2, text: "Relire le cache" }, hash);
    expect(out).not.toContain("Relire le cache");
    expect(out).not.toContain("sous-point");
    expect(parseRemind(out)).toHaveLength(4);
  });

  it("vide les rappels faits, en gardant le reste", () => {
    const out = applyRemindChange(md, { op: "clearDone", version: hash(md) }, hash);
    expect(parseRemind(out).map((i) => i.text)).toEqual(["Relire le cache", "Point sans case", "Demander à l'équipe"]);
    expect(out).toContain("- [ ] pas un rappel (bloc de code)");
    expect(out).toContain("Un paragraphe.");
    // le fichier a changé depuis la lecture : des rappels faits que la page n'a pas vus ne sont pas supprimés
    expect(() => applyRemindChange(md, { op: "clearDone", version: "autre" }, hash)).toThrow(RemindConflict);
  });

  it("ignore l'en-tête YAML d'Obsidian : ni rappels, ni ajout dedans", () => {
    const fm = "---\ntags:\n- travail\n- todo\n---\n\n- [ ] vrai rappel\n";
    expect(parseRemind(fm).map((i) => i.text)).toEqual(["vrai rappel"]);
    expect(applyRemindChange(fm, { op: "add", text: "b" }, hash)).toBe("---\ntags:\n- travail\n- todo\n---\n\n- [ ] vrai rappel\n- [ ] b\n");
    expect(applyRemindChange("---\na: 1\n---\n", { op: "add", text: "b" }, hash)).toBe("---\na: 1\n---\n- [ ] b\n");
  });

  it("un séparateur « * * * » n'est pas un rappel ; un bloc de code plus long se ferme au bon endroit", () => {
    expect(parseRemind("- [ ] a\n* * *\n- - -\n- [ ] b")).toHaveLength(2);
    expect(parseRemind("````\n```\n- [ ] dans le code\n````\n- [ ] dehors").map((i) => i.text)).toEqual(["dehors"]);
  });

  it("supprime un rappel avec un bloc de code, et son détail après une ligne vide", () => {
    const code = "- [x] fait\n  ```\ndu code\n  ```\n- [ ] garder\n- [ ] aussi\n";
    expect(applyRemindChange(code, { op: "clearDone", version: hash(code) }, hash)).toBe("- [ ] garder\n- [ ] aussi\n");
    const loose = "- [ ] a\n- [x] b\n\n  détail de b\n\nSuite.\n";
    expect(applyRemindChange(loose, { op: "remove", line: 1, text: "b" }, hash)).toBe("- [ ] a\n\nSuite.\n");
  });

  it("ne touche pas à un rappel dont le bloc de code ne se ferme pas", () => {
    const open = "- [ ] a\n  ```\ncode sans fin\n";
    expect(() => applyRemindChange(open, { op: "remove", line: 0, text: "a" }, hash)).toThrow(RemindUnsafe);
  });

  it("garde les fins de ligne de chaque ligne (Windows, ou mélangées)", () => {
    const crlf = "- [ ] a\r\n- [ ] b\r\n";
    expect(applyRemindChange(crlf, { op: "toggle", line: 1, text: "b", done: true }, hash)).toBe("- [ ] a\r\n- [x] b\r\n");
    expect(applyRemindChange(crlf, { op: "add", text: "c" }, hash)).toBe("- [ ] a\r\n- [ ] b\r\n- [ ] c\r\n");
    const mixed = "- [ ] a\r\n- [ ] b\nNote\n";
    expect(applyRemindChange(mixed, { op: "toggle", line: 0, text: "a", done: true }, hash)).toBe("- [x] a\r\n- [ ] b\nNote\n");
  });

  it("refuse de toucher un rappel qui n'est plus à sa ligne (fichier modifié ailleurs)", () => {
    expect(() => applyRemindChange(md, { op: "toggle", line: 2, text: "Autre chose", done: true }, hash)).toThrow(RemindConflict);
    expect(() => applyRemindChange(md, { op: "remove", line: 3, text: "sous-point gardé avec son rappel" }, hash)).toThrow(RemindConflict);
  });

  it("réécrit tout seulement depuis la version lue", () => {
    expect(applyRemindChange("a", { op: "replace", content: "b", version: hash("a") }, hash)).toBe("b");
    expect(() => applyRemindChange("a modifié", { op: "replace", content: "b", version: hash("a") }, hash)).toThrow(RemindConflict);
  });
});

describe("groupRemind", () => {
  it("à revoir par section (ordre du fichier), faits à part", () => {
    const { open, done } = groupRemind(parseRemind(md));
    expect(open.map((g) => [g.section, g.items.map((i) => i.text)])).toEqual([
      [null, ["Relire le cache", "Point sans case"]],
      ["Plus tard", ["Demander à l'équipe"]],
    ]);
    expect(done.map((i) => i.text)).toEqual(["Mettre à jour Biome", "Essayer bun test"]);
  });
});

describe("inlineParts", () => {
  it("code, gras, liens Markdown et adresses nues ; le reste en texte", () => {
    expect(inlineParts("voir `cache.ts` et **vite** sur [la PR](https://github.com/a/b/pull/1), ou https://exemple.test/x.")).toEqual([
      { kind: "text", text: "voir " },
      { kind: "code", text: "cache.ts" },
      { kind: "text", text: " et " },
      { kind: "bold", text: "vite" },
      { kind: "text", text: " sur " },
      { kind: "link", text: "la PR", href: "https://github.com/a/b/pull/1" },
      { kind: "text", text: ", ou " },
      { kind: "link", text: "https://exemple.test/x", href: "https://exemple.test/x" },
      { kind: "text", text: "." },
    ]);
  });

  it("un lien qui n'est pas http(s) reste du texte", () => {
    expect(inlineParts("[clic](javascript:alert(1))")).toEqual([{ kind: "text", text: "[clic](javascript:alert(1))" }]);
  });
});

describe("préférences", () => {
  it("chemin affiché (défaut sans config) ; les préférences ne l'écrivent jamais (ADR 0010)", () => {
    const p = readPreferences({ libs: { projectPath: "~/p" } });
    expect(p.remindPath).toBe("~/.config/n2/remind.md");
    expect(readPreferences({ libs: { projectPath: "~/p" }, remind: { path: "~/notes/r.md" } }).remindPath).toBe("~/notes/r.md");
    expect(applyPreferences({ libs: { projectPath: "~/p" } }, { ...p, remindPath: "~/.claude/CLAUDE.md" })).not.toHaveProperty("remind");
    expect(applyPreferences({ libs: { projectPath: "~/p" }, remind: { path: "~/notes/r.md" } }, { ...p, remindPath: "/ailleurs.md" }).remind).toEqual({ path: "~/notes/r.md" });
  });
});

// ---------- Côté serveur : le vrai fichier ----------
let setting = "";
vi.mock("../src/server/config.ts", async (orig) => ({ ...(await orig<typeof import("../src/server/config.ts")>()), loadConfig: () => ({ remind: { path: setting } }) }));
const { changeRemind, checkRemindPath, readRemind } = await import("../src/server/sources/remind.ts");

describe("fichier des rappels", () => {
  let dir = "";
  beforeEach(() => {
    dir = tempDir("n2-remind-");
    setting = join(dir, "remind.md");
  });
  afterEach(() => remove(dir));

  it("créé au premier ajout, en 600", () => {
    expect(readRemind()).toMatchObject({ exists: false, content: "", items: [] });
    const after = changeRemind({ op: "add", text: "revoir la PR" });
    expect(after).toMatchObject({ exists: true, items: [{ text: "revoir la PR", done: false }] });
    expect(readFileSync(setting, "utf8")).toBe("# Remind me\n\n- [ ] revoir la PR\n");
    expect(statSync(setting).mode & 0o777).toBe(0o600);
  });

  it("garde les droits d'un fichier existant et réécrit le fichier pointé par un lien", () => {
    const real = join(dir, "vrai.md");
    writeFileSync(real, "- [ ] a\n", { mode: 0o644 });
    symlinkSync(real, setting);
    changeRemind({ op: "toggle", line: 0, text: "a", done: true });
    expect(readFileSync(real, "utf8")).toBe("- [x] a\n");
    expect(statSync(real).mode & 0o777).toBe(0o644);
  });

  it("refuse une réécriture complète si le fichier a changé ailleurs", () => {
    writeFileSync(setting, "- [ ] a\n");
    const { version } = readRemind();
    writeFileSync(setting, "- [ ] a\n- [ ] ajouté dans l'éditeur\n");
    expect(() => changeRemind({ op: "replace", content: "écrasé", version })).toThrow();
    expect(readFileSync(setting, "utf8")).toContain("ajouté dans l'éditeur");
  });

  it("refuse un fichier trop gros", () => {
    writeFileSync(setting, "x".repeat(300 * 1024));
    expect(() => readRemind()).toThrow();
    writeFileSync(setting, "");
    expect(() => changeRemind({ op: "replace", content: "x".repeat(300 * 1024), version: readRemind().version })).toThrow();
  });

  it("chemins acceptés : un .md absolu, dans un dossier qui existe", () => {
    expect(checkRemindPath(join(dir, "ok.md"))).toBeNull();
    expect(checkRemindPath("relatif.md")).toBe("srv_remind_path_invalid");
    expect(checkRemindPath(join(dir, "notes.txt"))).toBe("srv_remind_path_invalid");
    mkdirSync(join(dir, "dossier.md"));
    expect(checkRemindPath(join(dir, "dossier.md"))).toBe("srv_remind_path_invalid");
    expect(checkRemindPath(join(dir, "absent", "r.md"))).toBe("srv_remind_dir_missing");
    expect(existsSync(join(dir, "absent"))).toBe(false);
    // lien cassé, ou qui mène à autre chose qu'un .md : refusé
    symlinkSync(join(dir, "nulle-part.md"), join(dir, "casse.md"));
    expect(checkRemindPath(join(dir, "casse.md"))).toBe("srv_remind_path_invalid");
    writeFileSync(join(dir, "config.json"), "{}");
    symlinkSync(join(dir, "config.json"), join(dir, "vers-json.md"));
    expect(checkRemindPath(join(dir, "vers-json.md"))).toBe("srv_remind_path_invalid");
  });
});
