// Compteurs des onglets, calculés à partir des données déjà chargées.
import { ok, useCloudWatch, useCodeMap, useDeploy, useLibs, usePullRequests, useSentry, useSprint } from "~/lib/data";
import { m } from "~/lib/i18n";
import type { IconName } from "~/components/ds";
import { useTodo } from "./todo/useTodo";

export type BadgeTone = "" | "ok" | "warn" | "bad";
export interface TabBadge {
  text: string;
  tone: BadgeTone;
  /** icône SVG avant le texte (pas d'emoji : leur rendu varie d'un système à l'autre) */
  icon?: IconName;
}

export function useTabBadges(): Record<string, TabBadge | null> {
  const prsQ = usePullRequests();
  const sprintQ = useSprint();
  const cwQ = useCloudWatch();
  const sentryQ = useSentry();
  const libsQ = useLibs();
  const mapQ = useCodeMap(false);
  const deployQ = useDeploy(); // la carte n'est analysée qu'à l'ouverture de son onglet

  const prs = ok(prsQ);
  const sprint = ok(sprintQ);
  const cw = ok(cwQ);
  const sentry = ok(sentryQ);
  const libs = ok(libsQ);
  const map = ok(mapQ);
  const err = (q: { data?: { ok: boolean } }) => q.data && !q.data.ok;

  // sans les éléments reportés ou ignorés
  const todo = useTodo().items;
  const urgent = todo.filter((t) => t.urgency === "now").length;

  const mineOpen = prs?.mine.filter((p) => p.state === "OPEN") ?? [];
  const blocked = mineOpen.some((p) => ["FAILURE", "ERROR"].includes(p.ci ?? "") || p.reviewDecision === "CHANGES_REQUESTED" || p.mergeable === "CONFLICTING");
  const done = sprint?.issues.filter((i) => i.category === "done").length ?? 0;
  const alarms = cw?.counts.ALARM ?? 0;
  const fresh = sentry?.fresh.length ?? 0;
  const vulns = libs?.reduce((n, l) => n + l.advisories.length, 0) ?? 0;
  const behind = libs?.filter((l) => l.update !== "none").length ?? 0;

  return {
    "/dashboard": todo.length ? { text: String(todo.length), tone: urgent ? "bad" : "warn" } : prs ? { text: "✓", tone: "ok" } : null,
    "/pull-requests": err(prsQ) ? { text: "!", tone: "warn" } : prs ? { text: String(mineOpen.length), tone: blocked ? "bad" : "" } : null,
    "/sprint": err(sprintQ) ? { text: "!", tone: "warn" } : sprint ? { text: `${done}/${sprint.issues.length}`, tone: done === sprint.issues.length && done ? "ok" : "" } : null,
    "/observabilite": alarms
      ? { text: m.badges_alarm({ alarms, s: alarms > 1 ? "s" : "" }), tone: "bad" }
      : fresh
        ? { text: m.badges_new({ fresh }), tone: "warn" }
        : err(cwQ) || err(sentryQ)
          ? { text: "!", tone: "warn" }
          : sentry && cw
            ? { text: "✓", tone: "ok" }
            : null,
    "/librairies": libs ? { text: vulns ? `⚠ ${vulns}` : String(behind), tone: vulns ? "bad" : libs.some((l) => l.update === "major") ? "warn" : "" } : null,
    "/deploiements": deployBadge(deployQ),
    "/carte": map ? { text: String(map.nodes.filter((n) => n.files > 0).length), tone: "" } : null,
  };
}

// Déploiements : échec, validation prod en attente (nombre de commits), ou tout en prod
function deployBadge(q: ReturnType<typeof useDeploy>): TabBadge | null {
  if (q.data && !q.data.ok) return { text: "!", tone: "warn" };
  const main = ok(q)?.main;
  if (!main) return null;
  const p = main.pendingState;
  if (p?.kind === "failed") return { text: "✗", tone: "bad" };
  if (main.pending.length) return { text: String(main.pending.length), icon: "clock", tone: p?.kind === "approval" ? "warn" : "" };
  return { text: "✓", tone: "ok" };
}
