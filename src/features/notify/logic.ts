// Notifications : ce qui mérite d'interrompre (urgences de « À faire », réunion imminente, message Slack,
// mention ou réponse sur GitHub et Jira),
// et ce qui a déjà été notifié. Fonctions pures, testables.
import type { ActivityData, CalendarEvent, SlackData } from "~/server/types";
import type { TodoItem } from "../todo/logic";
import { m } from "~/lib/i18n";

export type NotifySource = "todo" | "calendar" | "slack" | "activity";

export interface Candidate {
  /** identifiant stable : une même clé n'est notifiée qu'une fois */
  key: string;
  source: NotifySource;
  title: string;
  body: string;
  /** lien externe ouvert au clic */
  url?: string;
  /** onglet de N2 ouvert au clic */
  to?: string;
}

export interface SeenStore {
  /** clé -> dernière fois qu'elle a été vue (ms) */
  seen: Record<string, number>;
  /** sources déjà chargées une fois : au premier chargement, tout ce qui existe est noté comme vu, sans notifier */
  sources: NotifySource[];
}

/** Une clé absente depuis 14 jours est oubliée */
const FORGET_MS = 14 * 86_400_000;
/** Au-delà, une seule notification résume le reste */
export const MAX_SEPARATE = 3;
/** Une réunion est annoncée 5 minutes avant */
export const MEETING_NOTICE_MS = 5 * 60_000;

export const todoCandidates = (items: TodoItem[]): Candidate[] =>
  items
    .filter((i) => i.urgency === "now")
    .map((i) => ({ key: `todo:${i.id}:${i.version ?? ""}`, source: "todo", title: i.label, body: [i.title, i.detail].filter(Boolean).join("\n"), url: i.url, to: i.to }));

export function calendarCandidates(events: CalendarEvent[], now: number): Candidate[] {
  return events
    .filter((e) => !e.allDay && !e.cancelled && e.showAs !== "free")
    .filter((e) => {
      const left = Date.parse(e.start) - now;
      return left > 0 && left <= MEETING_NOTICE_MS;
    })
    .map((e) => {
      const min = Math.max(1, Math.round((Date.parse(e.start) - now) / 60_000));
      return {
        key: `cal:${e.id}:${e.start}`,
        source: "calendar",
        title: m.notify_meeting_min({ value: min }),
        body: e.joinUrl ? `${e.title}\n${m.notify_click_join()}` : e.title,
        url: e.joinUrl ?? e.webUrl ?? undefined,
      };
    });
}

export function slackCandidates(data: SlackData): Candidate[] {
  return [
    ...data.dms
      .filter((c) => c.unread > 0)
      .map((c): Candidate => ({ key: `dm:${c.id}:${c.last.ts}`, source: "slack", title: m.notify_message_from({ name: c.name }), body: c.last.text, url: c.last.url })),
    ...data.mentions.map(
      (x): Candidate => ({ key: `mention:${x.channelId}:${x.ts}`, source: "slack", title: m.notify_mentioned({ author: x.author, channel: x.channel }), body: x.text, url: x.url }),
    ),
  ];
}

/** GitHub et Jira : un fil notifie de nouveau à chaque nouveau message (la clé contient sa date) */
export function activityCandidates(data: ActivityData): Candidate[] {
  return data.items.map((i): Candidate => {
    const on = `${i.ref} · ${i.title}`;
    const title =
      i.kind === "mention"
        ? m.notify_mentioned_2({ author: i.author })
        : i.kind === "comment"
          ? i.source === "github"
            ? m.notify_commented_pr({ author: i.author })
            : m.notify_commented_ticket({ author: i.author })
          : m.notify_replied({ author: i.author });
    return { key: `activity:${i.id}:${i.at}`, source: "activity", title, body: `${on}\n${i.excerpt}`, url: i.url };
  });
}

/**
 * Ce qu'il faut notifier maintenant, et le nouvel état.
 * `loaded` : sources dont les données sont arrivées. La première fois qu'une source arrive, ce qu'elle contient
 * est noté comme vu sans notifier (pas de rafale à l'ouverture de N2 ou à l'activation des notifications).
 */
export function selectNotifications(candidates: Candidate[], loaded: NotifySource[], store: SeenStore, now: number): { send: Candidate[]; next: SeenStore } {
  const seen = Object.fromEntries(Object.entries(store.seen).filter(([, at]) => now - at < FORGET_MS));
  const sources = [...store.sources];
  const send: Candidate[] = [];
  for (const source of loaded) {
    const baseline = !sources.includes(source);
    if (baseline) sources.push(source);
    for (const c of candidates.filter((x) => x.source === source)) {
      if (!baseline && !(c.key in seen)) send.push(c);
      seen[c.key] = now;
    }
  }
  return { send, next: { seen, sources } };
}

/** Plus de MAX_SEPARATE nouveautés d'un coup : les premières séparément, le reste en une seule notification */
export function groupNotifications(send: Candidate[]): Candidate[] {
  if (send.length <= MAX_SEPARATE) return send;
  const rest = send.slice(MAX_SEPARATE - 1);
  return [
    ...send.slice(0, MAX_SEPARATE - 1),
    { key: `group:${rest.map((c) => c.key).join("|")}`, source: rest[0].source, title: m.notify_more_updates_n2({ rest: rest.length }), body: rest.map((c) => c.title).slice(0, 4).join(" · "), to: "/dashboard" },
  ];
}
