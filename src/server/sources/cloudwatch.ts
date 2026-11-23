import type { Config } from "../config.ts";
import { run, CommandError, SourceFailure } from "../run.ts";
import type { AlarmChart, AlarmCharts, ChartPoints, CloudWatchAlarm, CloudWatchData } from "../types.ts";
import { msg } from "../messages.ts";

// ---------- Réponses brutes de l'AWS CLI ----------
interface RawMetric {
  Namespace?: string;
  MetricName?: string;
  Dimensions?: { Name: string; Value: string }[];
}

export interface RawMetricQuery {
  Id: string;
  ReturnData?: boolean;
  Expression?: string;
  Label?: string;
  Period?: number;
  MetricStat?: { Metric: RawMetric; Period: number; Stat: string; Unit?: string };
}

export interface RawAlarm extends RawMetric {
  AlarmName: string;
  StateValue: CloudWatchAlarm["state"];
  StateReason: string;
  StateUpdatedTimestamp: string;
  AlarmActions?: string[];
  // définition de la métrique : simple (Namespace, MetricName, Statistic…) ou calculée (Metrics)
  Statistic?: string;
  ExtendedStatistic?: string;
  Period?: number;
  Unit?: string;
  Threshold?: number;
  ThresholdMetricId?: string;
  ComparisonOperator?: string;
  Metrics?: RawMetricQuery[];
}

interface RawHistoryItem {
  AlarmName: string;
  Timestamp: string;
  HistorySummary?: string;
}

interface RawMetricResult {
  Id: string;
  Label?: string;
  Timestamps: string[];
  Values: number[];
}

// Alarme d'autoscaling = toutes ses actions servent à redimensionner un service (ECS, EC2…).
// Elles passent en « ALARM » en fonctionnement normal (ex. « on peut retirer un conteneur ») : ce ne sont pas des incidents.
const isAutoscaling = (a: RawAlarm) =>
  (a.AlarmActions?.length ?? 0) > 0 && a.AlarmActions!.every((arn) => arn.startsWith("arn:aws:autoscaling:"));

/** Appel de l'AWS CLI avec le profil et la région de la config ; session expirée → message de reconnexion */
async function awsJson<T>(cfg: Config, args: string[], timeoutMs = 30_000): Promise<T> {
  const { profile, region, reconnectHint } = cfg.aws;
  try {
    return JSON.parse(await run("aws", [...args, "--profile", profile, "--region", region, "--output", "json"], timeoutMs)) as T;
  } catch (e) {
    if (e instanceof CommandError && /ExpiredToken|InvalidClientTokenId|security token|Unable to locate credentials|could not be found|SSO/i.test(e.stderr)) {
      throw new SourceFailure({ kind: "auth", message: msg("srv_aws_session_expired"), hint: msg("srv_raw", { text: reconnectHint }) });
    }
    throw e;
  }
}

/** Alarmes gardées : préfixe de la config, autoscaling masqué si demandé */
async function keptAlarms(cfg: Config): Promise<{ all: RawAlarm[]; kept: RawAlarm[] }> {
  const args = ["cloudwatch", "describe-alarms"];
  if (cfg.aws.alarmPrefix) args.push("--alarm-name-prefix", cfg.aws.alarmPrefix);
  const raw = await awsJson<{ MetricAlarms?: RawAlarm[]; CompositeAlarms?: RawAlarm[] }>(cfg, args);
  const all = [...(raw.MetricAlarms ?? []), ...(raw.CompositeAlarms ?? [])];
  const hideAutoscaling = cfg.aws.hideAutoscaling ?? true;
  return { all, kept: hideAutoscaling ? all.filter((a) => !isAutoscaling(a)) : all };
}

const DAY = 86_400_000;

/** Passages en ALARM sur 7 jours, par alarme (historique des changements d'état) */
export function countTriggers(items: RawHistoryItem[]): Map<string, { count: number; last: string }> {
  const out = new Map<string, { count: number; last: string }>();
  for (const i of items) {
    if (!/ to ALARM\b/.test(i.HistorySummary ?? "")) continue;
    const prev = out.get(i.AlarmName);
    out.set(i.AlarmName, { count: (prev?.count ?? 0) + 1, last: prev && prev.last > i.Timestamp ? prev.last : i.Timestamp });
  }
  return out;
}

export async function fetchCloudWatch(cfg: Config): Promise<CloudWatchData> {
  const { region } = cfg.aws;
  const since = new Date(Date.now() - 7 * DAY).toISOString();
  const [{ all, kept }, history] = await Promise.all([
    keptAlarms(cfg),
    // l'historique aide sans être indispensable : illisible, les alarmes s'affichent quand même
    awsJson<{ AlarmHistoryItems?: RawHistoryItem[] }>(cfg, ["cloudwatch", "describe-alarm-history", "--history-item-type", "StateUpdate", "--start-date", since, "--max-items", "1000"]).then(
      (r) => countTriggers(r.AlarmHistoryItems ?? []),
      () => null,
    ),
  ]);

  const console = `https://${region}.console.aws.amazon.com/cloudwatch/home?region=${region}`;
  const alarms = kept.map((a) => {
    const h = history?.get(a.AlarmName);
    return {
      name: a.AlarmName,
      state: a.StateValue,
      reason: a.StateReason,
      updatedAt: a.StateUpdatedTimestamp,
      url: `${console}#alarmsV2:alarm/${encodeURIComponent(a.AlarmName)}`,
      triggers7d: history ? (h?.count ?? 0) : null,
      lastAlarmAt: h?.last ?? null,
    };
  });

  // en alarme, puis sans données, puis OK ; à état égal, les plus agitées de la semaine, puis les plus récentes
  const order = { ALARM: 0, INSUFFICIENT_DATA: 1, OK: 2 } as const;
  alarms.sort((a, b) => order[a.state] - order[b.state] || (b.triggers7d ?? 0) - (a.triggers7d ?? 0) || b.updatedAt.localeCompare(a.updatedAt));
  const counts = { ALARM: 0, INSUFFICIENT_DATA: 0, OK: 0 };
  for (const a of alarms) counts[a.state]++;

  return { alarms, counts, hiddenAutoscaling: all.length - kept.length, consoleUrl: `${console}#alarmsV2:` };
}

// ---------- Courbes des alarmes ----------
const MAX_CHARTS = 20;
const MAX_POINTS = 144; // un point toutes les 10 min sur 24 h

/** Identifiant de requête propre à l'alarme n° i (les identifiants doivent être uniques dans un appel) */
const qid = (i: number, id: string) => `a${i}_${id}`;

/**
 * Requêtes GetMetricData qui reproduisent une alarme : sa métrique simple, ou ses métriques et calculs (identifiants
 * préfixés, y compris dans les expressions). Renvoie aussi l'identifiant de la série surveillée et celui de la bande.
 */
export function alarmQueries(a: RawAlarm, i: number): { queries: RawMetricQuery[]; dataId: string; bandId: string | null } | null {
  if (a.Metrics?.length) {
    const ids = a.Metrics.map((m) => m.Id).filter((id) => /^[a-z][a-zA-Z0-9_]*$/.test(id));
    if (ids.length !== a.Metrics.length) return null;
    const prefix = (expr: string) => ids.reduce((e, id) => e.replace(new RegExp(`\\b${id}\\b`, "g"), qid(i, id)), expr);
    const data = a.Metrics.find((m) => m.ReturnData !== false && m.Id !== a.ThresholdMetricId) ?? a.Metrics.find((m) => m.Id !== a.ThresholdMetricId);
    if (!data) return null;
    const queries = a.Metrics.map((m) => ({
      Id: qid(i, m.Id),
      ...(m.Expression && { Expression: prefix(m.Expression) }),
      ...(m.MetricStat && { MetricStat: m.MetricStat }),
      ...(m.Period && { Period: m.Period }),
      ReturnData: m.Id === data.Id || m.Id === a.ThresholdMetricId,
    }));
    return { queries, dataId: qid(i, data.Id), bandId: a.ThresholdMetricId ? qid(i, a.ThresholdMetricId) : null };
  }
  const stat = a.Statistic ?? a.ExtendedStatistic;
  if (!a.Namespace || !a.MetricName || !stat) return null;
  const metric = { Namespace: a.Namespace, MetricName: a.MetricName, Dimensions: a.Dimensions ?? [] };
  return {
    queries: [{ Id: qid(i, "m"), MetricStat: { Metric: metric, Period: Math.max(60, a.Period ?? 300), Stat: stat, ...(a.Unit && { Unit: a.Unit }) }, ReturnData: true }],
    dataId: qid(i, "m"),
    bandId: null,
  };
}

/**
 * Série triée du plus ancien au plus récent, ramenée à `MAX_POINTS` points au plus : dans chaque tranche, la valeur
 * la plus parlante pour l'alarme (la plus haute si elle se déclenche au-dessus, la plus basse sinon).
 */
export function toPoints(r: RawMetricResult | undefined, start: number, end: number, above: boolean): ChartPoints {
  if (!r) return [];
  const pts = r.Timestamps.map((t, k): [number, number] => [Date.parse(t), r.Values[k]]).filter(([t, v]) => Number.isFinite(t) && Number.isFinite(v));
  pts.sort((x, y) => x[0] - y[0]);
  if (pts.length <= MAX_POINTS) return pts;
  const step = (end - start) / MAX_POINTS;
  const buckets = new Map<number, [number, number]>();
  for (const [t, v] of pts) {
    const b = Math.min(MAX_POINTS - 1, Math.max(0, Math.floor((t - start) / step)));
    const cur = buckets.get(b);
    if (!cur || (above ? v > cur[1] : v < cur[1])) buckets.set(b, [start + (b + 0.5) * step, v]);
  }
  return [...buckets.entries()].sort((x, y) => x[0] - y[0]).map(([, p]) => p);
}

/** Courbes des 24 dernières heures de chaque alarme gardée, en un seul appel à CloudWatch */
export async function fetchAlarmCharts(cfg: Config): Promise<AlarmCharts> {
  const end = Date.now();
  const start = end - DAY;
  const { kept } = await keptAlarms(cfg);
  const plans = kept
    .slice(0, MAX_CHARTS)
    .map((a, i) => ({ a, plan: alarmQueries(a, i) }))
    .filter((x): x is { a: RawAlarm; plan: NonNullable<ReturnType<typeof alarmQueries>> } => x.plan !== null);
  if (!plans.length) return { start, end, charts: [] };

  const raw = await awsJson<{ MetricDataResults?: RawMetricResult[] }>(
    cfg,
    [
      "cloudwatch",
      "get-metric-data",
      "--metric-data-queries",
      JSON.stringify(plans.flatMap((p) => p.plan.queries)),
      "--start-time",
      new Date(start).toISOString(),
      "--end-time",
      new Date(end).toISOString(),
    ],
    45_000,
  );
  const results = raw.MetricDataResults ?? [];
  const charts: AlarmChart[] = plans.map(({ a, plan }) => {
    const above = !/^LessThan/.test(a.ComparisonOperator ?? "GreaterThan");
    // une bande d'anomalie revient en deux séries de même identifiant : « … Low » et « … High »
    const band = plan.bandId ? results.filter((r) => r.Id === plan.bandId) : [];
    const low = band.find((r) => /low$/i.test(r.Label ?? ""));
    const high = band.find((r) => /high$/i.test(r.Label ?? ""));
    return {
      name: a.AlarmName,
      data: toPoints(
        results.find((r) => r.Id === plan.dataId),
        start,
        end,
        above,
      ),
      threshold: plan.bandId ? null : (a.Threshold ?? null),
      band: low && high ? { low: toPoints(low, start, end, false), high: toPoints(high, start, end, true) } : null,
      above,
    };
  });
  return { start, end, charts };
}
