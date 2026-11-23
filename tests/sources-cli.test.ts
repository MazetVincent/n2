// Sources lues par une CLI (acli, gh, aws) : lecture des réponses JSON et erreurs de connexion.
// `run` est remplacé par une fausse CLI : aucune commande n'est lancée, données inventées.
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandError } from "../src/server/run.ts";
import { alarmQueries, countTriggers, fetchAlarmCharts, fetchCloudWatch, toPoints, type RawAlarm } from "../src/server/sources/cloudwatch.ts";
import { fetchDeploy } from "../src/server/sources/deploy.ts";
import { fetchCi, workflowsOf, type RawRun } from "../src/server/sources/ci.ts";
import { listLogQueries, runLogQuery, toTable } from "../src/server/sources/logs.ts";
import { computeTodo } from "../src/features/todo/logic.ts";
import { fetchOpenPrs, fetchPullRequests } from "../src/server/sources/github.ts";
import { fetchSprint } from "../src/server/sources/jira.ts";
import { makeConfig } from "./helpers.ts";

const run = vi.hoisted(() => vi.fn<(cmd: string, args: string[]) => Promise<string>>());
vi.mock("../src/server/run.ts", async (actual) => ({ ...(await actual<typeof import("../src/server/run.ts")>()), run }));

afterEach(() => run.mockReset());

const cfg = makeConfig("/tmp/inexistant");
/** Fausse CLI : la première règle dont le motif apparaît dans la commande donne la réponse */
const cli = (rules: [RegExp, unknown][]) =>
  run.mockImplementation(async (cmd, args) => {
    const line = [cmd, ...args].join(" ");
    const rule = rules.find(([re]) => re.test(line));
    if (!rule) throw new Error(`commande inattendue : ${line}`);
    if (rule[1] instanceof Error) throw rule[1];
    return typeof rule[1] === "string" ? rule[1] : JSON.stringify(rule[1]);
  });

// ---------- Jira ----------
describe("fetchSprint (acli)", () => {
  const sprint = { sprints: [{ id: 42, name: "Sprint 42", goal: "Objectif du sprint", startDate: "2026-11-16", endDate: "2026-11-27" }] };
  const issue = (key: string, assignee: string | null) => ({
    key,
    fields: { summary: `Ticket ${key}`, issuetype: { name: "Story" }, status: { name: "En cours", statusCategory: { key: "indeterminate" } }, assignee: assignee && { displayName: assignee } },
  });

  it("lit le sprint actif et ses tickets, avec les liens vers le site configuré", async () => {
    cli([
      [/list-sprints/, sprint],
      [/workitem search/, [issue("DEMO-1", "Camille"), issue("DEMO-2", null)]],
    ]);
    const d = await fetchSprint(cfg);
    expect(d.sprint).toMatchObject({ name: "Sprint 42", goal: "Objectif du sprint", url: "https://demo.atlassian.net/jira/software/c/projects/DEMO/boards/1" });
    expect(d.issues).toEqual([
      { key: "DEMO-1", summary: "Ticket DEMO-1", url: "https://demo.atlassian.net/browse/DEMO-1", type: "Story", priority: "", status: "En cours", category: "indeterminate", assignee: "Camille" },
      expect.objectContaining({ key: "DEMO-2", assignee: null }),
    ]);
  });

  it("limite la recherche à mes tickets avec onlyMine, et à tout le sprint sinon", async () => {
    cli([
      [/list-sprints/, sprint],
      [/workitem search/, []],
    ]);
    await fetchSprint(cfg);
    expect(run.mock.calls[1][1].join(" ")).toContain("sprint = 42 AND assignee = currentUser()");
    await fetchSprint({ ...cfg, jira: { ...cfg.jira, onlyMine: false } });
    expect(run.mock.calls[3][1].join(" ")).not.toContain("currentUser");
  });

  it("n'insère que le numéro du sprint dans la requête JQL", async () => {
    cli([
      [/list-sprints/, { sprints: [{ id: "1 OR project = SECRET", name: "?" }] }],
      [/workitem search/, []],
    ]);
    await fetchSprint(cfg);
    expect(run.mock.calls[1][1].join(" ")).not.toContain("SECRET");
  });

  it("sans sprint actif : rien à afficher", async () => {
    cli([[/list-sprints/, { sprints: [] }]]);
    expect(await fetchSprint(cfg)).toEqual({ sprint: null, issues: [] });
  });

  it("acli déconnecté : erreur de connexion avec la marche à suivre", async () => {
    cli([[/list-sprints/, new CommandError("acli", "Error: not authenticated, run acli jira auth login")]]);
    await expect(fetchSprint(cfg)).rejects.toMatchObject({ detail: { kind: "auth", message: { key: "srv_jira_not_logged_in" }, hint: { key: "srv_hint_jira_login" } } });
  });
});

// ---------- GitHub ----------
const pr = (number: number, over: Record<string, unknown> = {}) => ({
  number,
  title: `(DEMO-${number}) PR ${number}`,
  url: `https://github.com/demo/demo/pull/${number}`,
  isDraft: false,
  updatedAt: `2026-11-2${number % 10}T10:00:00Z`,
  state: "OPEN",
  headRefName: `feature/DEMO-${number}`,
  author: { login: "autre" },
  reviewDecision: null,
  mergeable: "MERGEABLE",
  repository: { nameWithOwner: "demo/demo" },
  commits: { nodes: [{ commit: { statusCheckRollup: { state: "SUCCESS" } } }] },
  reviews: { nodes: [] },
  ...over,
});
const search = (...nodes: unknown[]) => ({ data: { search: { nodes } } });

describe("fetchPullRequests (gh)", () => {
  it("range les PR, lit les tickets du titre et ne garde qu'une fois une PR revue et commentée", async () => {
    const approvedThenCommented = pr(3, { reviews: { nodes: [{ author: { login: "moi" }, state: "APPROVED" }, { author: { login: "moi" }, state: "COMMENTED" }] } });
    cli([
      [/api user/, "moi\n"],
      [/desc author:@me/, search(pr(1, { author: { login: "moi" }, commits: { nodes: [] } }), {})],
      [/reviewed-by:@me/, search(approvedThenCommented)],
      [/commenter:@me/, search(approvedThenCommented, pr(4, { reviews: { nodes: [{ author: { login: "moi" }, state: "COMMENTED" }] } }))],
      [/review-requested:@me/, search(pr(5))],
    ]);
    const d = await fetchPullRequests(cfg);
    expect(d.me).toBe("moi");
    expect(d.mine.map((p) => [p.number, p.ci, p.jira])).toEqual([[1, null, [{ key: "DEMO-1", url: "https://demo.atlassian.net/browse/DEMO-1" }]]]);
    // l'approbation prime sur le commentaire qui la suit ; la PR n'apparaît pas deux fois
    expect(d.approved.map((p) => [p.number, p.myReview])).toEqual([[3, "APPROVED"]]);
    expect(d.commented.map((p) => [p.number, p.myReview])).toEqual([[4, "COMMENTED"]]);
    expect(d.reviewRequested.map((p) => [p.number, p.branch])).toEqual([[5, "feature/DEMO-5"]]);
    expect(d.searchUrl).toContain(encodeURIComponent("involves:moi"));
  });

  it("gh déconnecté : erreur de connexion avec la marche à suivre", async () => {
    cli([[/api user/, new CommandError("gh", "To get started with GitHub CLI, please run:  gh auth login")]]);
    await expect(fetchPullRequests(cfg)).rejects.toMatchObject({ detail: { kind: "auth", message: { key: "srv_gh_not_logged_in" } } });
  });

  it("autre échec de gh : renvoyé tel quel (affiché nettoyé par cached)", async () => {
    cli([[/api user/, new CommandError("gh", "HTTP 502")]]);
    await expect(fetchPullRequests(cfg)).rejects.toBeInstanceOf(CommandError);
  });
});

describe("fetchOpenPrs (gh)", () => {
  it("ne renvoie de la description que les librairies annoncées par un robot, et lit les diffs d'un robot muet", async () => {
    const bot = (n: number, body: string | null) => pr(n, { author: { login: "renovate[bot]" }, headRefName: `renovate/lib-${n}`, body });
    cli([
      [/api graphql/, search(bot(1, "| [react](https://x) | `19.0.0` -> `19.1.0` |"), bot(2, null), pr(3, { body: "Description d'un humain : react 19.1.0" }))],
      [/pulls\/2\/files/, [{ filename: "apps/web/package.json", patch: '-    "zod": "^4.0.0",\n+    "zod": "^4.1.0",' }, { filename: "README.md", patch: "+zod" }]],
    ]);
    const prs = await fetchOpenPrs(cfg);
    expect(prs).toHaveLength(3);
    expect(prs.every((p) => !("body" in p))).toBe(true);
    expect(prs[0].updates.map((u) => u.name)).toEqual(["react"]);
    expect(prs[1].updates.map((u) => u.name)).toEqual(["zod"]);
    expect(prs[2].updates).toEqual([]);
    // seules les PR des robots sans liste sont lues fichier par fichier
    expect(run.mock.calls.filter(([, a]) => a.join(" ").includes("/files"))).toHaveLength(1);
  });
});

// ---------- CloudWatch ----------
describe("fetchCloudWatch (aws)", () => {
  const alarm = (name: string, state: string, updated: string, actions?: string[]) => ({ AlarmName: name, StateValue: state, StateReason: `raison ${name}`, StateUpdatedTimestamp: updated, AlarmActions: actions });
  const scaling = ["arn:aws:autoscaling:eu-west-1:000000000000:scalingPolicy:x"];
  const raw = {
    MetricAlarms: [
      alarm("ok-ancienne", "OK", "2026-11-20T08:00:00Z"),
      alarm("scale-in", "ALARM", "2026-11-22T09:00:00Z", scaling),
      alarm("api-5xx", "ALARM", "2026-11-22T08:00:00Z", ["arn:aws:sns:eu-west-1:000000000000:alertes"]),
      alarm("latence", "ALARM", "2026-11-22T10:00:00Z"),
    ],
    CompositeAlarms: [alarm("composite", "INSUFFICIENT_DATA", "2026-11-21T08:00:00Z")],
  };

  const history = { AlarmHistoryItems: [
    { AlarmName: "ok-ancienne", Timestamp: "2026-11-21T08:00:00Z", HistorySummary: "Alarm updated from OK to ALARM" },
    { AlarmName: "ok-ancienne", Timestamp: "2026-11-21T09:00:00Z", HistorySummary: "Alarm updated from ALARM to OK" },
    { AlarmName: "ok-ancienne", Timestamp: "2026-11-22T07:00:00Z", HistorySummary: "Alarm updated from OK to ALARM" },
    { AlarmName: "api-5xx", Timestamp: "2026-11-22T08:00:00Z", HistorySummary: "Alarm updated from OK to ALARM" },
  ] };

  it("masque l'autoscaling, trie par gravité puis date et compte par état", async () => {
    cli([[/describe-alarms /, raw], [/describe-alarm-history/, history]]);
    const d = await fetchCloudWatch(cfg);
    expect(d.alarms.map((a) => a.name)).toEqual(["api-5xx", "latence", "composite", "ok-ancienne"]);
    expect(d.counts).toEqual({ ALARM: 2, INSUFFICIENT_DATA: 1, OK: 1 });
    expect(d.hiddenAutoscaling).toBe(1);
    expect(d.alarms[0].url).toBe("https://eu-west-1.console.aws.amazon.com/cloudwatch/home?region=eu-west-1#alarmsV2:alarm/api-5xx");
    // historique sur 7 jours : passages en ALARM, et le dernier
    expect(d.alarms.map((a) => [a.name, a.triggers7d, a.lastAlarmAt])).toEqual([
      ["api-5xx", 1, "2026-11-22T08:00:00Z"],
      ["latence", 0, null],
      ["composite", 0, null],
      ["ok-ancienne", 2, "2026-11-22T07:00:00Z"],
    ]);
  });

  it("historique illisible : les alarmes s'affichent quand même", async () => {
    cli([[/describe-alarms /, raw], [/describe-alarm-history/, new CommandError("aws", "AccessDenied")]]);
    const d = await fetchCloudWatch(cfg);
    expect(d.alarms.every((a) => a.triggers7d === null)).toBe(true);
  });

  it("montre l'autoscaling avec hideAutoscaling: false, et passe le préfixe à la CLI", async () => {
    cli([[/describe-alarms /, raw], [/describe-alarm-history/, history]]);
    const d = await fetchCloudWatch({ ...cfg, aws: { ...cfg.aws, hideAutoscaling: false, alarmPrefix: "prod-" } });
    expect(d.alarms).toHaveLength(5);
    expect(run.mock.calls[0][1]).toEqual(expect.arrayContaining(["--profile", "demo", "--region", "eu-west-1", "--alarm-name-prefix", "prod-"]));
  });

  it("session AWS expirée : erreur de connexion avec le message de la config", async () => {
    cli([[/describe-alarm/, new CommandError("aws", "An error occurred (ExpiredTokenException): The security token included in the request is expired")]]);
    await expect(fetchCloudWatch({ ...cfg, aws: { ...cfg.aws, reconnectHint: "Lance aws:login" } })).rejects.toMatchObject({
      detail: { kind: "auth", message: { key: "srv_aws_session_expired" }, hint: { key: "srv_raw", params: { text: "Lance aws:login" } } },
    });
  });
});

// ---------- Déploiements (CodePipeline) ----------
describe("fetchDeploy (aws) : tout vient de la config", () => {
  const pipelines = { pipelines: [
    { name: "demo-main-pipeline-PipelineA-1", updated: "2026-11-22T10:00:00Z" },
    { name: "demo-abc-12-pipeline-PipelineB-2", updated: "2026-11-22T09:00:00Z" },
    { name: "autre-projet-pipeline-C", updated: "2026-11-22T08:00:00Z" },
  ] };
  const execution = { pipelineExecutionId: "x1", status: "Succeeded", startTime: "2026-11-22T09:00:00Z", lastUpdateTime: "2026-11-22T09:10:00Z", sourceRevisions: [{ revisionSummary: "(ABC-12) Panier (#7)" }] };
  const aws = () =>
    cli([
      [/list-pipelines/, pipelines],
      [/get-pipeline-state/, { stageStates: [] }],
      [/list-pipeline-executions/, { pipelineExecutionSummaries: [execution] }],
    ]);

  it("sans deploy.pipelinePrefix : demande de le régler, sans appeler AWS", async () => {
    aws();
    await expect(fetchDeploy(cfg)).rejects.toMatchObject({ detail: { kind: "config", message: { key: "srv_deploy_not_configured" }, hint: { key: "srv_hint_deploy_config" } } });
    expect(run).not.toHaveBeenCalled();
  });

  it("branche principale « main » par défaut ; sans deploy.envUrl, pas d'adresse d'environnement", async () => {
    aws();
    const d = await fetchDeploy({ ...cfg, deploy: { pipelinePrefix: "demo-" } });
    expect(d.main?.name).toBe("demo-main-pipeline-PipelineA-1");
    expect(d.envs.map((e) => [e.slug, e.url])).toEqual([["abc-12", null]]);
  });

  it("avec deploy.envUrl et deploy.mainBranch", async () => {
    aws();
    const d = await fetchDeploy({ ...cfg, deploy: { pipelinePrefix: "demo-", mainBranch: "abc-12", envUrl: "https://preview-{slug}.demo.example/" } });
    expect(d.main?.name).toBe("demo-abc-12-pipeline-PipelineB-2");
    expect(d.envs.map((e) => [e.slug, e.url])).toEqual([["main", "https://preview-main.demo.example/"]]);
  });
});

describe("courbes des alarmes CloudWatch", () => {
  const simple: RawAlarm = { AlarmName: "cpu", StateValue: "OK", StateReason: "", StateUpdatedTimestamp: "", Namespace: "AWS/ECS", MetricName: "CPUUtilization", Dimensions: [{ Name: "ServiceName", Value: "web" }], Statistic: "Average", Period: 60, Threshold: 80, ComparisonOperator: "GreaterThanThreshold" };
  const band: RawAlarm = {
    AlarmName: "5xx", StateValue: "OK", StateReason: "", StateUpdatedTimestamp: "", ThresholdMetricId: "ad1", ComparisonOperator: "GreaterThanUpperThreshold",
    Metrics: [
      { Id: "m1", ReturnData: false, MetricStat: { Metric: { Namespace: "AWS/ApplicationELB", MetricName: "HTTPCode_Target_5XX_Count" }, Period: 300, Stat: "Sum" } },
      { Id: "e1", ReturnData: true, Expression: "FILL(m1, 0)" },
      { Id: "ad1", ReturnData: true, Expression: "ANOMALY_DETECTION_BAND(e1, 3)" },
    ],
  };

  it("une alarme simple : sa métrique, au moins 60 s par point", () => {
    expect(alarmQueries(simple, 0)).toEqual({
      queries: [{ Id: "a0_m", MetricStat: { Metric: { Namespace: "AWS/ECS", MetricName: "CPUUtilization", Dimensions: [{ Name: "ServiceName", Value: "web" }] }, Period: 60, Stat: "Average" }, ReturnData: true }],
      dataId: "a0_m",
      bandId: null,
    });
  });

  it("une alarme calculée : identifiants préfixés jusque dans les expressions, seules la série et la bande reviennent", () => {
    const p = alarmQueries(band, 3)!;
    expect(p.queries.map((q) => [q.Id, q.Expression ?? null, q.ReturnData])).toEqual([
      ["a3_m1", null, false],
      ["a3_e1", "FILL(a3_m1, 0)", true],
      ["a3_ad1", "ANOMALY_DETECTION_BAND(a3_e1, 3)", true],
    ]);
    expect([p.dataId, p.bandId]).toEqual(["a3_e1", "a3_ad1"]);
  });

  it("série triée et réduite à 144 points, en gardant les pics", () => {
    const start = 0;
    const end = 86_400_000;
    const n = 1440;
    const r = { Id: "x", Timestamps: Array.from({ length: n }, (_, k) => new Date(end - k * 60_000).toISOString()), Values: Array.from({ length: n }, (_, k) => (k === 700 ? 99 : 1)) };
    const pts = toPoints(r, start, end, true);
    expect(pts.length).toBeLessThanOrEqual(144);
    expect(pts.every(([t], k) => k === 0 || t > pts[k - 1][0])).toBe(true);
    expect(Math.max(...pts.map(([, v]) => v))).toBe(99);
  });

  it("historique : seuls les passages en ALARM comptent", () => {
    const c = countTriggers([
      { AlarmName: "a", Timestamp: "2026-11-20T10:00:00Z", HistorySummary: "Alarm updated from OK to ALARM" },
      { AlarmName: "a", Timestamp: "2026-11-20T11:00:00Z", HistorySummary: "Alarm updated from ALARM to OK" },
      { AlarmName: "a", Timestamp: "2026-11-20T12:00:00Z", HistorySummary: "Alarm updated from INSUFFICIENT_DATA to ALARM" },
      { AlarmName: "b", Timestamp: "2026-11-20T12:00:00Z", HistorySummary: "Alarm updated from OK to INSUFFICIENT_DATA" },
    ]);
    expect(c.get("a")).toEqual({ count: 2, last: "2026-11-20T12:00:00Z" });
    expect(c.has("b")).toBe(false);
  });

  it("un seul appel GetMetricData ; la bande revient en deux séries « Low » et « High »", async () => {
    const at = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
    cli([
      [/describe-alarms /, { MetricAlarms: [simple, band] }],
      [/get-metric-data/, { MetricDataResults: [
        { Id: "a0_m", Label: "CPU", Timestamps: [at(1), at(2)], Values: [50, 40] },
        { Id: "a1_e1", Label: "e1", Timestamps: [at(1)], Values: [79] },
        { Id: "a1_ad1", Label: "HTTPCode_Target_5XX_Count Low", Timestamps: [at(1)], Values: [-5] },
        { Id: "a1_ad1", Label: "HTTPCode_Target_5XX_Count High", Timestamps: [at(1)], Values: [53] },
      ] }],
    ]);
    const d = await fetchAlarmCharts(cfg);
    expect(run.mock.calls.filter(([, a]) => a.includes("get-metric-data"))).toHaveLength(1);
    expect(d.charts.map((c) => [c.name, c.data.map(([, v]) => v), c.threshold, c.band && [c.band.low[0][1], c.band.high[0][1]], c.above])).toEqual([
      ["cpu", [40, 50], 80, null, true],
      ["5xx", [79], null, [-5, 53], true],
    ]);
  });
});

// ---------- CI GitHub ----------
describe("CI GitHub (gh)", () => {
  const now = Date.parse("2026-11-22T12:00:00Z");
  const runAt = (name: string, created: string, conclusion: string | null, over: Partial<RawRun> = {}): RawRun => ({
    name, status: conclusion ? "completed" : "in_progress", conclusion, html_url: `https://github.com/demo/demo/actions/runs/${name}-${created}`,
    run_started_at: created, created_at: created, updated_at: new Date(Date.parse(created) + 300_000).toISOString(), run_attempt: 1, head_sha: "abcdef1234567", event: "push", ...over,
  });

  it("dernière exécution par workflow, échecs et relances réussies sur 14 jours, les échecs d'abord", () => {
    const w = workflowsOf([
      runAt("CI", "2026-11-22T10:00:00Z", "success", { run_attempt: 2 }),
      runAt("CI", "2026-11-21T10:00:00Z", "failure"),
      runAt("CI", "2026-11-01T10:00:00Z", "failure"), // plus de 14 jours
      runAt("E2E", "2026-11-22T09:00:00Z", "failure"),
      runAt("Lint", "2026-11-22T11:00:00Z", null),
      runAt("Nightly", "2026-11-22T11:30:00Z", "skipped"),
      runAt("Docs", "2026-11-01T10:00:00Z", "success"), // n'a pas tourné depuis 14 jours : pas affiché
    ], now);
    expect(w.map((x) => [x.name, x.status, x.conclusion, x.attempt, x.failures14d, x.retriedOk14d])).toEqual([
      ["E2E", "completed", "failure", 1, 1, 0],
      ["Lint", "running", null, 1, 0, 0],
      ["CI", "completed", "success", 2, 1, 1],
    ]);
    expect(w[2].durationMs).toBe(300_000);
    expect(w[1].durationMs).toBeNull();
  });

  it("branche principale et ma branche ; un nom de branche douteux est ignoré", async () => {
    cli([
      [/branch=master/, { workflow_runs: [runAt("CI", "2026-11-22T10:00:00Z", "success")] }],
      [/branch=feat%2FABC-1/, { workflow_runs: [runAt("PR CI", "2026-11-22T10:00:00Z", "failure")] }],
    ]);
    const c = { ...cfg, deploy: { mainBranch: "master" } };
    const d = await fetchCi(c, "feat/ABC-1");
    expect([d.main.name, d.main.state, d.branch?.name, d.branch?.state]).toEqual(["master", "success", "feat/ABC-1", "failure"]);
    expect((await fetchCi(c, "--upload-pack=x")).branch).toBeNull();
    expect((await fetchCi(c, "master")).branch).toBeNull();
  });

  it("« À faire » : un workflow en échec sur la branche principale", () => {
    const main = { name: "master", state: "failure" as const, workflows: workflowsOf([runAt("CI", "2026-11-22T10:00:00Z", "failure")], now) };
    const items = computeTodo({ ci: { repo: "demo/demo", main, branch: null, actionsUrl: "" }, now }).filter((i) => i.id.startsWith("ci:"));
    expect(items).toMatchObject([{ id: "ci:master:CI", urgency: "now", version: "abcdef123" }]);
  });
});

// ---------- Logs Insights ----------
describe("Logs Insights (aws logs)", () => {
  const defs = { queryDefinitions: [
    { queryDefinitionId: "q-1", name: "Erreurs", queryString: "fields message | filter level = 'error'", logGroupNames: ["/app/staging"] },
    { queryDefinitionId: "q-2", name: "Sans groupe", queryString: "fields x" },
  ] };
  const results = { status: "Complete", results: [[{ field: "message", value: "boom" }, { field: "@ptr", value: "xyz" }], [{ field: "count", value: "3" }, { field: "message", value: "bang" }]], statistics: { recordsMatched: 2, bytesScanned: 2155 } };
  const noWait = async () => {};

  it("ne garde que les requêtes enregistrées qui visent un groupe de logs", async () => {
    cli([[/describe-query-definitions/, defs]]);
    expect((await listLogQueries(cfg)).map((q) => [q.id, q.logGroups])).toEqual([["q-1", ["/app/staging"]]]);
  });

  it("lance la requête enregistrée (jamais un texte venu de la page), attend la fin, sans @ptr", async () => {
    let polls = 0;
    run.mockImplementation(async (_cmd, args) => {
      const line = args.join(" ");
      if (line.includes("describe-query-definitions")) return JSON.stringify(defs);
      if (line.includes("start-query")) return JSON.stringify({ queryId: "run-1" });
      if (line.includes("get-query-results")) return JSON.stringify(++polls < 3 ? { status: "Running" } : results);
      throw new Error(line);
    });
    const r = await runLogQuery(cfg, "q-1", "1h", noWait);
    expect(r).toMatchObject({ columns: ["message", "count"], rows: [["boom", ""], ["bang", "3"]], matched: 2, bytesScanned: 2155 });
    const start = run.mock.calls.find(([, a]) => a.includes("start-query"))![1];
    expect(start[start.indexOf("--query-string") + 1]).toBe("fields message | filter level = 'error'");
    expect(Number(start[start.indexOf("--end-time") + 1]) - Number(start[start.indexOf("--start-time") + 1])).toBe(3600);
  });

  it("requête inconnue : refusée sans rien lancer", async () => {
    cli([[/describe-query-definitions/, defs]]);
    await expect(runLogQuery(cfg, "q-2", "24h", noWait)).rejects.toMatchObject({ detail: { message: { key: "srv_logs_unknown_query" } } });
    expect(run.mock.calls.some(([, a]) => a.includes("start-query"))).toBe(false);
  });

  it("échec de la requête : message lisible", async () => {
    cli([[/describe-query-definitions/, defs], [/start-query/, { queryId: "run-2" }], [/get-query-results/, { status: "Failed" }]]);
    await expect(runLogQuery(cfg, "q-1", "1h", noWait)).rejects.toMatchObject({ detail: { message: { key: "srv_logs_query_failed", params: { status: "Failed" } } } });
  });

  it("toTable : 100 lignes au plus", () => {
    const many = Array.from({ length: 150 }, (_, k) => [{ field: "n", value: String(k) }]);
    expect(toTable(many).rows).toHaveLength(100);
  });
});
