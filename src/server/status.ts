// État de N2 en JSON (/api/status, `bun run status`, serveur MCP) : ce qui demande une action, la CI de la branche
// principale et de la branche actuelle, les sources en échec. Format versionné : un changement incompatible
// incrémente STATUS_SCHEMA_VERSION, et un lecteur doit le vérifier.
import { computeTodo, type TodoItem } from "../features/todo/logic.ts";
import { githubBranch, isValidBranchName, prsOfBranch } from "../features/branches/logic.ts";
import { isNotConfigured } from "../features/sources/logic.ts";
import { isDashboardSource, sourceStats, STARTED_AT } from "./run.ts";
import { readAwsSession, readBranch, readCi, readCloudWatch, readDeploy, readLibs, readPullRequests, readSentry, readSprint } from "./sources.ts";
import type { CiBranch, CiWorkflow, SourceResult } from "./types.ts";

export const STATUS_SCHEMA_VERSION = 1;

export interface N2Status {
  schemaVersion: typeof STATUS_SCHEMA_VERSION;
  generatedAt: string;
  /** `demo` : données inventées (N2_DEMO=1), à ne pas prendre pour les vraies */
  n2: { startedAt: string; demo: boolean };
  /** « À faire », sans les reports et les éléments ignorés (gardés dans le navigateur) */
  todo: { counts: { now: number; watch: number; info: number }; items: Pick<TodoItem, "id" | "urgency" | "label" | "title" | "detail" | "url">[] };
  ci: { main: Pick<CiBranch, "name" | "state"> | null; branch: Pick<CiBranch, "name" | "state"> | null };
  /** branche actuelle du projet suivi */
  branch: { name: string; ahead: number; files: number; parts: string[] } | null;
  /** sources des onglets dont la dernière lecture a échoué (les non configurées n'y sont pas) */
  failingSources: string[];
  /** sources servies avec leurs dernières bonnes données, la lecture de l'instant ayant échoué */
  staleSources: string[];
}

/** Clés des résultats servis périmés (dernières bonnes données après un échec) */
const staleKeys = (results: [string, SourceResult<unknown> | undefined][]) => results.filter(([, r]) => r?.ok && r.stale).map(([k]) => k);

const ok = <T>(r: SourceResult<T> | undefined) => (r?.ok ? r.data : undefined);
/** Une source qui échoue ne fait pas échouer l'état : elle manque, simplement */
const settle = <T>(p: Promise<T>) => p.catch(() => undefined);

export async function buildStatus(now = Date.now()): Promise<N2Status> {
  const [prs, sprint, cloudwatch, sentry, libs, deploy, aws, branch] = await Promise.all([
    settle(readPullRequests()),
    settle(readSprint()),
    settle(readCloudWatch()),
    settle(readSentry()),
    settle(readLibs()),
    settle(readDeploy()),
    settle(Promise.resolve().then(readAwsSession)),
    settle(readBranch()),
  ]);
  const b = ok(branch);
  const ciKey = b ? githubBranch(b.branch) : undefined;
  const ciResult = await settle(readCi(false, ciKey));
  const ci = ok(ciResult);
  const items = computeTodo({ prs: ok(prs), sprint: ok(sprint), cloudwatch: ok(cloudwatch), sentry: ok(sentry), libs: ok(libs), deploy: ok(deploy), aws, ci, now });
  const count = (u: TodoItem["urgency"]) => items.filter((i) => i.urgency === u).length;
  return {
    schemaVersion: STATUS_SCHEMA_VERSION,
    generatedAt: new Date(now).toISOString(),
    n2: { startedAt: STARTED_AT, demo: process.env.N2_DEMO === "1" },
    todo: {
      counts: { now: count("now"), watch: count("watch"), info: count("info") },
      items: items.slice(0, 30).map(({ id, urgency, label, title, detail, url }) => ({ id, urgency, label, title, ...(detail && { detail }), ...(url && { url }) })),
    },
    ci: { main: ci ? { name: ci.main.name, state: ci.main.state } : null, branch: ci?.branch ? { name: ci.branch.name, state: ci.branch.state } : null },
    branch: b ? { name: b.branch, ahead: b.ahead, files: b.files.length, parts: Object.keys(b.nodes) } : null,
    failingSources: sourceStats()
      .filter((s) => isDashboardSource(s.key) && !s.lastOk && !isNotConfigured(s.lastError))
      .map((s) => s.key)
      .sort(),
    staleSources: staleKeys([
      ["prs", prs],
      ["jira", sprint],
      ["cloudwatch", cloudwatch],
      ["sentry:(config)", sentry],
      ["libs", libs],
      ["deploy", deploy],
      [`ci:${ciKey ?? ""}`, ciResult],
    ]),
  };
}

/** Contexte d'une branche (serveur MCP, /api/branch) : fichiers modifiés, parties touchées, PR, CI, tickets */
export interface N2BranchContext {
  schemaVersion: typeof STATUS_SCHEMA_VERSION;
  branch: string;
  base: string;
  ahead: number;
  /** 200 premiers fichiers modifiés depuis la base (commités ou non), avec leur partie du projet */
  files: { file: string; status: string; part: string | null }[];
  parts: Record<string, number>;
  jira: string[];
  prs: { number: number; title: string; url: string; isDraft: boolean; ci: string | null; review: string | null; mergeable: string | null }[];
  ci: Pick<CiWorkflow, "name" | "status" | "conclusion" | "url" | "attempt">[];
  /** parties servies avec leurs dernières bonnes données (« prs », « ci ») */
  staleSources: string[];
}

/** Contexte d'une branche, ou pourquoi il manque : 404 branche inconnue (ou nom refusé), 503 autre échec */
export type BranchContextResult = { ok: true; context: N2BranchContext } | { ok: false; status: 404 | 503; error: string };

/** `name` : une branche du projet suivi (locale ou distante) ; absent : la branche actuelle */
export async function buildBranchContext(name?: string): Promise<BranchContextResult> {
  if (name !== undefined && !isValidBranchName(name)) return { ok: false, status: 404, error: "unknown-branch" };
  const read = await readBranch(false, name);
  if (!read.ok) {
    const unknown = read.error.message.key === "srv_branch_not_found";
    return { ok: false, status: unknown ? 404 : 503, error: unknown ? "unknown-branch" : read.error.message.key };
  }
  const b = read.data;
  const onGithub = githubBranch(b.branch);
  const [prs, ci] = await Promise.all([settle(readPullRequests()), settle(readCi(false, onGithub))]);
  const p = ok(prs);
  const context: N2BranchContext = {
    schemaVersion: STATUS_SCHEMA_VERSION,
    branch: b.branch,
    base: b.base,
    ahead: b.ahead,
    files: b.files.slice(0, 200).map((f) => ({ file: f.file, status: f.status, part: f.node })),
    parts: b.nodes,
    jira: b.jira.map((j) => j.key),
    prs: prsOfBranch(onGithub, p ? [p.mine, p.reviewRequested, p.approved, p.commented] : []).map((x) => ({
      number: x.number,
      title: x.title,
      url: x.url,
      isDraft: x.isDraft,
      ci: x.ci,
      review: x.reviewDecision,
      mergeable: x.mergeable,
    })),
    ci: (ok(ci)?.branch?.workflows ?? []).map(({ name: n, status, conclusion, url, attempt }) => ({ name: n, status, conclusion, url, attempt })),
    staleSources: staleKeys([
      ["prs", prs],
      ["ci", ci],
    ]),
  };
  return { ok: true, context };
}
