// Langue de l'interface (français par défaut, anglais en option) et traductions.
//
// Les textes sont dans messages/fr.json et messages/en.json (une clé par texte) ; Paraglide en fait des fonctions
// typées : m.prs_review_requested(), m.topbar_last_updated_at({ lastUpdate }). Une clé absente = erreur de compilation.
//
// Le choix de langue est gardé dans un cookie : le serveur le lit pendant le rendu, le navigateur aussi,
// donc la page arrive directement dans la bonne langue (pas d'écart à l'hydratation). Paraglide lit la langue ici.
import { createIsomorphicFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { m } from "~/paraglide/messages.js";
import { overwriteGetLocale, overwriteSetLocale, type Locale } from "~/paraglide/runtime.js";
import type { Message } from "~/server/types";

export { m };

export type Lang = Locale;
export const LANGS: readonly Lang[] = ["fr", "en"];
const COOKIE = "n2-lang";

const parse = (v: string | null | undefined): Lang => (v === "en" ? "en" : "fr");

export const getLang = createIsomorphicFn()
  .server((): Lang => {
    try {
      return parse(getCookie(COOKIE));
    } catch {
      return "fr"; // hors d'une requête (tests…)
    }
  })
  .client((): Lang => parse(document.cookie.match(/(?:^|;\s*)n2-lang=(\w+)/)?.[1]));

/** Locale pour les dates et les nombres */
export const locale = (): string => (getLang() === "en" ? "en-GB" : "fr-FR");

/** Change de langue : le cookie est retenu un an, puis la page est rechargée dans la nouvelle langue. */
export function setLang(lang: Lang) {
  document.cookie = `${COOKIE}=${lang}; path=/; max-age=31536000; SameSite=Lax`;
  location.reload();
}

// Paraglide demande la langue à chaque message : c'est celle du cookie (côté serveur, celui de la requête en cours).
overwriteGetLocale(() => getLang());
overwriteSetLocale((lang) => setLang(lang));

// ---------- Messages renvoyés par le serveur (erreurs des sources, résultats des actions) ----------
type MessageFn = (params?: Record<string, string>) => string;

/** Le texte d'un message du serveur dans la langue courante (une clé inconnue est affichée telle quelle). */
export function msg(message: Message): string;
export function msg(message: Message | undefined): string | undefined;
export function msg(message: Message | undefined): string | undefined {
  if (!message) return undefined;
  const fn = (m as unknown as Record<string, MessageFn | undefined>)[message.key];
  return fn ? fn(message.params ?? {}) : message.key;
}

// ---------- Libellés des parties de la carte ----------
// Calculés côté serveur en français (« racine · x », « autres », « racine src ») : traduits à l'affichage.
export function trPart(label: string): string;
export function trPart(label: string | undefined): string | undefined;
export function trPart(label: string | undefined): string | undefined {
  if (!label || getLang() === "fr") return label;
  return label
    .replace(/\bracine src\b/g, m.map_part_root_src())
    .replace(/\(racine\)/g, `(${m.map_part_root()})`)
    .replace(/\bracine\b/g, m.map_part_root())
    .replace(/\bautres\b/g, m.map_part_other());
}
