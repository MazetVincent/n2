// CI GitHub (GitHub Actions) du dépôt suivi : la branche principale et une branche (« ma branche »).
// Pour chaque workflow, sa dernière exécution ; et les relances, signe d'une CI instable (un test qui échoue au hasard).
import type { Config } from "../config.ts";
import { msg } from "../messages.ts";
import { SourceFailure } from "../run.ts";
import type { CiBranch, CiData, CiWorkflow } from "../types.ts";
import { deployConfig } from "./deploy.ts";
import { gh } from "./github.ts";

export interface RawRun {
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  run_started_at?: string | null;
  created_at: string;
  updated_at: string;
  run_attempt?: number;
  head_sha: string;
  event: string;
}

const DAY = 86_400_000;
/** Une branche : caractères acceptés par git, sans « .. » ni début par « - » (passée en paramètre d'URL) */
const isBranch = (b: string) => /^[\w./+-]{1,200}$/.test(b) && !b.startsWith("-") && !b.includes("..");

/**
 * Dernière exécution de chaque workflow qui a tourné ces 14 derniers jours (les exécutions « ignorées » ne comptent
 * pas : rien n'a tourné ; un workflow plus ancien, souvent un robot ponctuel, encombrerait la liste),
 * plus, sur 14 jours, ses échecs et ses relances réussies.
 */
export function workflowsOf(runs: RawRun[], now = Date.now()): CiWorkflow[] {
  const by = new Map<string, RawRun[]>();
  for (const r of runs) {
    if (r.conclusion === "skipped" || now - Date.parse(r.created_at) >= 14 * DAY) continue;
    by.set(r.name, [...(by.get(r.name) ?? []), r]);
  }
  const out: CiWorkflow[] = [];
  for (const [name, list] of by) {
    list.sort((a, b) => b.created_at.localeCompare(a.created_at));
    const last = list[0];
    const recent = list.filter((r) => now - Date.parse(r.created_at) < 14 * DAY);
    const started = last.run_started_at ?? last.created_at;
    out.push({
      name,
      status: last.status === "completed" ? "completed" : "running",
      conclusion: last.conclusion,
      url: last.html_url,
      startedAt: started,
      durationMs: last.status === "completed" ? Math.max(0, Date.parse(last.updated_at) - Date.parse(started)) : null,
      attempt: last.run_attempt ?? 1,
      sha: last.head_sha.slice(0, 9),
      failures14d: recent.filter((r) => r.conclusion === "failure").length,
      retriedOk14d: recent.filter((r) => (r.run_attempt ?? 1) > 1 && r.conclusion === "success").length,
    });
  }
  // en échec d'abord, puis en cours, puis le reste ; à égalité, la plus récente
  const rank = (w: CiWorkflow) => (w.conclusion === "failure" ? 0 : w.status === "running" ? 1 : 2);
  return out.sort((a, b) => rank(a) - rank(b) || b.startedAt.localeCompare(a.startedAt));
}

async function branchRuns(repo: string, branch: string): Promise<RawRun[]> {
  const out = await gh(["api", `repos/${repo}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=50`]);
  return (JSON.parse(out) as { workflow_runs?: RawRun[] }).workflow_runs ?? [];
}

const summary = (name: string, workflows: CiWorkflow[]): CiBranch => ({
  name,
  workflows,
  state: workflows.some((w) => w.conclusion === "failure") ? "failure" : workflows.some((w) => w.status === "running") ? "running" : workflows.length ? "success" : "none",
});

/** CI de la branche principale (deploy.mainBranch) et, si elle est donnée et différente, de `branch` */
export async function fetchCi(cfg: Config, branch?: string): Promise<CiData> {
  const repo = cfg.github.repos[0];
  if (!repo) throw new SourceFailure({ kind: "config", message: msg("srv_ci_no_repo") });
  const main = deployConfig(cfg).mainBranch;
  const other = branch && branch !== main && isBranch(branch) ? branch : null;
  const [mainRuns, otherRuns] = await Promise.all([branchRuns(repo, main), other ? branchRuns(repo, other) : Promise.resolve(null)]);
  return {
    repo,
    main: summary(main, workflowsOf(mainRuns)),
    branch: other && otherRuns ? summary(other, workflowsOf(otherRuns)) : null,
    actionsUrl: `https://github.com/${repo}/actions`,
  };
}
