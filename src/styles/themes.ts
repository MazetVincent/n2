// Thèmes de N2 autres qu'Enseigne : ce que chacun change dans les jetons (panda.config.ts) et dans les couleurs données
// au guide (src/features/guide/embed.ts). Un thème n'existe que dans un schéma (clair ou sombre) ; ce qu'il ne redéfinit
// pas garde la valeur d'Enseigne dans ce schéma (src/styles/colors.ts et panda.config.ts).
// Le logo (jetons sign et neonSign, police d'enseigne) n'est jamais redéfini : c'est l'enseigne N2 dans tous les thèmes.
import { COLORS, type ColorName } from "./colors";

/** Schéma de chaque thème (Enseigne existe dans les deux) */
export const THEME_SCHEME = { classique: "light", miami: "light", retrowave: "dark", holo: "dark", aubergine: "dark" } as const;
export type ExtraTheme = keyof typeof THEME_SCHEME;
export const EXTRA_THEMES = Object.keys(THEME_SCHEME) as ExtraTheme[];

/** Pas de vis aux coins des cartes (caisson d'enseigne) ; les électrodes des interrupteurs restent (jeton electrode) */
const NO_SCREWS = { screw: "transparent", "screw.ring": "transparent" } as const;

export const THEME_COLORS: Record<ExtraTheme, Partial<Record<ColorName, string>>> = {
  // Classique : le clair de la charte, net et sans effet (mêmes couleurs que l'Enseigne de jour, sans le caisson)
  classique: { ...NO_SCREWS },
  // Miami : le Retrowave en plein jour, ciel pastel rose et cyan, titres en dégradé magenta vers violet
  miami: {
    ...NO_SCREWS,
    bg: "#fff3f8",
    surface: "#ffffff",
    "surface.alt": "#fff7fb",
    "surface.lift": "#fff0f6",
    border: "#f3d0e0",
    text: "#2a1b3d",
    muted: "#76668a",
    accent: "#d6006a",
    "accent.soft": "#ffe0ee",
    "accent.light": "#f06bb0",
    neon: "#b8005c",
    "heading.fill": "transparent",
    tube: "#d6006a",
    "tube.off": "#f3d0e0",
    heat: "#d6006a",
    ok: "#0f8a5f",
    "ok.soft": "#dcf6ec",
    warn: "#a86400",
    "warn.soft": "#fff1d6",
    bad: "#c4380f",
    "bad.soft": "#ffe6dc",
    info: "#0a78a8",
    "info.soft": "#dff4ff",
  },
  // Retrowave : coucher de soleil des années 80, ciel violet, magenta et orange, titres en dégradé rose vers jaune
  retrowave: {
    ...NO_SCREWS,
    bg: "#140a26",
    surface: "#1c0f34",
    "surface.alt": "#160a2c",
    "surface.lift": "#24143f",
    border: "#3a2457",
    text: "#f8efff",
    muted: "#b49fcf",
    "accent.soft": "#3f1840",
    neon: "#ffb0c8",
    "heading.fill": "transparent",
    tube: "#ffc2a0",
    "tube.off": "#45285f",
    "ok.soft": "#14302f",
    "warn.soft": "#3a2a2a",
    "bad.soft": "#3d1f2a",
    "info.soft": "#1b2a48",
  },
  // Holo : affichage holographique, arêtes irisées rose, violet et cyan, titres légèrement dédoublés ; le reste calme
  holo: {
    ...NO_SCREWS,
    bg: "#0c0a12",
    surface: "#16121c",
    "surface.alt": "#110e16",
    "surface.lift": "#1d1825",
    border: "#2a2333",
    text: "#f3eef8",
    muted: "#a59cb3",
    "accent.soft": "#3a1a33",
    neon: "#ffe3ec",
    tube: "#e6dcff",
    "tube.off": "#3a3050",
  },
  // Aubergine douce : fond prune, magenta clair de la charte (#FFC4D6), états en tons doux, aucune lueur
  aubergine: {
    ...NO_SCREWS,
    bg: "#1a1020",
    surface: "#23162a",
    "surface.alt": "#1e1325",
    "surface.lift": "#2a1c32",
    border: "#3a2944",
    text: "#f6e9f1",
    muted: "#b49cb0",
    accent: "#ffc4d6",
    "accent.soft": "#40283a",
    "accent.light": "#ffdde8",
    neon: "#ffd6e3",
    tube: "#ffc4d6",
    "tube.off": "#4a3352",
    contrast: "#2a1020",
    heat: "#ff8fb1",
    ok: "#5fe0b0",
    "ok.soft": "#1f3a35",
    warn: "#ffd57a",
    "warn.soft": "#3d3226",
    bad: "#ff9a66",
    "bad.soft": "#3f2628",
    info: "#7fdcff",
    "info.soft": "#213442",
  },
};

/** Ombres redéfinies (noms des jetons `shadows` de panda.config.ts) */
export const THEME_SHADOWS: Record<ExtraTheme, Record<string, string>> = {
  classique: {},
  miami: {
    card: "0 14px 34px -18px rgb(214 0 106 / 35%)",
    cardHover: "0 16px 38px -16px rgb(214 0 106 / 45%)",
  },
  // les lueurs tirent vers l'orange du soleil ; pas de lueur sur les titres (elle couvrirait leur dégradé)
  retrowave: {
    card: "inset 0 1px 0 rgb(255 255 255 / 7%), 0 18px 40px -20px rgb(0 0 0 / 90%)",
    cardHover: "inset 0 1px 0 rgb(255 255 255 / 9%), 0 18px 40px -20px rgb(0 0 0 / 90%), 0 0 24px -6px rgb(255 130 65 / 45%)",
    inset: "inset 0 1px 3px rgb(0 0 0 / 55%)",
    // ligne d'horizon néon sous la barre du haut
    bar: "0 1px 0 rgb(255 61 119 / 55%), 0 0 18px rgb(255 61 119 / 25%)",
    neonText: "none",
    neonTube: "0 0 8px #ff8241, 0 0 16px rgb(255 130 65 / 60%)",
    neonButton: "0 0 4px #ff3d77, 0 0 14px rgb(255 61 119 / 55%)",
    neonButtonHover: "0 0 6px #ff3d77, 0 0 20px rgb(255 61 119 / 65%), 0 0 34px rgb(255 130 65 / 35%)",
    neonGas: "0 0 4px #ff8241, 0 0 12px rgb(255 130 65 / 70%)",
    neonFrame: "0 0 0 1.5px #ffc2a0, 0 0 6px #ff8241, 0 0 14px rgb(255 130 65 / 45%)",
    neonField: "inset 0 2px 6px rgb(0 0 0 / 60%), 0 0 4px #ff8241, 0 0 12px rgb(255 130 65 / 40%)",
  },
  holo: {
    card: "0 24px 46px -24px rgb(130 100 225 / 55%), 0 0 0 1px rgb(0 0 0 / 40%)",
    cardHover: "0 24px 46px -20px rgb(130 100 225 / 70%), 0 0 0 1px rgb(0 0 0 / 40%), 0 0 22px -6px rgb(51 209 255 / 35%)",
    inset: "inset 0 1px 3px rgb(0 0 0 / 55%)",
    // titres : néon rose avec un léger décalage cyan et magenta
    neonText: "-1px 0 rgb(51 209 255 / 55%), 1px 0 rgb(255 61 119 / 75%), 0 0 12px rgb(255 61 119 / 45%)",
    neonTube: "0 0 8px rgb(255 61 119 / 70%), 0 0 18px rgb(51 209 255 / 35%)",
    neonButton: "0 0 10px rgb(255 61 119 / 45%), 0 0 22px rgb(130 100 225 / 30%), inset 0 0 6px rgb(130 100 225 / 40%)",
    neonButtonHover: "0 0 14px rgb(255 61 119 / 60%), 0 0 30px rgb(130 100 225 / 40%), 0 0 40px rgb(51 209 255 / 20%), inset 0 0 8px rgb(130 100 225 / 50%)",
    neonGas: "0 0 6px rgb(130 100 225 / 90%), 0 0 16px rgb(51 209 255 / 45%)",
    neonFrame: "0 0 0 1.5px #e6dcff, 0 0 8px rgb(130 100 225 / 60%), 0 0 16px rgb(51 209 255 / 30%), inset 0 0 6px rgb(255 61 119 / 30%)",
    neonField: "inset 0 2px 6px rgb(0 0 0 / 60%), 0 0 6px rgb(130 100 225 / 70%), 0 0 14px rgb(51 209 255 / 35%)",
  },
  aubergine: {
    card: "inset 0 1px 0 rgb(255 255 255 / 4%), 0 8px 24px -14px rgb(0 0 0 / 60%)",
    cardHover: "inset 0 1px 0 rgb(255 255 255 / 5%), 0 8px 24px -14px rgb(0 0 0 / 60%)",
    inset: "none",
    bar: "none",
    neonText: "none",
    neonTube: "none",
    neonButton: "none",
    neonButtonHover: "0 0 0 3px {colors.accent.soft}",
    neonGas: "none",
    neonFrame: "0 0 0 1px {colors.accent}",
    neonField: "0 0 0 1px {colors.accent}",
  },
};

/** Dégradés redéfinis (jetons `gradients`) : aucun dans ces thèmes */
export const THEME_GRADIENTS: Record<ExtraTheme, Record<string, string>> = {
  classique: {},
  // cartes en verre (translucides, floutées dans cardFrame) : le coucher de soleil passe derrière
  miami: { card: "linear-gradient(transparent, transparent), linear-gradient(rgb(255 255 255 / 70%), rgb(255 255 255 / 70%))", headingInk: "linear-gradient(90deg, #d6006a, #8264e1)" },
  retrowave: {
    // deux couches, comme celui d'Enseigne (la première est fixée sur la fenêtre dans cardFrame) : ici, aucune lumière ;
    // la carte est translucide (le soleil et la grille passent derrière, floutés dans cardFrame)
    card: "linear-gradient(transparent, transparent), linear-gradient(180deg, rgb(34 18 65 / 72%) 0%, rgb(26 13 49 / 76%) 100%)",
    cardHead: "linear-gradient(180deg, rgb(255 255 255 / 4%), transparent)",
    rim: "linear-gradient(135deg, rgb(255 200 70 / 30%), rgb(255 200 70 / 0) 35%, rgb(255 61 119 / 0) 60%, rgb(255 61 119 / 55%))",
    tabGlow: "linear-gradient(to top, rgb(255 130 65 / 22%), rgb(255 130 65 / 5%) 65%, transparent)",
    headingInk: "linear-gradient(90deg, #ff9ab8, #ffc846)",
  },
  holo: {
    card: "linear-gradient(transparent, transparent), linear-gradient(180deg, #1a1521 0%, #120e17 100%)",
    cardHead: "linear-gradient(180deg, rgb(255 255 255 / 4.5%), transparent)",
    // arête irisée autour de chaque carte
    rim: "conic-gradient(from 210deg, rgb(255 61 119 / 85%), rgb(130 100 225 / 60%), rgb(51 209 255 / 65%), rgb(255 61 119 / 15%), rgb(255 61 119 / 85%))",
    tabGlow: "linear-gradient(to top, rgb(130 100 225 / 24%), rgb(51 209 255 / 5%) 65%, transparent)",
  },
  aubergine: { card: "none", cardHead: "none", rim: "none", tabGlow: "none" },
};

const SYSTEM_MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
/** Polices des titres (`heading`), des onglets et rubriques (`display`), des chiffres (`mono`) ; le texte courant ne change pas */
export const THEME_FONTS: Record<ExtraTheme, { heading: string; headingWeight: string; display: string; mono: string; cardRadius: string }> = {
  // Righteous et Audiowide n'ont qu'une graisse : pas de gras simulé
  miami: { heading: "{fonts.righteous}", headingWeight: "{fontWeights.normal}", display: "{fonts.body}", mono: SYSTEM_MONO, cardRadius: "{radii.xl}" },
  retrowave: { heading: "{fonts.audiowide}", headingWeight: "{fontWeights.normal}", display: "{fonts.chakra}", mono: "{fonts.kode}", cardRadius: "{radii.lg}" },
  holo: { heading: "{fonts.chakra}", headingWeight: "{fontWeights.semibold}", display: "{fonts.chakra}", mono: "{fonts.kode}", cardRadius: "{radii.xl}" },
  classique: { heading: "{fonts.body}", headingWeight: "{fontWeights.semibold}", display: "{fonts.body}", mono: SYSTEM_MONO, cardRadius: "{radii.xl}" },
  aubergine: { heading: "{fonts.body}", headingWeight: "{fontWeights.semibold}", display: "{fonts.body}", mono: SYSTEM_MONO, cardRadius: "{radii.xl}" },
};

/** Couleurs d'un thème dans un schéma (0 : clair, 1 : sombre) ; Enseigne, ou un thème d'un autre schéma : celles d'Enseigne */
export function themeColors(theme: string, scheme: 0 | 1): Record<ColorName, string> {
  const own = (THEME_SCHEME as Record<string, string>)[theme] === (scheme ? "dark" : "light") ? THEME_COLORS[theme as ExtraTheme] : {};
  return Object.fromEntries((Object.keys(COLORS) as ColorName[]).map((n) => [n, own[n] ?? COLORS[n][scheme]])) as Record<ColorName, string>;
}
