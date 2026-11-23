// Statistiques sur 8 semaines.
import type { Message } from "./common.ts";

// ---------- Statistiques de la semaine ----------
/** PR d'une semaine (durées en ms, heures ouvrées : sans samedi ni dimanche) */
export interface PrWeek {
  /** PR fusionnées dans la semaine */
  merged: number;
  /** temps médian de l'ouverture (prête pour revue) à la fusion, pour ces PR */
  cycle: number | null;
  /** PR qui ont reçu leur première revue dans la semaine */
  reviewed: number;
  /** délai médian avant cette première revue */
  review: number | null;
}

export interface StatsWeek {
  /** lundi de la semaine, « 2026-11-16 » */
  start: string;
  /** toutes les PR des dépôts suivis, sans les robots */
  team: PrWeek;
  /** mes PR */
  mine: PrWeek;
  /** événements d'erreur reçus par Sentry (null si Sentry n'a pas répondu) */
  errors: number | null;
  /** problèmes Sentry vus pour la première fois (plafonné à newIssuesCap) */
  newIssues: number | null;
}

export interface SlowPr {
  number: number;
  title: string;
  url: string;
  author: string;
  mergedAt: string;
  cycle: number;
  review: number | null;
}

export interface StatsData {
  weeks: StatsWeek[];
  /** PR fusionnées les plus longues des deux dernières semaines */
  slowest: SlowPr[];
  /** Sentry ne compte pas au-delà : « 100+ » */
  newIssuesCap: number;
  /** GitHub ou Sentry en échec : le reste est quand même affiché */
  failed: { source: "github" | "sentry"; message: Message; hint?: Message }[];
}
