import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Config } from "../config.ts";
import { httpFetch, SourceFailure } from "../run.ts";
import type { SentryData, SentryFrame, SentryIssue, SentryRelease } from "../types.ts";
import { resolveTracePath } from "./codemap.ts";
import { msg } from "../messages.ts";

// Le token est lu à chaque appel depuis la config de sentry-cli (~/.sentryclirc) ou SENTRY_AUTH_TOKEN.
// Il n'est jamais copié dans le projet, ni renvoyé au navigateur.
export function token(): string {
  if (process.env.SENTRY_AUTH_TOKEN) return process.env.SENTRY_AUTH_TOKEN;
  const rc = join(homedir(), ".sentryclirc");
  const t = existsSync(rc) ? readFileSync(rc, "utf8").match(/^\s*token\s*=\s*(\S+)/m)?.[1] : undefined;
  if (!t) throw new SourceFailure({ kind: "auth", message: msg("srv_sentry_no_token"), hint: msg("srv_hint_sentry_login") });
  return t;
}

interface RawIssue {
  id: string;
  shortId: string;
  title: string;
  culprit: string;
  level: string;
  count: string;
  userCount: number;
  lastSeen: string;
  firstSeen: string;
  permalink: string;
  stats?: { "24h"?: [number, number][] };
}

const API = "https://sentry.io/api/0";

/** GET sur l'API Sentry, avec le jeton de sentry-cli ; 401/403 → reconnexion, autre erreur → Sentry indisponible */
async function api<T>(path: string, params?: URLSearchParams): Promise<T> {
  const res = await httpFetch(`${API}/${path}${params ? `?${params}` : ""}`, { headers: { Authorization: `Bearer ${token()}` } });
  if (res.status === 401 || res.status === 403) {
    throw new SourceFailure({ kind: "auth", message: msg("srv_sentry_denied", { status: res.status }), hint: msg("srv_hint_sentry_login") });
  }
  if (!res.ok) throw new SourceFailure({ kind: "unavailable", message: msg("srv_sentry_responded", { status: res.status }) });
  return (await res.json()) as T;
}

const toIssue = (i: RawIssue): SentryIssue => ({
  id: i.id,
  shortId: i.shortId,
  title: i.title,
  culprit: i.culprit,
  level: i.level,
  count: Number(i.count),
  users: i.userCount,
  lastSeen: i.lastSeen,
  firstSeen: i.firstSeen,
  url: i.permalink,
  trend: (i.stats?.["24h"] ?? []).map(([, n]) => n),
});

/** Erreurs non résolues ; `environments` vide = tous les environnements */
async function issues(cfg: Config, query: string, sort: string, limit: number, environments: string[]): Promise<SentryIssue[]> {
  const { org, project } = cfg.sentry;
  const params = new URLSearchParams({ query, sort, limit: String(limit), statsPeriod: "24h" });
  for (const e of environments) params.append("environment", e);
  return (await api<RawIssue[]>(`projects/${org}/${project}/issues/`, params)).map(toIssue);
}

/** Nom d'environnement Sentry acceptable (vient de la config ou de la page) */
export const isSentryEnv = (e: unknown): e is string => typeof e === "string" && /^[\w.-]{1,64}$/.test(e);

/** Environnements du projet (gardés 1 h : ils changent rarement) */
let envMemo: { key: string; at: number; names: string[] } | null = null;
async function projectEnvironments(cfg: Config): Promise<string[]> {
  const key = `${cfg.sentry.org}/${cfg.sentry.project}`;
  if (envMemo?.key === key && Date.now() - envMemo.at < 3_600_000) return envMemo.names;
  const raw = await api<{ name: string }[]>(`projects/${cfg.sentry.org}/${cfg.sentry.project}/environments/`, new URLSearchParams({ visibility: "visible" }));
  const names = raw.map((e) => e.name).filter(isSentryEnv);
  envMemo = { key, at: Date.now(), names };
  return names;
}

/** Identifiant numérique du projet (l'API des releases le demande), gardé tant que le projet ne change pas */
let projectIdMemo: { key: string; id: string } | null = null;
async function projectId(cfg: Config): Promise<string> {
  const key = `${cfg.sentry.org}/${cfg.sentry.project}`;
  if (projectIdMemo?.key === key) return projectIdMemo.id;
  const { id } = await api<{ id: string }>(`projects/${cfg.sentry.org}/${cfg.sentry.project}/`);
  projectIdMemo = { key, id: String(id) };
  return projectIdMemo.id;
}

/** Nom de release utilisable dans une recherche Sentry (« 1.2.3 », « web@1.2.3+abc ») */
const isRelease = (v: unknown): v is string => typeof v === "string" && /^[\w.+@:/-]{1,200}$/.test(v);

/**
 * Release en production : la plus récente qui a des événements dans l'environnement de production, et les erreurs
 * apparues avec elle (firstRelease) dans cet environnement. Plus fiable qu'une heure de mise en prod : une erreur
 * apparue plus tard (le week-end) n'est comptée que si elle est née avec cette release.
 */
async function productionRelease(cfg: Config, prod: string): Promise<SentryRelease | null> {
  const { org, project } = cfg.sentry;
  const id = await projectId(cfg);
  const [last] = await api<{ version: string; firstEvent?: string | null; dateCreated?: string; newGroups?: number }[]>(
    `organizations/${org}/releases/`,
    new URLSearchParams({ project: id, environment: prod, per_page: "1", sort: "date" }),
  );
  if (!last || !isRelease(last.version)) return null;
  const newIssues = await issues(cfg, `firstRelease:"${last.version}"`, "freq", 10, [prod]);
  return {
    version: last.version,
    since: last.firstEvent ?? last.dateCreated ?? null,
    url: `https://${org}.sentry.io/releases/${encodeURIComponent(last.version)}/?project=${id}&environment=${encodeURIComponent(prod)}`,
    newCount: Math.max(Number(last.newGroups) || 0, newIssues.length),
    newIssues,
  };
}

/**
 * Avant la prod : erreurs vues ces 7 derniers jours dans les environnements d'avant la prod, et jamais en production
 * (environnements de chaque erreur lus dans ses tags). Gardé 10 min : jusqu'à 15 appels à Sentry.
 */
let preprodMemo: { key: string; at: number; issues: SentryIssue[] } | null = null;
async function preprodIssues(cfg: Config, prod: string, pre: string[]): Promise<SentryIssue[]> {
  const key = `${cfg.sentry.org}/${cfg.sentry.project}:${prod}:${pre.join(",")}`;
  if (preprodMemo?.key === key && Date.now() - preprodMemo.at < 600_000) return preprodMemo.issues;
  const candidates = await issues(cfg, "is:unresolved lastSeen:-7d", "date", 15, pre);
  const checked = await Promise.all(
    candidates.map(async (i) => {
      const t = await api<{ topValues?: { value: string }[] }>(`issues/${i.id}/tags/environment/`);
      const environments = (t.topValues ?? []).map((v) => v.value).filter(isSentryEnv);
      return { ...i, environments };
    }),
  );
  const result = checked.filter((i) => !i.environments.includes(prod));
  preprodMemo = { key, at: Date.now(), issues: result };
  return result;
}

interface RawFrame {
  filename?: string | null;
  absPath?: string | null;
  lineNo?: number | null;
  function?: string | null;
  inApp?: boolean;
}

// Trace de la dernière occurrence d'une erreur (dans l'environnement affiché s'il y en a une, sinon la dernière tout court),
// rattachée aux fichiers du projet quand c'est possible (les erreurs navigateur minifiées sans source map n'ont souvent
// aucun chemin exploitable).
export async function sentryFrames(cfg: Config, issueId: string, environment?: string | null): Promise<SentryFrame[]> {
  if (!/^\d{1,20}$/.test(issueId)) throw new SourceFailure({ kind: "config", message: msg("srv_sentry_invalid_issue") });
  type RawEvent = { entries?: { type: string; data: { values?: { stacktrace?: { frames?: RawFrame[] } }[] } }[] };
  const latest = (env?: string) => api<RawEvent>(`issues/${issueId}/events/latest/`, env ? new URLSearchParams({ environment: env }) : undefined);
  // 404 : aucune occurrence dans cet environnement
  const event = isSentryEnv(environment)
    ? await latest(environment).catch((e) => (e instanceof SourceFailure && e.detail.kind === "unavailable" ? latest() : Promise.reject(e)))
    : await latest();
  const raw = (event.entries ?? [])
    .filter((e) => e.type === "exception")
    .flatMap((e) => e.data.values ?? [])
    .flatMap((v) => v.stacktrace?.frames ?? []);
  // les frames vont de l'appelant le plus lointain au point de l'erreur : on inverse (erreur d'abord)
  const frames = await Promise.all(
    raw.reverse().map(async (f) => {
      const path = f.filename || f.absPath || "";
      const file = (await resolveTracePath(cfg, f.filename ?? "")) ?? (await resolveTracePath(cfg, f.absPath ?? ""));
      return { file, raw: path.slice(0, 300), line: f.lineNo ?? null, fn: f.function?.slice(0, 120) ?? null, inApp: Boolean(f.inApp) };
    }),
  );
  return frames.slice(0, 40);
}

/**
 * Erreurs Sentry. `environment` : celui choisi dans la page (null : tous) ; non précisé : sentry.environment de la config.
 * Un nom inconnu du projet est ignoré (on revient à la config).
 */
export async function fetchSentry(cfg: Config, environment?: string | null): Promise<SentryData> {
  const environments = await projectEnvironments(cfg);
  const prod = isSentryEnv(cfg.sentry.environment) ? cfg.sentry.environment : null;
  const chosen = environment === undefined || (environment !== null && !environments.includes(environment)) ? prod : environment;
  const pre = (cfg.sentry.preprodEnvironments ?? []).filter(isSentryEnv).filter((e) => e !== prod);
  const only = chosen ? [chosen] : [];
  const [top, fresh, preprod, release] = await Promise.all([
    issues(cfg, "is:unresolved", "freq", 8, only),
    issues(cfg, "is:unresolved firstSeen:-24h", "date", 5, only),
    prod && pre.length ? preprodIssues(cfg, prod, pre) : Promise.resolve(null),
    prod ? productionRelease(cfg, prod) : Promise.resolve(null),
  ]);
  return { top, fresh, environment: chosen, environments, preprod, preprodEnvironments: pre, release, projectUrl: `https://${cfg.sentry.org}.sentry.io/projects/${cfg.sentry.project}/` };
}
