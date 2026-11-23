// Branches du projet suivi : validation des noms, lecture des refs git, classement pour le sélecteur « Ma branche »,
// PR et tickets Jira d'une branche.
// Fonctions pures (sans git ni node:*) : partagées entre le serveur, qui lance git, et la page, qui valide l'URL.
import type { PullRequest } from "../../server/types.ts";

export interface BranchRef {
  /** « feat/x » pour une branche locale, « origin/feat/x » pour une branche distante */
  name: string;
  /** date du dernier commit (ISO), si connue */
  date: string | null;
}

/** Refs lues dans le dépôt, sans tri ni filtrage */
export interface ParsedRefs {
  local: BranchRef[];
  remote: BranchRef[];
}

/** Ce qu'affiche le sélecteur : la branche actuelle, les autres branches locales, les distantes sans équivalent local */
export interface BranchList {
  /** branche sur laquelle est le dépôt (null si HEAD détachée) */
  current: string | null;
  local: BranchRef[];
  remote: BranchRef[];
}

export const REMOTE = "origin";
const MAX_LENGTH = 200;

/**
 * Nom de branche acceptable venant de la page (URL) : un sous-ensemble strict des noms admis par git
 * (`git check-ref-format --branch`), sans rien qui puisse passer pour une option ou une plage de commits.
 */
export function isValidBranchName(name: unknown): name is string {
  if (typeof name !== "string" || !name || name.length > MAX_LENGTH) return false;
  if (!/^[A-Za-z0-9._/+-]+$/.test(name)) return false;
  if (name.startsWith("-") || name.startsWith("/") || name.endsWith("/") || name.endsWith(".")) return false;
  if (name.includes("..") || name.includes("//")) return false;
  const segments = name.split("/");
  if (segments.some((s) => s.startsWith(".") || s.endsWith(".lock"))) return false;
  // HEAD (et origin/HEAD) désignent un pointeur, pas une branche
  if (segments.at(-1) === "HEAD") return false;
  return true;
}

/**
 * Lit la sortie de `git for-each-ref --format=%(refname)%09%(committerdate:iso-strict) refs/heads refs/remotes/origin`.
 * Les refs aux noms inhabituels (refusés par isValidBranchName) sont écartées : la page ne pourrait pas les demander.
 */
export function parseRefs(output: string): ParsedRefs {
  const local: BranchRef[] = [];
  const remote: BranchRef[] = [];
  for (const line of output.split("\n")) {
    const [ref, date] = line.trim().split("\t");
    if (!ref) continue;
    const d = date || null;
    if (ref.startsWith("refs/heads/")) {
      const name = ref.slice("refs/heads/".length);
      if (isValidBranchName(name)) local.push({ name, date: d });
    } else if (ref.startsWith(`refs/remotes/${REMOTE}/`)) {
      const name = ref.slice("refs/remotes/".length);
      if (isValidBranchName(name)) remote.push({ name, date: d });
    }
  }
  return { local, remote };
}

// le plus récent d'abord, puis par nom
const byRecent = (a: BranchRef, b: BranchRef) => (b.date ?? "").localeCompare(a.date ?? "") || a.name.localeCompare(b.name);

/** Classe les refs en trois sections : branche actuelle, autres branches locales, branches distantes sans équivalent local. */
export function classifyBranches(refs: ParsedRefs, current: string | null): BranchList {
  const cur = current && isValidBranchName(current) ? current : null;
  const localNames = new Set(refs.local.map((b) => b.name));
  if (cur) localNames.add(cur);
  return {
    current: cur,
    local: refs.local.filter((b) => b.name !== cur).sort(byRecent),
    remote: refs.remote.filter((b) => !localNames.has(b.name.slice(REMOTE.length + 1))).sort(byRecent),
  };
}

/**
 * Ref git complète à comparer pour un nom de branche reçu de la page, ou null s'il n'existe pas dans le dépôt.
 * « HEAD » pour la branche actuelle (on garde alors aussi les modifications non commitées).
 * Une branche locale l'emporte sur une distante du même nom ; on n'utilise jamais le nom brut dans git.
 */
export function resolveBranch(refs: ParsedRefs, current: string | null, name: string): { ref: string; isCurrent: boolean } | null {
  if (!isValidBranchName(name)) return null;
  if (name === current) return { ref: "HEAD", isCurrent: true };
  if (refs.local.some((b) => b.name === name)) return { ref: `refs/heads/${name}`, isCurrent: false };
  if (refs.remote.some((b) => b.name === name)) return { ref: `refs/remotes/${name}`, isCurrent: false };
  return null;
}

/** Nom de la branche telle que GitHub la connaît (« origin/feat/x » → « feat/x ») */
export const githubBranch = (name: string) => (name.startsWith(`${REMOTE}/`) ? name.slice(REMOTE.length + 1) : name);

/**
 * PR dont la branche est `name`, sans doublon (une PR peut être dans plusieurs listes) :
 * les ouvertes d'abord, puis les plus récentes.
 */
export function prsOfBranch(name: string, lists: readonly (readonly PullRequest[] | undefined)[]): PullRequest[] {
  const branch = githubBranch(name);
  const found = new Map<string, PullRequest>();
  for (const list of lists) for (const pr of list ?? []) if (pr.branch === branch && !found.has(pr.url)) found.set(pr.url, pr);
  return [...found.values()].sort((a, b) => Number(b.state === "OPEN") - Number(a.state === "OPEN") || b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Tickets Jira cités dans un nom de branche : « feat/ABC-123 » → ABC-123.
 * Les clés du projet Jira suivi sont aussi reconnues en minuscules (« fix/abc-42-typo »).
 */
export function jiraKeysOf(branch: string, projectKey?: string): string[] {
  const keys = new Set(branch.match(/\b[A-Z][A-Z0-9]+-\d+\b/g) ?? []);
  if (projectKey && /^[A-Za-z][A-Za-z0-9]*$/.test(projectKey)) {
    for (const m of branch.matchAll(new RegExp(`(?:^|[^A-Za-z0-9])(${projectKey}-\\d+)(?![0-9])`, "gi"))) keys.add(m[1].toUpperCase());
  }
  return [...keys];
}
