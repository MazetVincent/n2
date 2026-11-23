// Logs CloudWatch : les requêtes Logs Insights enregistrées par l'équipe, lancées à la demande depuis N2.
// Logs Insights est facturé au volume parcouru : rien ne part sans un clic, sur 1 h ou 24 h seulement, et le
// navigateur n'envoie que l'identifiant d'une requête enregistrée (jamais le texte d'une requête).
import type { Config } from "../config.ts";
import { msg } from "../messages.ts";
import { CommandError, run, SourceFailure } from "../run.ts";
import type { LogQuery, LogQueryResult, LogWindow } from "../types.ts";

interface RawDefinition {
  queryDefinitionId: string;
  name: string;
  queryString: string;
  logGroupNames?: string[];
}

interface RawResults {
  status: "Scheduled" | "Running" | "Complete" | "Failed" | "Cancelled" | "Timeout" | "Unknown";
  results?: { field: string; value: string }[][];
  statistics?: { recordsMatched?: number; recordsScanned?: number; bytesScanned?: number };
}

const WINDOW_S: Record<LogWindow, number> = { "1h": 3_600, "24h": 86_400 };
const MAX_ROWS = 100;
const WAIT_MS = 60_000;

async function awsJson<T>(cfg: Config, args: string[]): Promise<T> {
  const { profile, region, reconnectHint } = cfg.aws;
  try {
    return JSON.parse(await run("aws", [...args, "--profile", profile, "--region", region, "--output", "json"], 30_000)) as T;
  } catch (e) {
    if (e instanceof CommandError && /ExpiredToken|InvalidClientTokenId|security token|Unable to locate credentials|could not be found|SSO/i.test(e.stderr)) {
      throw new SourceFailure({ kind: "auth", message: msg("srv_aws_session_expired"), hint: msg("srv_raw", { text: reconnectHint }) });
    }
    throw e;
  }
}

/** Requêtes enregistrées dans Logs Insights (celles qui visent au moins un groupe de logs) */
export async function listLogQueries(cfg: Config): Promise<LogQuery[]> {
  const raw = await awsJson<{ queryDefinitions?: RawDefinition[] }>(cfg, ["logs", "describe-query-definitions", "--max-results", "100"]);
  return (raw.queryDefinitions ?? [])
    .filter((d) => d.logGroupNames?.length)
    .map((d) => ({ id: d.queryDefinitionId, name: d.name, logGroups: d.logGroupNames!, query: d.queryString }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Lignes du résultat : colonnes dans l'ordre d'apparition, sans le pointeur interne (@ptr) */
export function toTable(results: RawResults["results"]): { columns: string[]; rows: string[][] } {
  const columns: string[] = [];
  for (const row of results ?? []) for (const f of row) if (f.field !== "@ptr" && !columns.includes(f.field)) columns.push(f.field);
  const rows = (results ?? []).slice(0, MAX_ROWS).map((row) => columns.map((c) => row.find((f) => f.field === c)?.value ?? ""));
  return { columns, rows };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Lance une requête enregistrée sur la dernière heure ou les dernières 24 h, et attend son résultat (1 min au plus) */
export async function runLogQuery(cfg: Config, id: string, window: LogWindow, wait = sleep): Promise<LogQueryResult> {
  const def = (await listLogQueries(cfg)).find((q) => q.id === id);
  if (!def) throw new SourceFailure({ kind: "config", message: msg("srv_logs_unknown_query") });
  const end = Math.floor(Date.now() / 1000);
  const start = end - WINDOW_S[window];
  const { queryId } = await awsJson<{ queryId: string }>(cfg, [
    "logs", "start-query",
    "--log-group-names", ...def.logGroups,
    "--start-time", String(start), "--end-time", String(end),
    "--query-string", def.query,
    "--limit", String(MAX_ROWS),
  ]);
  const deadline = Date.now() + WAIT_MS;
  for (;;) {
    const r = await awsJson<RawResults>(cfg, ["logs", "get-query-results", "--query-id", queryId]);
    if (r.status === "Complete") {
      return {
        id,
        window,
        ...toTable(r.results),
        matched: r.statistics?.recordsMatched ?? 0,
        bytesScanned: r.statistics?.bytesScanned ?? 0,
        ranAt: new Date().toISOString(),
      };
    }
    if (r.status === "Failed" || r.status === "Cancelled" || r.status === "Timeout" || r.status === "Unknown") {
      throw new SourceFailure({ kind: "unavailable", message: msg("srv_logs_query_failed", { status: r.status }) });
    }
    if (Date.now() > deadline) {
      // trop long : on l'arrête pour ne pas continuer à payer le volume parcouru
      await awsJson(cfg, ["logs", "stop-query", "--query-id", queryId]).catch(() => null);
      throw new SourceFailure({ kind: "unavailable", message: msg("srv_logs_timeout") });
    }
    await wait(1_000);
  }
}
