// « Remind me » : des points à revoir plus tard, dans un fichier Markdown à toi (remind.path, ~/.config/n2/remind.md par défaut).
// Le fichier reste lisible et modifiable ailleurs (éditeur, Obsidian) : N2 n'en réécrit que les lignes touchées.
// Un rappel est un élément de liste au premier niveau (« - [ ] texte », « - [x] fait », ou « - texte » sans case) ;
// les titres (« ## Projet ») le rangent dans une section (« # Titre » est le titre du document, pas une section) ; le reste (paragraphes, sous-listes, blocs de code) est gardé tel quel.
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
  /** empreinte du contenu lu : une réécriture complète est refusée si le fichier a changé depuis */
  version: string;
  items: RemindItem[];
}

export type RemindChange =
  | { op: "add"; text: string }
  | { op: "toggle"; line: number; text: string }
  | { op: "remove"; line: number; text: string }
  | { op: "clearDone" }
  | { op: "replace"; content: string; version: string };

// élément de liste au premier niveau, avec ou sans case à cocher
const ITEM = /^([-*+])[ \t]+(?:\[([ xX])\][ \t]+)?(.*\S)[ \t]*$/;
const HEADING = /^(#{1,6})[ \t]+(.*?)[ \t#]*$/;
const FENCE = /^[ \t]{0,3}(```|~~~)/;

const linesOf = (md: string) => md.split(/\r?\n/);
// le fichier garde ses fins de ligne (\r\n s'il en avait)
const eolOf = (md: string) => (md.includes("\r\n") ? "\r\n" : "\n");

/** Rappels du fichier, dans l'ordre */
export function parseRemind(md: string): RemindItem[] {
  const items: RemindItem[] = [];
  let section: string | null = null;
  let fence: string | null = null;
  linesOf(md).forEach((line, i) => {
    const f = FENCE.exec(line)?.[1];
    if (fence) {
      if (f === fence) fence = null;
      return;
    }
    if (f) {
      fence = f;
      return;
    }
    const h = HEADING.exec(line);
    if (h) {
      // « # Titre » : le titre du document (déjà celui de la carte), pas une section
      section = h[1] === "#" ? null : h[2] || null;
      return;
    }
    const it = ITEM.exec(line);
    if (it) items.push({ line: i, text: it[3], done: it[2] === "x" || it[2] === "X", section });
  });
  return items;
}

/** Ligne du premier titre de section (« ## … » ou plus, hors bloc de code), -1 s'il n'y en a pas */
function firstSectionLine(md: string): number {
  let fence: string | null = null;
  const lines = linesOf(md);
  for (let i = 0; i < lines.length; i++) {
    const f = FENCE.exec(lines[i])?.[1];
    if (fence) {
      if (f === fence) fence = null;
    } else if (f) fence = f;
    else if ((HEADING.exec(lines[i])?.[1].length ?? 0) > 1) return i;
  }
  return -1;
}

/** Texte saisi dans N2 → une seule ligne, sans espaces autour */
export const cleanText = (text: string) => text.replace(/\s+/g, " ").trim();

/** Le rappel attendu est-il toujours à cette ligne ? (le fichier a pu changer ailleurs entre-temps) */
function itemAt(md: string, line: number, text: string): RemindItem | null {
  return parseRemind(md).find((it) => it.line === line && it.text === text) ?? null;
}

/** Lignes d'un rappel : la sienne et celles, en retrait, qui le suivent (sous-liste, détail) */
function blockEnd(lines: string[], line: number): number {
  let end = line + 1;
  while (end < lines.length && /^[ \t]+\S/.test(lines[end])) end++;
  return end;
}

export class RemindConflict extends Error {}

/**
 * Contenu du fichier après une modification faite dans N2.
 * Lève RemindConflict si le rappel visé n'est plus à sa place, ou si le fichier a changé depuis la version modifiée.
 * `hash` : empreinte d'un contenu (la même que RemindData.version).
 */
export function applyRemindChange(md: string, change: RemindChange, hash: (s: string) => string): string {
  const eol = eolOf(md);
  switch (change.op) {
    case "add": {
      // dans la première section (avant le premier « ## »), après son dernier rappel ;
      // sans rappel là, juste avant le premier « ## » ; sans section, à la fin
      const text = cleanText(change.text);
      if (!text) return md;
      const line = `- [ ] ${text}`;
      const lines = linesOf(md);
      const first = firstSectionLine(md);
      const top = parseRemind(md).filter((it) => first < 0 || it.line < first);
      if (top.length) {
        lines.splice(blockEnd(lines, top[top.length - 1].line), 0, line);
        return lines.join(eol);
      }
      if (first >= 0) {
        lines.splice(first, 0, line, "");
        return lines.join(eol);
      }
      const head = md.trim() ? md.replace(/(\r?\n)*$/, eol) : `# Remind me${eol}${eol}`;
      return `${head}${line}${eol}`;
    }
    case "toggle": {
      const it = itemAt(md, change.line, change.text);
      if (!it) throw new RemindConflict();
      const lines = linesOf(md);
      lines[it.line] = lines[it.line].replace(/^([-*+])[ \t]+(?:\[[ xX]\][ \t]+)?/, `$1 [${it.done ? " " : "x"}] `);
      return lines.join(eol);
    }
    case "remove": {
      const it = itemAt(md, change.line, change.text);
      if (!it) throw new RemindConflict();
      const lines = linesOf(md);
      lines.splice(it.line, blockEnd(lines, it.line) - it.line);
      return lines.join(eol);
    }
    case "clearDone": {
      const lines = linesOf(md);
      // de la fin vers le début : les numéros de ligne des rappels suivants ne bougent pas
      for (const it of parseRemind(md).filter((i) => i.done).reverse()) lines.splice(it.line, blockEnd(lines, it.line) - it.line);
      return lines.join(eol);
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
