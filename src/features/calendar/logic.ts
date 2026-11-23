// Agenda du Dashboard : jours affichés et état de chaque réunion (passée, en cours, imminente).
import type { CalendarEvent } from "~/server/types";

export type CalendarView = "day" | "week";
export type MeetingState = "past" | "now" | "soon" | "later";

/** Une réunion qui commence dans moins de 15 minutes est « imminente » */
export const SOON_MS = 15 * 60_000;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Les événements qui touchent le jour `day` (minuit à minuit, heure locale), dans l'ordre */
export function eventsOn(events: CalendarEvent[], day: Date): CalendarEvent[] {
  const from = startOfDay(day).getTime();
  const to = addDays(day, 1).getTime();
  return events.filter((e) => Date.parse(e.start) < to && Date.parse(e.end) > from);
}

/**
 * Jours affichés : aujourd'hui (vue Jour), ou du lundi au vendredi (vue Semaine). Le week-end, la vue Semaine
 * montre la semaine suivante ; samedi et dimanche n'apparaissent que s'ils ont des événements.
 */
export function daysToShow(view: CalendarView, events: CalendarEvent[], now = new Date()): Date[] {
  const today = startOfDay(now);
  if (view === "day") return [today];
  const weekend = today.getDay() === 0 || today.getDay() === 6;
  const monday = addDays(today, -((today.getDay() + 6) % 7) + (weekend ? 7 : 0));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i)).filter((d, i) => i < 5 || eventsOn(events, d).length > 0);
}

export function meetingState(e: CalendarEvent, now = Date.now()): MeetingState {
  const start = Date.parse(e.start);
  const end = Date.parse(e.end);
  if (end <= now) return "past";
  if (start <= now) return e.allDay ? "later" : "now";
  return start - now <= SOON_MS ? "soon" : "later";
}

/** La prochaine réunion (pas toute la journée, pas annulée) qui n'est pas terminée */
export const nextMeeting = (events: CalendarEvent[], now = Date.now()) =>
  events.find((e) => !e.allDay && !e.cancelled && e.showAs !== "free" && Date.parse(e.end) > now);

export const isSameDay = (a: Date, b: Date) => startOfDay(a).getTime() === startOfDay(b).getTime();
