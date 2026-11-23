// Branches du projet suivi, pour le sélecteur « Ma branche » (onglets À faire et Carte).
//
// Les branches distantes sont lues dans les refs déjà connues du dépôt (refs/remotes/origin/*) : instantané,
// sans réseau ni demande d'identifiants. Le bouton « git fetch » du sélecteur les met à jour à la demande ;
// il ne touche qu'aux refs distantes, jamais à la branche ni aux fichiers de l'utilisateur.
import { classifyBranches, parseRefs, REMOTE, resolveBranch, type BranchList, type ParsedRefs } from "../../features/branches/logic.ts";
import type { Config } from "../config.ts";
import { run, SourceFailure } from "../run.ts";
import { msg } from "../messages.ts";

const root = (cfg: Config) => cfg.codemap?.projectPath ?? cfg.libs.projectPath;
const git = (cfg: Config, args: string[], timeoutMs = 20_000, env?: Record<string, string>) => run("git", ["-C", root(cfg), ...args], timeoutMs, env);
// pas de terminal derrière N2 : git échoue plutôt que d'attendre un mot de passe ou une phrase de passe SSH
const NO_PROMPT = { GIT_TERMINAL_PROMPT: "0", GIT_SSH_COMMAND: "ssh -o BatchMode=yes" };

/** Branche sur laquelle est le dépôt (null si HEAD détachée) */
export async function currentBranch(cfg: Config): Promise<string | null> {
  return (await git(cfg, ["branch", "--show-current"])).trim() || null;
}

export async function readRefs(cfg: Config): Promise<ParsedRefs> {
  return parseRefs(await git(cfg, ["for-each-ref", "--format=%(refname)%09%(committerdate:iso-strict)", "refs/heads", `refs/remotes/${REMOTE}`]));
}

export async function listBranches(cfg: Config): Promise<BranchList> {
  const [refs, current] = await Promise.all([readRefs(cfg), currentBranch(cfg)]);
  return classifyBranches(refs, current);
}

/** Met à jour les branches distantes (git fetch), sans jamais demander d'identifiants, puis relit la liste. */
export async function fetchRemoteBranches(cfg: Config): Promise<BranchList> {
  // mode démo : pas de git fetch (aucun accès distant), seulement les branches déjà connues
  if (process.env.N2_DEMO === "1") return listBranches(cfg);
  await git(cfg, ["fetch", "--prune", "--no-tags", "--quiet", REMOTE], 60_000, NO_PROMPT).catch(() => {
    throw new SourceFailure({ kind: "unavailable", message: msg("srv_git_fetch_failed"), hint: msg("srv_hint_check_remote") });
  });
  return listBranches(cfg);
}

/** Ref git à comparer pour une branche demandée par la page (undefined : la branche actuelle). */
export async function branchTarget(cfg: Config, name: string | undefined): Promise<{ ref: string; isCurrent: boolean; label: string }> {
  const current = await currentBranch(cfg).catch(() => null);
  if (!name) return { ref: "HEAD", isCurrent: true, label: current ?? "HEAD" };
  const target = resolveBranch(await readRefs(cfg), current, name);
  if (!target) throw new SourceFailure({ kind: "config", message: msg("srv_branch_not_found", { name }) });
  return { ...target, label: name };
}
