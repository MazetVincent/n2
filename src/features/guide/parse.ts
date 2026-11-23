// Index du guide de l'équipe, tiré de son fichier HTML (une application compilée : le contenu est dans le JS).
// Le JS n'est jamais exécuté : on y repère les objets de contenu et on les lit avec readLiteral.
//
// Ce qu'on cherche dans le JS :
//  - la table des pages par langue : {en:{guide:Ny,"guide/page-a":Ny,…},fr:{…}} (valeurs = variables) ;
//  - la définition de chaque variable de page : `,Ny={title:…,investigate:{id:"…",title:…,sources:[…]}}` ;
//  - la table des sections de chaque page : {en:{"guide/page-a":{page:[…],sections:{"section-1":[…]}}}} ;
//  - le glossaire : X={en:A,fr:B}, où B = { terme: { term, short, body } } ;
//  - le pied de page : « Rédigé le … `commit:1a2b3c4d5`. Révisé le … `commit:9f8e7d6c5` ».
// Si une partie manque (nouvelle version du guide), l'index est construit avec le reste et `warnings` le dit.
// Quand le guide fournit son contenu en JSON (format/schema.ts), guideFromJson construit le même index sans rien deviner.
import type { DocPassage, GuideContent, GuideFileRef, GuidePage, GuideSection, GuideTerm, GuideText } from "~/server/types";
import { isObject, isRef, readLiteral, type Literal } from "./literal";
import { guideTarget } from "./logic";
import type { GuideJson } from "./format/schema";

type Lang = "fr" | "en";
const LANGS: Lang[] = ["fr", "en"];

const esc = (s: string) => s.replace(/[$]/g, "\\$");

/** Position du `{` qui ouvre la valeur de la variable `name` (`,name={`), ou -1 */
function definitionOf(src: string, name: string): number {
  const m = new RegExp(`(?:^|[,;\\s(])${esc(name)}=\\{`).exec(src);
  return m ? m.index + m[0].length - 1 : -1;
}

function tryRead(src: string, at: number): Literal | undefined {
  if (at < 0) return undefined;
  try {
    return readLiteral(src, at).value;
  } catch {
    return undefined;
  }
}

/** Table {en:{page:Var}, fr:{page:Var}} : la plus grande trouvée dont toutes les valeurs sont des variables */
function pageTable(src: string): Record<Lang, Record<string, string>> | null {
  let best: Record<Lang, Record<string, string>> | null = null;
  let bestSize = 0;
  for (const m of src.matchAll(/\{en:\{(?:"[^"]{1,80}"|[\w$]{1,40}):[\w$]{1,8},/g)) {
    const v = tryRead(src, m.index);
    if (!isObject(v) || !isObject(v.en) || !isObject(v.fr)) continue;
    const out = { en: {}, fr: {} } as Record<Lang, Record<string, string>>;
    let valid = true;
    for (const lang of LANGS) {
      for (const [k, ref] of Object.entries(v[lang] as Record<string, Literal>)) {
        if (!isRef(ref) || !/^[\w$]+$/.test(ref.$ref)) valid = false;
        else out[lang][k] = ref.$ref;
      }
    }
    const size = Object.keys(out.fr).length;
    if (valid && size > bestSize) {
      best = out;
      bestSize = size;
    }
  }
  return best;
}

/** Table des sections : {en:{"page":{page:[…],sections:{id:[…]}}},fr:{…}} → page → ids des sections */
function sectionTable(src: string): Map<string, string[]> | null {
  const m = /\{en:\{(?:"[^"]{1,80}"|[\w$]{1,40}):\{page:\[/.exec(src);
  const v = m ? tryRead(src, m.index) : undefined;
  if (!isObject(v)) return null;
  const out = new Map<string, string[]>();
  for (const lang of LANGS) {
    const t = v[lang];
    if (!isObject(t)) continue;
    for (const [page, entry] of Object.entries(t)) {
      if (!isObject(entry) || !isObject(entry.sections)) continue;
      const ids = new Set([...(out.get(page) ?? []), ...Object.keys(entry.sections)]);
      out.set(page, [...ids]);
    }
  }
  return out.size ? out : null;
}

/** Commit de vérification de chaque page : {guide:{component:`…`,verifiedAgainst:`…`},…} */
function verifiedTable(src: string): Record<string, string> {
  const m = /\{(?:"[^"]{1,80}"|[\w$]{1,40}):\{component:/.exec(src);
  const v = m ? tryRead(src, m.index) : undefined;
  const out: Record<string, string> = {};
  if (!isObject(v)) return out;
  for (const [page, entry] of Object.entries(v)) {
    if (isObject(entry) && typeof entry.verifiedAgainst === "string") out[page] = entry.verifiedAgainst;
  }
  return out;
}

function glossary(src: string): GuideTerm[] {
  for (const m of src.matchAll(/[,;\s]([\w$]{1,8})=\{en:([\w$]{1,8}),fr:([\w$]{1,8})\}/g)) {
    const read = (name: string) => tryRead(src, definitionOf(src, name));
    const fr = read(m[3]);
    if (!isObject(fr)) continue;
    const entries = Object.entries(fr).filter(([, e]) => isObject(e) && typeof e.term === "string" && typeof e.body === "string");
    if (entries.length < 5) continue;
    const en = read(m[2]);
    return entries.map(([id, e]) => {
      const fe = e as Record<string, Literal>;
      const ee = isObject(en) && isObject(en[id]) ? (en[id] as Record<string, Literal>) : fe;
      const s = (o: Record<string, Literal>, k: string) => (typeof o[k] === "string" ? cleanText(o[k] as string) : "");
      return { id, term: { fr: s(fe, "term"), en: s(ee, "term") || s(fe, "term") }, short: { fr: s(fe, "short"), en: s(ee, "short") || s(fe, "short") } };
    });
  }
  return [];
}

/** Retire la mise en forme du guide : [[id|Texte]] → Texte, [lien](#…) → lien, `code` → code */
export function cleanText(s: string): string {
  return s
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`(?:commit:)?([^`]*)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

// Chemin du projet entre accents graves : `apps/web/src/router.tsx:80-92`, `1a2b3c4d5:infrastructure/lib/app.ts:42`
const REF = /^(?:([0-9a-f]{7,40}):)?([\w$.()[\]+-]+(?:\/[\w$.()[\]+@-]+)+\/?)(?::(\d{1,6})(?:[-–](\d{1,6}))?)?$/;

/** Fichiers du projet cités dans un texte du guide (entre accents graves) */
export function fileRefs(text: string): GuideFileRef[] {
  const out: GuideFileRef[] = [];
  for (const m of text.matchAll(/`([^`\n]{3,300})`/g)) {
    const raw = m[1].trim();
    if (raw.startsWith("commit:") || raw.includes("://")) continue;
    const r = REF.exec(raw);
    if (!r || r[2].startsWith(".") || r[2].startsWith("-")) continue;
    const ref: GuideFileRef = { path: r[2].replace(/\/$/, "") };
    if (r[3]) {
      ref.from = Number(r[3]);
      ref.to = r[4] ? Number(r[4]) : ref.from;
    }
    if (r[1]) ref.commit = r[1];
    out.push(ref);
  }
  return out;
}

const refKey = (r: GuideFileRef) => `${r.commit ?? ""}:${r.path}:${r.from ?? ""}-${r.to ?? ""}`;

const TITLE_KEYS = ["title", "heading", "label", "shortLabel", "term"];
const titleOf = (o: Record<string, Literal>): string | null => {
  for (const k of TITLE_KEYS) if (typeof o[k] === "string" && (o[k] as string).trim()) return cleanText(o[k] as string);
  return null;
};

interface Collected {
  title: string | null;
  refs: Map<string, GuideFileRef>;
  /** textes de la section (pour la recherche et les librairies citées), mise en forme retirée */
  text: string[];
}

/** Au-delà, le texte d'une section n'est plus gardé (la recherche n'a besoin que d'en trouver les mots) */
const MAX_TEXT = 20_000;

/**
 * Parcourt l'objet d'une page : chaque objet dont l'`id` est une section de la page ouvre une section,
 * et les fichiers cités dans son contenu lui reviennent (sauf ceux de ses propres sous-sections).
 */
function collectPage(page: Literal, sectionIds: Set<string> | null): Map<string | null, Collected> {
  const out = new Map<string | null, Collected>([[null, { title: null, refs: new Map(), text: [] }]]);
  const size = new Map<string | null, number>();
  const visit = (v: Literal, current: string | null, depth: number) => {
    if (depth > 60 || v === null || v === undefined) return;
    if (typeof v === "string") {
      const target = out.get(current)!;
      for (const r of fileRefs(v)) target.refs.set(refKey(r), r);
      const t = cleanText(v);
      const used = size.get(current) ?? 0;
      if (t.length > 1 && used < MAX_TEXT) {
        target.text.push(t);
        size.set(current, used + t.length);
      }
      return;
    }
    if (Array.isArray(v)) {
      for (const x of v) visit(x, current, depth + 1);
      return;
    }
    if (!isObject(v)) return;
    let here = current;
    const id = typeof v.id === "string" ? v.id : null;
    // sans table des sections (ancien format), les objets avec un id directement sous la page font office de sections
    const isSection = id !== null && (sectionIds ? sectionIds.has(id) : depth === 1) && !out.has(id);
    if (isSection) {
      out.set(id, { title: titleOf(v), refs: new Map(), text: [] });
      here = id;
    }
    for (const [k, x] of Object.entries(v)) {
      if (k === "legacy") continue; // ancien identifiant de la section, gardé par le guide pour les vieux liens
      if (k === "id") continue; // identifiant, pas du texte
      visit(x, here, depth + 1);
    }
  };
  visit(page, null, 0);
  return out;
}

/** Index du guide, plus le texte de chaque section (gardé côté serveur : il n'est pas envoyé à la page) */
/** Ce qu'on tire du fichier HTML (le nom et les liens des onglets viennent de la config, voir fetchGuide) */
export type ParsedGuide = GuideContent & { passages: DocPassage[] };

interface PageSource {
  key: string;
  fr: Literal;
  en: Literal;
  /** ids des sections de la page ; null : inconnus (les objets avec un id juste sous la page en font office) */
  sectionIds: Set<string> | null;
  verifiedAgainst?: string;
}

/** Ajoute une page à l'index : sa fiche, ses sections (fichiers cités) et leur texte (recherche) */
function indexPage(p: PageSource, out: { pages: GuidePage[]; sections: GuideSection[]; passages: DocPassage[] }) {
  const { key } = p;
  const fr = collectPage(p.fr, p.sectionIds);
  const en = isObject(p.en) ? collectPage(p.en, p.sectionIds) : fr;
  const frTitle = (isObject(p.fr) && titleOf(p.fr)) || key;
  const enTitle = (isObject(p.en) && titleOf(p.en)) || frTitle;
  out.pages.push({ key, title: { fr: frTitle, en: enTitle }, ...(p.verifiedAgainst ? { verifiedAgainst: p.verifiedAgainst } : {}) });
  for (const [id, c] of fr) {
    const title: GuideText =
      id === null ? { fr: frTitle, en: enTitle } : { fr: c.title ?? humanize(id), en: en.get(id)?.title ?? c.title ?? humanize(id) };
    const text = { fr: c.text.join(" "), en: (en.get(id) ?? c).text.join(" ") };
    if (text.fr || text.en) out.passages.push({ kind: "guide", key: `guide:${guideTarget(key, id)}`, title, where: { fr: frTitle, en: enTitle }, text, target: guideTarget(key, id) });
    if (id === null && !c.refs.size) continue;
    out.sections.push({ page: key, id, title, files: [...c.refs.values()] });
  }
}

/**
 * Index du guide à partir de son contenu en JSON (format n2-guide/1, voir format/schema.ts) : même résultat que
 * parseGuide sur le HTML, sans deviner où est le contenu dans le JS compilé.
 */
export function guideFromJson(doc: GuideJson, modifiedAt = new Date(0).toISOString()): ParsedGuide {
  const warnings: string[] = [];
  const pages: GuidePage[] = [];
  const sections: GuideSection[] = [];
  const passages: DocPassage[] = [];
  for (const page of doc.pages) {
    // une langue absente prend le texte de l'autre
    const fr = (page.text.fr ?? page.text.en) as Literal;
    const en = (page.text.en ?? page.text.fr) as Literal;
    if (!isObject(fr)) {
      warnings.push(`Page illisible : ${page.key}`);
      continue;
    }
    indexPage({ key: page.key, fr, en, sectionIds: new Set(page.sections.map((s) => s.id)), verifiedAgainst: page.verifiedAgainst }, { pages, sections, passages });
  }
  const terms: GuideTerm[] = doc.glossary.map(({ id, text }) => {
    const fr = text.fr ?? text.en!;
    const en = text.en ?? fr;
    return { id, term: { fr: cleanText(fr.term), en: cleanText(en.term) }, short: { fr: cleanText(fr.short ?? ""), en: cleanText(en.short ?? fr.short ?? "") } };
  });
  const { written, revised } = doc.revision ?? {};
  return {
    modifiedAt,
    writtenAt: written ? (written.date.fr ?? written.date.en ?? null) : null,
    writtenCommit: written?.commit ?? null,
    revisedAt: revised ? (revised.date.fr ?? revised.date.en ?? null) : null,
    revisedCommit: revised?.commit ?? null,
    pages,
    sections,
    terms,
    warnings,
    passages,
  };
}

/** Construit l'index du guide à partir du texte de son fichier HTML */
export function parseGuide(html: string, modifiedAt = new Date(0).toISOString()): ParsedGuide {
  const warnings: string[] = [];
  const table = pageTable(html);
  const sectionIdsByPage = sectionTable(html);
  if (!sectionIdsByPage) warnings.push("Table des sections introuvable : sections déduites de la structure des pages.");
  const verified = verifiedTable(html);

  const pages: GuidePage[] = [];
  const sections: GuideSection[] = [];
  const passages: DocPassage[] = [];
  if (!table) {
    warnings.push("Table des pages introuvable : le format du guide a changé.");
  } else {
    for (const key of Object.keys(table.fr)) {
      const objects: Partial<Record<Lang, Literal>> = {};
      for (const lang of LANGS) {
        const name = table[lang][key] ?? table.fr[key];
        objects[lang] = tryRead(html, definitionOf(html, name));
      }
      if (!isObject(objects.fr)) {
        warnings.push(`Page illisible : ${key}`);
        continue;
      }
      const ids = sectionIdsByPage?.get(key);
      indexPage({ key, fr: objects.fr, en: objects.en, sectionIds: ids ? new Set(ids) : sectionIdsByPage ? new Set() : null, verifiedAgainst: verified[key] }, { pages, sections, passages });
    }
  }

  const terms = glossary(html);
  if (!terms.length) warnings.push("Glossaire introuvable.");

  // Pied de page, en français : « Rédigé le 3 mars 2026 … `commit:1a2b3c4d5`. Révisé le 17 mars 2026 … `commit:9f8e7d6c5`. »
  const written = /Rédigé le ([^.`"]{4,40}?) à partir[^"]{0,200}?`commit:([0-9a-f]{7,40})`/.exec(html);
  const revised = /Révisé le ([^.`"]{4,40}?) avec[^"]{0,200}?`commit:([0-9a-f]{7,40})`/.exec(html);

  return {
    modifiedAt,
    writtenAt: written?.[1] ?? null,
    writtenCommit: written?.[2] ?? null,
    revisedAt: revised?.[1] ?? null,
    revisedCommit: revised?.[2] ?? null,
    pages,
    sections,
    terms,
    warnings,
    passages,
  };
}

const humanize = (id: string) => id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, " ");
