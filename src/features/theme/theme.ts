// Thème de la page : lu dans le cookie (par le serveur pendant le rendu, et par le navigateur), changé par les Préférences.
// Règles et script de <head> : ./logic.ts
import { createIsomorphicFn } from "@tanstack/react-start";
import { useSyncExternalStore } from "react";
import { getCookie } from "@tanstack/react-start/server";
import { stopSos } from "../secret/morse-sos";
import { formatTheme, parseTheme, resolveTheme, THEME_COOKIE, themeAttributes, type ThemeChoice } from "./logic";

/** Évènement de la page quand le thème change (les composants qui en dépendent se mettent à jour) */
const CHANGE = "n2-theme";

export const getTheme = createIsomorphicFn()
  .server((): ThemeChoice => {
    try {
      return parseTheme(getCookie(THEME_COOKIE));
    } catch {
      return parseTheme(undefined); // hors d'une requête (tests…)
    }
  })
  .client((): ThemeChoice => parseTheme(document.cookie.match(/(?:^|;\s*)n2-theme=([\w.-]+)/)?.[1]));

/** Change de thème tout de suite (sans recharger) et le retient un an dans ce navigateur */
export function setTheme(c: ThemeChoice) {
  document.cookie = `${THEME_COOKIE}=${formatTheme(c)}; path=/; max-age=31536000; SameSite=Lax`;
  const html = document.documentElement;
  for (const [name, value] of Object.entries(themeAttributes(c))) html.setAttribute(name, value);
  // même calcul que le script de <head>, qui continue ensuite de suivre macOS en relisant ces attributs
  const { theme, scheme } = resolveTheme(c, matchMedia("(prefers-color-scheme: dark)").matches);
  html.dataset.theme = theme;
  html.dataset.scheme = scheme;
  // clignotements coupés : un S.O.S en cours s'arrête aussi
  if (!c.logoBlink) stopSos();
  window.dispatchEvent(new Event(CHANGE));
}

const subscribe = (onChange: () => void) => {
  window.addEventListener(CHANGE, onChange);
  return () => window.removeEventListener(CHANGE, onChange);
};
// le cookie, lu par le serveur au rendu puis par la page à l'hydratation : les deux rendus sont les mêmes
const snapshot = () => formatTheme(getTheme());

/** Choix de thème, mis à jour quand les Préférences le changent (le guide se recharge alors avec ses couleurs) */
export function useThemeChoice(): ThemeChoice {
  return parseTheme(useSyncExternalStore(subscribe, snapshot, snapshot));
}
