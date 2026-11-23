// « À faire maintenant » : ce qui demande une action, calculé à partir des sources déjà chargées.
// Fonctions pures (testables), sans accès réseau.
import type { AwsSession, CiData, CloudWatchData, DeployData, JiraIssue, JiraSprintData, LibInfo, PullRequest, PullRequestsData, SentryData } from "~/server/types";
import { isRecentRelease } from "~/features/deploy/release";
import { m } from "~/lib/i18n";

export type Urgency = "now" | "watch" | "info";

export interface TodoItem {
  id: string;
  urgency: Urgency;
  /** catégorie affichée (« Revue demandée », « CI en échec »…) */
  label: string;
  title: string;
  detail?: string;
  url?: string;
  /** lien interne (onglet de N2), et ses paramètres d'adresse */
  to?: string;
  search?: Record<string, string>;
  pr?: PullRequest;
  issue?: JiraIssue;
  /**
   * Ce qui fait changer l'élément sans changer son id (raisons du blocage, nouvelles erreurs, nouvelles failles) :
   * un élément ignoré ou déjà notifié revient quand sa version change.
   */
  version?: string;
}

const DAY = 86_400_000;
const hoursSince = (iso: string, now: number) => {
  const min = Math.max(1, Math.round((now - Date.parse(iso)) / 60_000));
  return min < 60 ? `${min} min` : `${Math.round(min / 60)} h`;
};
const isBlocked = (p: PullRequest) => p.ci === "FAILURE" || p.ci === "ERROR" || p.reviewDecision === "CHANGES_REQUESTED" || p.mergeable === "CONFLICTING";
const isReady = (p: PullRequest) => !p.isDraft && p.reviewDecision === "APPROVED" && p.ci === "SUCCESS" && p.mergeable === "MERGEABLE";

/** Clé Jira -> PR ouvertes (toutes catégories) qui la citent dans leur titre */
export function prsByJiraKey(prs: PullRequestsData | undefined): Map<string, PullRequest[]> {
  const map = new Map<string, PullRequest[]>();
  if (!prs) return map;
  const seen = new Set<string>();
  for (const p of [...prs.mine, ...prs.reviewRequested, ...prs.approved, ...prs.commented]) {
    if (seen.has(p.url)) continue;
    seen.add(p.url);
    for (const j of p.jira) map.set(j.key, [...(map.get(j.key) ?? []), p]);
  }
  return map;
}

export function computeTodo(input: {
  prs?: PullRequestsData;
  sprint?: JiraSprintData;
  cloudwatch?: CloudWatchData;
  sentry?: SentryData;
  libs?: LibInfo[];
  aws?: AwsSession;
  deploy?: DeployData;
  ci?: CiData;
  now?: number;
}): TodoItem[] {
  const now = input.now ?? Date.now();
  const items: TodoItem[] = [];
  const { prs, sprint } = input;

  // 1. Revues demandées : la plus ancienne d'abord
  for (const p of prs?.reviewRequested ?? []) {
    const age = now - new Date(p.updatedAt).getTime();
    items.push({
      id: `review:${p.url}`,
      urgency: age > 2 * DAY ? "now" : "watch",
      label: m.todo_review_requested(),
      title: p.title,
      detail: `#${p.number} · ${p.author}`,
      url: p.url,
      pr: p,
    });
  }

  // 2. Mes PR : bloquées, ou prêtes à fusionner
  for (const p of (prs?.mine ?? []).filter((x) => x.state === "OPEN")) {
    if (isBlocked(p)) {
      const why = [
        (p.ci === "FAILURE" || p.ci === "ERROR") && m.todo_ci_failing(),
        p.reviewDecision === "CHANGES_REQUESTED" && m.todo_changes_requested(),
        p.mergeable === "CONFLICTING" && m.todo_conflicts(),
      ].filter(Boolean);
      const version = [p.ci === "FAILURE" || p.ci === "ERROR" ? "ci" : "", p.reviewDecision === "CHANGES_REQUESTED" ? "changes" : "", p.mergeable === "CONFLICTING" ? "conflicts" : ""].filter(Boolean).join("+");
      items.push({ id: `blocked:${p.url}`, urgency: "now", label: m.todo_my_pr_blocked(), title: p.title, detail: `#${p.number} · ${why.join(", ")}`, url: p.url, pr: p, version });
    } else if (isReady(p)) {
      items.push({ id: `ready:${p.url}`, urgency: "watch", label: m.todo_ready_merge(), title: p.title, detail: m.todo_approved_ci({ number: p.number }), url: p.url, pr: p });
    }
  }

  // 3. Sprint ↔ PR : tickets en revue sans PR ouverte, et PR dont le ticket n'est pas (plus) dans le sprint
  const byKey = prsByJiraKey(prs);
  const myOpen = (prs?.mine ?? []).filter((x) => x.state === "OPEN");
  for (const i of sprint?.issues ?? []) {
    if (i.category === "done") continue;
    const open = (byKey.get(i.key) ?? []).filter((p) => p.state === "OPEN");
    if (/review|revue/i.test(i.status) && open.length === 0) {
      items.push({ id: `noprs:${i.key}`, urgency: "watch", label: m.todo_review_without_open_pr(), title: i.summary, detail: `${i.key} · ${i.status}`, url: i.url, issue: i });
    }
  }
  if (sprint?.sprint) {
    const sprintKeys = new Map((sprint.issues ?? []).map((i) => [i.key, i]));
    for (const p of myOpen) {
      if (!p.jira.length) {
        items.push({ id: `noticket:${p.url}`, urgency: "info", label: m.todo_pr_without_ticket(), title: p.title, detail: `#${p.number}`, url: p.url, pr: p });
        continue;
      }
      const issues = p.jira.map((j) => sprintKeys.get(j.key));
      if (issues.every((i) => !i)) {
        items.push({ id: `offsprint:${p.url}`, urgency: "info", label: m.todo_ticket_outside_sprint(), title: p.title, detail: `#${p.number} · ${p.jira.map((j) => j.key).join(", ")}`, url: p.url, pr: p });
      } else if (issues.some((i) => i?.category === "done")) {
        items.push({ id: `donepr:${p.url}`, urgency: "watch", label: m.todo_ticket_done_pr_still_open(), title: p.title, detail: `#${p.number}`, url: p.url, pr: p });
      }
    }
  }

  // 4. Production : alarmes, nouvelles erreurs, failles de sécurité
  for (const a of (input.cloudwatch?.alarms ?? []).filter((x) => x.state === "ALARM")) {
    items.push({ id: `alarm:${a.name}`, urgency: "now", label: m.todo_cloudwatch_alarm(), title: a.name, detail: a.reason.slice(0, 140), url: a.url });
  }
  const fresh = input.sentry?.fresh ?? [];
  if (fresh.length) {
    items.push({
      id: "sentry:fresh",
      urgency: "watch",
      label: m.todo_new_errors(),
      title: m.todo_new_sentry_error_last_24({ fresh: fresh.length, s: fresh.length > 1 ? "s" : "" }),
      detail: fresh.slice(0, 2).map((i) => i.title).join(" · ").slice(0, 160),
      to: "/observabilite",
      version: fresh.map((i) => i.id).sort().join(","),
    });
  }
  // mise en prod de moins de 24 h qui a apporté de nouvelles erreurs (release Sentry en production)
  const release = input.sentry?.release;
  if (release && release.newCount > 0 && isRecentRelease(release.since, now)) {
    items.push({
      id: `sentry:release:${release.version}`,
      urgency: "watch",
      label: m.todo_release_label(),
      title: m.todo_release_errors({ version: release.version, count: release.newCount }),
      detail: release.newIssues.slice(0, 2).map((i) => i.title).join(" · ").slice(0, 160),
      to: "/observabilite",
      search: { erreurs: "release" },
      version: String(release.newCount),
    });
  }
  // erreurs vues avant la prod (qa, staging…) et pas encore en production : à regarder avant de valider la mise en prod
  const preprod = input.sentry?.preprod ?? [];
  if (preprod.length) {
    items.push({
      id: "sentry:preprod",
      urgency: "watch",
      label: m.todo_before_prod(),
      title: m.todo_preprod_errors({ count: preprod.length, envs: (input.sentry?.preprodEnvironments ?? []).join(", ") }),
      detail: preprod.slice(0, 2).map((i) => i.title).join(" · ").slice(0, 160),
      to: "/observabilite",
      search: { erreurs: "avant-prod" },
      version: preprod.map((i) => i.id).sort().join(","),
    });
  }
  for (const l of (input.libs ?? []).filter((x) => x.advisories.length)) {
    items.push({ id: `vuln:${l.name}`, urgency: "now", label: m.todo_security_vulnerability(), title: `${l.name} ${l.installed ?? ""}`, detail: l.advisories.map((a) => `${a.severity} · ${a.summary}`).join(" | ").slice(0, 160), url: l.advisories[0].url, version: l.advisories.map((a) => a.id).sort().join(",") });
  }

  // CI GitHub de la branche principale en échec : tout ce qui part en prod en dépend
  for (const w of (input.ci?.main.workflows ?? []).filter((x) => x.conclusion === "failure")) {
    items.push({
      id: `ci:${input.ci!.main.name}:${w.name}`,
      urgency: "now",
      label: m.todo_ci_failed(),
      title: m.todo_ci_failed_on({ workflow: w.name, branch: input.ci!.main.name }),
      detail: w.sha,
      url: w.url,
      version: w.sha,
    });
  }

  // 5. Déploiements : pipeline principal en échec, mes PR fusionnées qui attendent la prod ou viennent d'y arriver
  const main = input.deploy?.main;
  if (main?.pendingState?.kind === "failed") {
    const c = main.pending[0];
    items.push({
      id: "deploy:failed",
      urgency: "now",
      label: m.common_deploy_failed(),
      title: m.todo_failed_at({ g: main.pendingState.stage.replace(/_/g, " ") }),
      detail: c ? `${c.pr ? `#${c.pr} · ` : ""}${c.message}`.slice(0, 160) : undefined,
      url: main.consoleUrl,
      version: c?.executionId,
    });
  }
  for (const p of (prs?.mine ?? []).filter((x) => x.state === "MERGED")) {
    const state = input.deploy?.prStates[p.number];
    const commit = main?.executions.find((c) => c.pr === p.number);
    if (state === "approval") {
      const since = main?.pendingState?.since;
      items.push({
        id: `deploy:approval:${p.url}`,
        urgency: "watch",
        label: m.todo_awaiting_prod_approval(),
        title: p.title,
        detail: since ? m.todo_staging_approval_pending({ number: p.number, now: hoursSince(since, now) }) : `#${p.number}`,
        url: main?.consoleUrl,
        pr: p,
      });
    } else if (state === "prod" && commit?.prodAt && now - Date.parse(commit.prodAt) < DAY) {
      items.push({ id: `deploy:prod:${p.url}`, urgency: "info", label: m.todo_production(), title: p.title, detail: `#${p.number}`, url: p.url, pr: p });
    }
  }

  // 6. Session AWS bientôt expirée
  const exp = input.aws?.expiresAt ? new Date(input.aws.expiresAt).getTime() : null;
  if (exp && exp - now < 30 * 60_000) {
    items.push({
      id: "aws:session",
      urgency: exp < now ? "watch" : "info",
      label: m.todo_aws_session(),
      title: exp < now ? m.todo_aws_session_expired() : m.todo_aws_session_expiring_soon(),
      detail: m.todo_aws_reconnect_hint(),
    });
  }

  const order: Record<Urgency, number> = { now: 0, watch: 1, info: 2 };
  return items.sort((a, b) => order[a.urgency] - order[b.urgency]);
}
