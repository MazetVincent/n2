// Documentation du projet suivi : les README (découpés par titre) et les sections du guide de l'équipe, en passages.
// Sert à la recherche de la carte (texte libre) et aux « passages qui parlent de cette librairie ».
// Fonctions pures (sans node:*), partagées par le serveur et les tests.
import type { DocHit, DocPassage, GuideText } from "~/server/types";

type Lang = "fr" | "en";

const same = (s: string): GuideText => ({ fr: s, en: s });

/** Markdown → texte cherchable : sans commentaires HTML, images, balises ni syntaxe des liens */
export function mdText(md: string): string {
  return md
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<\/?[a-zA-Z][^>]*>/g, " ")
    .replace(/^\s*(```|~~~).*$/gm, " ")
    .replace(/[*`]+/g, "")
    .replace(/[>|#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Un README découpé en passages : un par titre (#…######), plus le texte avant le premier titre s'il y en a */
export function readmePassages(file: string, md: string): DocPassage[] {
  const lines = md.replace(/\r/g, "").split("\n");
  const out: { title: string; line: number; body: string[] }[] = [{ title: file, line: 1, body: [] }];
  let fence = false;
  lines.forEach((l, i) => {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    const h = !fence && /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(l);
    if (h) out.push({ title: mdText(h[1]) || file, line: i + 1, body: [] });
    else out.at(-1)!.body.push(l);
  });
  return out
    .map((s) => ({ ...s, text: mdText(s.body.join("\n")) }))
    .filter((s, i) => s.text || i > 0)
    .map((s) => ({ kind: "readme" as const, key: `readme:${file}:${s.line}`, title: same(s.title), where: same(file), text: same(s.text.slice(0, 20_000)), file, line: s.line }));
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

export interface PreparedDocs {
  passages: DocPassage[];
  /** textes normalisés (minuscules, sans accents), dans le même ordre que `passages` */
  hay: { title: string; all: string }[];
}

/** Normalise une fois les textes (la recherche tourne à chaque frappe) */
export function prepareDocs(passages: DocPassage[]): PreparedDocs {
  return {
    passages,
    hay: passages.map((p) => ({
      title: norm(`${p.title.fr} ${p.title.en}`),
      all: norm(`${p.title.fr} ${p.title.en} ${p.where.fr} ${p.where.en} ${p.text.fr} ${p.text.en === p.text.fr ? "" : p.text.en}`),
    })),
  };
}

/** Extrait d'environ 180 caractères autour de la position `at` (coupé sur des mots) */
export function snippet(text: string, at: number, len = 0): string {
  if (!text) return "";
  if (at < 0) return text.length > 180 ? `${text.slice(0, 180).replace(/\s+\S*$/, "")}…` : text;
  let start = Math.max(0, at - 60);
  let end = Math.min(text.length, at + len + 120);
  if (start > 0) start = text.indexOf(" ", start) + 1 || start;
  if (end < text.length) end = text.lastIndexOf(" ", end) > at + len ? text.lastIndexOf(" ", end) : end;
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

function hit(p: DocPassage, lang: Lang, text: string, at: number, len: number): DocHit {
  return {
    kind: p.kind,
    key: p.key,
    title: p.title[lang] || p.title.fr,
    where: p.where[lang] || p.where.fr,
    snippet: snippet(text, at, len),
    ...(p.file ? { file: p.file, line: p.line } : {}),
    ...(p.target ? { target: p.target } : {}),
  };
}

/** Passage dans la langue demandée si le mot y est, sinon dans l'autre langue */
function locate(p: DocPassage, lang: Lang, find: (text: string) => number): [string, number] {
  const other: Lang = lang === "fr" ? "en" : "fr";
  for (const l of [lang, other]) {
    const at = find(p.text[l]);
    if (at >= 0) return [p.text[l], at];
  }
  return [p.text[lang] || p.text.fr, -1];
}

/** Tous les mots de la requête doivent apparaître ; les passages dont le titre contient la requête d'abord */
export function searchDocs(docs: PreparedDocs, query: string, lang: Lang, limit = 8): DocHit[] {
  const q = norm(query.trim());
  if (q.length < 2) return [];
  const words = q.split(/\s+/);
  const scored: [number, number][] = [];
  docs.hay.forEach((h, i) => {
    if (!words.every((w) => h.all.includes(w))) return;
    scored.push([i, h.title.includes(q) ? 0 : words.every((w) => h.title.includes(w)) ? 1 : 2]);
  });
  return scored
    .sort((a, b) => a[1] - b[1] || a[0] - b[0])
    .slice(0, limit)
    .map(([i]) => {
      const p = docs.passages[i];
      const [text, at] = locate(p, lang, (t) => norm(t).indexOf(words[0]));
      return hit(p, lang, text, at, words[0].length);
    });
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Passages qui citent une librairie par son nom exact (« zod », « @tanstack/react-query ») :
 * pas un morceau d'un autre nom (« react » ne trouve ni « react-dom » ni « preact »).
 * Ceux qui la nomment dans leur titre d'abord, puis ceux qui en parlent le plus.
 */
export function libMentions(docs: PreparedDocs, lib: string, lang: Lang, limit = 12): DocHit[] {
  if (!lib || lib === "node:*") return [];
  const re = new RegExp(`(^|[^\\w@/.-])${escape(lib)}(?![\\w/-])`, "gi");
  const at = (t: string) => {
    re.lastIndex = 0;
    const m = re.exec(t);
    return m ? m.index + m[1].length : -1;
  };
  const count = (t: string) => (t.match(re) ?? []).length;
  const found: { p: DocPassage; inTitle: boolean; n: number }[] = [];
  for (const p of docs.passages) {
    const inTitle = at(p.title.fr) >= 0 || at(p.title.en) >= 0;
    const n = count(p.text.fr) + (p.text.en === p.text.fr ? 0 : count(p.text.en));
    if (inTitle || n) found.push({ p, inTitle, n });
  }
  return found
    .sort((a, b) => Number(b.inTitle) - Number(a.inTitle) || b.n - a.n)
    .slice(0, limit)
    .map(({ p }) => {
      const [text, i] = locate(p, lang, at);
      return hit(p, lang, text, i, lib.length);
    });
}
