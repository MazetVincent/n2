// Déploiements : lecture des exécutions CodePipeline (commit en prod, en attente, étape en cours), noms des
// environnements dynamiques, éléments de « À faire » et pastilles des PR. Données inventées.
import { describe, expect, it } from "vitest";
import { branchSlug, pipelineSlug } from "../src/features/deploy/slug.ts";
import { deployStateOf, prStatusBadges } from "../src/features/prs/status.ts";
import { computeTodo } from "../src/features/todo/logic.ts";
import { deployOfRelease, isRecentRelease } from "../src/features/deploy/release.ts";
import { buildMain, commitMessage, type RawExecution, type RawState } from "../src/server/sources/deploy.ts";
import type { DeployData, PullRequest } from "../src/server/types.ts";

const exec = (id: string, status: string, start: string, message: string, end = start): RawExecution => ({
  pipelineExecutionId: id,
  status,
  startTime: `2026-11-20T${start}:00+01:00`,
  lastUpdateTime: `2026-11-20T${end}:00+01:00`,
  sourceRevisions: [{ revisionId: `sha-${id}`, revisionSummary: JSON.stringify({ ProviderType: "GitHub", CommitMessage: message }) }],
});

// dans le désordre, comme une réponse quelconque ; e4 attend la validation, e3 a été remplacée par e4
const executions = [
  exec("e2", "Succeeded", "16:00", "(DEMO-2) Deuxième (#102)", "16:20"),
  exec("e4", "InProgress", "17:20", "(DEMO-4) Quatrième (#104)\n\nCo-authored-by: quelqu'un", "17:28"),
  exec("e1", "Succeeded", "15:00", "(DEMO-1) Premier (#101)", "15:20"),
  exec("e3", "Superseded", "17:00", "(DEMO-3) Troisième (#103)", "17:10"),
];

const at = (t: string) => `2026-11-20T${t}:00+01:00`;
const state = (approval: string, prodExec = "e2"): RawState => ({
  stageStates: [
    { stageName: "Source", latestExecution: { pipelineExecutionId: "e4", status: "Succeeded" }, actionStates: [{ actionName: "GitHub", latestExecution: { status: "Succeeded", lastStatusChange: at("17:20") } }] },
    { stageName: "Staging", latestExecution: { pipelineExecutionId: "e4", status: "Succeeded" }, actionStates: [{ actionName: "Staging", latestExecution: { status: "Succeeded", lastStatusChange: at("17:28") } }] },
    { stageName: "Approval", latestExecution: { pipelineExecutionId: "e4", status: approval }, actionStates: [{ actionName: "Approve", latestExecution: { status: approval } }] },
    { stageName: "Production", latestExecution: { pipelineExecutionId: prodExec, status: "Succeeded" }, actionStates: [{ actionName: "Production", latestExecution: { status: "Succeeded", lastStatusChange: at("16:20") } }] },
  ],
});

describe("buildMain : pipeline principal", () => {
  const { main, prStates } = buildMain("monprojet-main-pipeline-X", "eu-west-1", state("InProgress"), executions);

  it("lit le commit, la PR et les tickets de chaque exécution, de la plus récente à la plus ancienne", () => {
    expect(main.executions.map((c) => [c.executionId, c.pr, c.jira, c.message])).toEqual([
      ["e4", 104, ["DEMO-4"], "(DEMO-4) Quatrième (#104)"],
      ["e3", 103, ["DEMO-3"], "(DEMO-3) Troisième (#103)"],
      ["e2", 102, ["DEMO-2"], "(DEMO-2) Deuxième (#102)"],
      ["e1", 101, ["DEMO-1"], "(DEMO-1) Premier (#101)"],
    ]);
  });

  it("en prod : la dernière exécution réussie ; en attente : tout ce qui a été fusionné après", () => {
    expect(main.prod?.executionId).toBe("e2");
    expect(main.pending.map((c) => c.executionId)).toEqual(["e4", "e3"]);
  });

  it("date de mise en prod : la première exécution réussie qui contient le commit", () => {
    expect(main.executions.map((c) => c.prodAt)).toEqual([null, null, at("16:20"), at("15:20")]);
  });

  it("en attente de validation, depuis la fin de l'étape précédente", () => {
    expect(main.pendingState).toEqual({ kind: "approval", stage: "Approval", since: at("17:28") });
    expect(prStates).toEqual({ 101: "prod", 102: "prod", 103: "approval", 104: "approval" });
  });

  it("étapes : état, heure et commit de la dernière exécution passée par chacune", () => {
    expect(main.stages.map((s) => [s.name, s.status, s.commit?.pr ?? null, s.at])).toEqual([
      ["Source", "Succeeded", 104, at("17:20")],
      ["Staging", "Succeeded", 104, at("17:28")],
      ["Approval", "InProgress", 104, null],
      ["Production", "Succeeded", 102, at("16:20")],
    ]);
    expect(main.consoleUrl).toBe("https://eu-west-1.console.aws.amazon.com/codesuite/codepipeline/pipelines/monprojet-main-pipeline-X/view?region=eu-west-1");
  });

  it("échec : l'étape qui a échoué, et les PR en attente passent en échec", () => {
    const failed = buildMain("p", "eu-west-1", state("Failed"), executions);
    expect(failed.main.pendingState?.kind).toBe("failed");
    expect(failed.main.pendingState?.stage).toBe("Approval");
    expect(failed.prStates[104]).toBe("failed");
  });

  it("tout en prod : rien en attente", () => {
    const done = buildMain("p", "eu-west-1", state("Succeeded", "e4"), [exec("e4", "Succeeded", "17:20", "(DEMO-4) Quatrième (#104)", "17:40"), ...executions.filter((e) => e.pipelineExecutionId !== "e4")]);
    expect(done.main.pending).toEqual([]);
    expect(done.main.pendingState).toBeNull();
    expect(done.prStates[103]).toBe("prod");
  });
});

describe("noms", () => {
  it("commitMessage : JSON de GitHub, sinon texte brut", () => {
    expect(commitMessage('{"ProviderType":"GitHub","CommitMessage":"Fix"}')).toBe("Fix");
    expect(commitMessage("texte")).toBe("texte");
    expect(commitMessage(undefined)).toBe("");
  });

  it("branchSlug : le ticket de la branche, sinon le nom nettoyé", () => {
    expect(branchSlug("feat/DEMO-123")).toBe("demo-123");
    expect(branchSlug("fix/DEMO-789-panier-vide")).toBe("demo-789");
    expect(branchSlug("deps/auto-update")).toBe("deps-auto-update");
    expect(branchSlug("une-tres-longue-branche-sans-ticket")).toBe("une-tres-longue-branche");
  });

  it("pipelineSlug : la partie entre le préfixe et « -pipeline »", () => {
    expect(pipelineSlug("monprojet-demo-123-pipeline-Pipeline1A2B3C4D-AbC", "monprojet-")).toBe("demo-123");
    expect(pipelineSlug("monprojet-main-pipeline-Pipeline1A2B3C4D-AbC", "monprojet-")).toBe("main");
    expect(pipelineSlug("autre-projet-pipeline-X", "monprojet-")).toBeNull();
    expect(pipelineSlug("monprojet-cache-stack", "monprojet-")).toBeNull();
  });
});

describe("intégration : « À faire » et pastilles des PR", () => {
  const { main, prStates } = buildMain("p", "eu-west-1", state("InProgress"), executions);
  const deploy: DeployData = { main, envs: [], prStates, region: "eu-west-1", links: { pr: "https://github.com/demo/demo/pull/", jira: "https://demo.atlassian.net/browse/" } };
  const pr = (number: number, extra: Partial<PullRequest> = {}): PullRequest => ({
    number,
    title: `PR ${number}`,
    url: `https://github.com/demo/demo/pull/${number}`,
    repo: "demo/demo",
    author: "moi",
    state: "MERGED",
    isDraft: false,
    reviewDecision: "APPROVED",
    mergeable: "UNKNOWN",
    ci: "SUCCESS",
    updatedAt: at("17:00"),
    myReview: null,
    jira: [],
    branch: "b",
    ...extra,
  });
  const prs = { me: "moi", mine: [pr(104), pr(102)], approved: [], commented: [], reviewRequested: [], searchUrl: "" };

  it("ma PR qui attend la validation, et celle arrivée en prod dans les dernières 24 h", () => {
    const items = computeTodo({ prs, deploy, now: Date.parse(at("18:00")) });
    expect(items.map((i) => [i.id, i.urgency])).toEqual([
      ["deploy:approval:https://github.com/demo/demo/pull/104", "watch"],
      ["deploy:prod:https://github.com/demo/demo/pull/102", "info"],
    ]);
    expect(items[0].detail).toContain("32 min");
  });

  it("pipeline en échec : une urgence, qui revient à chaque nouvelle exécution", () => {
    const failed = buildMain("p", "eu-west-1", state("Failed"), executions);
    const items = computeTodo({ deploy: { ...deploy, main: failed.main, prStates: failed.prStates }, now: Date.parse(at("18:00")) });
    expect(items[0]).toMatchObject({ id: "deploy:failed", urgency: "now", version: "e4" });
  });

  it("pastille d'une PR fusionnée, seulement pour le dépôt déployé", () => {
    expect(prStatusBadges(pr(104), deployStateOf(pr(104), deploy)).map(([t]) => t)).toEqual(["Fusionnée", "Attend la prod"]);
    expect(deployStateOf(pr(104, { repo: "autre/depot" }), deploy)).toBeUndefined();
    expect(deployStateOf(pr(104, { state: "OPEN" }), deploy)).toBeUndefined();
  });
});

describe("« À faire » : erreurs vues avant la prod", () => {
  const issue = (id: string) => ({ id, shortId: `DEMO-${id}`, title: `Erreur ${id}`, culprit: "", level: "error", count: 1, users: 1, lastSeen: "", firstSeen: "", url: "", trend: [] });
  const sentry = (preprod: ReturnType<typeof issue>[] | null) => ({ top: [], fresh: [], environment: "production", environments: [], preprod, preprodEnvironments: ["qa", "staging"], release: null, projectUrl: "" });

  it("une ligne à surveiller, qui mène à la vue « Avant la prod » et revient si la liste change", () => {
    const [item] = computeTodo({ sentry: sentry([issue("2"), issue("1")]) }).filter((i) => i.id === "sentry:preprod");
    expect(item).toMatchObject({ urgency: "watch", to: "/observabilite", search: { erreurs: "avant-prod" }, version: "1,2" });
    expect(item.title).toContain("qa, staging");
  });

  it("rien si la liste est vide ou si la vue n'est pas configurée", () => {
    expect(computeTodo({ sentry: sentry([]) }).some((i) => i.id === "sentry:preprod")).toBe(false);
    expect(computeTodo({ sentry: sentry(null) }).some((i) => i.id === "sentry:preprod")).toBe(false);
  });
});

describe("release Sentry en production ↔ mise en prod", () => {
  const { main } = buildMain("monprojet-main-pipeline-X", "eu-west-1", state("InProgress"), executions);

  it("la mise en prod réussie qui finit le plus près du premier événement de la release (1 h 30 au plus)", () => {
    // e2 finit à 16:20, e1 à 15:20 (heure de Paris)
    expect(deployOfRelease(main, "2026-11-20T15:25:00Z")?.executionId).toBe("e2");
    expect(deployOfRelease(main, "2026-11-20T14:30:00Z")?.executionId).toBe("e1");
    expect(deployOfRelease(main, "2026-11-20T20:00:00Z")).toBeNull();
    expect(deployOfRelease(main, null)).toBeNull();
    expect(deployOfRelease(null, "2026-11-20T15:25:00Z")).toBeNull();
  });

  it("« À faire » : une mise en prod de moins de 24 h qui a apporté des erreurs", () => {
    const now = Date.parse("2026-11-21T10:00:00Z");
    const issue = { id: "7", shortId: "DEMO-7", title: "Erreur 7", culprit: "", level: "error", count: 3, users: 1, lastSeen: "", firstSeen: "", url: "", trend: [] };
    const sentry = (since: string, newCount: number) => ({ top: [], fresh: [], environment: "production", environments: [], preprod: null, preprodEnvironments: [], projectUrl: "", release: { version: "1.2.3", since, url: "", newCount, newIssues: newCount ? [issue] : [] } });
    const [item] = computeTodo({ sentry: sentry("2026-11-20T16:29:00Z", 3), now }).filter((i) => i.id.startsWith("sentry:release"));
    expect(item).toMatchObject({ urgency: "watch", to: "/observabilite", search: { erreurs: "release" }, version: "3" });
    expect(item.title).toContain("1.2.3");
    expect(computeTodo({ sentry: sentry("2026-11-19T09:00:00Z", 3), now }).some((i) => i.id.startsWith("sentry:release"))).toBe(false);
    expect(computeTodo({ sentry: sentry("2026-11-20T16:29:00Z", 0), now }).some((i) => i.id.startsWith("sentry:release"))).toBe(false);
    expect(isRecentRelease(undefined, now)).toBe(false);
  });
});
