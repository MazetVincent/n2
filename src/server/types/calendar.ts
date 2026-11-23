// Agenda (Teams / Outlook).
import type { Message } from "./common.ts";

// ---------- Agenda (Teams / Outlook) ----------
export type CalendarShowAs = "busy" | "tentative" | "free" | "oof" | "elsewhere";

export interface CalendarEvent {
  id: string;
  title: string;
  /** dates ISO ; pour un événement « toute la journée », minuit heure locale */
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  /** lien « Rejoindre » d'une réunion Teams */
  joinUrl: string | null;
  /** l'événement dans Outlook (Graph uniquement) */
  webUrl: string | null;
  organizer: string | null;
  showAs: CalendarShowAs;
  cancelled: boolean;
}

export interface CalendarData {
  /** d'où vient l'agenda */
  source: "graph" | "ics" | null;
  /** période lue : du lundi de la semaine en cours, sur 14 jours */
  from: string;
  to: string;
  events: CalendarEvent[];
  /** Microsoft Graph configuré : « needed » = pas encore connecté, « connected » = agenda lu par Graph */
  graph: "none" | "needed" | "connected";
}

export interface MicrosoftLogin {
  state: "idle" | "pending" | "done" | "error";
  /** code à saisir sur la page Microsoft */
  userCode?: string;
  verificationUri?: string;
  expiresAt?: string;
  error?: Message;
}
