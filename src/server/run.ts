import { execFile } from "node:child_process";
import { msg } from "./messages.ts";
import type { Message, SourceError, SourceResult, SourceStat } from "./types.ts";
import { isNotConfigured } from "../features/sources/logic.ts";

// Lance un outil en ligne de commande déjà authentifié (gh, acli, aws).
// Aucun token ne transite par N2 : chaque CLI utilise sa propre session.
// `env` : variables ajoutées à celles du serveur (ex. interdire à git de demander des identifiants).
export function run(cmd: string, args: string[], timeoutMs = 20_000, env?: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024, env: env && { ...process.env, ...env } }, (err, stdout, stderr) => {
      if (err) {
        const notFound = (err as NodeJS.ErrnoException).code === "ENOENT";
        reject(new CommandError(cmd, notFound ? "" : stderr || err.message, notFound));
      } else resolve(stdout);
    });
  });
}

/**
 * Appel HTTP avec un délai maximal (en-têtes et corps compris) : une API qui ne répond plus
 * (Sentry, Slack, Microsoft, npm…) ne bloque pas sa carte indéfiniment.
 */
export async function httpFetch(url: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") {
      throw new SourceFailure({ kind: "unavailable", message: msg("srv_timeout", { host: new URL(url).host, seconds: Math.round(timeoutMs / 1000) }) });
    }
    throw e;
  }
}

export class CommandError extends Error {
  constructor(
    public cmd: string,
    public stderr: string,
    public notFound = false,
  ) {
    super(notFound ? `${cmd}: not installed` : `${cmd}: failed`);
  }
}

/** Erreur qui porte un texte pour l'utilisateur (clé de messages/*.json) */
export class MessageError extends Error {
  constructor(public msg: Message) {
    super(msg.key);
  }
}

export class SourceFailure extends MessageError {
  constructor(public detail: SourceError) {
    super(detail.message);
  }
}

// Efface tout ce qui pourrait ressembler à un secret avant d'envoyer un message d'erreur au navigateur.
export function redact(text: string): string {
  return text
    .replace(/(gh[pousr]_|github_pat_|sntry[su]_|ATATT)[A-Za-z0-9_+/=-]+/g, "$1••••")
    .replace(/(AKIA|ASIA)[A-Z0-9]{16}/g, "$1••••")
    .replace(/(Bearer\s+)\S+/gi, "$1••••")
    .replace(/(xox[abeoprs]-)[A-Za-z0-9-]+/g, "$1••••")
    .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9._-]+/g, "eyJ••••")
    .replace(/(\/owa\/calendar\/)\S+/gi, "$1••••")
    .trim()
    .slice(0, 400);
}

// Petit cache mémoire (rien n'est écrit sur disque).
// `lastGood` : la dernière lecture réussie, resservie si la suivante échoue (voir cached()).
const cache = new Map<string, { at: number; value: SourceResult<unknown>; lastGood?: { data: unknown; fetchedAt: string } }>();
/** Au-delà, des données trop anciennes ne sont plus resservies : l'erreur s'affiche seule */
const STALE_MAX_MS = 24 * 3_600_000;

// ---------- État des sources : l'observabilité de N2 lui-même ----------
const stats = new Map<string, SourceStat>();
export const STARTED_AT = new Date().toISOString();
export const sourceStats = (): SourceStat[] => [...stats.values()];
/** Au-delà, une lecture réussie est notée dans le journal */
const SLOW_MS = 5_000;

/**
 * Note une lecture de source. Le journal (sortie du serveur : ~/Library/Logs/n2.log avec le démarrage automatique)
 * n'en garde que l'utile : les échecs, les lectures lentes et le retour à la normale après un échec.
 */
function record(key: string, ms: number, value: SourceResult<unknown>): void {
  const prev = stats.get(key);
  const now = new Date().toISOString();
  const off = !value.ok && isNotConfigured(value.error);
  const stat: SourceStat = {
    key,
    calls: (prev?.calls ?? 0) + 1,
    failures: (prev?.failures ?? 0) + (value.ok || off ? 0 : 1),
    lastAt: now,
    lastMs: Math.round(ms),
    lastOk: value.ok,
    off,
    lastSuccessAt: value.ok ? now : (prev?.lastSuccessAt ?? null),
    lastError: value.ok ? (prev?.lastError ?? null) : value.error,
  };
  stats.set(key, stat);
  const line = `${now} [n2] source=${key} ${stat.lastMs} ms`;
  if (off) return; // section de config absente : rien à signaler
  if (!value.ok) console.warn(`${line} échec=${value.error.kind} message=${value.error.message.key}`);
  else if (prev && !prev.lastOk && !prev.off) console.log(`${line} rétablie`);
  else if (ms > SLOW_MS) console.log(`${line} lente`);
}

export async function cached<T>(
  key: string,
  ttlMs: number,
  force: boolean,
  load: () => Promise<T>,
): Promise<SourceResult<T>> {
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < ttlMs) return hit.value as SourceResult<T>;

  let value: SourceResult<T>;
  const started = performance.now();
  try {
    value = { ok: true, data: await load(), fetchedAt: new Date().toISOString() };
  } catch (e) {
    value = { ok: false, error: toSourceError(e), fetchedAt: new Date().toISOString() };
  }
  record(key, performance.now() - started, value);
  const lastGood = value.ok ? { data: value.data, fetchedAt: value.fetchedAt } : hit?.lastGood;
  // Échec après un succès : on garde les dernières bonnes données, avec l'erreur et l'heure de l'échec
  // (une panne passagère ou une session expirée ne vide pas la carte ; 24 h au plus).
  const served: SourceResult<T> =
    !value.ok && lastGood && Date.now() - Date.parse(lastGood.fetchedAt) < STALE_MAX_MS
      ? { ok: true, data: lastGood.data as T, fetchedAt: lastGood.fetchedAt, stale: { error: value.error, failedAt: value.fetchedAt } }
      : value;
  // Les erreurs ne sont gardées que 15 s, pour qu'un rafraîchissement après reconnexion marche vite.
  cache.set(key, { at: value.ok ? Date.now() : Date.now() - ttlMs + 15_000, value: served, lastGood });
  return served;
}

/** Oublie une source du cache (ex. après une connexion : la prochaine lecture repart de zéro) */
export const forget = (key: string) => cache.delete(key);

/** Oublie toutes les sources (la config a changé : projet, guide…) */
export const forgetAll = () => cache.clear();

/** Paramètres d'un message passés au crible de redact() (un chemin, une sortie de commande peuvent contenir un secret) */
const redactMessage = (m: Message): Message => (m.params ? { key: m.key, params: Object.fromEntries(Object.entries(m.params).map(([k, v]) => [k, redact(v)])) } : m);

export function toSourceError(e: unknown): SourceError {
  // délai de httpFetch dépassé pendant la lecture de la réponse (res.json()) : même message, sans le nom du site
  if (e instanceof Error && e.name === "TimeoutError") return { kind: "unavailable", message: msg("srv_timeout_reading") };
  if (e instanceof SourceFailure) return { kind: e.detail.kind, message: redactMessage(e.detail.message), ...(e.detail.hint && { hint: redactMessage(e.detail.hint) }) };
  if (e instanceof CommandError) {
    return e.notFound ? { kind: "config", message: msg("srv_not_installed", { cmd: e.cmd }) } : { kind: "unknown", message: msg("srv_command_error", { cmd: e.cmd, detail: redact(e.stderr) }) };
  }
  return { kind: "unknown", message: msg("srv_raw", { text: redact(e instanceof Error ? e.message : String(e)) }) };
}
