// Thème de N2 (docs/adr/0011-theme-dans-un-cookie.md ; Préférences, rubrique « Apparence ») : un thème de jour, un thème de nuit, et quand les afficher
// (« Automatique » : selon le réglage clair / sombre de macOS, comme avant ; « Jour » ou « Nuit » : toujours le même).
//
// Le choix est gardé dans un cookie, comme la langue : c'est un réglage d'affichage du navigateur, pas de la config.
// Le serveur le pose sur <html> (data-mode, data-day, data-night) ; un petit script dans <head> (THEME_SCRIPT), lancé
// avant l'affichage, en tire le thème affiché (data-theme) et son schéma (data-scheme), puis suit macOS en mode
// Automatique. Les styles lisent data-scheme (condition `_dark` de panda.config.ts) : pas de flash au chargement.
//
// Le logo N2 (l'enseigne au néon) ne dépend d'aucun thème. Ses clignotements (battements, S.O.S en morse) se coupent
// dans la même rubrique (logoBlink, attribut data-logo) : il reste alors allumé, sans bouger.
// Fonctions pures, partagées par le serveur (rendu de <html>), la page et les tests.

/** Thèmes proposés le jour (clairs) et la nuit (sombres) ; « enseigne » existe dans les deux schémas.
 *  Ce que chaque autre thème change : src/styles/themes.ts */
export const DAY_THEMES = ["enseigne", "classique", "miami"] as const;
export const NIGHT_THEMES = ["enseigne", "retrowave", "holo", "aubergine"] as const;
export type DayTheme = (typeof DAY_THEMES)[number];
export type NightTheme = (typeof NIGHT_THEMES)[number];
export type ThemeId = DayTheme | NightTheme;

export const THEME_MODES = ["auto", "day", "night"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export interface ThemeChoice {
  mode: ThemeMode;
  day: DayTheme;
  night: NightTheme;
  /** le logo bat de temps en temps et clignote S.O.S en morse ; false : allumé, sans bouger */
  logoBlink: boolean;
}

export const DEFAULT_THEME: ThemeChoice = { mode: "auto", day: "enseigne", night: "enseigne", logoBlink: true };

export const THEME_COOKIE = "n2-theme";

const pick = <T extends string>(list: readonly T[], v: string | undefined, fallback: T): T => ((list as readonly string[]).includes(v ?? "") ? (v as T) : fallback);

/** Choix lu dans le cookie (« auto.enseigne.enseigne.blink ») ; une valeur inconnue ou un thème retiré reprend sa valeur par défaut */
export function parseTheme(cookie: string | null | undefined): ThemeChoice {
  const [mode, day, night, logo] = (cookie ?? "").split(".");
  return {
    mode: pick(THEME_MODES, mode, DEFAULT_THEME.mode),
    day: pick(DAY_THEMES, day, DEFAULT_THEME.day),
    night: pick(NIGHT_THEMES, night, DEFAULT_THEME.night),
    // seul « still » coupe les clignotements (un cookie d'avant ce réglage n'a pas ce morceau)
    logoBlink: logo !== "still",
  };
}

/** Valeur du cookie (lettres, chiffres, tirets et points : rien à échapper) */
export const formatTheme = (c: ThemeChoice): string => `${c.mode}.${c.day}.${c.night}.${c.logoBlink ? "blink" : "still"}`;

/** Thème affiché et son schéma, selon le choix et le réglage de macOS (`systemDark`) */
export function resolveTheme(c: ThemeChoice, systemDark: boolean): { theme: ThemeId; scheme: "light" | "dark" } {
  const dark = c.mode === "night" || (c.mode === "auto" && systemDark);
  return dark ? { theme: c.night, scheme: "dark" } : { theme: c.day, scheme: "light" };
}

/** Attributs de <html> rendus par le serveur ; THEME_SCRIPT en tire data-theme et data-scheme */
export const themeAttributes = (c: ThemeChoice) => ({ "data-mode": c.mode, "data-day": c.day, "data-night": c.night, "data-logo": c.logoBlink ? "blink" : "still" });

/** Les clignotements du logo sont-ils coupés dans cette page ? (lu à chaque fois : le réglage s'applique sans recharger) */
export const logoStill = () => typeof document !== "undefined" && document.documentElement.dataset.logo === "still";

/**
 * Script lancé dans <head>, avant l'affichage : pose data-theme et data-scheme d'après data-mode, data-day et
 * data-night, puis suit le réglage de macOS (il relit les attributs : la page peut les changer, voir applyTheme).
 * Même règle que resolveTheme (vérifié par les tests).
 */
export const THEME_SCRIPT = `(()=>{const d=document.documentElement,q=matchMedia("(prefers-color-scheme: dark)"),a=()=>{const m=d.dataset.mode,k=m==="night"||(m!=="day"&&q.matches);d.dataset.scheme=k?"dark":"light";d.dataset.theme=(k?d.dataset.night:d.dataset.day)||"enseigne"};a();q.addEventListener("change",a)})();`;
