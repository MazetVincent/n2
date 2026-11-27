// Thèmes de N2 autres qu'Enseigne : ce que chacun change dans les jetons (panda.config.ts) et dans les couleurs données
// au guide (src/features/guide/embed.ts). Un thème n'existe que dans un schéma (clair ou sombre) ; ce qu'il ne redéfinit
// pas garde la valeur d'Enseigne dans ce schéma (src/styles/colors.ts et panda.config.ts).
// Le logo (jetons sign et neonSign, police d'enseigne) n'est jamais redéfini : c'est l'enseigne N2 dans tous les thèmes.
import { COLORS, type ColorName } from "./colors";

/** Schéma de chaque thème (Enseigne existe dans les deux) */
export const THEME_SCHEME = { classique: "light", aubergine: "dark" } as const;
export type ExtraTheme = keyof typeof THEME_SCHEME;
export const EXTRA_THEMES = Object.keys(THEME_SCHEME) as ExtraTheme[];

/** Pas de vis aux coins des cartes (caisson d'enseigne) ; les électrodes des interrupteurs restent (jeton electrode) */
const NO_SCREWS = { screw: "transparent", "screw.ring": "transparent" } as const;

export const THEME_COLORS: Record<ExtraTheme, Partial<Record<ColorName, string>>> = {
  // Classique : le clair de la charte, net et sans effet (mêmes couleurs que l'Enseigne de jour, sans le caisson)
  classique: { ...NO_SCREWS },
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
  aubergine: { card: "none", cardHead: "none", rim: "none", tabGlow: "none" },
};

const SYSTEM_MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
/** Polices des titres (`heading`), des onglets et rubriques (`display`), des chiffres (`mono`) ; le texte courant ne change pas */
export const THEME_FONTS: Record<ExtraTheme, { heading: string; headingWeight: string; display: string; mono: string; cardRadius: string }> = {
  classique: { heading: "{fonts.body}", headingWeight: "{fontWeights.semibold}", display: "{fonts.body}", mono: SYSTEM_MONO, cardRadius: "{radii.xl}" },
  aubergine: { heading: "{fonts.body}", headingWeight: "{fontWeights.semibold}", display: "{fonts.body}", mono: SYSTEM_MONO, cardRadius: "{radii.xl}" },
};

/** Couleurs d'un thème dans un schéma (0 : clair, 1 : sombre) ; Enseigne, ou un thème d'un autre schéma : celles d'Enseigne */
export function themeColors(theme: string, scheme: 0 | 1): Record<ColorName, string> {
  const own = (THEME_SCHEME as Record<string, string>)[theme] === (scheme ? "dark" : "light") ? THEME_COLORS[theme as ExtraTheme] : {};
  return Object.fromEntries((Object.keys(COLORS) as ColorName[]).map((n) => [n, own[n] ?? COLORS[n][scheme]])) as Record<ColorName, string>;
}
