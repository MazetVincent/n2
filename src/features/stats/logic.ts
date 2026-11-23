// Statistiques de la semaine : délai de première revue, temps de l'ouverture à la fusion des PR, erreurs Sentry,
// semaine par semaine pour voir les tendances. Fonctions pures (partagées par le serveur et les tests).
import type { PrWeek, SlowPr } from "../../server/types.ts";
import { m } from "../../paraglide/messages.js";

export const WEEKS = 8;
const DAY = 86_400_000;

/** Lundi 00:00 (heure locale) de la semaine qui contient cette date */
export function weekStart(at: number | Date): Date {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/** Les débuts des `n` dernières semaines, de la plus ancienne à la semaine en cours */
export function lastWeeks(now: number, n = WEEKS): Date[] {
  const current = weekStart(now);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(current);
    d.setDate(d.getDate() - 7 * (n - 1 - i));
    return d;
  });
}

/** « 2026-11-16 » (date locale, pas UTC) */
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Durée entre deux instants sans les samedis et dimanches (une PR ouverte le vendredi soir n'attend pas 2 jours de plus) */
export function workingMs(start: number, end: number): number {
  if (end <= start) return 0;
  let total = 0;
  let cursor = start;
  while (cursor < end) {
    const next = new Date(cursor);
    next.setHours(24, 0, 0, 0); // minuit suivant (heure locale, changements d'heure compris)
    const stop = Math.min(next.getTime(), end);
    const day = new Date(cursor).getDay();
    if (day !== 0 && day !== 6) total += stop - cursor;
    cursor = stop;
  }
  return total;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Une PR, telle que la lisent les statistiques */
export interface StatsPr {
  number: number;
  title: string;
  url: string;
  author: string;
  bot: boolean;
  createdAt: string;
  /** passage de brouillon à « prête pour revue » (la création si elle n'a jamais été un brouillon) */
  readyAt: string;
  /** première revue d'une autre personne (pas un robot) */
  firstReviewAt: string | null;
  mergedAt: string | null;
}

/** Délai de première revue (heures ouvrées) ; null si pas encore revue ou revue pendant le brouillon */
export const reviewDelay = (p: StatsPr): number | null => {
  if (!p.firstReviewAt) return null;
  const from = Date.parse(p.readyAt);
  const to = Date.parse(p.firstReviewAt);
  return to < from ? null : workingMs(from, to);
};

/** Temps de l'ouverture (prête pour revue) à la fusion (heures ouvrées) */
export const cycleTime = (p: StatsPr): number | null => (p.mergedAt ? workingMs(Date.parse(p.readyAt), Date.parse(p.mergedAt)) : null);

/**
 * Chaque semaine : PR fusionnées et leur temps médian ouverture → fusion (semaine de la fusion),
 * délai médian de première revue (semaine de cette revue). Sans les PR des robots.
 */
export function prWeeks(prs: StatsPr[], weeks: Date[]): PrWeek[] {
  const humans = prs.filter((p) => !p.bot);
  const index = (iso: string | null) => {
    if (!iso) return -1;
    const key = weekStart(Date.parse(iso)).getTime();
    return weeks.findIndex((w) => w.getTime() === key);
  };
  return weeks.map((_, i) => {
    const merged = humans.filter((p) => index(p.mergedAt) === i);
    const reviews = humans.filter((p) => index(p.firstReviewAt) === i).map(reviewDelay).filter((v): v is number => v !== null);
    return {
      merged: merged.length,
      cycle: median(merged.map(cycleTime).filter((v): v is number => v !== null)),
      reviewed: reviews.length,
      review: median(reviews),
    };
  });
}

/** Les PR fusionnées qui ont pris le plus de temps, sur les deux dernières semaines */
export function slowestPrs(prs: StatsPr[], weeks: Date[], limit = 5): SlowPr[] {
  const from = weeks.at(-2)?.getTime() ?? 0;
  return prs
    .filter((p) => !p.bot && p.mergedAt && Date.parse(p.mergedAt) >= from)
    .map((p) => ({ number: p.number, title: p.title, url: p.url, author: p.author, mergedAt: p.mergedAt!, cycle: cycleTime(p)!, review: reviewDelay(p) }))
    .sort((a, b) => b.cycle - a.cycle)
    .slice(0, limit);
}

/** Événements Sentry par jour ([timestamp en secondes, nombre]) regroupés par semaine */
export function weeklyCounts(daily: [number, number][], weeks: Date[]): number[] {
  const totals = weeks.map(() => 0);
  for (const [ts, n] of daily) {
    const key = weekStart(ts * 1000).getTime();
    const i = weeks.findIndex((w) => w.getTime() === key);
    if (i >= 0) totals[i] += n;
  }
  return totals;
}

/** Évolution d'une semaine sur l'autre, en % (null si l'une des deux manque ou si la précédente est nulle) */
export function change(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Durée lisible : « 45 min », « 6 h », « 2,5 j » (jours ouvrés de 24 h, comme les durées calculées) */
export function formatDuration(ms: number | null, lang: "fr" | "en" = "fr"): string {
  if (ms === null) return "—";
  const min = Math.round(ms / 60_000);
  if (min < 60) return m.lib_duration_minutes({ minutes: min }, { locale: lang });
  const h = ms / 3_600_000;
  if (h < 24) return m.stats_duration_hours({ hours: Math.round(h) }, { locale: lang });
  const d = Math.round((ms / DAY) * 10) / 10;
  return m.stats_duration_days({ days: lang === "fr" ? String(d).replace(".", ",") : String(d) }, { locale: lang });
}
