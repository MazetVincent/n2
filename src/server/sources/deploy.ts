import type { Config } from "../config.ts";
import { CommandError, run, SourceFailure } from "../run.ts";
import { pipelineSlug } from "../../features/deploy/slug.ts";
import type { DeployCommit, DeployData, DeployStage, DeployState, DynamicEnv, MainPipeline } from "../types.ts";
import { msg } from "../messages.ts";

// Déploiements : pipelines AWS CodePipeline du projet, lus en lecture seule avec le profil AWS de la config
// (la même session que CloudWatch). Convention de nommage (deploy.pipelinePrefix = « monprojet- ») :
//  - branche principale : « monprojet-<mainBranch>-pipeline… », étapes quelconques (Source → … → validation → Production) ;
//  - une branche : « monprojet-<ticket>-pipeline… », qui déploie un environnement de branche (deploy.envUrl).

/** Réglages des Déploiements : rien de propre à un projet dans le code, tout vient de config.local.json */
export const deployConfig = (cfg: Config) => ({
  pipelinePrefix: cfg.deploy?.pipelinePrefix || null,
  mainBranch: cfg.deploy?.mainBranch || "main",
  envUrl: cfg.deploy?.envUrl || null,
});

const MAX_EXECUTIONS = 25;
const MAX_ENVS = 20;

async function awsJson<T>(cfg: Config, args: string[]): Promise<T> {
  const { profile, region, reconnectHint } = cfg.aws;
  try {
    return JSON.parse(await run("aws", [...args, "--profile", profile, "--region", region, "--output", "json"], 30_000)) as T;
  } catch (e) {
    if (e instanceof CommandError && /ExpiredToken|InvalidClientTokenId|security token|Unable to locate credentials|could not be found|SSO/i.test(e.stderr)) {
      throw new SourceFailure({ kind: "auth", message: msg("srv_aws_session_expired"), hint: msg("srv_raw", { text: reconnectHint }) });
    }
    if (e instanceof CommandError && /AccessDenied|not authorized/i.test(e.stderr)) {
      throw new SourceFailure({ kind: "auth", message: msg("srv_codepipeline_denied"), hint: msg("srv_hint_codepipeline_perms") });
    }
    throw e;
  }
}

// ---------- Réponses brutes de l'AWS CLI ----------
export interface RawExecution {
  pipelineExecutionId: string;
  status: string;
  startTime: string;
  lastUpdateTime: string;
  sourceRevisions?: { revisionId?: string; revisionSummary?: string }[];
}

export interface RawState {
  stageStates: {
    stageName: string;
    latestExecution?: { pipelineExecutionId: string; status: string };
    actionStates?: { actionName: string; latestExecution?: { status?: string; lastStatusChange?: string } }[];
  }[];
}

// ---------- Lecture des commits ----------
/** Message de commit : GitHub le fournit en JSON ({"ProviderType":"GitHub","CommitMessage":"…"}) */
export function commitMessage(summary: string | undefined): string {
  if (!summary) return "";
  try {
    const parsed = JSON.parse(summary) as { CommitMessage?: string };
    if (typeof parsed.CommitMessage === "string") return parsed.CommitMessage;
  } catch {
    /* texte brut */
  }
  return summary;
}

function toCommit(e: RawExecution): DeployCommit {
  const full = commitMessage(e.sourceRevisions?.[0]?.revisionSummary);
  const message = full.split("\n")[0].trim();
  return {
    sha: e.sourceRevisions?.[0]?.revisionId ?? "",
    message,
    pr: Number(message.match(/\(#(\d+)\)\s*$/)?.[1] ?? message.match(/#(\d+)/)?.[1]) || null,
    jira: [...new Set(message.match(/\b[A-Z][A-Z0-9]+-\d+\b/g) ?? [])],
    executionId: e.pipelineExecutionId,
    status: e.status,
    startedAt: e.startTime,
    updatedAt: e.lastUpdateTime,
    prodAt: null,
  };
}

const consoleUrl = (region: string, name: string) => `https://${region}.console.aws.amazon.com/codesuite/codepipeline/pipelines/${encodeURIComponent(name)}/view?region=${region}`;

/**
 * Pipeline principal : étapes, commit en prod, commits en attente, état de chaque PR.
 * Chaque exécution déploie toute la branche : un commit est en prod dès qu'une exécution réussie démarre après lui.
 */
export function buildMain(name: string, region: string, state: RawState, raw: RawExecution[]): { main: MainPipeline; prStates: Record<number, DeployState> } {
  const executions = [...raw].sort((a, b) => b.startTime.localeCompare(a.startTime)).map(toCommit);

  // mise en prod de chaque commit : la plus ancienne exécution réussie qui démarre à partir de lui.
  // En remontant du plus récent au plus ancien, la dernière réussite rencontrée est justement celle-là.
  let firstSuccessAfter: DeployCommit | null = null;
  for (const c of executions) {
    if (c.status === "Succeeded") firstSuccessAfter = c;
    c.prodAt = firstSuccessAfter ? firstSuccessAfter.updatedAt : null;
  }

  const byId = new Map(executions.map((c) => [c.executionId, c]));
  const prod = executions.find((c) => c.status === "Succeeded") ?? null;
  const pending = prod ? executions.filter((c) => c.startedAt > prod.startedAt) : executions;

  const stages: DeployStage[] = state.stageStates.map((s) => {
    const times = (s.actionStates ?? []).map((a) => a.latestExecution?.lastStatusChange).filter((t): t is string => !!t);
    return {
      name: s.stageName,
      status: s.latestExecution?.status ?? null,
      at: times.length ? times.sort().at(-1)! : null,
      commit: s.latestExecution ? (byId.get(s.latestExecution.pipelineExecutionId) ?? null) : null,
      actions: (s.actionStates ?? []).map((a) => ({ name: a.actionName, status: a.latestExecution?.status ?? null })),
    };
  });

  const pendingState = pending.length ? progressOf(pending[0], state, stages) : null;
  const prStates: Record<number, DeployState> = {};
  for (const c of [...executions].reverse()) {
    if (c.pr === null) continue;
    prStates[c.pr] = c.prodAt ? "prod" : (pendingState?.kind ?? "deploying");
  }

  return { main: { name, consoleUrl: consoleUrl(region, name), stages, prod, pending, pendingState, executions }, prStates };
}

/** Où en est la dernière exécution : première étape qu'elle n'a pas réussie */
function progressOf(newest: DeployCommit, state: RawState, stages: DeployStage[]): MainPipeline["pendingState"] {
  let since: string | null = newest.startedAt;
  for (const [i, s] of state.stageStates.entries()) {
    const mine = s.latestExecution?.pipelineExecutionId === newest.executionId;
    const status = mine ? s.latestExecution!.status : null;
    if (status === "Succeeded") {
      since = stages[i].at ?? since;
      continue;
    }
    if (status === "Failed" || status === "Stopped" || newest.status === "Failed") return { kind: "failed", stage: s.stageName, since: stages[i].at ?? since };
    // étape pas encore atteinte (une autre exécution l'occupe) ou en cours
    const approval = /approv|validation/i.test(s.stageName) && status === "InProgress";
    return { kind: approval ? "approval" : "deploying", stage: s.stageName, since };
  }
  return null;
}

/** Exécute au plus `n` tâches à la fois (l'AWS CLI démarre un processus par appel) */
async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

export async function fetchDeploy(cfg: Config): Promise<DeployData> {
  const { pipelinePrefix, mainBranch, envUrl } = deployConfig(cfg);
  if (!pipelinePrefix) throw new SourceFailure({ kind: "config", message: msg("srv_deploy_not_configured"), hint: msg("srv_hint_deploy_config") });
  const region = cfg.aws.region;
  const list = await awsJson<{ pipelines: { name: string; updated: string }[] }>(cfg, ["codepipeline", "list-pipelines"]);
  const ours = list.pipelines
    .map((p) => ({ ...p, slug: pipelineSlug(p.name, pipelinePrefix) }))
    .filter((p): p is typeof p & { slug: string } => p.slug !== null);

  const mainP = ours.find((p) => p.slug === mainBranch);
  const branches = ours
    .filter((p) => p !== mainP)
    .sort((a, b) => b.updated.localeCompare(a.updated))
    .slice(0, MAX_ENVS);

  const executions = (name: string, max: number) =>
    awsJson<{ pipelineExecutionSummaries: RawExecution[] }>(cfg, ["codepipeline", "list-pipeline-executions", "--pipeline-name", name, "--max-items", String(max)]).then(
      (r) => r.pipelineExecutionSummaries,
    );

  const [mainPart, envs] = await Promise.all([
    mainP
      ? Promise.all([awsJson<RawState>(cfg, ["codepipeline", "get-pipeline-state", "--name", mainP.name]), executions(mainP.name, MAX_EXECUTIONS)]).then(([state, raw]) =>
          buildMain(mainP.name, region, state, raw),
        )
      : null,
    pool(branches, 6, async (p): Promise<DynamicEnv> => {
      const last = (await executions(p.name, 1))[0];
      return { slug: p.slug, pipeline: p.name, consoleUrl: consoleUrl(region, p.name), url: envUrl ? envUrl.replace("{slug}", p.slug) : null, last: last ? toCommit(last) : null };
    }),
  ]);

  // environnements : le dernier déployé en premier
  envs.sort((a, b) => (b.last?.startedAt ?? "").localeCompare(a.last?.startedAt ?? ""));
  const links = { pr: `https://github.com/${cfg.github.repos[0] ?? ""}/pull/`, jira: `https://${cfg.jira.site}/browse/` };
  return { main: mainPart?.main ?? null, envs, prStates: mainPart?.prStates ?? {}, region, links };
}
