// Mode démo (N2_DEMO=1, `bun run demo`) : des données inventées pour chaque source qui demande un compte (GitHub, Jira,
// Sentry, AWS, Slack, agenda), pour montrer N2 sans rien configurer et pour les tests de navigateur.
// La carte du code, « Ma branche » et la recherche dans les README restent réelles : elles lisent le dépôt N2 lui-même.
// Les heures sont calculées à partir de maintenant, pour que l'écran ait l'air vivant.
import type { Config } from "./config.ts";
import { workflowsOf, type RawRun } from "./sources/ci.ts";
import { buildMain, type RawExecution, type RawState } from "./sources/deploy.ts";
import type {
  ActivityData,
  AlarmCharts,
  CalendarData,
  CiData,
  CloudWatchData,
  DeployData,
  JiraIssue,
  JiraSprintData,
  LibInfo,
  LogQuery,
  LogQueryResult,
  OpenPr,
  PullRequest,
  PullRequestsData,
  SentryData,
  SentryFrame,
  SentryIssue,
  SlackData,
  StatsData,
} from "./types.ts";

export const isDemo = () => process.env.N2_DEMO === "1";

/** Config de démo : comptes factices ; carte du code et librairies sur le dépôt N2 lui-même */
export function demoConfig(root: string): Config {
  return {
    port: 0,
    github: { repos: ["demo/boutique"], recentDays: 14 },
    jira: { site: "demo.atlassian.net", projectKey: "SHOP", boardId: 1, onlyMine: true },
    libs: { projectPath: root, packages: ["react", "zod", "vite"] },
    sentry: { org: "demo", project: "boutique", environment: "production", preprodEnvironments: ["staging"] },
    aws: { profile: "demo", region: "eu-west-1", alarmPrefix: "", hideAutoscaling: true, reconnectHint: "" },
    deploy: { pipelinePrefix: "boutique-", mainBranch: "main", envUrl: "https://preview-{slug}.boutique.example/" },
    codemap: { projectPath: root, splitThreshold: 400 },
    ui: { editor: "github" },
  };
}

const H = 3_600_000;
const iso = (now: number, hoursAgo: number) => new Date(now - hoursAgo * H).toISOString();

// ---------- GitHub ----------
function pr(now: number, n: number, title: string, over: Partial<PullRequest> = {}): PullRequest {
  const key = title.match(/SHOP-\d+/)?.[0];
  return {
    number: n,
    title,
    url: `https://github.com/demo/boutique/pull/${n}`,
    repo: "demo/boutique",
    author: "camille",
    state: "OPEN",
    isDraft: false,
    reviewDecision: "REVIEW_REQUIRED",
    mergeable: "MERGEABLE",
    ci: "SUCCESS",
    updatedAt: iso(now, 3),
    myReview: null,
    jira: key ? [{ key, url: `https://demo.atlassian.net/browse/${key}` }] : [],
    branch: `feat/${key ?? n}`,
    ...over,
  };
}

function pullRequests(now: number): PullRequestsData {
  return {
    me: "moi",
    mine: [
      pr(now, 412, "(SHOP-128) Panier : garder les codes promo après connexion", { author: "moi", reviewDecision: "APPROVED", branch: "feat/SHOP-128-promo", updatedAt: iso(now, 1) }),
      pr(now, 409, "(SHOP-121) Paiement : message clair quand la carte est refusée", { author: "moi", ci: "FAILURE", branch: "feat/SHOP-121-carte", updatedAt: iso(now, 5) }),
      pr(now, 401, "(SHOP-117) Catalogue : filtres par prix", { author: "moi", state: "MERGED", reviewDecision: "APPROVED", branch: "feat/SHOP-117-filtres", updatedAt: iso(now, 30) }),
    ],
    reviewRequested: [
      pr(now, 415, "(SHOP-131) Compte : changer d'adresse e-mail", { author: "alex", updatedAt: iso(now, 2) }),
      pr(now, 413, "(SHOP-130) Recherche : suggestions pendant la frappe", { author: "sam", isDraft: true, ci: "PENDING", updatedAt: iso(now, 6) }),
    ],
    approved: [pr(now, 405, "(SHOP-125) Commandes : export CSV", { author: "alex", myReview: "APPROVED", reviewDecision: "APPROVED", updatedAt: iso(now, 20) })],
    commented: [pr(now, 407, "(SHOP-126) Livraison : point relais", { author: "sam", myReview: "COMMENTED", mergeable: "CONFLICTING", updatedAt: iso(now, 26) })],
    searchUrl: "https://github.com/pulls",
  };
}

const openPrs = (now: number): OpenPr[] => [
  {
    number: 418,
    title: "Update dependency vite to v8.4.0",
    url: "https://github.com/demo/boutique/pull/418",
    repo: "demo/boutique",
    author: "renovate[bot]",
    branch: "renovate/vite-8.x",
    isDraft: false,
    updatedAt: iso(now, 8),
    reviewDecision: "REVIEW_REQUIRED",
    mergeable: "MERGEABLE",
    ci: "SUCCESS",
    updates: [{ name: "vite", from: "8.3.0", to: "8.4.0" }],
  },
];

// ---------- Jira ----------
function sprint(now: number): JiraSprintData {
  const issue = (key: string, summary: string, status: string, category: JiraIssue["category"], type = "Story"): JiraIssue => ({
    key,
    summary,
    url: `https://demo.atlassian.net/browse/${key}`,
    type,
    priority: "Medium",
    status,
    category,
    assignee: "Moi",
  });
  return {
    sprint: { name: "Sprint 24", goal: "Tunnel de commande plus rapide", startDate: iso(now, 4 * 24), endDate: iso(now, -6 * 24), url: "https://demo.atlassian.net/jira/software/c/projects/SHOP/boards/1" },
    issues: [
      issue("SHOP-132", "Livraison : estimer la date de réception", "À faire", "new"),
      issue("SHOP-121", "Paiement : message clair quand la carte est refusée", "En cours", "indeterminate", "Bug"),
      issue("SHOP-128", "Panier : garder les codes promo après connexion", "En revue", "indeterminate"),
      issue("SHOP-117", "Catalogue : filtres par prix", "Terminé", "done"),
    ],
  };
}

// ---------- Sentry ----------
function issue(now: number, id: string, title: string, culprit: string, count: number, firstSeenH: number, trend: number[]): SentryIssue {
  return { id, shortId: `BOUTIQUE-${id}`, title, culprit, level: "error", count, users: Math.ceil(count / 4), lastSeen: iso(now, 0.3), firstSeen: iso(now, firstSeenH), url: `https://demo.sentry.io/issues/${id}/`, trend };
}

function sentry(now: number): SentryData {
  const fresh = [
    issue(now, "981", "TypeError: Cannot read properties of undefined (reading 'price')", "apps/web/src/features/cart/Cart", 37, 5, [0, 0, 0, 2, 9, 14, 12]),
    issue(now, "982", "Error: Payment provider timeout", "POST /api/trpc/checkout.pay", 6, 12, [0, 1, 2, 1, 0, 1, 1]),
  ];
  return {
    top: [issue(now, "512", "ChunkLoadError: Loading chunk failed", "apps/web/src/main", 1820, 900, [40, 38, 52, 47, 60, 55, 49]), ...fresh],
    fresh,
    environment: "production",
    environments: ["production", "staging"],
    preprod: [issue(now, "990", "RangeError: Invalid time value", "apps/web/src/features/delivery/eta", 3, 20, [0, 0, 1, 2, 0, 0, 0])],
    preprodEnvironments: ["staging"],
    release: { version: "2.14.0", since: iso(now, 6), url: "https://demo.sentry.io/releases/2.14.0/", newCount: 1, newIssues: [fresh[0]] },
    projectUrl: "https://demo.sentry.io/projects/boutique/",
  };
}

const frames: SentryFrame[] = [
  { file: "src/features/map/model.ts", raw: "src/features/map/model.ts", line: 42, fn: "visibleNodes", inApp: true },
  { file: null, raw: "node_modules/react-dom/cjs/react-dom.production.js", line: 1, fn: "renderWithHooks", inApp: false },
];

// ---------- AWS ----------
function cloudwatch(now: number): CloudWatchData {
  const console = "https://eu-west-1.console.aws.amazon.com/cloudwatch/home?region=eu-west-1";
  const alarm = (name: string, state: "ALARM" | "OK", triggers: number, reason: string) => ({
    name,
    state,
    reason,
    updatedAt: iso(now, state === "ALARM" ? 0.5 : 30),
    url: `${console}#alarmsV2:alarm/${name}`,
    triggers7d: triggers,
    lastAlarmAt: triggers ? iso(now, 0.5) : null,
  });
  const alarms = [
    alarm("boutique-web-5xx", "ALARM", 3, "Threshold Crossed: 1 datapoint [14.0] was greater than the upper threshold [6.2]."),
    alarm("boutique-web-latency", "OK", 1, ""),
    alarm("boutique-db-cpu", "OK", 0, ""),
  ];
  return { alarms, counts: { ALARM: 1, INSUFFICIENT_DATA: 0, OK: 2 }, hiddenAutoscaling: 4, consoleUrl: `${console}#alarmsV2:` };
}

function alarmCharts(now: number): AlarmCharts {
  const start = now - 24 * H;
  const series = (f: (k: number) => number): [number, number][] => Array.from({ length: 96 }, (_, k) => [start + k * 15 * 60_000, f(k)]);
  return {
    start,
    end: now,
    charts: [
      { name: "boutique-web-5xx", data: series((k) => (k > 90 ? 14 : 2 + (k % 5))), threshold: null, band: { low: series(() => 0), high: series(() => 6.2) }, above: true },
      { name: "boutique-web-latency", data: series((k) => 0.3 + 0.1 * Math.sin(k / 6)), threshold: 1.5, band: null, above: true },
      { name: "boutique-db-cpu", data: series((k) => 20 + 10 * Math.sin(k / 10)), threshold: 80, band: null, above: true },
    ],
  };
}

const logQueries: LogQuery[] = [
  { id: "demo-errors", name: "Erreurs de l'application", logGroups: ["/demo/boutique/production"], query: "fields @timestamp, message | filter level = 'error' | sort @timestamp desc" },
  { id: "demo-slow", name: "Requêtes de plus de 2 s", logGroups: ["/demo/boutique/production"], query: "fields @timestamp, path, duration | filter duration > 2000" },
];

const logResult = (now: number, id: string, window: LogQueryResult["window"]): LogQueryResult => ({
  id,
  window,
  columns: ["@timestamp", "message"],
  rows: [
    [iso(now, 0.2), "Payment provider timeout after 10000 ms"],
    [iso(now, 0.6), "Cart total mismatch for session 7f3a"],
  ],
  matched: 2,
  bytesScanned: 3_400_000,
  ranAt: new Date(now).toISOString(),
});

function deploy(now: number): DeployData {
  const exec = (id: string, status: string, hoursAgo: number, message: string): RawExecution => ({
    pipelineExecutionId: id,
    status,
    startTime: iso(now, hoursAgo),
    lastUpdateTime: iso(now, hoursAgo - 0.3),
    sourceRevisions: [{ revisionId: `${id}0000000`, revisionSummary: message }],
  });
  const executions = [
    exec("e3", "InProgress", 1, "(SHOP-128) Panier : garder les codes promo après connexion (#412)"),
    exec("e2", "Succeeded", 6, "(SHOP-117) Catalogue : filtres par prix (#401)"),
    exec("e1", "Succeeded", 30, "(SHOP-110) Accueil : bannière saisonnière (#396)"),
  ];
  const stage = (name: string, id: string, status: string, hoursAgo: number) => ({
    stageName: name,
    latestExecution: { pipelineExecutionId: id, status },
    actionStates: [{ actionName: name, latestExecution: { status, lastStatusChange: iso(now, hoursAgo) } }],
  });
  const state: RawState = {
    stageStates: [stage("Source", "e3", "Succeeded", 1), stage("Staging", "e3", "Succeeded", 0.7), stage("Approval", "e3", "InProgress", 0.7), stage("Production", "e2", "Succeeded", 5.7)],
  };
  const { main, prStates } = buildMain("boutique-main-pipeline", "eu-west-1", state, executions);
  const env = (slug: string, hoursAgo: number, message: string) => ({
    slug,
    pipeline: `boutique-${slug}-pipeline`,
    consoleUrl: `https://eu-west-1.console.aws.amazon.com/codesuite/codepipeline/pipelines/boutique-${slug}-pipeline/view?region=eu-west-1`,
    url: `https://preview-${slug}.boutique.example/`,
    last: { ...main.executions[0], executionId: `${slug}-1`, status: "Succeeded", startedAt: iso(now, hoursAgo), updatedAt: iso(now, hoursAgo - 0.2), message },
  });
  return {
    main,
    envs: [env("shop-128", 2, "(SHOP-128) Panier : garder les codes promo"), env("shop-121", 8, "(SHOP-121) Paiement : carte refusée")],
    prStates,
    region: "eu-west-1",
    links: { pr: "https://github.com/demo/boutique/pull/", jira: "https://demo.atlassian.net/browse/" },
  };
}

function ci(now: number, branch?: string): CiData {
  const run = (name: string, hoursAgo: number, conclusion: string | null, attempt = 1): RawRun => ({
    name,
    status: conclusion ? "completed" : "in_progress",
    conclusion,
    html_url: "https://github.com/demo/boutique/actions",
    run_started_at: iso(now, hoursAgo),
    created_at: iso(now, hoursAgo),
    updated_at: iso(now, hoursAgo - 0.15),
    run_attempt: attempt,
    head_sha: "4f1c2d9a0000000",
    event: "push",
  });
  const main = workflowsOf([run("CI", 1, "success", 2), run("CI", 20, "failure"), run("E2E", 1, "success"), run("Nightly", 9, "success")], now);
  const mine = workflowsOf([run("PR CI", 0.5, null), run("PR CI", 4, "failure")], now);
  const summary = (name: string, w: typeof main) => ({
    name,
    workflows: w,
    state: w.some((x) => x.conclusion === "failure") ? ("failure" as const) : w.some((x) => x.status === "running") ? ("running" as const) : ("success" as const),
  });
  return { repo: "demo/boutique", main: summary("main", main), branch: branch && branch !== "main" ? summary(branch, mine) : null, actionsUrl: "https://github.com/demo/boutique/actions" };
}

// ---------- Agenda, Slack, activité, statistiques, librairies ----------
function calendar(now: number): CalendarData {
  const day = new Date(now);
  const at = (h: number, m = 0) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m).toISOString();
  const ev = (id: string, title: string, start: string, end: string, join = true) => ({
    id,
    title,
    start,
    end,
    allDay: false,
    location: join ? "Réunion Microsoft Teams" : "Salle Lumière",
    joinUrl: join ? "https://teams.microsoft.com/l/meetup-join/demo" : null,
    webUrl: null,
    organizer: "Camille Martin",
    showAs: "busy" as const,
    cancelled: false,
  });
  return {
    source: "ics",
    from: at(0),
    to: at(23, 59),
    events: [ev("d1", "Daily", at(9, 30), at(9, 45)), ev("d2", "Revue de sprint", at(14), at(15)), ev("d3", "Atelier tunnel de commande", at(16), at(17), false)],
    graph: "none",
  };
}

function slack(now: number): SlackData {
  const msg = (ts: number, channel: string, author: string, text: string, unread = false) => ({
    ts: String(Math.floor((now - ts * H) / 1000)),
    channelId: `C${channel.length}`,
    channel,
    author,
    text,
    url: "https://demo.slack.com/archives/C1",
    replies: 0,
    mine: false,
    unread,
  });
  return {
    team: "Démo",
    url: "https://demo.slack.com",
    mentions: [msg(1, "dev-front", "Alex", "@moi tu peux regarder la PR du panier quand tu as un moment ?", true)],
    dms: [{ id: "D1", name: "Sam", unread: 1, last: msg(0.5, "Sam", "Sam", "Le staging est à jour avec ta branche", true) }],
    channels: [{ id: "C1", name: "releases", url: "https://demo.slack.com/archives/C1", unread: 2, messages: [msg(6, "releases", "Camille", "Mise en prod 2.14.0 : filtres par prix ✅")] }],
    missing: [],
  };
}

const activity = (now: number): ActivityData => ({
  items: [
    { id: "a1", source: "github", kind: "comment", ref: "#409", title: "(SHOP-121) Paiement : message clair quand la carte est refusée", where: "PR", url: "https://github.com/demo/boutique/pull/409", author: "Alex", excerpt: "Il manque le cas 3-D Secure refusé.", at: iso(now, 2), count: 1 },
    { id: "a2", source: "jira", kind: "mention", ref: "SHOP-132", title: "Livraison : estimer la date de réception", where: "À faire", url: "https://demo.atlassian.net/browse/SHOP-132", author: "Camille", excerpt: "On part sur l'API du transporteur ?", at: iso(now, 7), count: 1 },
  ],
  days: 14,
  failed: [],
});

function stats(now: number): StatsData {
  const weeks = Array.from({ length: 8 }, (_, k) => {
    const start = new Date(now - (7 - k) * 7 * 24 * H);
    return {
      start: start.toISOString().slice(0, 10),
      team: { merged: 9 + (k % 4), cycle: 20 - k, reviewed: 10 + (k % 3), review: 6 - (k % 3) },
      mine: { merged: 2 + (k % 2), cycle: 18 - k, reviewed: 3, review: 4 },
      errors: 1200 - k * 60,
      newIssues: 8 - (k % 4),
    };
  });
  return { weeks, slowest: [{ number: 396, title: "(SHOP-110) Accueil : bannière saisonnière", url: "https://github.com/demo/boutique/pull/396", author: "sam", mergedAt: iso(now, 40), cycle: 52, review: 20 }], newIssuesCap: 100, failed: [] };
}

const lib = (name: string, installed: string, latest: string, update: LibInfo["update"]): LibInfo => ({
  name,
  installed,
  latest,
  update,
  npmUrl: `https://www.npmjs.com/package/${name}`,
  repoUrl: null,
  releases: [],
  advisories: [],
});

/**
 * Données de démo d'une clé du cache des sources (voir run.ts, cached()) ; undefined : la source est lue pour de vrai
 * (carte du code, ma branche, README, fiches des librairies).
 */
export function demoData(key: string, now = Date.now()): unknown {
  const [name, ...rest] = key.split(":");
  const arg = rest.join(":");
  switch (name) {
    case "prs":
      return pullRequests(now);
    case "open-prs":
      return openPrs(now);
    case "jira":
      return sprint(now);
    case "sentry":
      return sentry(now);
    case "frames":
      return frames;
    case "cloudwatch":
      return cloudwatch(now);
    case "alarm-charts":
      return alarmCharts(now);
    case "log-queries":
      return logQueries;
    case "log-query": {
      const [id, window] = arg.split(":");
      return logResult(now, id, window === "24h" ? "24h" : "1h");
    }
    case "deploy":
      return deploy(now);
    case "ci":
      return ci(now, arg || undefined);
    case "calendar":
      return calendar(now);
    case "slack":
      return slack(now);
    case "activity":
      return activity(now);
    case "stats":
      return stats(now);
    case "libs":
      return [lib("react", "19.3.1", "19.3.1", "none"), lib("zod", "4.6.7", "4.7.0", "minor"), lib("vite", "8.3.8", "8.4.0", "minor")];
    default:
      return undefined;
  }
}
