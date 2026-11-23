import type { Config } from "../config.ts";
import { httpFetch, run, SourceFailure } from "../run.ts";
import type { SlackChannelFeed, SlackData, SlackDm, SlackMessage } from "../types.ts";
import { msg } from "../messages.ts";
import { currentPlatform, type Platform } from "../platform.ts";

// Slack du Dashboard, en lecture seule, avec un token utilisateur (xoxp-) d'une app Slack interne.
// Le token est lu à chaque appel dans SLACK_USER_TOKEN, sinon dans le trousseau macOS (service « n2-slack ») ;
// sous Linux et WSL, pas de trousseau : seule la variable d'environnement compte.
// il n'est jamais copié dans le projet, ni renvoyé au navigateur.
//  - Mentions : recherche des messages qui me citent (7 derniers jours) ;
//  - Messages directs : recherche « to:me », regroupée par conversation, avec le nombre de non-lus de Slack ;
//  - Salons : derniers messages des salons de la config, non-lus calculés avec mon curseur de lecture.

export const KEYCHAIN_SERVICE = "n2-slack";
const DAYS = 7;
const MAX_CHANNELS = 8;
const MAX_DMS = 8;

/** Token Slack : variable d'environnement, puis trousseau (macOS seulement) ; sinon une erreur qui dit où le mettre */
export async function slackToken(platform: Platform = currentPlatform(), env: Record<string, string | undefined> = process.env, exec: typeof run = run): Promise<string> {
  if (env.SLACK_USER_TOKEN) return env.SLACK_USER_TOKEN;
  if (platform === "mac") {
    const t = await exec("security", ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"], 5000).catch(() => "");
    if (t.trim()) return t.trim();
  }
  throw new SourceFailure({ kind: "auth", message: msg("srv_slack_no_token"), hint: msg(platform === "mac" ? "srv_hint_slack_keychain" : "srv_hint_slack_env") });
}

// ---------- Appels à l'API ----------
const AUTH_ERRORS = new Set(["invalid_auth", "not_authed", "token_revoked", "token_expired", "account_inactive"]);

type Api = <T>(method: string, params?: Record<string, string>) => Promise<T>;

function api(tok: string): Api {
  return async <T>(method: string, params: Record<string, string> = {}) => {
    const res = await httpFetch(`https://slack.com/api/${method}?${new URLSearchParams(params)}`, { headers: { Authorization: `Bearer ${tok}` } });
    if (res.status === 429) throw new SourceFailure({ kind: "unavailable", message: msg("srv_slack_rate_limited"), hint: msg("srv_hint_retry_minute") });
    if (!res.ok) throw new SourceFailure({ kind: "unavailable", message: msg("srv_slack_responded", { status: res.status }) });
    const body = (await res.json()) as { ok: boolean; error?: string; needed?: string } & T;
    if (body.ok) return body;
    if (AUTH_ERRORS.has(body.error ?? "")) {
      throw new SourceFailure({ kind: "auth", message: msg("srv_slack_token_rejected", { error: String(body.error) }), hint: msg("srv_hint_slack_copy_token") });
    }
    if (body.error === "missing_scope") {
      throw new SourceFailure({ kind: "config", message: msg("srv_slack_missing_scope", { scope: body.needed ?? "?" }), hint: msg("srv_hint_slack_add_scope") });
    }
    throw new SourceFailure({ kind: "unavailable", message: msg("srv_slack_error", { error: body.error ?? "?", method }) });
  };
}

// ---------- Texte des messages ----------
/** Remplace la syntaxe Slack (<@U…>, <#C…|nom>, <url|texte>, &amp;…) par du texte lisible. */
export function slackText(raw: string, names: Map<string, string>): string {
  return raw
    .replace(/<@([UW][A-Z0-9]+)(?:\|([^>]+))?>/g, (_, id: string, label?: string) => `@${names.get(id) ?? label ?? id}`)
    .replace(/<#([CG][A-Z0-9]+)(?:\|([^>]*))?>/g, (_, id: string, label?: string) => `#${label || id}`)
    .replace(/<!(here|channel|everyone)(?:\|[^>]*)?>/g, "@$1")
    .replace(/<!subteam\^[A-Z0-9]+(?:\|([^>]+))?>/g, (_, label?: string) => label ?? "@groupe")
    .replace(/<!date\^[^|>]*\|([^>]+)>/g, "$1")
    .replace(/<(?:https?|mailto):[^|>]+\|([^>]+)>/g, "$1")
    .replace(/<((?:https?|mailto):[^>]+)>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

const mentionedIds = (text: string) => [...text.matchAll(/<@([UW][A-Z0-9]+)/g)].map((m) => m[1]);

/** Lien vers un message, construit sans appel (chat.getPermalink coûterait un appel par message) */
export const permalink = (teamUrl: string, channelId: string, ts: string, threadTs?: string) =>
  `${teamUrl.replace(/\/?$/, "/")}archives/${channelId}/p${ts.replace(".", "")}${threadTs && threadTs !== ts ? `?thread_ts=${threadTs}&cid=${channelId}` : ""}`;

/** Groupe de messages directs « mpdm-alice--bob--moi-1 » : les autres participants */
export const mpimName = (name: string, me: string) =>
  name
    .replace(/^mpdm-/, "")
    .replace(/-\d+$/, "")
    .split("--")
    .filter((n) => n && n !== me)
    .join(", ");

// ---------- Noms (gardés en mémoire pendant la vie du serveur) ----------
const userNames = new Map<string, string>();
let channelList: { at: number; byName: Map<string, { id: string; name: string }> } | null = null;

interface RawUser {
  name: string;
  real_name?: string;
  profile?: { display_name?: string; real_name?: string };
}

async function resolveUsers(call: Api, ids: Iterable<string>): Promise<Map<string, string>> {
  const missing = [...new Set(ids)].filter((id) => !userNames.has(id));
  await Promise.all(
    missing.slice(0, 40).map(async (id) => {
      try {
        const { user } = await call<{ user: RawUser }>("users.info", { user: id });
        userNames.set(id, user.profile?.display_name || user.profile?.real_name || user.real_name || user.name);
      } catch {
        userNames.set(id, id);
      }
    }),
  );
  return userNames;
}

async function channelsByName(call: Api): Promise<Map<string, { id: string; name: string }>> {
  if (channelList && Date.now() - channelList.at < 60 * 60_000) return channelList.byName;
  const byName = new Map<string, { id: string; name: string }>();
  let cursor = "";
  for (let page = 0; page < 20; page++) {
    const r = await call<{ channels: { id: string; name: string }[]; response_metadata?: { next_cursor?: string } }>("conversations.list", {
      types: "public_channel,private_channel",
      exclude_archived: "true",
      limit: "1000",
      ...(cursor ? { cursor } : {}),
    });
    for (const c of r.channels) byName.set(c.name, { id: c.id, name: c.name });
    cursor = r.response_metadata?.next_cursor ?? "";
    if (!cursor) break;
  }
  channelList = { at: Date.now(), byName };
  return byName;
}

// ---------- Lecture ----------
interface RawMessage {
  ts: string;
  thread_ts?: string;
  user?: string;
  username?: string;
  bot_profile?: { name?: string };
  subtype?: string;
  text?: string;
  reply_count?: number;
  files?: unknown[];
}

interface SearchMatch extends RawMessage {
  permalink: string;
  channel: { id: string; name: string; is_im?: boolean; is_mpim?: boolean };
}

// messages « techniques » (arrivées, départs, changement de sujet…) : pas affichés
const SHOWN_SUBTYPES = new Set([undefined, "bot_message", "thread_broadcast", "file_share", "me_message"]);
export const isShown = (m: RawMessage) => SHOWN_SUBTYPES.has(m.subtype);

const author = (m: RawMessage, names: Map<string, string>) => (m.user ? (names.get(m.user) ?? m.user) : (m.bot_profile?.name ?? m.username ?? "Slack"));

function toMessage(m: RawMessage, ctx: { channelId: string; channel: string; url: string; me: string; names: Map<string, string>; lastRead?: string }): SlackMessage {
  const text = slackText(m.text ?? "", ctx.names);
  return {
    ts: m.ts,
    channelId: ctx.channelId,
    channel: ctx.channel,
    author: author(m, ctx.names),
    text: text || (m.files?.length ? "📎 Fichier" : ""),
    url: ctx.url,
    replies: m.reply_count ?? 0,
    mine: m.user === ctx.me,
    unread: ctx.lastRead !== undefined && m.user !== ctx.me && Number(m.ts) > Number(ctx.lastRead),
  };
}

const isDm = (c: SearchMatch["channel"]) => c.is_im || c.is_mpim || c.id.startsWith("D");

function since(now: Date): string {
  const d = new Date(now.getTime() - DAYS * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function search(call: Api, query: string, count: number): Promise<SearchMatch[]> {
  const r = await call<{ messages: { matches: SearchMatch[] } }>("search.messages", { query, sort: "timestamp", sort_dir: "desc", count: String(count) });
  return r.messages.matches.filter(isShown);
}

export async function fetchSlack(cfg: Config, now = new Date(), call?: Api): Promise<SlackData> {
  if (!cfg.slack) {
    throw new SourceFailure({ kind: "config", message: msg("srv_slack_not_configured"), hint: msg("srv_hint_slack_config") });
  }
  call ??= api(await slackToken());
  const auth = await call<{ url: string; team: string; user: string; user_id: string }>("auth.test");
  const me = auth.user_id;

  const [mentionMatches, dmMatches, channelFeeds] = await Promise.all([
    search(call, `<@${me}> after:${since(now)}`, 20),
    search(call, `to:me after:${since(now)}`, 50),
    readChannels(call, cfg.slack, auth.url),
  ]);

  // noms des auteurs et des personnes citées, en une fois
  const ids = [...mentionMatches, ...dmMatches, ...channelFeeds.raw].flatMap((m) => [m.user ?? "", ...mentionedIds(m.text ?? "")]).filter(Boolean);
  const names = await resolveUsers(call, ids);

  const mentions = mentionMatches
    .filter((m) => m.user !== me && !isDm(m.channel))
    .map((m) => toMessage(m, { channelId: m.channel.id, channel: `#${m.channel.name}`, url: m.permalink, me, names }));

  const dms = await readDms(call, dmMatches, me, auth.user, names);
  const channels = channelFeeds.feeds.map((f) => ({
    ...f.feed,
    messages: f.messages.map((m) => toMessage(m, { channelId: f.feed.id, channel: `#${f.feed.name}`, url: permalink(auth.url, f.feed.id, m.ts, m.thread_ts), me, names, lastRead: f.lastRead })),
  }));
  for (const c of channels) c.unread = c.unread === null ? null : c.messages.filter((m) => m.unread).length;

  return { team: auth.team, url: auth.url, mentions, dms, channels, missing: channelFeeds.missing };
}

async function readChannels(call: Api, cfg: NonNullable<Config["slack"]>, teamUrl: string) {
  const wanted = (cfg.channels ?? []).slice(0, MAX_CHANNELS);
  const limit = String(Math.min(Math.max(cfg.messages ?? 5, 1), 20));
  const missing: string[] = [];
  const raw: RawMessage[] = [];
  if (!wanted.length) return { feeds: [], missing, raw };

  const byName = await channelsByName(call);
  const feeds = await Promise.all(
    wanted.map(async (w) => {
      const key = w.replace(/^#/, "");
      const found = byName.get(key) ?? [...byName.values()].find((c) => c.id === key);
      if (!found) {
        missing.push(w);
        return null;
      }
      const [history, info] = await Promise.all([
        call<{ messages: RawMessage[] }>("conversations.history", { channel: found.id, limit: String(Number(limit) + 10) }).catch((e) => {
          if (e instanceof SourceFailure && e.detail.message.params?.error === "not_in_channel") return { messages: [] as RawMessage[] };
          throw e;
        }),
        call<{ channel: { last_read?: string; is_member?: boolean } }>("conversations.info", { channel: found.id }),
      ]);
      const messages = history.messages.filter(isShown).slice(0, Number(limit));
      raw.push(...messages);
      const member = info.channel.is_member !== false && info.channel.last_read !== undefined;
      const feed: SlackChannelFeed = { id: found.id, name: found.name, url: `${teamUrl.replace(/\/?$/, "/")}archives/${found.id}`, unread: member ? 0 : null, messages: [] };
      return { feed, messages, lastRead: member ? info.channel.last_read : undefined };
    }),
  );
  return { feeds: feeds.filter((f) => f !== null), missing, raw };
}

/** Les conversations directes récentes (dernier message reçu), avec le nombre de non-lus donné par Slack */
export function groupDms(matches: SearchMatch[], me: string): SearchMatch[] {
  const seen = new Set<string>();
  return matches.filter((m) => isDm(m.channel) && m.user !== me && !seen.has(m.channel.id) && seen.add(m.channel.id)).slice(0, MAX_DMS);
}

async function readDms(call: Api, matches: SearchMatch[], me: string, myName: string, names: Map<string, string>): Promise<SlackDm[]> {
  return Promise.all(
    groupDms(matches, me).map(async (m) => {
      const { channel } = await call<{ channel: { user?: string; name?: string; unread_count_display?: number; is_mpim?: boolean } }>("conversations.info", { channel: m.channel.id });
      if (channel.user) await resolveUsers(call, [channel.user]);
      const name = channel.user ? (names.get(channel.user) ?? channel.user) : mpimName(channel.name ?? m.channel.name, myName);
      const unread = channel.unread_count_display ?? 0;
      return { id: m.channel.id, name, unread, last: { ...toMessage(m, { channelId: m.channel.id, channel: name, url: m.permalink, me, names }), unread: unread > 0 } };
    }),
  );
}
