import type { Config } from "../config.ts";
import { run, CommandError, SourceFailure } from "../run.ts";
import { isBotPr, parseManifestPatch, parsePrBody } from "../../lib/update-prs.ts";
import type { OpenPr, PrBodyUpdate, PullRequest, PullRequestsData, ReviewState } from "../types.ts";
import { msg } from "../messages.ts";

const QUERY = `
query($q: String!) {
  search(query: $q, type: ISSUE, first: 50) {
    nodes { ... on PullRequest {
      number title url isDraft updatedAt state headRefName
      author { login }
      reviewDecision mergeable
      repository { nameWithOwner }
      commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
      reviews(last: 50) { nodes { author { login } state } }
    } }
  }
}`;

interface RawPr {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  updatedAt: string;
  state: PullRequest["state"];
  headRefName: string;
  author: { login: string } | null;
  reviewDecision: PullRequest["reviewDecision"];
  mergeable: PullRequest["mergeable"];
  repository: { nameWithOwner: string };
  commits: { nodes: { commit: { statusCheckRollup: { state: PullRequest["ci"] } | null } }[] };
  reviews: { nodes: { author: { login: string } | null; state: ReviewState }[] };
}

export async function gh(args: string[]): Promise<string> {
  try {
    return await run("gh", args);
  } catch (e) {
    if (e instanceof CommandError && /auth login|not logged|401|Bad credentials/i.test(e.stderr)) {
      throw new SourceFailure({ kind: "auth", message: msg("srv_gh_not_logged_in"), hint: msg("srv_hint_gh_login") });
    }
    throw e;
  }
}

async function search(q: string): Promise<RawPr[]> {
  const out = await gh(["api", "graphql", "-F", `q=${q}`, "-f", `query=${QUERY}`]);
  return (JSON.parse(out).data.search.nodes as RawPr[]).filter((n) => n?.number);
}

export async function fetchPullRequests(cfg: Config): Promise<PullRequestsData> {
  const me = (await gh(["api", "user", "--jq", ".login"])).trim();
  const since = new Date(Date.now() - cfg.github.recentDays * 86_400_000).toISOString().slice(0, 10);
  const repos = cfg.github.repos.map((r) => `repo:${r}`).join(" ");
  const base = `is:pr ${repos} updated:>=${since} sort:updated-desc`;

  const [mine, reviewed, commented, requested] = await Promise.all([
    search(`${base} author:@me`),
    search(`${base} reviewed-by:@me -author:@me`),
    search(`${base} commenter:@me -author:@me`),
    // revue demandée (en attente) : pas de limite de date, une demande ancienne reste à traiter
    search(`is:pr is:open ${repos} review-requested:@me sort:created-asc`),
  ]);

  const toPr = (raw: RawPr): PullRequest => {
    const myReviews = raw.reviews.nodes.filter((r) => r.author?.login === me && r.state !== "PENDING");
    // L'approbation prime : un commentaire après une approbation ne l'annule pas.
    const myReview = myReviews.some((r) => r.state === "APPROVED")
      ? "APPROVED"
      : (myReviews.at(-1)?.state ?? null);
    const keys = [...new Set(raw.title.match(/\b[A-Z][A-Z0-9]+-\d+\b/g) ?? [])];
    return {
      number: raw.number,
      title: raw.title,
      url: raw.url,
      repo: raw.repository.nameWithOwner,
      author: raw.author?.login ?? "?",
      state: raw.state,
      isDraft: raw.isDraft,
      reviewDecision: raw.reviewDecision,
      mergeable: raw.mergeable,
      ci: raw.commits.nodes[0]?.commit.statusCheckRollup?.state ?? null,
      updatedAt: raw.updatedAt,
      myReview,
      jira: keys.map((key) => ({ key, url: `https://${cfg.jira.site}/browse/${key}` })),
      branch: raw.headRefName,
    };
  };

  // Une PR revue ET commentée n'apparaît qu'une fois : dans « approuvées » si je l'ai approuvée.
  const others = new Map<string, PullRequest>();
  for (const raw of [...reviewed, ...commented]) if (!others.has(raw.url)) others.set(raw.url, toPr(raw));
  const othersList = [...others.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return {
    me,
    mine: mine.map(toPr),
    approved: othersList.filter((p) => p.myReview === "APPROVED"),
    commented: othersList.filter((p) => p.myReview !== "APPROVED"),
    reviewRequested: requested.map(toPr),
    searchUrl: `https://github.com/pulls?q=${encodeURIComponent(`is:pr ${repos} involves:${me}`)}`,
  };
}

// ---------- PR ouvertes des dépôts suivis (pour l'onglet Librairies) ----------
// La page Pull requests ne lit que les PR où je suis impliqué : les PR de Renovate ou Dependabot n'y sont pas.
// Ici, toutes les PR ouvertes (100 au plus, les plus récentes), avec leur branche et, pour les robots, leur description.
const OPEN_QUERY = `
query($q: String!) {
  search(query: $q, type: ISSUE, first: 100) {
    nodes { ... on PullRequest {
      number title url isDraft updatedAt headRefName body
      reviewDecision mergeable
      author { login }
      repository { nameWithOwner }
      commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
    } }
  }
}`;

interface RawOpenPr {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  updatedAt: string;
  headRefName: string;
  body: string | null;
  reviewDecision: PullRequest["reviewDecision"];
  mergeable: PullRequest["mergeable"];
  author: { login: string } | null;
  repository: { nameWithOwner: string };
  commits: RawPr["commits"];
}

/** Versions qui changent dans les package.json d'une PR (diffs lus sur GitHub) */
async function manifestUpdates(repo: string, number: number) {
  const out = await gh(["api", `repos/${repo}/pulls/${number}/files?per_page=100`]).catch(() => "[]");
  const files = JSON.parse(out) as { filename: string; patch?: string }[];
  const seen = new Map<string, PrBodyUpdate>();
  for (const f of files) {
    if (f.filename !== "package.json" && !f.filename.endsWith("/package.json")) continue;
    for (const u of parseManifestPatch(f.patch)) if (!seen.has(u.name)) seen.set(u.name, u);
  }
  return [...seen.values()];
}

export async function fetchOpenPrs(cfg: Config): Promise<OpenPr[]> {
  const repos = cfg.github.repos.map((r) => `repo:${r}`).join(" ");
  const out = await gh(["api", "graphql", "-F", `q=is:pr is:open ${repos} sort:updated-desc`, "-f", `query=${OPEN_QUERY}`]);
  const prs = (JSON.parse(out).data.search.nodes as RawOpenPr[])
    .filter((n) => n?.number)
    .map((raw): OpenPr => {
      const pr = { author: raw.author?.login ?? "?", branch: raw.headRefName };
      return {
        number: raw.number,
        title: raw.title,
        url: raw.url,
        repo: raw.repository.nameWithOwner,
        ...pr,
        isDraft: raw.isDraft,
        updatedAt: raw.updatedAt,
        reviewDecision: raw.reviewDecision,
        mergeable: raw.mergeable,
        ci: raw.commits.nodes[0]?.commit.statusCheckRollup?.state ?? null,
        // la description n'est pas renvoyée à la page : seulement les librairies qu'un robot y annonce
        updates: isBotPr(pr) ? parsePrBody(raw.body) : [],
      };
    });
  // Robot qui ne liste rien dans sa description (robot maison « auto-update ») : on lit ses diffs de package.json
  // (10 PR au plus, une requête chacune)
  const silent = prs.filter((p) => isBotPr(p) && !p.updates.length).slice(0, 10);
  await Promise.all(silent.map(async (p) => (p.updates = await manifestUpdates(p.repo, p.number))));
  return prs;
}
