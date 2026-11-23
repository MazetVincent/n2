// Agenda : lecture d'un fichier ICS au format Outlook (fuseau Windows, récurrences, exceptions), réponses Graph,
// jours affichés et état des réunions. Données inventées.
import { describe, expect, it } from "vitest";
import { calendarRange, fromGraph, parseIcs } from "../src/server/sources/calendar.ts";
import { daysToShow, eventsOn, meetingState, nextMeeting } from "../src/features/calendar/logic.ts";
import type { CalendarEvent } from "../src/server/types.ts";

const TZ = `BEGIN:VTIMEZONE
TZID:Romance Standard Time
BEGIN:STANDARD
DTSTART:16010101T030000
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=-1SU;BYMONTH=10
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:16010101T020000
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=-1SU;BYMONTH=3
END:DAYLIGHT
END:VTIMEZONE`;

const ics = (...events: string[]) =>
  ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:Microsoft Exchange Server 2010", TZ, ...events, "END:VCALENDAR"].join("\r\n");

// Daily : tous les jours ouvrés à 9 h 30 (heure de Paris) depuis septembre ; mercredi 25 annulé (EXDATE), jeudi 26 déplacé à 11 h
const daily = `BEGIN:VEVENT
UID:daily-1
SUMMARY:Daily équipe
DTSTART;TZID=Romance Standard Time:20260901T093000
DTEND;TZID=Romance Standard Time:20260901T094500
RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR
EXDATE;TZID=Romance Standard Time:20261125T093000
LOCATION:Réunion Microsoft Teams
DESCRIPTION:Rejoindre : https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0?context=x
ORGANIZER;CN=Camille Martin:mailto:camille@example.com
X-MICROSOFT-CDO-BUSYSTATUS:BUSY
END:VEVENT`;
const moved = `BEGIN:VEVENT
UID:daily-1
RECURRENCE-ID;TZID=Romance Standard Time:20261126T093000
SUMMARY:Daily équipe (décalé)
DTSTART;TZID=Romance Standard Time:20261126T110000
DTEND;TZID=Romance Standard Time:20261126T111500
END:VEVENT`;
const allDay = `BEGIN:VEVENT
UID:conges
SUMMARY:Congés
DTSTART;VALUE=DATE:20261127
DTEND;VALUE=DATE:20261128
X-MICROSOFT-CDO-BUSYSTATUS:OOF
END:VEVENT`;
const cancelled = `BEGIN:VEVENT
UID:annulee
SUMMARY:Annulé : point produit
STATUS:CANCELLED
DTSTART:20261124T130000Z
DTEND:20261124T140000Z
END:VEVENT`;
const utcEvent = `BEGIN:VEVENT
UID:demo
SUMMARY:Démo client
DTSTART:20261124T150000Z
DTEND:20261124T160000Z
X-MICROSOFT-SKYPETEAMSMEETINGURL:https://teams.microsoft.com/l/meetup-join/demo
X-MICROSOFT-CDO-BUSYSTATUS:TENTATIVE
END:VEVENT`;
const busyOnly = `BEGIN:VEVENT
UID:prive
DTSTART:20261123T120000Z
DTEND:20261123T130000Z
END:VEVENT`;

// semaine du lundi 23 au dimanche 29 novembre 2026, en UTC pour ne pas dépendre du fuseau de la machine
const from = new Date("2026-11-23T00:00:00Z");
const to = new Date("2026-11-30T00:00:00Z");

describe("parseIcs : agenda publié par Outlook", () => {
  const events = parseIcs(ics(daily, moved, allDay, cancelled, utcEvent, busyOnly), from, to);
  const dailies = events.filter((e) => e.title.startsWith("Daily"));

  it("déroule la récurrence, sans l'occurrence annulée, avec l'occurrence déplacée", () => {
    expect(dailies.map((e) => e.start)).toEqual([
      "2026-11-23T08:30:00.000Z",
      "2026-11-24T08:30:00.000Z",
      "2026-11-26T10:00:00.000Z",
      "2026-11-27T08:30:00.000Z",
    ]);
    expect(dailies[2].title).toBe("Daily équipe (décalé)");
  });

  it("applique le fuseau Windows décrit dans le fichier (heure d'hiver : UTC+1)", () => {
    expect(dailies[0].end).toBe("2026-11-23T08:45:00.000Z");
  });

  it("donne aux occurrences des identifiants distincts", () => {
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
  });

  it("trouve le lien Teams dans la description ou dans la propriété Microsoft", () => {
    expect(dailies[0].joinUrl).toMatch(/^https:\/\/teams\.microsoft\.com\/l\/meetup-join\/19%3ameeting_abc/);
    expect(events.find((e) => e.title === "Démo client")?.joinUrl).toBe("https://teams.microsoft.com/l/meetup-join/demo");
  });

  it("lit l'organisateur, la disponibilité et les journées entières", () => {
    expect(dailies[0].organizer).toBe("Camille Martin");
    expect(events.find((e) => e.title === "Démo client")?.showAs).toBe("tentative");
    const off = events.find((e) => e.title === "Congés")!;
    expect(off.allDay).toBe(true);
    expect(off.showAs).toBe("oof");
    expect(new Date(off.start).getDate()).toBe(27);
  });

  it("ignore les réunions annulées et nomme les créneaux sans titre « Occupé »", () => {
    expect(events.some((e) => e.title.includes("point produit"))).toBe(false);
    expect(events.find((e) => e.id === "prive")?.title).toBe("Occupé");
  });

  it("ne garde que la période demandée, triée par début", () => {
    expect(parseIcs(ics(daily), new Date("2026-11-30T00:00:00Z"), new Date("2026-12-01T00:00:00Z"))).toHaveLength(1);
    expect(events.map((e) => e.start)).toEqual([...events.map((e) => e.start)].sort());
  });

  it("refuse un fichier illisible", () => {
    expect(() => parseIcs("pas un agenda", from, to)).toThrow("srv_ics_unreadable");
  });
});

describe("fromGraph : réponse de Microsoft Graph", () => {
  const base = { id: "1", subject: "Rétro", isCancelled: false, showAs: "busy", webLink: "https://outlook.office.com/x", responseStatus: { response: "accepted" } };

  it("lit les heures UTC et le lien Teams", () => {
    const e = fromGraph({ ...base, start: { dateTime: "2026-11-24T14:00:00.0000000" }, end: { dateTime: "2026-11-24T15:00:00.0000000" }, isAllDay: false, onlineMeeting: { joinUrl: "https://teams.microsoft.com/l/meetup-join/r" } });
    expect(e.start).toBe("2026-11-24T14:00:00.000Z");
    expect(e.joinUrl).toBe("https://teams.microsoft.com/l/meetup-join/r");
    expect(e.webUrl).toBe("https://outlook.office.com/x");
  });

  it("garde la date d'un événement « toute la journée », à minuit heure locale", () => {
    const e = fromGraph({ ...base, start: { dateTime: "2026-11-27T00:00:00.0000000" }, end: { dateTime: "2026-11-28T00:00:00.0000000" }, isAllDay: true, showAs: "workingElsewhere" });
    expect(e.start).toBe(new Date(2026, 10, 27).toISOString());
    expect(e.showAs).toBe("elsewhere");
  });
});

const ev = (start: string, end: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: start,
  title: "R",
  start: new Date(start).toISOString(),
  end: new Date(end).toISOString(),
  allDay: false,
  location: null,
  joinUrl: null,
  webUrl: null,
  organizer: null,
  showAs: "busy",
  cancelled: false,
  ...extra,
});

describe("jours affichés et état des réunions", () => {
  it("calendarRange : du lundi de la semaine, sur 14 jours", () => {
    const { from, to } = calendarRange(new Date(2026, 10, 26, 15));
    expect(from).toEqual(new Date(2026, 10, 23));
    expect(to).toEqual(new Date(2026, 11, 7));
  });

  it("vue Semaine : du lundi au vendredi ; le week-end, la semaine suivante", () => {
    expect(daysToShow("week", [], new Date(2026, 10, 25, 10)).map((d) => d.getDate())).toEqual([23, 24, 25, 26, 27]);
    expect(daysToShow("week", [], new Date(2026, 10, 21, 10)).map((d) => d.getDate())).toEqual([23, 24, 25, 26, 27]);
    expect(daysToShow("day", [], new Date(2026, 10, 25, 10)).map((d) => d.getDate())).toEqual([25]);
  });

  it("vue Semaine : samedi ou dimanche apparaissent s'ils ont un événement", () => {
    const sat = ev("2026-11-28T10:00", "2026-11-28T11:00");
    expect(daysToShow("week", [sat], new Date(2026, 10, 25)).map((d) => d.getDate())).toEqual([23, 24, 25, 26, 27, 28]);
    expect(eventsOn([sat], new Date(2026, 10, 28))).toEqual([sat]);
    expect(eventsOn([sat], new Date(2026, 10, 27))).toEqual([]);
  });

  it("passée, en cours, imminente (moins de 15 min), plus tard", () => {
    const now = new Date("2026-11-24T10:00").getTime();
    expect(meetingState(ev("2026-11-24T09:00", "2026-11-24T09:30"), now)).toBe("past");
    expect(meetingState(ev("2026-11-24T09:45", "2026-11-24T10:15"), now)).toBe("now");
    expect(meetingState(ev("2026-11-24T10:10", "2026-11-24T10:30"), now)).toBe("soon");
    expect(meetingState(ev("2026-11-24T11:00", "2026-11-24T12:00"), now)).toBe("later");
  });

  it("prochaine réunion : ni passée, ni annulée, ni « disponible », ni toute la journée", () => {
    const now = new Date("2026-11-24T10:00").getTime();
    const events = [
      ev("2026-11-24T00:00", "2026-11-25T00:00", { allDay: true }),
      ev("2026-11-24T09:00", "2026-11-24T09:30"),
      ev("2026-11-24T10:30", "2026-11-24T11:00", { cancelled: true }),
      ev("2026-11-24T11:00", "2026-11-24T11:30", { showAs: "free" }),
      ev("2026-11-24T14:00", "2026-11-24T15:00"),
    ];
    expect(nextMeeting(events, now)).toBe(events[4]);
  });
});
