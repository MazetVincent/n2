// Activité GitHub et Jira : dans chaque fil (PR, issue, ticket), ce que les autres ont écrit depuis mon dernier
// message. Une mention, un commentaire sur ma PR ou mon ticket, une réponse dans un fil où j'avais écrit.
// Fonctions pures (partagées par le serveur et les tests), sans accès réseau.
import type { ActivityItem, ActivityKind } from "../../server/types.ts";

/** Un message d'un fil, quelle que soit sa source */
export interface ThreadMessage {
  /** identifiant de l'auteur (login GitHub, accountId Jira) */
  authorId: string;
  author: string;
  bot: boolean;
  text: string;
  at: string;
  url: string;
  /** le message me mentionne */
  mentionsMe: boolean;
}

export interface Thread {
  id: string;
  source: ActivityItem["source"];
  ref: string;
  title: string;
  where: string;
  /** la PR ou le ticket est à moi (auteur, assigné ou rapporteur) */
  mine: boolean;
  messages: ThreadMessage[];
}

const MAX_EXCERPT = 280;

/** Texte d'un commentaire en clair : sans commentaires HTML, blocs de code, images ni espaces superflus */
export function excerpt(text: string, max = MAX_EXCERPT): string {
  const clean = text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/```[\s\S]*?(```|$)/g, " [code] ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "[image]")
    .replace(/<img[^>]*>/gi, "[image]")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/^>.*$/gm, "") // citations : le contexte, pas la réponse
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/** Le texte mentionne ce login GitHub (@login, sans tenir compte de la casse) */
export function mentionsLogin(text: string, login: string): boolean {
  if (!login) return false;
  const escaped = login.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\w/])@${escaped}(?![\\w-])`, "i").test(text);
}

/**
 * Ce qui attend une réponse dans un fil : les messages des autres (pas des robots) depuis mon dernier message,
 * dans la fenêtre. Rien si j'ai répondu, ou si le fil ne me concerne pas (ni à moi, ni mention, ni écrit dedans).
 */
export function threadActivity(t: Thread, me: string, since: number): ActivityItem | null {
  const sorted = [...t.messages].sort((a, b) => a.at.localeCompare(b.at));
  const lastMine = sorted.findLastIndex((m) => m.authorId === me);
  const waiting = sorted.slice(lastMine + 1).filter((m) => m.authorId !== me && !m.bot && Date.parse(m.at) >= since);
  if (!waiting.length) return null;

  const kind: ActivityKind | null = waiting.some((m) => m.mentionsMe) ? "mention" : t.mine ? "comment" : lastMine >= 0 ? "reply" : null;
  if (!kind) return null;
  // une mention : le message qui me mentionne ; sinon le dernier message
  const shown = kind === "mention" ? waiting.findLast((m) => m.mentionsMe)! : waiting.at(-1)!;
  return {
    id: t.id,
    source: t.source,
    kind,
    ref: t.ref,
    title: t.title,
    where: t.where,
    url: shown.url,
    author: shown.author,
    excerpt: excerpt(shown.text),
    at: waiting.at(-1)!.at,
    count: waiting.length,
  };
}

/** Les fils qui attendent une réponse, le plus récent d'abord */
export function collectActivity(threads: Thread[], me: string, since: number): ActivityItem[] {
  return threads
    .map((t) => threadActivity(t, me, since))
    .filter((i): i is ActivityItem => i !== null)
    .sort((a, b) => b.at.localeCompare(a.at));
}

// ---------- GitHub (réponse GraphQL) ----------
interface RawActor {
  __typename?: string;
  login: string;
}
interface RawComment {
  author: RawActor | null;
  body: string;
  createdAt: string;
  url: string;
}
export interface RawGithubThread {
  __typename?: "PullRequest" | "Issue";
  number: number;
  title: string;
  url: string;
  author: RawActor | null;
  assignees?: { nodes: { login: string }[] };
  repository: { nameWithOwner: string };
  comments: { nodes: RawComment[] };
  reviews?: { nodes: (RawComment & { state: string })[] };
  reviewThreads?: { nodes: { comments: { nodes: RawComment[] } }[] };
}

const isBot = (a: RawActor | null) => !a || a.__typename === "Bot" || /\[bot\]$|-bot$/i.test(a.login);

export function githubThread(raw: RawGithubThread, me: string): Thread {
  const msg = (c: RawComment): ThreadMessage => ({
    authorId: c.author?.login ?? "",
    author: c.author?.login ?? "?",
    bot: isBot(c.author),
    text: c.body,
    at: c.createdAt,
    url: c.url,
    mentionsMe: mentionsLogin(c.body, me),
  });
  // une revue sans texte (approbation seule) n'est pas un message ; mes revues comptent toujours comme une réponse
  const reviews = (raw.reviews?.nodes ?? []).filter((r) => r.state !== "PENDING" && (r.body.trim() || r.author?.login === me));
  return {
    id: `github:${raw.url}`,
    source: "github",
    ref: `#${raw.number}`,
    title: raw.title,
    where: raw.repository.nameWithOwner,
    mine: raw.author?.login === me || (raw.assignees?.nodes ?? []).some((a) => a.login === me),
    messages: [...raw.comments.nodes, ...reviews, ...(raw.reviewThreads?.nodes ?? []).flatMap((t) => t.comments.nodes)].map(msg),
  };
}

// ---------- Jira (champ « comment » d'un ticket, corps au format ADF) ----------
interface AdfNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: AdfNode[];
}
export interface RawJiraIssue {
  key: string;
  fields: {
    summary: string;
    status?: { name: string };
    assignee?: { accountId: string } | null;
    reporter?: { accountId: string } | null;
    comment?: { comments: { id: string; author?: { accountId: string; displayName: string; accountType?: string }; body: AdfNode | string; created: string }[] };
  };
}

const BLOCKS = new Set(["paragraph", "heading", "listItem", "blockquote", "tableRow", "panel"]);

/** Texte d'un document ADF (Atlassian Document Format) */
export function adfToText(node: AdfNode | string | undefined): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  switch (node.type) {
    case "text":
      return node.text ?? "";
    case "mention":
    case "emoji":
      return String(node.attrs?.text ?? "");
    case "hardBreak":
      return "\n";
    case "inlineCard":
    case "blockCard":
      return String(node.attrs?.url ?? "");
    case "codeBlock":
      return " [code] ";
    case "mediaSingle":
    case "mediaGroup":
      return "[image]";
  }
  const inner = (node.content ?? []).map(adfToText).join("");
  return BLOCKS.has(node.type) ? `${inner}\n` : inner;
}

/** L'ADF mentionne ce compte Jira */
export function adfMentions(node: AdfNode | string | undefined, accountId: string): boolean {
  if (!node || typeof node === "string") return false;
  if (node.type === "mention" && node.attrs?.id === accountId) return true;
  return (node.content ?? []).some((c) => adfMentions(c, accountId));
}

export function jiraThread(raw: RawJiraIssue, me: string, site: string): Thread {
  const f = raw.fields;
  return {
    id: `jira:${raw.key}`,
    source: "jira",
    ref: raw.key,
    title: f.summary,
    where: f.status?.name ?? "",
    mine: f.assignee?.accountId === me || f.reporter?.accountId === me,
    messages: (f.comment?.comments ?? []).map((c) => ({
      authorId: c.author?.accountId ?? "",
      author: c.author?.displayName ?? "?",
      bot: c.author?.accountType === "app",
      text: adfToText(c.body),
      // Jira : « 2026-11-05T16:55:01.782+0100 » ; ramené en ISO pour comparer les dates comme du texte
      at: new Date(c.created.replace(/([+-]\d\d)(\d\d)$/, "$1:$2")).toISOString(),
      url: `https://${site}/browse/${raw.key}?focusedCommentId=${c.id}`,
      mentionsMe: adfMentions(c.body, me),
    })),
  };
}
