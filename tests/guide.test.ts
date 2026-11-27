// Guide de l'équipe : lecture du fichier HTML compilé (sans exécuter son JS), liens guide ↔ fichiers, fraîcheur des citations.
// Le guide de test est un faux bundle qui reprend la forme du vrai (tables de pages, de sections, glossaire, pied de page).
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createContext, runInContext } from "node:vm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readLiteral } from "../src/features/guide/literal.ts";
import { DEFAULT_THEME, type DayTheme, type NightTheme, type ThemeMode } from "../src/features/theme/logic.ts";
import { fileRefs, guideFromJson, parseGuide } from "../src/features/guide/parse.ts";
import { readGuideJson } from "../src/features/guide/format/schema.ts";
import { freshnessMarkdown, isGuideTarget, resolveRefs, sectionsForFiles, sectionsUnder } from "../src/features/guide/logic.ts";
import { buildIndex, searchIndex } from "../src/features/search/index.ts";
import { embedGuide, guideSettings, guideStyle, type GuideSettings } from "../src/features/guide/embed.ts";
import { guideCsp } from "../src/routes/guide-html.ts";
import { allowedHosts } from "../src/server/session.ts";
import { COLORS } from "../src/styles/colors.ts";
import { THEME_COLORS } from "../src/styles/themes.ts";
import { fetchGuide, guideFreshness, indexGuide, parseHunks, staleRefs } from "../src/server/sources/guide.ts";
import type { GuideContent, GuideIndex } from "../src/server/types.ts";
import { gitInit, makeConfig, remove, tempDir, writeFiles } from "./helpers.ts";

const terms = (lang: string) =>
  ["hydration", "loader", "nitro", "query", "ssr"].map((t) => `${t}:{term:\`${t.toUpperCase()} ${lang}\`,short:\`Définition ${lang} de ${t}\`,body:\`Corps\`}`).join(",");

/** Faux guide compilé. `revised` : commit cité en pied de page comme révision. */
function fakeGuide(revised = "bbbbbbb"): string {
  const pageEn = `{title:\`Demo\`,inShort:{title:\`In short\`},open:{id:\`open-file\`,title:\`Open a [[file|file]]\`,sources:["\`apps/web/src/a.ts:3-5\`"],legacy:{id:\`old-id\`,sources:["\`apps/web/src/legacy.ts\`"]}},other:{id:\`other\`,heading:"Other",body:"See \`packages/x/src/b.ts\` and \`1a2b3c4d5:apps/web/src/a.ts:1\`",rows:[...Q.entries].map(e=>({a:e})),fn:()=>{return{x:1}}},loose:"\`apps/web/src/page-level.ts\` and \`next/font/local\` and \`https://x.y/z\`"}`;
  const pageFr = `{title:\`Démo\`,inShort:{title:\`En bref\`},open:{id:\`open-file\`,title:\`Ouvrir un [[file|fichier]]\`,sources:"\`apps/web/src/a.ts:3-5\`,\`docs/x.md\`".split(\`,\`),legacy:{id:\`old-id\`,sources:["\`apps/web/src/legacy.ts\`"]}},other:{id:\`other\`,heading:"Autre",body:"Voir \`packages/x/src/b.ts\` et \`1a2b3c4d5:apps/web/src/a.ts:1\`",ok:!0,no:!1,u:void 0,n:-1.5e2},loose:"\`apps/web/src/page-level.ts\` et \`next/font/local\`"}`;
  return `<!doctype html><html><head><script type="module">
var Wv={en:{"guide/demo":{page:[1,0,0,0],sections:{"open-file":[1,0,0,0],other:[1,0,0,0]}}},fr:{"guide/demo":{page:[1,0,0,0],sections:{"open-file":[1,0,0,0],other:[1,0,0,0]}}}},
Cm={guide:{component:\`guide/Guide\`},"guide/demo":{component:\`guide/Demo\`,verifiedAgainst:\`abc1234\`}},
Aa=${pageEn},Bb=${pageFr},Gx={title:\`Technical\`},Gy={title:\`Technique\`},
Pt={en:{guide:Gx,"guide/demo":Aa},fr:{guide:Gy,"guide/demo":Bb}},
sv={${terms("EN")}},cv={${terms("FR")}},lv={en:sv,fr:cv},
Ft={footer:"Rédigé le 3 mars 2026 à partir de la branche \`master\` au \`commit:aaaaaaa\`. Révisé le 17 mars 2026 avec des faits cités au \`commit:${revised}\`."};
</script></head><body></body></html>`;
}

describe("lecture d'un littéral JavaScript", () => {
  it("lit objets, textes, gabarits, booléens compacts et listes « a,b ».split », sans évaluer le reste", () => {
    const src = 'x={a:"q\\"\\u00e9",b:`t${y}`,c:[1,,-2],d:!0,e:void 0,f:"p,q".split(","),g:foo.bar(1,{z:2}),h:(e)=>{return 1},"k-1":null,...rest}';
    const v = readLiteral(src, 2).value as Record<string, unknown>;
    expect(v.a).toBe('q"é');
    expect(v.b).toBe("t${y}");
    expect(v.c).toEqual([1, undefined, -2]);
    expect(v.d).toBe(true);
    expect(v.e).toBeUndefined();
    expect(v.f).toEqual(["p", "q"]);
    expect(v.g).toEqual({ $ref: "foo.bar(1,{z:2})" });
    expect(v.h).toEqual({ $ref: "(e)=>{return 1}" });
    expect(v["k-1"]).toBeNull();
  });
});

describe("citations de fichiers", () => {
  it("garde les chemins entre accents graves, avec lignes et commit, sans les URL", () => {
    expect(fileRefs("Voir `apps/web/a.ts:3-5`, `1a2b3c4:infra/b.ts:2`, `apps/web/src/server/` et `https://x.y/z`, `commit:abc1234`, `npm run test`")).toEqual([
      { path: "apps/web/a.ts", from: 3, to: 5 },
      { path: "infra/b.ts", from: 2, to: 2, commit: "1a2b3c4" },
      { path: "apps/web/src/server" },
    ]);
  });
});

describe("index du guide", () => {
  const g = parseGuide(fakeGuide());

  it("trouve les pages, leurs titres dans les deux langues et leur commit de vérification", () => {
    expect(g.warnings).toEqual([]);
    expect(g.pages.map((p) => p.key)).toEqual(["guide", "guide/demo"]);
    expect(g.pages[1]).toEqual({ key: "guide/demo", title: { fr: "Démo", en: "Demo" }, verifiedAgainst: "abc1234" });
  });

  it("rattache à chaque section les fichiers qu'elle cite, sans ceux de l'ancien identifiant", () => {
    const open = g.sections.find((s) => s.id === "open-file")!;
    expect(open.title).toEqual({ fr: "Ouvrir un fichier", en: "Open a file" });
    expect(open.files.map((f) => f.path)).toEqual(["apps/web/src/a.ts", "docs/x.md"]);
    const other = g.sections.find((s) => s.id === "other")!;
    expect(other.title).toEqual({ fr: "Autre", en: "Other" });
    expect(other.files).toEqual([{ path: "packages/x/src/b.ts" }, { path: "apps/web/src/a.ts", from: 1, to: 1, commit: "1a2b3c4d5" }]);
    // fichiers cités hors de toute section : rattachés à la page
    expect(g.sections.find((s) => s.page === "guide/demo" && s.id === null)!.files.map((f) => f.path)).toEqual(["apps/web/src/page-level.ts", "next/font/local"]);
  });

  it("lit le glossaire et le pied de page", () => {
    expect(g.terms).toHaveLength(5);
    expect(g.terms[0]).toEqual({ id: "hydration", term: { fr: "HYDRATION FR", en: "HYDRATION EN" }, short: { fr: "Définition FR de hydration", en: "Définition EN de hydration" } });
    expect([g.writtenAt, g.writtenCommit, g.revisedAt, g.revisedCommit]).toEqual(["3 mars 2026", "aaaaaaa", "17 mars 2026", "bbbbbbb"]);
  });

  it("signale un format inconnu au lieu d'échouer", () => {
    const empty = parseGuide("<html><script>var a={b:1}</script></html>");
    expect(empty.pages).toEqual([]);
    expect(empty.warnings.join(" ")).toMatch(/Table des pages introuvable/);
  });
});

describe("réglages du guide dans la config", () => {
  const dir = tempDir("n2-guide-");
  const path = join(dir, "guide.html");
  writeFileSync(path, fakeGuide());
  afterAll(() => remove(dir));
  const cfg = (guide: Record<string, unknown>) => ({ ...makeConfig(dir), guide: { path, ...guide }, ui: { secret: { unlocked: true } } });

  it("sans nom ni liens : « Guide de l'équipe » et aucune section proposée dans les onglets", async () => {
    const g = await fetchGuide(cfg({}));
    expect(g.name).toBeNull();
    expect(g.links).toEqual({ deploy: [], observability: [], prs: [] });
  });

  it("nom et sections des onglets lus dans la config, adresses invalides ignorées", async () => {
    const g = await fetchGuide(cfg({ name: "  Guide Démo  ", links: { deploy: ["guide/demo/open-file", "../../etc", 42, "a//b"], prs: "guide/demo" } }));
    expect(g.name).toBe("Guide Démo");
    expect(g.links).toEqual({ deploy: ["guide/demo/open-file"], observability: [], prs: [] });
  });
});

/** Le même faux guide en JSON (format n2-guide/1), comme l'exporte le build du guide. `extra` : section absente du HTML. */
function fakeGuideJson(revised = "bbbbbbb", extra = false) {
  const term = (t: string, lang: string) => ({ term: `${t.toUpperCase()} ${lang}`, short: `Définition ${lang} de ${t}`, body: "Corps" });
  const demo = (lang: "fr" | "en") => {
    const fr = lang === "fr";
    return {
      title: fr ? "Démo" : "Demo",
      inShort: { title: fr ? "En bref" : "In short" },
      open: {
        id: "open-file",
        title: fr ? "Ouvrir un [[file|fichier]]" : "Open a [[file|file]]",
        sources: fr ? ["`apps/web/src/a.ts:3-5`", "`docs/x.md`"] : ["`apps/web/src/a.ts:3-5`"],
        legacy: { id: "old-id", sources: ["`apps/web/src/legacy.ts`"] },
      },
      other: {
        id: "other",
        heading: fr ? "Autre" : "Other",
        body: `${fr ? "Voir" : "See"} \`packages/x/src/b.ts\` ${fr ? "et" : "and"} \`1a2b3c4d5:apps/web/src/a.ts:1\``,
        ...(fr ? { ok: true, no: false, n: -150 } : {}),
      },
      loose: fr ? "`apps/web/src/page-level.ts` et `next/font/local`" : "`apps/web/src/page-level.ts` and `next/font/local` and `https://x.y/z`",
      ...(extra ? { more: { id: "json-only", title: fr ? "Seulement en JSON" : "JSON only", body: "`apps/web/src/json-only.ts`" } } : {}),
    };
  };
  return {
    schema: "n2-guide/1",
    title: "Demo guide",
    inline: "guide",
    langs: ["en", "fr"],
    revision: {
      written: { date: { fr: "3 mars 2026", en: "3 March 2026" }, commit: "aaaaaaa" },
      revised: { date: { fr: "17 mars 2026", en: "17 March 2026" }, commit: revised },
    },
    pages: [
      { key: "guide", component: "guide/Guide", title: { fr: "Technique", en: "Technical" }, sections: [], text: { fr: { title: "Technique" }, en: { title: "Technical" } } },
      {
        key: "guide/demo",
        component: "guide/Demo",
        verifiedAgainst: "abc1234",
        title: { fr: "Démo", en: "Demo" },
        sections: [{ id: "open-file" }, { id: "other" }, ...(extra ? [{ id: "json-only" }] : [])],
        text: { fr: demo("fr"), en: demo("en") },
      },
    ],
    glossary: ["hydration", "loader", "nitro", "query", "ssr"].map((t) => ({ id: t, text: { fr: term(t, "FR"), en: term(t, "EN") } })),
  };
}

describe("guide en JSON (n2-guide/1)", () => {
  const index = ({ modifiedAt: _, warnings: __, ...g }: ReturnType<typeof parseGuide>) => g;

  it("donne le même index que le HTML du même guide", () => {
    const fromJson = guideFromJson(readGuideJson(JSON.stringify(fakeGuideJson())));
    expect(fromJson.warnings).toEqual([]);
    expect(index(fromJson)).toEqual(index(parseGuide(fakeGuide())));
  });

  it("refuse un autre format en disant quel champ ne va pas", () => {
    expect(() => readGuideJson("{")).toThrow(/illisible/);
    expect(() => readGuideJson(JSON.stringify({ schema: "n2-guide/2" }))).toThrow(/format "n2-guide\/2" inconnu/);
    const bad = fakeGuideJson();
    (bad.pages[1] as { verifiedAgainst: string }).verifiedAgainst = "pas un commit";
    expect(() => readGuideJson(JSON.stringify(bad))).toThrow(/pages\.1\.verifiedAgainst/);
  });

  it("garde le JSON seulement s'il vient du même guide que le HTML, et le dit sinon", () => {
    const html = fakeGuide();
    const used = indexGuide(html, JSON.stringify(fakeGuideJson("bbbbbbb", true)), "t");
    expect(used.sections.some((s) => s.id === "json-only")).toBe(true);
    for (const json of [JSON.stringify(fakeGuideJson("ccccccc", true)), "pas du JSON"]) {
      const fallback = indexGuide(html, json, "t");
      expect(fallback.sections.some((s) => s.id === "json-only")).toBe(false);
      expect(fallback.warnings[0]).toMatch(/index lu dans le HTML/);
    }
    expect(indexGuide(html, null, "t").warnings).toEqual([]);
  });

  it("reconnaît un commit écrit court d'un côté et long de l'autre", () => {
    const html = fakeGuide("bbbbbbb");
    const doc = fakeGuideJson("bbbbbbb0123456789", true);
    doc.revision.written.commit = "aaaaaaa0123456789";
    const g = indexGuide(html, JSON.stringify(doc), "t");
    expect(g.warnings).toEqual([]);
    expect(g.sections.some((s) => s.id === "json-only")).toBe(true);
  });

  it("sans pied de page dans le HTML : prend le JSON, en le signalant ; un fichier illisible : le HTML", () => {
    const html = fakeGuide().replace(/Rédigé le|Révisé le/g, "Écrit");
    const g = indexGuide(html, JSON.stringify(fakeGuideJson("bbbbbbb", true)), "t");
    expect(g.sections.some((s) => s.id === "json-only")).toBe(true);
    expect(g.warnings[0]).toMatch(/Pied de page du HTML introuvable/);
    expect(indexGuide(fakeGuide(), new Error("EACCES"), "t").warnings[0]).toMatch(/guide\.json illisible : EACCES : index lu dans le HTML/);
  });

  it("titres donnés à part dans le JSON, langue illisible remplacée par l'autre, glossaire anglais vide pris en français", () => {
    const doc = fakeGuideJson();
    const demo = doc.pages[1] as Record<string, unknown> & { text: { fr: Record<string, unknown>; en: unknown } };
    delete demo.text.fr.title;
    demo.text.en = "pas un objet";
    demo.sections = [{ id: "open-file", title: { fr: "Ouvrir `a.ts`", en: "Open `a.ts`" } }, { id: "other" }];
    doc.glossary[0].text.en.term = "";
    const g = guideFromJson(readGuideJson(JSON.stringify(doc)));
    expect(g.pages[1].title).toEqual({ fr: "Démo", en: "Demo" });
    expect(g.sections.find((s) => s.id === "open-file")!.title).toEqual({ fr: "Ouvrir a.ts", en: "Open a.ts" });
    expect(g.sections.find((s) => s.id === "other")!.title).toEqual({ fr: "Autre", en: "Autre" });
    expect(g.terms[0].term).toEqual({ fr: "HYDRATION FR", en: "HYDRATION FR" });
  });

  it("lit le guide.json posé à côté du HTML, et le relit quand il change", async () => {
    const dir = tempDir();
    try {
      const path = join(dir, "index.html");
      writeFiles(dir, { "index.html": fakeGuide(), "guide.json": JSON.stringify(fakeGuideJson()) });
      const cfg = { ...makeConfig(dir), guide: { path }, ui: { secret: { unlocked: true } } };
      expect((await fetchGuide(cfg)).sections.some((s) => s.id === "json-only")).toBe(false);
      writeFileSync(join(dir, "guide.json"), JSON.stringify(fakeGuideJson("bbbbbbb", true)));
      // date de modification différente, même si l'écriture tombe dans la même milliseconde
      utimesSync(join(dir, "guide.json"), new Date(), new Date(Date.now() + 5000));
      expect((await fetchGuide(cfg)).sections.some((s) => s.id === "json-only")).toBe(true);
    } finally {
      remove(dir);
    }
  });

  it("le format ne dépend que de zod (pour pouvoir en faire un paquet à part)", () => {
    const dir = join(import.meta.dirname, "../src/features/guide/format");
    for (const f of readdirSync(dir)) {
      const imports = [...readFileSync(join(dir, f), "utf8").matchAll(/^import[^"']*["']([^"']+)["']/gm)].map((m) => m[1]);
      expect(imports.every((i) => i === "zod"), `${f} : ${imports.join(", ")}`).toBe(true);
    }
  });
});

describe("liens guide ↔ fichiers", () => {
  const raw = parseGuide(fakeGuide());
  const project = ["apps/web/src/a.ts", "apps/web/src/c.ts", "packages/x/src/b.ts", "docs/x.md", "apps/web/src/features/cart/Cart.tsx"];
  const g = resolveRefs(raw, project);

  it("retire ce qui n'est pas un fichier du projet et complète un chemin raccourci unique", () => {
    expect(g.sections.find((s) => s.id === null && s.page === "guide/demo")!.files).toEqual([]);
    const short = resolveRefs({ ...raw, sections: [{ page: "p", id: "s", title: { fr: "", en: "" }, files: [{ path: "x/src/b.ts" }, { path: "src/a.ts" }] }] }, [...project, "lib/src/a.ts"]);
    expect(short.sections[0].files).toEqual([{ path: "packages/x/src/b.ts" }]); // « src/a.ts » est ambigu
  });

  it("classe d'abord les sections qui citent nommément le premier fichier", () => {
    const m = sectionsForFiles(g, ["packages/x/src/b.ts", "apps/web/src/a.ts"]);
    expect(m.map((x) => x.section.id)).toEqual(["other", "open-file"]);
    expect(m[0].files).toEqual(["packages/x/src/b.ts", "apps/web/src/a.ts"]);
    expect(m[1].line).toBe(3);
  });

  it("ne compte pas les dossiers trop larges, et un dossier cité moins qu'un fichier", () => {
    const idx: GuideContent = {
      ...g,
      sections: [
        { page: "p", id: "broad", title: { fr: "Large", en: "" }, files: [{ path: "apps/web/src" }] },
        { page: "p", id: "dir", title: { fr: "Dossier", en: "" }, files: [{ path: "apps/web/src/features" }] },
        { page: "p", id: "file", title: { fr: "Fichier", en: "" }, files: [{ path: "apps/web/src/features/cart/Cart.tsx" }] },
      ],
    };
    expect(sectionsForFiles(idx, ["apps/web/src/features/cart/Cart.tsx"]).map((x) => x.section.id)).toEqual(["file", "dir"]);
  });

  it("trouve les sections d'une partie de la carte", () => {
    expect(sectionsUnder(g, "apps/web").map((x) => x.section.id).sort()).toEqual(["open-file", "other"]);
    expect(sectionsUnder(g, "packages/x/src")[0].files).toEqual(["packages/x/src/b.ts"]);
    expect(sectionsUnder(g, ["apps/web", "packages/x/src"]).length).toBe(sectionsUnder(g, "apps/web").length + sectionsUnder(g, "packages/x/src").filter((x) => !sectionsUnder(g, "apps/web").some((y) => y.section.id === x.section.id)).length);
  });

  it("n'accepte comme adresse du guide que lettres, chiffres, tirets et barres", () => {
    expect(isGuideTarget("guide/page-a/section-1")).toBe(true);
    expect(isGuideTarget("javascript:alert(1)")).toBe(false);
    expect(isGuideTarget("a//b")).toBe(false);
  });

  it("rend le guide cherchable avec ⌘K (pages, sections, glossaire)", () => {
    const full: GuideIndex = { ...g, name: null, links: { deploy: [], observability: [], prs: [] } };
    const index = buildIndex({ tabs: [], guide: full });
    expect(searchIndex(index, "ouvrir fichier")[0].action).toEqual({ kind: "route", to: "/guide", search: { p: "guide/demo/open-file" } });
    // rubrique : « Guide de l'équipe », ou le nom donné dans la config (guide.name)
    expect(searchIndex(index, "ouvrir fichier")[0].group).toBe("Guide de l'équipe");
    expect(searchIndex(buildIndex({ tabs: [], guide: { ...full, name: "Guide Démo" } }), "ouvrir fichier")[0].group).toBe("Guide Démo");
    // l'autre langue est cherchable aussi
    expect(searchIndex(index, "open a file")[0].label).toBe("Ouvrir un fichier");
    expect(searchIndex(index, "hydration")[0].action).toEqual({ kind: "route", to: "/guide", search: { p: "guide/reference/glossary/hydration" } });
  });
});

describe("fraîcheur des citations", () => {
  it("lit les blocs de `git diff -U0`", () => {
    const diff = ["diff --git a/x.ts b/x.ts", "--- a/x.ts", "+++ b/x.ts", "@@ -4 +4 @@", "-a", "+b", "@@ -10,0 +11,2 @@", "+c", "+d", "--- /dev/null", "+++ b/new.ts", "@@ -0,0 +1 @@"].join("\n");
    expect(parseHunks(diff)).toEqual(new Map([["x.ts", [{ start: 4, count: 1, added: 1 }, { start: 10, count: 0, added: 2 }]]]));
  });

  it("dit modifié seulement si les lignes citées changent ; déplacé, supprimé, introuvable dans tous les cas", () => {
    const state = {
      baseFiles: new Set(["a/x.ts", "a/old.ts", "a/gone.ts", "apps/web/scripts/s.ts"]),
      targetFiles: new Set(["a/x.ts", "a/new.ts", "apps/web/scripts/s.ts"]),
      renamed: new Map([["a/old.ts", "a/new.ts"]]),
      deleted: new Set(["a/gone.ts"]),
      hunks: new Map([["a/x.ts", [{ start: 4, count: 1, added: 3 }]]]),
    };
    const out = staleRefs(
      [
        { path: "a/x.ts", from: 3, to: 5 },
        { path: "a/x.ts", from: 8, to: 9 },
        { path: "a/x.ts" },
        { path: "a/old.ts", from: 1, to: 1 },
        { path: "a/gone.ts" },
        { path: "a/nowhere.ts" },
        { path: "apps/dist/bundle.js" },
        { path: "scripts/s.ts", from: 1, to: 1 },
        { path: "a/x.ts", from: 4, to: 4, commit: "abc1234" },
        { path: "next/font/local" },
      ],
      state,
    );
    expect(out).toEqual([
      { path: "a/x.ts", from: 3, to: 5, state: "changed", added: 3, removed: 1 },
      { path: "a/old.ts", from: 1, to: 1, state: "moved", movedTo: "a/new.ts", added: 0, removed: 0 },
      { path: "a/gone.ts", state: "deleted", added: 0, removed: 0 },
      { path: "a/nowhere.ts", state: "missing", added: 0, removed: 0 },
    ]);
  });

  let root = "";
  let file = "";
  beforeAll(() => {
    root = tempDir("n2-guide-");
    const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.test", ...args], { cwd: root, encoding: "utf8" }).trim();
    const lines = (n: number, changed?: number) => Array.from({ length: n }, (_, i) => (i + 1 === changed ? "changé" : `ligne ${i + 1}`)).join("\n") + "\n";
    writeFiles(root, { "apps/web/src/a.ts": lines(10), "docs/x.md": "# Doc\n\nUn texte assez long pour que git reconnaisse le renommage.\n", "packages/x/src/b.ts": "export const b = 1;\n" });
    gitInit(root);
    git("commit", "-qm", "base");
    const base = git("rev-parse", "--short=9", "HEAD");
    writeFiles(root, { "apps/web/src/a.ts": lines(10, 4) });
    git("mv", "docs/x.md", "docs/y.md");
    git("rm", "-q", "packages/x/src/b.ts");
    git("commit", "-qam", "suite");
    file = join(root, "guide.html");
    writeFileSync(file, fakeGuide(base));
  });
  afterAll(() => remove(root));

  it("compare le code cité entre la révision du guide et le projet", async () => {
    const cfg = { ...makeConfig(root), guide: { path: file }, deploy: { mainBranch: "main" }, ui: { secret: { unlocked: true } } };
    const f = await guideFreshness(cfg);
    expect(f.target).toBe("HEAD");
    expect(f.commits).toBe(1);
    const all = f.sections.flatMap((s) => s.refs.map((r) => [s.id, r.path, r.state, r.movedTo ?? ""]));
    expect(all).toEqual([
      [null, "apps/web/src/page-level.ts", "missing", ""],
      ["open-file", "apps/web/src/a.ts", "changed", ""],
      ["open-file", "docs/x.md", "moved", "docs/y.md"],
      // le dossier « packages » n'existe plus du tout : la citation est quand même vérifiée
      ["other", "packages/x/src/b.ts", "deleted", ""],
    ]);
    const md = freshnessMarkdown(parseGuide(fakeGuide()), f);
    expect(md).toContain("## Démo › Ouvrir un fichier");
    expect(md).toContain("- `apps/web/src/a.ts:3-5` : modifié (+1 −1)");
    expect(md).toContain("- `docs/x.md` : déplacé → `docs/y.md`");
  });

  it("explique quoi faire si le commit du guide manque dans le projet", async () => {
    const other = join(root, "autre.html");
    writeFileSync(other, fakeGuide("1234567"));
    // guide pas encore débloqué (code Konami) : comme s'il n'était pas configuré
    await expect(guideFreshness({ ...makeConfig(root), guide: { path: other } })).rejects.toMatchObject({ detail: { message: { key: "srv_guide_not_configured" } } });
    await expect(guideFreshness({ ...makeConfig(root), guide: { path: other }, ui: { secret: { unlocked: true } } })).rejects.toMatchObject({ detail: { message: { key: "srv_guide_commit_missing", params: { ref: "1234567" } }, hint: { key: "srv_hint_git_fetch" } } });
  });
});

describe("isolement du guide", () => {
  it("met le guide dans un bac à sable sans accès à N2 ni au réseau", () => {
    const csp = guideCsp("4747", allowedHosts());
    expect(csp).toMatch(/^sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox;/);
    expect(csp).not.toMatch(/allow-same-origin/);
    expect(csp).toContain("connect-src 'none'");
    // N2 s'ouvre sur n2.localhost : sans ce nom, Chrome refuse d'afficher le guide dans l'onglet Guide
    expect(csp).toContain("frame-ancestors http://n2.localhost:4747 http://127.0.0.1:4747 http://localhost:4747");
  });
});

describe("guide adapté à N2", () => {
  const settings: GuideSettings = { lang: "fr", editor: "vscode", folder: "/Users/me/monprojet", references: true, terms: false, theme: DEFAULT_THEME };
  const page = `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8">\n    <script type="module">const t=\`<head></head>\`;</script>\n  </head><body></body></html>`;

  /** Exécute les scripts ajoutés par N2 dans une fenêtre où le stockage est refusé (comme dans le bac à sable) */
  function storageAfter(html: string) {
    const win: Record<string, unknown> = {};
    Object.defineProperty(win, "localStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError");
      },
    });
    win.window = win;
    const ctx = createContext(win);
    for (const [, code] of html.matchAll(/<script data-n2>([\s\S]*?)<\/script>/g)) runInContext(code!, ctx);
    return ctx.localStorage as Storage;
  }

  it("ajoute son code juste après la vraie balise <head>, avant les scripts du guide", () => {
    const out = embedGuide(page, settings);
    expect(out.startsWith("<!doctype html>")).toBe(true);
    const at = out.indexOf("<script data-n2>");
    expect(at).toBe(page.indexOf("<head>") + "<head>".length);
    expect(at).toBeLessThan(out.indexOf('<script type="module">'));
    expect(out.indexOf("<style data-n2>")).toBeLessThan(out.indexOf('<script type="module">'));
    // le reste de la page est intact
    expect(out.replace(/<script data-n2>[\s\S]*?<\/script><style data-n2>[\s\S]*?<\/style>/, "")).toBe(page);
  });

  it("sans en-tête : avant le premier script, et jamais avant le doctype", () => {
    expect(embedGuide("<p>x</p><script>1</script>", settings)).toMatch(/^<p>x<\/p><script data-n2>/);
    expect(embedGuide("<!DOCTYPE html><html><p>x</p>", settings)).toMatch(/^<!DOCTYPE html><html><script data-n2>/);
  });

  it("donne au guide un stockage rempli avec les réglages de N2", () => {
    const store = storageAfter(embedGuide(page, settings));
    expect(store.getItem("guide-locale")).toBe("fr");
    expect(JSON.parse(store.getItem("guide-sources")!)).toEqual({ editor: "vscode", folder: "/Users/me/monprojet", glossary: false, visible: true });
    // pas de thème imposé : le guide suit le système, comme N2
    expect(store.getItem("guide-theme")).toBeNull();
    // le guide peut y écrire (pages lues, progression), le temps de la page
    store.setItem("guide.recipe-progress", "{}");
    expect(store.getItem("guide.recipe-progress")).toBe("{}");
    store.removeItem("guide-locale");
    expect(store.getItem("guide-locale")).toBeNull();
  });

  it("un chemin piégé reste une valeur : ni fin de script, ni motif de remplacement", () => {
    const folder = "/tmp/</script><script>alert(1)</script>/$&/$1";
    const out = embedGuide(page, { ...settings, folder });
    const injected = out.slice(0, out.indexOf("</style>"));
    expect(injected.match(/<\/script>/g)).toHaveLength(1);
    expect(JSON.parse(storageAfter(out).getItem("guide-sources")!).folder).toBe(folder);
  });

  it("donne les couleurs de N2 en clair et en sombre, et masque les contrôles du guide", () => {
    const css = guideStyle();
    expect(css).toContain(`--colors-canvas:${COLORS.bg[0]};`);
    expect(css).toContain(`--colors-ink:${COLORS.text[0]};`);
    // écran seulement : l'impression garde la palette du guide
    expect(css).toMatch(/^@media screen\{html:root/);
    const dark = css.slice(css.indexOf("prefers-color-scheme:dark"));
    expect(dark).toContain(`--colors-canvas:${COLORS.bg[1]};`);
    expect(dark).toContain(`--colors-accent:${COLORS.accent[1]};`);
    expect(css).toMatch(/\[data-preferences-trigger\][^{]*\[aria-label="Langue"\],\[aria-label="Language"\]\{display:none!important\}/);
  });

  it("couleurs sombres selon le thème de N2 : avec macOS, jamais, ou toujours", () => {
    const theme = (mode: ThemeMode, day: DayTheme = "enseigne", night: NightTheme = "enseigne") => ({ mode, day, night });
    expect(guideStyle(theme("auto"))).toContain(`@media screen and (prefers-color-scheme:dark){html:root:not(#n2-guide){--colors-canvas:${COLORS.bg[1]};`);
    // toujours le jour : seulement les couleurs claires, même si macOS est en sombre
    expect(guideStyle(theme("day"))).not.toContain(COLORS.bg[1]);
    expect(guideStyle(theme("day"))).toContain(`--colors-canvas:${COLORS.bg[0]};`);
    // toujours la nuit : les couleurs sombres passent après les claires, sans condition sur macOS
    const night = guideStyle(theme("night"));
    expect(night).not.toContain("prefers-color-scheme");
    expect(night.indexOf(`--colors-canvas:${COLORS.bg[1]};`)).toBeGreaterThan(night.indexOf(`--colors-canvas:${COLORS.bg[0]};`));
    expect(embedGuide(page, { ...settings, theme: theme("night") })).not.toContain("prefers-color-scheme");
  });

  it("couleurs du thème choisi : Aubergine douce la nuit, Enseigne le jour", () => {
    const css = guideStyle({ mode: "night", day: "classique", night: "aubergine" });
    expect(css).toContain(`--colors-canvas:${THEME_COLORS.aubergine.bg};`);
    expect(css).toContain(`--colors-accent:${THEME_COLORS.aubergine.accent};`);
    // Classique garde les couleurs claires d'Enseigne
    expect(css).toContain(`--colors-canvas:${COLORS.bg[0]};`);
  });

  it("réglages du guide tirés des préférences de N2", () => {
    const guide = { enabled: true, path: "/g.html", references: true, terms: false };
    expect(guideSettings({ editor: "vscode", projectPath: "/p", guide }, "en")).toEqual({ lang: "en", editor: "vscode", folder: "/p", references: true, terms: false, theme: DEFAULT_THEME });
    expect(guideSettings({ editor: "vscode", projectPath: "/p", guide }, "en", { ...DEFAULT_THEME, mode: "night" }).theme.mode).toBe("night");
    // le dossier ne sert qu'à VS Code et Cursor : le guide ne le reçoit pas sinon
    expect(guideSettings({ editor: "jetbrains", projectPath: "/p", guide }, "en").folder).toBe("");
    expect(guideSettings({ editor: "github", projectPath: "/p", guide: { ...guide, references: false, terms: true } }, "fr")).toMatchObject({ references: false, terms: true });
  });
});
