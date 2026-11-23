// « À faire » reporté / ignoré, et choix des notifications (pas de rafale, une seule fois par nouveauté).
import { describe, expect, it } from "vitest";
import type { TodoItem } from "../src/features/todo/logic.ts";
import { IGNORE_MS, isHidden, nextMorning, partition, prune, type Snoozes } from "../src/features/todo/snooze.ts";
import {
  calendarCandidates,
  groupNotifications,
  MAX_SEPARATE,
  selectNotifications,
  slackCandidates,
  todoCandidates,
  type Candidate,
  type SeenStore,
} from "../src/features/notify/logic.ts";
import type { CalendarEvent, SlackData } from "../src/server/types.ts";

const item = (id: string, extra: Partial<TodoItem> = {}): TodoItem => ({ id, urgency: "now", label: "Ma PR bloquée", title: `PR ${id}`, ...extra });
const NOW = new Date(2026, 10, 24, 10).getTime();

describe("reporter et ignorer", () => {
  it("un report masque l'élément jusqu'à son heure", () => {
    const e = { until: NOW + 3600_000, version: "", at: NOW };
    expect(isHidden(item("a"), e, NOW)).toBe(true);
    expect(isHidden(item("a"), e, NOW + 3600_000)).toBe(false);
  });

  it("un élément ignoré revient quand sa version change (nouvelle raison de blocage)", () => {
    const e = { until: null, version: "ci", at: NOW };
    expect(isHidden(item("a", { version: "ci" }), e, NOW)).toBe(true);
    expect(isHidden(item("a", { version: "ci+conflicts" }), e, NOW)).toBe(false);
  });

  it("un élément ignoré est oublié au bout de 30 jours", () => {
    const e = { until: null, version: "", at: NOW };
    expect(isHidden(item("a"), e, NOW + IGNORE_MS - 1)).toBe(true);
    expect(isHidden(item("a"), e, NOW + IGNORE_MS)).toBe(false);
  });

  it("partition sépare les éléments affichés des masqués", () => {
    const snoozes: Snoozes = { b: { until: null, version: "", at: NOW } };
    const { visible, hidden } = partition([item("a"), item("b"), item("c")], snoozes, NOW);
    expect(visible.map((i) => i.id)).toEqual(["a", "c"]);
    expect(hidden.map((h) => h.item.id)).toEqual(["b"]);
  });

  it("prune retire les reports terminés et les vieux éléments ignorés", () => {
    const snoozes: Snoozes = {
      fini: { until: NOW - 1, version: "", at: NOW - 7200_000 },
      encore: { until: NOW + 1, version: "", at: NOW },
      vieux: { until: null, version: "", at: NOW - IGNORE_MS - 1 },
      recent: { until: null, version: "", at: NOW },
    };
    expect(Object.keys(prune(snoozes, NOW))).toEqual(["encore", "recent"]);
  });

  it("« demain matin » : le prochain jour ouvré à 9 h", () => {
    expect(nextMorning(new Date(2026, 10, 24, 18))).toEqual(new Date(2026, 10, 25, 9)); // mardi → mercredi
    expect(nextMorning(new Date(2026, 10, 27, 18))).toEqual(new Date(2026, 10, 30, 9)); // vendredi → lundi
    expect(nextMorning(new Date(2026, 10, 28, 11))).toEqual(new Date(2026, 10, 30, 9)); // samedi → lundi
  });
});

describe("notifications", () => {
  const empty: SeenStore = { seen: {}, sources: [] };
  const todo = (ids: string[]) => todoCandidates(ids.map((id) => item(id)));

  it("au premier chargement d'une source : rien n'est notifié, tout est noté comme vu", () => {
    const { send, next } = selectNotifications(todo(["a", "b"]), ["todo"], empty, NOW);
    expect(send).toEqual([]);
    expect(next.sources).toEqual(["todo"]);
    expect(Object.keys(next.seen)).toHaveLength(2);
  });

  it("ensuite : seules les nouveautés sont notifiées, une seule fois", () => {
    const first = selectNotifications(todo(["a"]), ["todo"], empty, NOW).next;
    const second = selectNotifications(todo(["a", "b"]), ["todo"], first, NOW + 1000);
    expect(second.send.map((c) => c.key)).toEqual(["todo:b:"]);
    expect(selectNotifications(todo(["a", "b"]), ["todo"], second.next, NOW + 2000).send).toEqual([]);
  });

  it("une source qui n'a pas encore répondu ne compte pas : pas de rafale quand elle arrive", () => {
    const first = selectNotifications(todo(["a"]), ["todo"], empty, NOW).next;
    const slack: Candidate = { key: "dm:D1:1", source: "slack", title: "Message", body: "" };
    expect(selectNotifications([...todo(["a"]), slack], ["todo", "slack"], first, NOW).send).toEqual([]);
  });

  it("une PR bloquée pour une nouvelle raison est notifiée à nouveau", () => {
    const first = selectNotifications(todoCandidates([item("a", { version: "ci" })]), ["todo"], empty, NOW).next;
    expect(selectNotifications(todoCandidates([item("a", { version: "ci+conflicts" })]), ["todo"], first, NOW).send).toHaveLength(1);
  });

  it("seules les urgences de « À faire » notifient", () => {
    expect(todoCandidates([item("a"), item("b", { urgency: "watch" })]).map((c) => c.key)).toEqual(["todo:a:"]);
  });

  it("réunion : annoncée dans les 5 minutes qui précèdent, pas les journées entières ni les annulées", () => {
    const ev = (id: string, minutes: number, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
      id,
      title: id,
      start: new Date(NOW + minutes * 60_000).toISOString(),
      end: new Date(NOW + (minutes + 30) * 60_000).toISOString(),
      allDay: false,
      location: null,
      joinUrl: "https://teams.microsoft.com/l/meetup-join/x",
      webUrl: null,
      organizer: null,
      showAs: "busy",
      cancelled: false,
      ...extra,
    });
    const out = calendarCandidates([ev("bientot", 4), ev("plus-tard", 20), ev("commencee", -5), ev("annulee", 3, { cancelled: true }), ev("journee", 2, { allDay: true })], NOW);
    expect(out.map((c) => c.body.split("\n")[0])).toEqual(["bientot"]);
    expect(out[0].url).toBe("https://teams.microsoft.com/l/meetup-join/x");
  });

  it("Slack : messages directs non lus et mentions", () => {
    const msg = { ts: "1", channelId: "D1", channel: "Alex", author: "Alex", text: "Tu as 5 min ?", url: "https://demo.slack.com/x", replies: 0, mine: false, unread: true };
    const data: SlackData = {
      team: "Démo",
      url: "",
      dms: [
        { id: "D1", name: "Alex", unread: 2, last: msg },
        { id: "D2", name: "Sam", unread: 0, last: { ...msg, channelId: "D2" } },
      ],
      mentions: [{ ...msg, channelId: "C1", channel: "#dev", author: "Camille", ts: "2" }],
      channels: [],
      missing: [],
    };
    expect(slackCandidates(data).map((c) => c.key)).toEqual(["dm:D1:1", "mention:C1:2"]);
  });

  it("au-delà de 3 nouveautés : une notification résume le reste", () => {
    const send = todo(["a", "b", "c", "d", "e"]);
    const out = groupNotifications(send);
    expect(out).toHaveLength(MAX_SEPARATE);
    expect(out[2].title).toMatch(/^3 autres nouveautés/);
    expect(groupNotifications(send.slice(0, 3))).toHaveLength(3);
  });
});
