// Guide de l'équipe : liens entre le guide et le code (fonctions pures, testables).
import type { GuideContent, GuideFileRef, GuideSection, GuideText } from "~/server/types";

/** Adresse d'une section dans le guide, sans le « #/ » : « guide/page-a/section-1 » */
export const guideTarget = (page: string, id: string | null) => (id ? `${page}/${id}` : page);

/** Forme acceptée pour ?p= (adresse dans le guide) : lettres, chiffres, tirets, barres */
export const isGuideTarget = (s: string) => /^[a-z0-9][a-z0-9/-]{0,199}$/.test(s) && !s.includes("//");

export const text = (t: GuideText, lang: "fr" | "en") => t[lang] || t.fr;

/**
 * Rattache les chemins cités aux fichiers du projet. Le guide écrit parfois un chemin raccourci
 * (« pageful/serverFunctions.ts ») : il est complété s'il ne correspond qu'à un seul fichier.
 * Un dossier cité (« apps/web/src/server/ ») est gardé tel quel. Le reste (librairies, anciens chemins Next.js,
 * types MIME…) est retiré.
 */
export function resolveRefs<T extends GuideContent>(index: T, projectFiles: string[]): T {
  const files = new Set(projectFiles);
  const dirs = new Set<string>();
  for (const f of projectFiles) {
    let i = f.lastIndexOf("/");
    while (i > 0) {
      const d = f.slice(0, i);
      if (dirs.has(d)) break;
      dirs.add(d);
      i = d.lastIndexOf("/");
    }
  }
  const bySuffix = new Map<string, string | null>();
  const resolve = (path: string): string | null => {
    if (files.has(path) || dirs.has(path)) return path;
    if (bySuffix.has(path)) return bySuffix.get(path)!;
    let found: string | null = null;
    let count = 0;
    for (const f of projectFiles) {
      if (f.endsWith(`/${path}`)) {
        found = f;
        if (++count > 1) break;
      }
    }
    const r = count === 1 ? found : null;
    bySuffix.set(path, r);
    return r;
  };
  const sections = index.sections.map((s) => {
    const seen = new Set<string>();
    const kept: GuideFileRef[] = [];
    for (const r of s.files) {
      const path = resolve(r.path);
      if (!path) continue;
      const ref = { ...r, path };
      const key = `${ref.commit ?? ""}:${path}:${ref.from ?? ""}-${ref.to ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      kept.push(ref);
    }
    return { ...s, files: kept };
  });
  return { ...index, sections };
}

// Les pages de résultats et de démarche (migration) citent beaucoup de fichiers pour des mesures datées :
// utiles, mais après les explications du produit et de la technique.
const PAGE_WEIGHT = (page: string) => (page.startsWith("results") || page.startsWith("process") || page.startsWith("overview") ? 1 : 0);

export interface SectionMatch {
  section: GuideSection;
  /** fichiers demandés que la section cite */
  files: string[];
  /** lignes citées (premier fichier), pour l'ouvrir au bon endroit */
  line?: number;
}

/**
 * Sections du guide qui citent ces fichiers (le premier fichier est le plus important : le point d'une erreur,
 * le fichier d'une analyse d'impact). Score : un fichier cité nommément vaut 2 (5 pour le premier) ; un dossier qui le
 * contient vaut 0,25, pour qu'une section qui cite tout un dossier ne passe pas devant celles qui citent le fichier
 * (les dossiers trop larges, « apps/web/src », ne comptent pas).
 * À score égal : les pages produit et technique avant les mesures, puis les sections les plus ciblées.
 */
export function sectionsForFiles(index: GuideContent | undefined, files: string[]): SectionMatch[] {
  if (!index || !files.length) return [];
  const scored: (SectionMatch & { score: number })[] = [];
  for (const section of index.sections) {
    const matched: string[] = [];
    let score = 0;
    let line: number | undefined;
    files.forEach((f, i) => {
      const exact = section.files.find((r) => r.path === f);
      const dir = exact ? undefined : section.files.find((r) => r.path.split("/").length >= 4 && f.startsWith(`${r.path}/`));
      if (!exact && !dir) return;
      matched.push(f);
      score += exact ? 2 : 0.25;
      if (exact && i === 0) score += 3;
      line ??= exact?.from;
    });
    if (matched.length) scored.push({ section, files: matched, line, score });
  }
  return scored
    .sort(
      (a, b) =>
        b.score - a.score ||
        PAGE_WEIGHT(a.section.page) - PAGE_WEIGHT(b.section.page) ||
        Number(a.section.files.some((r) => r.commit)) - Number(b.section.files.some((r) => r.commit)) ||
        a.section.files.length - b.section.files.length,
    )
    .map(({ score: _, ...m }) => m);
}

/** Sections qui citent un fichier situé dans ce dossier (une partie de la carte), avec le nombre de fichiers concernés */
export function sectionsUnder(index: GuideContent | undefined, dir: string | string[]): SectionMatch[] {
  const dirs = (Array.isArray(dir) ? dir : [dir]).map((d) => d.replace(/\/$/, "")).filter(Boolean);
  if (!index || !dirs.length) return [];
  const within = (path: string) => dirs.some((d) => path === d || path.startsWith(`${d}/`));
  const out: SectionMatch[] = [];
  for (const section of index.sections) {
    const inside = [...new Set(section.files.filter((r) => within(r.path)).map((r) => r.path))];
    if (inside.length) out.push({ section, files: inside });
  }
  return out.sort(
    (a, b) =>
      PAGE_WEIGHT(a.section.page) - PAGE_WEIGHT(b.section.page) ||
      b.files.length - a.files.length ||
      a.section.files.length - b.section.files.length,
  );
}

/** Titre de la page d'une section (« Observabilité ») */
export function pageTitle(index: GuideContent | undefined, page: string, lang: "fr" | "en"): string {
  const p = index?.pages.find((x) => x.key === page);
  return p ? text(p.title, lang) : page;
}

/** Version Markdown de la liste des passages à revoir, à envoyer à l'auteur du guide */
export function freshnessMarkdown(
  index: GuideContent & { name?: string | null },
  f: import("~/server/types").GuideFreshness,
  lang: "fr" | "en" = "fr",
): string {
  const L = (fr: string, en: string) => (lang === "en" ? en : fr);
  const state = {
    changed: L("modifié", "changed"),
    moved: L("déplacé", "moved"),
    deleted: L("supprimé", "deleted"),
    missing: L("introuvable", "not found"),
  } as const;
  const lines = [
    `# ${index.name || L("Guide de l'équipe", "Team guide")} : ${L("passages à revoir", "passages to review")}`,
    "",
    L(
      `Code cité comparé entre \`${f.base}\` (révision du guide) et \`${f.target}\` (${f.commits} commits).`,
      `Cited code compared between \`${f.base}\` (guide revision) and \`${f.target}\` (${f.commits} commits).`,
    ),
    "",
  ];
  for (const s of f.sections) {
    const sec = index.sections.find((x) => x.page === s.page && x.id === s.id);
    const title = sec ? text(sec.title, lang) : (s.id ?? s.page);
    lines.push(`## ${pageTitle(index, s.page, lang)} › ${title}`, `\`#/${guideTarget(s.page, s.id)}\``, "");
    for (const r of s.refs) {
      const where = r.from ? `${r.path}:${r.from}${r.to && r.to !== r.from ? `-${r.to}` : ""}` : r.path;
      const detail = r.state === "moved" && r.movedTo ? ` → \`${r.movedTo}\`` : r.state === "changed" ? ` (+${r.added} −${r.removed})` : "";
      lines.push(`- \`${where}\` : ${state[r.state]}${detail}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
