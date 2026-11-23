import type { Config } from "../config.ts";
import { httpFetch, SourceFailure } from "../run.ts";
import { isBotPr } from "../../lib/update-prs.ts";
import { dayKey, lastWeeks, prWeeks, slowestPrs, weeklyCounts, WEEKS, type StatsPr } from "../../features/stats/logic.ts";
import type { PrWeek, StatsData } from "../types.ts";
import { gh } from "./github.ts";
import { token } from "./sentry.ts";
import { msg } from "../messages.ts";

// Statistiques de la semaine (lecture seule) :
//  - GitHub : les PR des dépôts suivis fusionnées ou ouvertes sur les 8 dernières semaines, avec leur passage
//    de brouillon à « prête pour revue » et leurs premières revues ;
//  - Sentry : les événements d'erreur reçus par jour, et les nouveaux problèmes par semaine.

const PAGE = 100;
const MAX_PAGES = 5;
/** l'API issues-count de Sentry s'arrête à 100 */
const NEW_ISSUES_CAP = 100;

const QUERY = `
query($q: String!, $after: String) {
  search(query: $q, type: ISSUE, first: ${PAGE}, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes { ... on PullRequest {
      number title url createdAt mergedAt headRefName
      author { __typename login }
      timelineItems(itemTypes: [READY_FOR_REVIEW_EVENT], last: 1) { nodes { ... on ReadyForReviewEvent { createdAt } } }
      reviews(first: 10) { nodes { author { __typename login } submittedAt state } }
    } }
  }
}`;

interface RawStatsPr {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  mergedAt: string | null;
  headRefName: string;
  author: { __typename?: string; login: string } | null;
  timelineItems: { nodes: { createdAt?: string }[] };
  reviews: { nodes: { author: { __typename?: string; login: string } | null; submittedAt: string | null; state: string }[] };
}

async function searchAll(q: string): Promise<RawStatsPr[]> {
  const out: RawStatsPr[] = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const args = ["api", "graphql", "-F", `q=${q}`, "-f", `query=${QUERY}`];
    if (after) args.push("-f", `after=${after}`);
    const search = JSON.parse(await gh(args)).data.search as { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: RawStatsPr[] };
    out.push(...search.nodes.filter((n) => n?.number));
    if (!search.pageInfo.hasNextPage) break;
    after = search.pageInfo.endCursor;
  }
  return out;
}

export function toStatsPr(raw: RawStatsPr): StatsPr {
  const author = raw.author?.login ?? "?";
  const bot = raw.author?.__typename === "Bot" || isBotPr({ author, branch: raw.headRefName });
  const firstReview = raw.reviews.nodes.find((r) => r.submittedAt && r.state !== "PENDING" && r.author && r.author.login !== author && r.author.__typename !== "Bot");
  return {
    number: raw.number,
    title: raw.title,
    url: raw.url,
    author,
    bot,
    createdAt: raw.createdAt,
    readyAt: raw.timelineItems.nodes[0]?.createdAt ?? raw.createdAt,
    firstReviewAt: firstReview?.submittedAt ?? null,
    mergedAt: raw.mergedAt,
  };
}

async function githubStats(cfg: Config, since: Date) {
  const me = (await gh(["api", "user", "--jq", ".login"])).trim();
  const repos = cfg.github.repos.map((r) => `repo:${r}`).join(" ");
  // fusionnées dans la fenêtre (temps jusqu'à la fusion) ; ouvertes depuis 2 semaines de plus (premières revues :
  // une PR ouverte juste avant la fenêtre peut être revue dans sa première semaine)
  const openedSince = new Date(since);
  openedSince.setDate(openedSince.getDate() - 14);
  const [merged, opened] = await Promise.all([searchAll(`is:pr ${repos} is:merged merged:>=${dayKey(since)}`), searchAll(`is:pr ${repos} created:>=${dayKey(openedSince)}`)]);
  const byUrl = new Map([...merged, ...opened].map((r) => [r.url, toStatsPr(r)]));
  return { me, prs: [...byUrl.values()] };
}

async function sentryGet<T>(url: string): Promise<T> {
  const res = await httpFetch(url, { headers: { Authorization: `Bearer ${token()}` } });
  if (res.status === 401 || res.status === 403) throw new SourceFailure({ kind: "auth", message: msg("srv_sentry_denied", { status: res.status }), hint: msg("srv_hint_sentry_login") });
  if (!res.ok) throw new SourceFailure({ kind: "unavailable", message: msg("srv_sentry_responded", { status: res.status }) });
  return (await res.json()) as T;
}

let projectId: string | null = null;

async function sentryStats(cfg: Config, weeks: Date[]): Promise<{ errors: number[]; newIssues: number[] }> {
  const { org, project } = cfg.sentry;
  const base = `https://sentry.io/api/0`;
  projectId ??= (await sentryGet<{ id: string }>(`${base}/projects/${org}/${project}/`)).id;
  const since = Math.floor(weeks[0].getTime() / 1000);
  const daily = await sentryGet<[number, number][]>(`${base}/projects/${org}/${project}/stats/?stat=received&resolution=1d&since=${since}`);

  // nouveaux problèmes : une requête par semaine, toutes envoyées d'un coup
  const iso = (d: Date) => d.toISOString().slice(0, 19);
  const queries = weeks.map((w) => {
    const end = new Date(w);
    end.setDate(end.getDate() + 7);
    return `firstSeen:>=${iso(w)} firstSeen:<${iso(end)}`;
  });
  const params = new URLSearchParams({ project: projectId, statsPeriod: "90d" });
  for (const q of queries) params.append("query", q);
  const counts = await sentryGet<Record<string, number>>(`${base}/organizations/${org}/issues-count/?${params}`);
  return { errors: weeklyCounts(daily, weeks), newIssues: queries.map((q) => counts[q] ?? 0) };
}

const failure = (source: "github" | "sentry", e: unknown) =>
  e instanceof SourceFailure ? { source, message: e.detail.message, hint: e.detail.hint } : { source, message: msg("srv_raw", { text: e instanceof Error ? e.message.split("\n")[0].slice(0, 200) : String(e) }) };

export async function fetchStats(cfg: Config, now = Date.now()): Promise<StatsData> {
  const weeks = lastWeeks(now, WEEKS);
  const [github, sentry] = await Promise.allSettled([githubStats(cfg, weeks[0]), sentryStats(cfg, weeks)]);
  if (github.status === "rejected" && sentry.status === "rejected") throw github.reason;

  const empty: PrWeek[] = weeks.map(() => ({ merged: 0, cycle: null, reviewed: 0, review: null }));
  const prs = github.status === "fulfilled" ? github.value.prs : [];
  const team = github.status === "fulfilled" ? prWeeks(prs, weeks) : empty;
  const mine = github.status === "fulfilled" ? prWeeks(prs.filter((p) => p.author === github.value.me), weeks) : empty;
  const s = sentry.status === "fulfilled" ? sentry.value : null;

  return {
    weeks: weeks.map((w, i) => ({ start: dayKey(w), team: team[i], mine: mine[i], errors: s?.errors[i] ?? null, newIssues: s?.newIssues[i] ?? null })),
    slowest: slowestPrs(prs, weeks),
    newIssuesCap: NEW_ISSUES_CAP,
    failed: [...(github.status === "rejected" ? [failure("github", github.reason)] : []), ...(sentry.status === "rejected" ? [failure("sentry", sentry.reason)] : [])],
  };
}
