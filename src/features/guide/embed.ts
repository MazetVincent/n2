// Le guide de l'équipe dans N2 : son HTML est adapté au moment d'être servi (src/routes/guide-html.ts).
//
// Le guide est une application compilée qui garde ses réglages dans le stockage du navigateur. Dans son bac à sable
// (origine opaque), ce stockage lui est refusé. N2 lui en donne un en mémoire, déjà rempli avec ses propres réglages :
//  - guide-locale : la langue de N2 ;
//  - guide-sources : où ouvrir les fichiers (éditeur et dossier du projet des préférences N2) et la lecture ;
//  - guide-theme : « light » ou « dark » quand le thème de N2 ne suit pas macOS (Toujours le jour, Toujours la nuit),
//    pour que les couleurs propres au guide (blocs de code, schémas) suivent elles aussi ; absent en Automatique.
// Une feuille de style lui donne les couleurs de N2 (src/styles/colors.ts), claires ou sombres comme le thème de N2
// (Préférences, Apparence : selon macOS, ou toujours le jour, ou toujours la nuit), et masque ses propres contrôles
// (langue, Préférences), puisque ces réglages viennent de N2. Le cadre du guide ne voit pas le thème de la page qui
// l'affiche (il ne voit que le réglage de macOS) : N2 le lui donne au chargement.
import type { Lang } from "../../lib/i18n.ts";
import type { ColorName } from "../../styles/colors.ts";
import type { Editor, Preferences } from "../prefs/logic.ts";
import { DEFAULT_THEME, type ThemeChoice } from "../theme/logic.ts";
import { themeColors } from "../../styles/themes.ts";

export interface GuideSettings {
  lang: Lang;
  editor: Editor;
  /** dossier local du projet, chemin absolu, pour VS Code et Cursor (sans lui, le guide ouvre les fichiers sur GitHub) */
  folder: string;
  /** « Références au code » : le guide cite les fichiers du projet dans le texte */
  references: boolean;
  /** « Expliquer les termes » : vocabulaire du guide souligné, définition au survol */
  terms: boolean;
  /** thème de N2 : couleurs de jour et de nuit, et quand afficher celles de nuit (selon macOS, jamais, toujours) */
  theme: GuideTheme;
}

/**
 * Réglages du guide tirés de ceux de N2. Le serveur s'en sert pour remplir la page du guide ; la page de N2,
 * pour la recharger quand ils changent.
 */
/** Ce que le guide reçoit du thème (pas les clignotements du logo : les changer ne recharge pas le guide) */
export type GuideTheme = Pick<ThemeChoice, "mode" | "day" | "night">;

export function guideSettings(p: Pick<Preferences, "editor" | "projectPath" | "guide">, lang: Lang, theme: GuideTheme = DEFAULT_THEME): GuideSettings {
  // le dossier ne sert qu'aux liens VS Code et Cursor : le guide (code d'un tiers) ne le reçoit pas sinon
  const folder = p.editor === "vscode" || p.editor === "cursor" ? p.projectPath : "";
  return { lang, editor: p.editor, folder, references: p.guide.references, terms: p.guide.terms, theme: { mode: theme.mode, day: theme.day, night: theme.night } };
}

/** Couleurs de l'interface du guide (--colors-…) → couleur de N2. Les palettes d'illustration (code, schémas) restent les siennes. */
const GUIDE_COLORS: Record<string, ColorName> = {
  canvas: "bg",
  surface: "surface",
  "surface-muted": "surface.lift",
  ink: "text",
  muted: "muted",
  line: "border",
  accent: "accent",
  "accent-soft": "accent.soft",
  warn: "warn",
  "warn-soft": "warn.soft",
  old: "info",
  "old-soft": "info.soft",
  "code-bg": "surface.lift",
  "diff-add-sign": "accent",
  "diff-del-sign": "info",
};

const vars = (colors: Record<ColorName, string>) =>
  Object.entries(GUIDE_COLORS)
    .map(([guide, n2]) => `--colors-${guide}:${colors[n2]};`)
    .join("") +
  // N2 n'a pas de bordure appuyée : un mélange de la bordure et du texte secondaire
  "--colors-line-strong:color-mix(in srgb,var(--colors-line),var(--colors-muted) 45%);";

/** Sélecteur des couleurs de N2 : plus fort que ceux des jetons du guide (`:where(:root)`, `[data-theme=…]`), quel que soit l'ordre des styles */
const ROOT = "html:root:not(#n2-guide)";

/** Feuille de style ajoutée au guide : couleurs du thème de jour, et de nuit selon le choix (`theme`), contrôles du guide masqués */
export function guideStyle(theme: GuideTheme = DEFAULT_THEME): string {
  const dark = { auto: "@media screen and (prefers-color-scheme:dark)", night: "@media screen", day: "" }[theme.mode];
  return [
    // écran seulement : à l'impression, le guide garde sa palette (texte sombre sur papier blanc)
    `@media screen{${ROOT}{${vars(themeColors(theme.day, 0))}}}`,
    ...(dark ? [`${dark}{${ROOT}{${vars(themeColors(theme.night, 1))}}}`] : []),
    // contrôles du guide repris par N2 : bouton et panneau Préférences, sélecteur de langue
    `[data-preferences-trigger],[data-preferences-panel],[aria-label="Langue"],[aria-label="Language"]{display:none!important}`,
  ].join("\n");
}

/** Contenu du stockage donné au guide (clés et format lus par le guide) */
export function guideStorage(s: GuideSettings): Record<string, string> {
  const fixed = s.theme.mode === "day" ? "light" : s.theme.mode === "night" ? "dark" : undefined;
  return {
    "guide-locale": s.lang,
    "guide-sources": JSON.stringify({ editor: s.editor, folder: s.folder, glossary: s.terms, visible: s.references }),
    ...(fixed ? { "guide-theme": fixed } : {}),
  };
}

/** JSON sûr dans un <script> : `<` échappé, aucune valeur ne peut refermer le script */
const scriptJson = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");

/** Script exécuté avant ceux du guide : remplace le stockage refusé par un stockage en mémoire, déjà rempli */
export function storageScript(s: GuideSettings): string {
  return `(()=>{const m=new Map(Object.entries(${scriptJson(guideStorage(s))}));const k=(x)=>String(x);const s={get length(){return m.size},key:(i)=>[...m.keys()][i]??null,getItem:(x)=>m.has(k(x))?m.get(k(x)):null,setItem:(x,v)=>{m.set(k(x),String(v))},removeItem:(x)=>{m.delete(k(x))},clear:()=>{m.clear()}};try{Object.defineProperty(window,"localStorage",{value:s,configurable:true})}catch{}})();`;
}

/**
 * Où ajouter le code de N2 : juste après la balise <head>, avant les scripts du guide.
 * Les scripts du guide contiennent eux-mêmes du texte « <head> » : seule une balise placée avant le premier script compte.
 */
function insertAt(html: string): number {
  const head = /<head(?:\s[^>]*)?>/i.exec(html);
  const firstScript = html.search(/<script\b/i);
  if (head && (firstScript < 0 || head.index < firstScript)) return head.index + head[0].length;
  if (firstScript >= 0) return firstScript;
  // ni en-tête ni script : après le doctype et <html> (rien avant le doctype, sinon la page passe en mode « quirks »)
  return /^\s*(?:<!doctype[^>]*>\s*)?(?:<html(?:\s[^>]*)?>)?/i.exec(html)![0].length;
}

/** HTML du guide adapté à N2 : stockage rempli et styles de N2 en tête, avant les scripts du guide */
export function embedGuide(html: string, s: GuideSettings): string {
  const at = insertAt(html);
  return `${html.slice(0, at)}<script data-n2>${storageScript(s)}</script><style data-n2>\n${guideStyle(s.theme)}\n</style>${html.slice(at)}`;
}
