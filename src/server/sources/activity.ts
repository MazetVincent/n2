import type { Config } from "../config.ts";
import { SourceFailure } from "../run.ts";
import { collectActivity, githubThread, jiraThread, type RawGithubThread, type RawJiraIssue, type Thread } from "../../features/activity/logic.ts";
import type { ActivityData } from "../types.ts";
import { gh } from "./github.ts";
import { acli } from "./jira.ts";
import { msg } from "../messages.ts";

// Activité GitHub et Jira du Dashboard, en lecture seule, avec les CLI déjà connectées :
//  - GitHub : les PR et issues des dépôts suivis où je suis impliqué (auteur, assigné, mentionné, commentateur),
//    avec leurs commentaires, revues et fils de revue. La boîte de notifications de GitHub n'est pas utilisée :
//    elle se vide dès qu'on la lit ailleurs, et ne dit pas si j'ai répondu.
//  - Jira : les tickets que je suis, qui sont à moi ou qui me mentionnent, avec leurs commentaires.

const DAY = 86_400_000;
const MAX_GITHUB = 40;
const MAX_JIRA = 25;

const comment = "author { __typename login } body createdAt url";
const QUERY = `
query($q: String!) {
  search(query: $q, type: ISSUE, first: ${MAX_GITHUB}) {
    nodes {
      ... on PullRequest {
        __typename number title url
        author { __typename login }
        assignees(first: 5) { nodes { login } }
        repository { nameWithOwner }
        comments(last: 20) { nodes { ${comment} } }
        reviews(last: 20) { nodes { ${comment} state } }
        reviewThreads(last: 30) { nodes { comments(last: 10) { nodes { ${comment} } } } }
      }
      ... on Issue {
        __typename number title url
        author { __typename login }
        assignees(first: 5) { nodes { login } }
        repository { nameWithOwner }
        comments(last: 20) { nodes { ${comment} } }
      }
    }
  }
}`;

async function githubThreads(cfg: Config, since: string): Promise<{ me: string; threads: Thread[] }> {
  const me = (await gh(["api", "user", "--jq", ".login"])).trim();
  const repos = cfg.github.repos.map((r) => `repo:${r}`).join(" ");
  const out = await gh(["api", "graphql", "-F", `q=${repos} involves:@me updated:>=${since} sort:updated-desc`, "-f", `query=${QUERY}`]);
  const nodes = (JSON.parse(out).data.search.nodes as RawGithubThread[]).filter((n) => n && n.number);
  return { me, threads: nodes.map((n) => githubThread(n, me)) };
}

// Identifiant de mon compte Jira (pour reconnaître mes commentaires et mes mentions), lu une fois
let jiraMe: string | null = null;
async function jiraAccountId(): Promise<string> {
  if (jiraMe) return jiraMe;
  for (const field of ["assignee", "reporter"] as const) {
    const out = await acli(["workitem", "search", "--jql", `${field} = currentUser() ORDER BY updated DESC`, "--fields", `key,${field}`, "--limit", "1", "--json"]);
    const id = (JSON.parse(out) as RawJiraIssue[] | null)?.[0]?.fields[field]?.accountId;
    if (id) return (jiraMe = id);
  }
  throw new SourceFailure({ kind: "config", message: msg("srv_jira_account_not_found"), hint: msg("srv_hint_jira_account") });
}

/** Applique fn à chaque élément, `limit` à la fois (pour ne pas lancer 25 acli en même temps) */
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function jiraThreads(cfg: Config, days: number): Promise<{ me: string; threads: Thread[] }> {
  const me = await jiraAccountId();
  // je suis les tickets où j'ai commenté (réglage par défaut de Jira) : c'est ce qui donne les réponses
  const jql = `updated >= -${days}d AND (watcher = currentUser() OR assignee = currentUser() OR reporter = currentUser() OR comment ~ currentUser()) ORDER BY updated DESC`;
  const found = (JSON.parse(await acli(["workitem", "search", "--jql", jql, "--fields", "key,summary", "--limit", String(MAX_JIRA), "--json"])) as RawJiraIssue[] | null) ?? [];
  const issues = await mapLimit(found, 5, async (i) => JSON.parse(await acli(["workitem", "view", i.key, "--fields", "summary,status,assignee,reporter,comment", "--json"])) as RawJiraIssue);
  return { me, threads: issues.map((i) => jiraThread(i, me, cfg.jira.site)) };
}

const failure = (source: "github" | "jira", e: unknown) =>
  e instanceof SourceFailure ? { source, message: e.detail.message, hint: e.detail.hint } : { source, message: msg("srv_raw", { text: e instanceof Error ? e.message.split("\n")[0].slice(0, 200) : String(e) }) };

export async function fetchActivity(cfg: Config): Promise<ActivityData> {
  const days = cfg.github.recentDays;
  const sinceMs = Date.now() - days * DAY;
  const [github, jira] = await Promise.allSettled([githubThreads(cfg, new Date(sinceMs).toISOString().slice(0, 10)), jiraThreads(cfg, days)]);
  // les deux en échec : erreur de la source (carte en erreur, avec l'indication pour se reconnecter)
  if (github.status === "rejected" && jira.status === "rejected") throw github.reason;

  const items = [
    ...(github.status === "fulfilled" ? collectActivity(github.value.threads, github.value.me, sinceMs) : []),
    ...(jira.status === "fulfilled" ? collectActivity(jira.value.threads, jira.value.me, sinceMs) : []),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const failed = [...(github.status === "rejected" ? [failure("github", github.reason)] : []), ...(jira.status === "rejected" ? [failure("jira", jira.reason)] : [])];
  return { items, days, failed };
}
