// « Remind me » : des points à revoir plus tard, dans un fichier Markdown à toi (remind.path, ~/.config/n2/remind.md par défaut).
// Le fichier reste lisible et modifiable ailleurs (éditeur, Obsidian) : N2 n'en réécrit que les lignes touchées.
// Un rappel est un élément de liste au premier niveau (« - [ ] texte », « - [x] fait », ou « - texte » sans case) ;
// les titres (« ## Projet ») le rangent dans une section ; le reste (paragraphes, sous-listes, blocs de code) est gardé tel quel.
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
const HEADING = /^#{1,6}[ \t]+(.*?)[ \t#]*$/;
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
      section = h[1] || null;
      return;
    }
    const it = ITEM.exec(line);
    if (it) items.push({ line: i, text: it[3], done: it[2] === "x" || it[2] === "X", section });
  });
  return items;
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
      const text = cleanText(change.text);
      if (!text) return md;
      const head = md.trim() ? md.replace(/(\r?\n)*$/, eol) : `# Remind me${eol}${eol}`;
      return `${head}- [ ] ${text}${eol}`;
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
