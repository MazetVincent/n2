import ICAL from "ical.js";
import type { Config } from "../config.ts";
import { httpFetch, SourceFailure } from "../run.ts";
import type { CalendarData, CalendarEvent, CalendarShowAs } from "../types.ts";
import { accessToken } from "./microsoft-auth.ts";
import { msg } from "../messages.ts";

// Agenda Teams / Outlook du Dashboard.
//  - Microsoft Graph (calendar.graph) une fois connecté : récurrences et liens Teams fournis par Microsoft ;
//  - sinon le lien ICS publié depuis Outlook (calendar.icsUrl) : N2 déroule lui-même les réunions récurrentes.

/** Lundi 00:00 (heure locale) de la semaine de `now`, et 14 jours plus tard : semaine en cours + suivante */
export function calendarRange(now = new Date()): { from: Date; to: Date } {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  from.setDate(from.getDate() - ((from.getDay() + 6) % 7));
  const to = new Date(from);
  to.setDate(to.getDate() + 14);
  return { from, to };
}

export async function fetchCalendar(cfg: Config, now = new Date()): Promise<CalendarData> {
  const c = cfg.calendar;
  if (!c?.icsUrl && !c?.graph) {
    throw new SourceFailure({ kind: "config", message: msg("srv_calendar_not_configured"), hint: msg("srv_hint_calendar_config") });
  }
  const { from, to } = calendarRange(now);
  const base = { from: from.toISOString(), to: to.toISOString() };

  if (c.graph) {
    const token = await accessToken(c.graph);
    if (token) return { ...base, source: "graph", graph: "connected", events: await graphEvents(c.graph, token, from, to) };
  }
  const graph = c.graph ? "needed" : "none";
  if (!c.icsUrl) return { ...base, source: null, graph, events: [] };
  return { ...base, source: "ics", graph, events: parseIcs(await fetchIcs(c.icsUrl), from, to) };
}

// ---------- Lien ICS ----------
async function fetchIcs(url: string): Promise<string> {
  if (!/^https:\/\//.test(url)) throw new SourceFailure({ kind: "config", message: msg("srv_ics_https") });
  const res = await httpFetch(url, { headers: { Accept: "text/calendar" } });
  if (res.status === 404 || res.status === 401 || res.status === 403) {
    throw new SourceFailure({ kind: "auth", message: msg("srv_ics_gone", { status: res.status }), hint: msg("srv_hint_ics_republish") });
  }
  if (!res.ok) throw new SourceFailure({ kind: "unavailable", message: msg("srv_outlook_responded", { status: res.status }) });
  return res.text();
}

const TEAMS_URL = /https:\/\/teams\.(?:microsoft|live)\.com\/(?:l\/meetup-join|meet)\/[^\s<>"')\]]+/;
const teamsLink = (...texts: (string | null | undefined)[]) => texts.map((t) => t?.match(TEAMS_URL)?.[0]).find(Boolean) ?? null;

const BUSY: Record<string, CalendarShowAs> = { BUSY: "busy", TENTATIVE: "tentative", FREE: "free", OOF: "oof", WORKINGELSEWHERE: "elsewhere" };

/** Les événements d'un fichier ICS qui touchent [from, to), récurrences déroulées, triés par début. */
export function parseIcs(text: string, from: Date, to: Date): CalendarEvent[] {
  let root: ICAL.Component;
  try {
    root = new ICAL.Component(ICAL.parse(text));
  } catch {
    throw new SourceFailure({ kind: "unavailable", message: msg("srv_ics_unreadable") });
  }
  // Outlook décrit ses fuseaux (« Romance Standard Time »…) dans le fichier : on les enregistre avant de lire les dates.
  for (const tz of root.getAllSubcomponents("vtimezone")) ICAL.TimezoneService.register(tz);

  const masters: ICAL.Event[] = [];
  const exceptions: ICAL.Event[] = [];
  for (const v of root.getAllSubcomponents("vevent")) {
    const e = new ICAL.Event(v);
    (e.isRecurrenceException() ? exceptions : masters).push(e);
  }
  const byUid = new Map(masters.map((m) => [m.uid, m]));
  for (const ex of exceptions) byUid.get(ex.uid)?.relateException(ex);

  const out: CalendarEvent[] = [];
  const add = (e: ICAL.Event, start: ICAL.Time, end: ICAL.Time, key: string) => {
    const s = start.toJSDate();
    const en = end.toJSDate();
    if (en <= from || s >= to) return;
    if (e.component.getFirstPropertyValue("status") === "CANCELLED") return;
    out.push(toEvent(e, s, en, start.isDate, key));
  };

  for (const m of masters) {
    if (!m.startDate) continue;
    if (!m.isRecurring()) {
      add(m, m.startDate, m.endDate ?? m.startDate, m.uid);
      continue;
    }
    const it = m.iterator();
    for (let next = it.next(), n = 0; next && n < 50_000; next = it.next(), n++) {
      const d = m.getOccurrenceDetails(next);
      if (d.startDate.toJSDate() >= to) break;
      // occurrence déplacée ou modifiée : traitée plus bas avec les exceptions (sa nouvelle date peut sortir de la période)
      if (d.item !== m) continue;
      add(m, d.startDate, d.endDate, `${m.uid}:${next.toString()}`);
    }
  }
  for (const ex of exceptions) if (ex.startDate) add(ex, ex.startDate, ex.endDate ?? ex.startDate, `${ex.uid}:${ex.recurrenceId?.toString()}`);

  return out.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
}

function toEvent(e: ICAL.Event, start: Date, end: Date, allDay: boolean, id: string): CalendarEvent {
  const c = e.component;
  const str = (name: string) => {
    const v = c.getFirstPropertyValue(name);
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  const organizer = c.getFirstProperty("organizer");
  const busy = str("x-microsoft-cdo-busystatus")?.toUpperCase();
  return {
    id,
    // agenda publié en « disponibilités seulement » : pas de titre
    title: e.summary?.trim() || "Occupé",
    start: start.toISOString(),
    end: end.toISOString(),
    allDay,
    location: e.location?.trim() || null,
    joinUrl: teamsLink(str("x-microsoft-skypeteamsmeetingurl"), e.location, e.description),
    webUrl: null,
    organizer: (organizer?.getParameter("cn") as string | undefined) ?? null,
    showAs: (busy && BUSY[busy]) || (str("transp") === "TRANSPARENT" ? "free" : "busy"),
    cancelled: false,
  };
}

// ---------- Microsoft Graph ----------
type GraphConfig = NonNullable<NonNullable<Config["calendar"]>["graph"]>;

interface GraphEvent {
  id: string;
  subject: string | null;
  start: { dateTime: string };
  end: { dateTime: string };
  isAllDay: boolean;
  isCancelled: boolean;
  showAs: string;
  webLink: string | null;
  location?: { displayName?: string | null };
  onlineMeeting?: { joinUrl?: string | null } | null;
  organizer?: { emailAddress?: { name?: string | null } };
  responseStatus?: { response?: string };
}

const SHOW_AS: Record<string, CalendarShowAs> = { busy: "busy", tentative: "tentative", free: "free", oof: "oof", workingElsewhere: "elsewhere" };

// Graph renvoie des heures UTC sans « Z » (Prefer: outlook.timezone="UTC") ; un événement « toute la journée »
// commence à minuit dans ce fuseau : on garde la date, à minuit heure locale.
const utc = (s: string) => new Date(`${s.slice(0, 19)}Z`);
const localDay = (s: string) => new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));

export function fromGraph(e: GraphEvent): CalendarEvent {
  const [start, end] = e.isAllDay ? [localDay(e.start.dateTime), localDay(e.end.dateTime)] : [utc(e.start.dateTime), utc(e.end.dateTime)];
  return {
    id: e.id,
    title: e.subject?.trim() || "Sans titre",
    start: start.toISOString(),
    end: end.toISOString(),
    allDay: e.isAllDay,
    location: e.location?.displayName?.trim() || null,
    joinUrl: e.onlineMeeting?.joinUrl ?? null,
    webUrl: e.webLink,
    organizer: e.organizer?.emailAddress?.name ?? null,
    showAs: SHOW_AS[e.showAs] ?? "busy",
    cancelled: e.isCancelled,
  };
}

async function graphEvents(g: GraphConfig, token: string, from: Date, to: Date): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    startDateTime: from.toISOString(),
    endDateTime: to.toISOString(),
    $select: "id,subject,start,end,isAllDay,isCancelled,showAs,webLink,location,onlineMeeting,organizer,responseStatus",
    $orderby: "start/dateTime",
    $top: "100",
  });
  let url: string | undefined = `https://graph.microsoft.com/v1.0/me/calendarView?${params}`;
  const events: GraphEvent[] = [];
  let retried = false;
  for (let page = 0; url && page < 10; page++) {
    const res = await httpFetch(url, { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="UTC"' } });
    if (res.status === 401 && !retried) {
      // jeton révoqué avant son expiration : un renouvellement, puis on réessaie la même page
      retried = true;
      const fresh = await accessToken(g, true);
      if (!fresh) throw new SourceFailure({ kind: "auth", message: msg("srv_ms_session_expired"), hint: msg("srv_hint_ms_reconnect") });
      token = fresh;
      page--;
      continue;
    }
    if (res.status === 401 || res.status === 403) {
      throw new SourceFailure({ kind: "auth", message: msg("srv_graph_denied", { status: res.status }), hint: msg("srv_hint_graph_permission") });
    }
    if (!res.ok) throw new SourceFailure({ kind: "unavailable", message: msg("srv_graph_responded", { status: res.status }) });
    const body = (await res.json()) as { value: GraphEvent[]; "@odata.nextLink"?: string };
    events.push(...body.value);
    url = body["@odata.nextLink"];
  }
  // invitations refusées : on n'y va pas
  return events.filter((e) => e.responseStatus?.response !== "declined").map(fromGraph);
}
