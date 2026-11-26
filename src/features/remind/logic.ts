// « Remind me » : des points à revoir plus tard, dans un fichier Markdown à toi (remind.path, ~/.config/n2/remind.md par défaut).
// Le fichier reste lisible et modifiable ailleurs (éditeur, Obsidian) : N2 n'en réécrit que les lignes touchées.
// Un rappel est un élément de liste au premier niveau (« - [ ] texte », « - [x] fait », ou « - texte » sans case) ;
// les titres (« ## Projet ») le rangent dans une section (« # Titre » est le titre du document, pas une section).
// Le reste est gardé tel quel : en-tête YAML (« --- … --- », Obsidian), paragraphes, sous-listes, blocs de code, séparateurs,
// et les fins de ligne de chaque ligne.
// Fonctions pures, partagées par le serveur (écriture) et la page (affichage).

/** Emplacement du fichier quand la config n'en donne pas */
export const DEFAULT_REMIND_PATH = "~/.config/n2/remind.md";
/** Taille maximale du fichier (au-delà, N2 refuse de le lire ou de l'écrire) */
export const REMIND_MAX_BYTES = 256 * 1024;
/** Longueur maximale d'un rappel ajouté depuis N2 */
export const REMIND_TEXT_MAX = 500;

export interface RemindItem {
  /** numéro de la ligne dans le fichier (à partir de 0) : identifie le rappel pour le cocher ou le supprimer */
  line: number;
  /** texte du rappel, tel qu'écrit dans le fichier (Markdown en ligne compris) */
  text: string;
  done: boolean;
  /** titre sous lequel il est rangé, s'il y en a un */
  section: string | null;
}

export interface RemindData {
  /** chemin du fichier, tel que réglé (« ~/… » gardé) */
  path: string;
  /** le fichier n'existe pas encore : il sera créé au premier ajout */
  exists: boolean;
  content: string;
  /** empreinte du contenu lu : une modification d'ensemble est refusée si le fichier a changé depuis */
  version: string;
  items: RemindItem[];
}

export type RemindChange =
  | { op: "add"; text: string }
  /** `done` : l'état voulu (pas une bascule) ; déjà dans cet état, rien ne change */
  | { op: "toggle"; line: number; text: string; done: boolean }
  | { op: "remove"; line: number; text: string }
  | { op: "clearDone"; version: string }
  | { op: "replace"; content: string; version: string };

// élément de liste au premier niveau, avec ou sans case à cocher
const ITEM = /^([-*+])[ \t]+(?:\[([ xX])\][ \t]+)?(.*\S)[ \t]*$/;
const HEADING = /^(#{1,6})[ \t]+(.*?)[ \t#]*$/;
const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})/;
// séparateur « * * * », « - - - », « ___ » : pas un rappel
const THEMATIC = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const INDENTED = /^[ \t]+\S/;
const blank = (s: string) => s.trim() === "";
/** Une ligne de clôture ferme le bloc ouvert par `open` : même caractère, au moins aussi long */
const closes = (f: string | undefined, open: string) => !!f && f[0] === open[0] && f.length >= open.length;

// ---------- Lignes, avec la fin de chacune (\n, \r\n, ou rien pour la dernière) ----------
interface Row {
  text: string;
  eol: string;
}
function rowsOf(md: string): Row[] {
  const parts = md.split(/(\r?\n)/);
  const rows: Row[] = [];
  for (let i = 0; i < parts.length; i += 2) rows.push({ text: parts[i], eol: parts[i + 1] ?? "" });
  return rows;
}
const join = (rows: Row[]) => rows.map((r) => r.text + r.eol).join("");
// fin de ligne d'une ligne ajoutée : la plus courante du fichier
const eolOf = (md: string) => ((md.match(/\r\n/g)?.length ?? 0) > (md.match(/(?<!\r)\n/g)?.length ?? 0) ? "\r\n" : "\n");
/** Insère des lignes à `at` ; à la fin d'un fichier sans retour final, la dernière ligne en reçoit un */
function insert(rows: Row[], at: number, texts: string[], eol: string) {
  if (at === rows.length && at > 0 && rows[at - 1].eol === "") {
    rows[at - 1].eol = eol;
    rows.splice(at, 0, ...texts.map((text, i) => ({ text, eol: i === texts.length - 1 ? "" : eol })));
  } else rows.splice(at, 0, ...texts.map((text) => ({ text, eol })));
}

// ---------- Ce qu'est chaque ligne ----------
type Kind = { k: "skip" } | { k: "heading"; level: number; title: string } | { k: "item"; text: string; done: boolean } | { k: "other" };

function classify(lines: string[]): Kind[] {
  const out: Kind[] = [];
  let i = 0;
  // en-tête YAML d'Obsidian (« --- » en toute première ligne, jusqu'au « --- » ou « ... » suivant)
  if (lines[0] === "---") {
    const end = lines.findIndex((l, j) => j > 0 && (l === "---" || l === "..."));
    if (end > 0) for (; i <= end; i++) out.push({ k: "skip" });
  }
  let fence: string | null = null;
  for (; i < lines.length; i++) {
    const line = lines[i];
    const f = FENCE.exec(line)?.[1];
    if (fence) {
      if (closes(f, fence)) fence = null;
      out.push({ k: "skip" });
    } else if (f) {
      fence = f;
      out.push({ k: "skip" });
    } else if (THEMATIC.test(line)) out.push({ k: "other" });
    else {
      const h = HEADING.exec(line);
      const it = !h && ITEM.exec(line);
      out.push(h ? { k: "heading", level: h[1].length, title: h[2] } : it ? { k: "item", text: it[3], done: it[2] === "x" || it[2] === "X" } : { k: "other" });
    }
  }
  return out;
}

/** Rappels du fichier, dans l'ordre */
export function parseRemind(md: string): RemindItem[] {
  const items: RemindItem[] = [];
  let section: string | null = null;
  classify(rowsOf(md).map((r) => r.text)).forEach((kind, line) => {
    // « # Titre » : le titre du document (déjà celui de la carte), pas une section
    if (kind.k === "heading") section = kind.level === 1 ? null : kind.title || null;
    if (kind.k === "item") items.push({ line, text: kind.text, done: kind.done, section });
  });
  return items;
}

/** Ligne du premier titre de section (« ## … » ou plus, hors bloc de code), -1 s'il n'y en a pas */
const firstSectionLine = (lines: string[]) => classify(lines).findIndex((k) => k.k === "heading" && k.level > 1);

/** Texte saisi dans N2 → une seule ligne, sans espaces autour */
export const cleanText = (text: string) => text.replace(/\s+/g, " ").trim();

export class RemindConflict extends Error {}
/** Le rappel contient un bloc de code qui ne se ferme pas : N2 ne sait pas où il s'arrête, il n'y touche pas */
export class RemindUnsafe extends Error {}

/** Le rappel attendu est-il toujours à cette ligne ? (le fichier a pu changer ailleurs entre-temps) */
function itemAt(md: string, line: number, text: string): RemindItem {
  const it = parseRemind(md).find((i) => i.line === line && i.text === text);
  if (!it) throw new RemindConflict();
  return it;
}

/**
 * Fin (exclue) des lignes d'un rappel : la sienne et celles, en retrait, qui le suivent (sous-liste, détail),
 * y compris après une ligne vide et dans un bloc de code ouvert en retrait. Les lignes vides de la fin n'en font pas partie.
 */
function blockEnd(lines: string[], line: number): number {
  let end = line + 1;
  let fence: string | null = null;
  while (end < lines.length) {
    const l = lines[end];
    const f = FENCE.exec(l)?.[1];
    if (fence) {
      if (closes(f, fence)) fence = null;
      end++;
    } else if (INDENTED.test(l)) {
      if (f) fence = f;
      end++;
    } else if (blank(l)) {
      let next = end;
      while (next < lines.length && blank(lines[next])) next++;
      if (next < lines.length && INDENTED.test(lines[next])) end = next;
      else break;
    } else break;
  }
  if (fence) throw new RemindUnsafe();
  return end;
}

/**
 * Contenu du fichier après une modification faite dans N2.
 * Lève RemindConflict si le rappel visé n'est plus à sa place, ou si le fichier a changé depuis la version modifiée ;
 * RemindUnsafe si les lignes du rappel ne sont pas sûres (bloc de code non fermé).
 * `hash` : empreinte d'un contenu (la même que RemindData.version).
 */
export function applyRemindChange(md: string, change: RemindChange, hash: (s: string) => string): string {
  const eol = eolOf(md);
  const rows = rowsOf(md);
  const lines = rows.map((r) => r.text);
  switch (change.op) {
    case "add": {
      // dans la première section (avant le premier « ## »), après son dernier rappel ;
      // sans rappel là, juste avant le premier « ## » ; sans section, à la fin
      const text = cleanText(change.text);
      if (!text) return md;
      const line = `- [ ] ${text}`;
      const first = firstSectionLine(lines);
      const top = parseRemind(md).filter((it) => first < 0 || it.line < first);
      if (top.length) insert(rows, blockEnd(lines, top[top.length - 1].line), [line], eol);
      else if (first >= 0) insert(rows, first, [line, ""], eol);
      else if (!md.trim()) return `# Remind me${eol}${eol}${line}${eol}`;
      else return `${md.replace(/(\r?\n)*$/, eol)}${line}${eol}`;
      return join(rows);
    }
    case "toggle": {
      const it = itemAt(md, change.line, change.text);
      if (it.done === change.done) return md;
      rows[it.line].text = rows[it.line].text.replace(/^([-*+])[ \t]+(?:\[[ xX]\][ \t]+)?/, `$1 [${change.done ? "x" : " "}] `);
      return join(rows);
    }
    case "remove": {
      const it = itemAt(md, change.line, change.text);
      rows.splice(it.line, blockEnd(lines, it.line) - it.line);
      return join(rows);
    }
    case "clearDone": {
      // seulement les rappels faits que la page a vus : refusé si le fichier a changé depuis
      if (hash(md) !== change.version) throw new RemindConflict();
      // de la fin vers le début : les numéros de ligne des rappels suivants ne bougent pas
      const done = parseRemind(md).filter((i) => i.done);
      const blocks = done.map((it) => [it.line, blockEnd(lines, it.line)] as const);
      for (const [start, end] of blocks.reverse()) rows.splice(start, end - start);
      return join(rows);
    }
    case "replace": {
      if (hash(md) !== change.version) throw new RemindConflict();
      return change.content;
    }
  }
}

/** Rappels regroupés pour l'affichage : à revoir par section (dans l'ordre du fichier), puis ceux faits */
export function groupRemind(items: RemindItem[]): { open: { section: string | null; items: RemindItem[] }[]; done: RemindItem[] } {
  const open: { section: string | null; items: RemindItem[] }[] = [];
  for (const it of items.filter((i) => !i.done)) {
    const group = open.find((g) => g.section === it.section);
    if (group) group.items.push(it);
    else open.push({ section: it.section, items: [it] });
  }
  return { open, done: items.filter((i) => i.done) };
}

export type InlinePart = { kind: "text" | "code" | "bold"; text: string } | { kind: "link"; text: string; href: string };

// `code`, **gras**, [texte](https://…) et adresses https://… nues ; le reste est du texte
const INLINE = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"])/g;

/** Le Markdown en ligne d'un rappel, découpé pour l'affichage (seuls les liens http(s) deviennent des liens) */
export function inlineParts(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  let last = 0;
  for (const mt of text.matchAll(INLINE)) {
    if (mt.index > last) parts.push({ kind: "text", text: text.slice(last, mt.index) });
    if (mt[1] !== undefined) parts.push({ kind: "code", text: mt[1] });
    else if (mt[2] !== undefined) parts.push({ kind: "bold", text: mt[2] });
    else if (mt[3] !== undefined) parts.push({ kind: "link", text: mt[3], href: mt[4] });
    else parts.push({ kind: "link", text: mt[5], href: mt[5] });
    last = mt.index + mt[0].length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}
