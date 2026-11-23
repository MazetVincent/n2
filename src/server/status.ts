// État de N2 en JSON (/api/status, `bun run status`, serveur MCP) : ce qui demande une action, la CI de la branche
// principale et de la branche actuelle, les sources en échec. Format versionné : un changement incompatible
// incrémente STATUS_SCHEMA_VERSION, et un lecteur doit le vérifier.
import { computeTodo, type TodoItem } from "../features/todo/logic.ts";
import { githubBranch } from "../features/branches/logic.ts";
import { isNotConfigured } from "../features/sources/logic.ts";
import { sourceStats, STARTED_AT } from "./run.ts";
import { readAwsSession, readBranch, readCi, readCloudWatch, readDeploy, readLibs, readPullRequests, readSentry, readSprint } from "./sources.ts";
import type { CiBranch, SourceResult } from "./types.ts";

export const STATUS_SCHEMA_VERSION = 1;

export interface N2Status {
  schemaVersion: typeof STATUS_SCHEMA_VERSION;
  generatedAt: string;
  n2: { startedAt: string };
  /** « À faire », sans les reports et les éléments ignorés (gardés dans le navigateur) */
  todo: { counts: { now: number; watch: number; info: number }; items: Pick<TodoItem, "id" | "urgency" | "label" | "title" | "detail" | "url">[] };
  ci: { main: Pick<CiBranch, "name" | "state"> | null; branch: Pick<CiBranch, "name" | "state"> | null };
  /** branche actuelle du projet suivi */
  branch: { name: string; ahead: number; files: number; parts: string[] } | null;
  /** sources dont la dernière lecture a échoué (les non configurées n'y sont pas) */
  failingSources: string[];
}

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
  const ci = ok(await settle(readCi(false, b ? githubBranch(b.branch) : undefined)));
  const items = computeTodo({ prs: ok(prs), sprint: ok(sprint), cloudwatch: ok(cloudwatch), sentry: ok(sentry), libs: ok(libs), deploy: ok(deploy), aws, ci, now });
  const count = (u: TodoItem["urgency"]) => items.filter((i) => i.urgency === u).length;
  return {
    schemaVersion: STATUS_SCHEMA_VERSION,
    generatedAt: new Date(now).toISOString(),
    n2: { startedAt: STARTED_AT },
    todo: {
      counts: { now: count("now"), watch: count("watch"), info: count("info") },
      items: items.slice(0, 30).map(({ id, urgency, label, title, detail, url }) => ({ id, urgency, label, title, ...(detail && { detail }), ...(url && { url }) })),
    },
    ci: { main: ci ? { name: ci.main.name, state: ci.main.state } : null, branch: ci?.branch ? { name: ci.branch.name, state: ci.branch.state } : null },
    branch: b ? { name: b.branch, ahead: b.ahead, files: b.files.length, parts: Object.keys(b.nodes) } : null,
    failingSources: sourceStats()
      .filter((s) => !s.lastOk && !isNotConfigured(s.lastError))
      .map((s) => s.key)
      .sort(),
  };
}
