// Prévient sans qu'on regarde N2 : nombre d'urgences dans le titre de l'onglet, et notifications macOS
// (via le navigateur) pour les nouvelles urgences, les réunions dans 5 minutes, les messages Slack et les mentions
// ou réponses sur GitHub et Jira.
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { openLink, useLinkTarget } from "~/lib/actions";
import { useActivity, useCalendar, useSlack } from "~/lib/data";
import { useNow } from "~/lib/now";
import { useTodo } from "../todo/useTodo";
import { activityCandidates, calendarCandidates, groupNotifications, selectNotifications, slackCandidates, todoCandidates, type Candidate, type NotifySource } from "./logic";
import { readSeen, useNotifyEnabled, writeSeen } from "./store";

export const notificationsSupported = () => typeof window !== "undefined" && "Notification" in window;

export function Notifier() {
  const todo = useTodo();
  const calendar = useCalendar();
  const slack = useSlack();
  const activity = useActivity();
  const now = useNow(30_000);
  const enabled = useNotifyEnabled();
  const navigate = useNavigate();
  // lue au clic sur la notification (la préférence a pu changer depuis son envoi)
  const target = useLinkTarget();
  const linkTarget = useRef(target);
  linkTarget.current = target;
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // titre de l'onglet : « (3) N2 » tant qu'il reste des urgences (réappliqué après chaque navigation)
  const urgent = todo.items.filter((i) => i.urgency === "now").length;
  useEffect(() => {
    document.title = urgent ? `(${urgent}) N2` : "N2";
  }, [urgent, pathname]);

  const loaded: NotifySource[] = [];
  const candidates: Candidate[] = [];
  if (todo.settled) {
    loaded.push("todo");
    candidates.push(...todoCandidates(todo.items)); // les éléments reportés ou ignorés ne notifient pas
  }
  if (calendar.data?.ok) {
    loaded.push("calendar");
    candidates.push(...calendarCandidates(calendar.data.data.events, now));
  }
  if (slack.data?.ok) {
    loaded.push("slack");
    candidates.push(...slackCandidates(slack.data.data));
  }
  if (activity.data?.ok) {
    loaded.push("activity");
    candidates.push(...activityCandidates(activity.data.data));
  }
  const signature = `${loaded.join(",")}|${candidates.map((c) => c.key).join("|")}`;

  useEffect(() => {
    if (!enabled || !notificationsSupported() || Notification.permission !== "granted") return;
    // relu juste avant d'écrire : si deux onglets N2 sont ouverts, le second voit ce que le premier a notifié
    const { send, next } = selectNotifications(candidates, loaded, readSeen(), Date.now());
    writeSeen(next);
    for (const c of groupNotifications(send)) {
      const n = new Notification(c.title, { body: c.body.slice(0, 200), tag: c.key });
      n.onclick = () => {
        window.focus();
        n.close();
        if (c.url) openLink(c.url, linkTarget.current);
        else if (c.to) navigate({ to: c.to });
      };
    }
    // candidates et loaded sont résumés par signature
  }, [enabled, signature]);

  return null;
}
