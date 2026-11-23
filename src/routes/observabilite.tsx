import { Collapsible } from "@ark-ui/react/collapsible";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { css, cx } from "styled-system/css";
import { z } from "zod";
import { button, Badge, Card, Empty, ErrorBox, ExtLink, FitScroll, Item, ItemMeta, ItemTitle, List, Segmented, Skeleton, SourceView, StaleNotice, Tabs } from "~/components/ds";
import { GuideForFiles, GuideReflexLinks } from "~/features/guide/GuideLinks";
import { useEditorName } from "~/features/prefs/useEditorName";
import { openInIde } from "~/lib/actions";
import { ok, useAlarmCharts, useCloudWatch, useLogQueries, useSentry } from "~/lib/data";
import { ago, nf } from "~/lib/format";
import { m } from "~/lib/i18n";
import { getSentryFrames, runLogQuery } from "~/server/fns";
import type { AlarmChart, LogQuery, LogWindow, SentryIssue } from "~/server/types";

// ?vue=cloudwatch : onglet CloudWatch (Sentry par défaut) ; ?erreurs=frequentes|avant-prod|release : vue des erreurs Sentry ;
// ?env=<environnement> (« * » : tous) : environnement Sentry affiché, sinon celui de la config (sentry.environment)
const search = z.object({
  vue: z.enum(["cloudwatch"]).optional(),
  erreurs: z.enum(["frequentes", "avant-prod", "release"]).optional().catch(undefined),
  env: z.string().regex(/^([\w.-]{1,64}|\*)$/).optional().catch(undefined),
});
const ALL_ENVS = "*";
export const Route = createFileRoute("/observabilite")({ validateSearch: search, component: ObservabilityPage });

function ObservabilityPage() {
  const { vue } = Route.useSearch();
  const navigate = Route.useNavigate();
  const sentry = useSentry();
  const cw = useCloudWatch();
  const s = sentry.data?.ok ? sentry.data.data : null;
  const c = cw.data?.ok ? cw.data.data : null;
  return (
    <Tabs
      label={m.obs_observability_sources()}
      value={vue ?? "sentry"}
      onChange={(v) => navigate({ search: { vue: v === "cloudwatch" ? "cloudwatch" : undefined }, replace: true })}
      items={[
        { value: "sentry", label: "Sentry", count: s ? m.obs_new({ count: s.fresh.length }) : undefined },
        { value: "cloudwatch", label: "CloudWatch", count: c ? m.obs_alarm({ ALARM: c.counts.ALARM }) : cw.data && !cw.data.ok ? m.obs_unavailable() : undefined },
      ]}
    >
      <div className={css({ mt: "3", display: "flex", flexDirection: "column", gap: "3" })}>
        <GuideReflexLinks tab="observability" />
        {vue === "cloudwatch" ? (
          <>
            <CloudWatchCard />
            <LogsCard />
          </>
        ) : (
          <SentryCard />
        )}
      </div>
    </Tabs>
  );
}

// ---------- Sentry ----------
type View = "fresh" | "top" | "release" | "preprod";
const VIEW_PARAM = { fresh: undefined, top: "frequentes", release: "release", preprod: "avant-prod" } as const;

function SentryCard() {
  // vue et environnement gardés dans l'adresse : le bouton retour les retrouve
  const { erreurs, env } = Route.useSearch();
  const navigate = Route.useNavigate();
  const q = useSentry(env === undefined ? undefined : env === ALL_ENVS ? "" : env);
  const d = q.data?.ok ? q.data.data : null;
  const view: View = erreurs === "frequentes" ? "top" : erreurs === "avant-prod" && d?.preprod ? "preprod" : erreurs === "release" && d?.release ? "release" : "fresh";
  // vues propres à la production (sentry.environment) : pas de choix d'environnement
  const prodOnly = view === "preprod" || view === "release";
  const setView = (v: View) => navigate({ search: (s) => ({ ...s, erreurs: VIEW_PARAM[v] }), replace: true, resetScroll: false });
  const setEnv = (v: string) => navigate({ search: (s) => ({ ...s, env: v }), replace: true, resetScroll: false });
  const views = d
    ? [
        { value: "fresh" as const, label: m.obs_new_last_24_h(), count: d.fresh.length },
        { value: "top" as const, label: m.obs_most_frequent(), count: d.top.length },
        // seulement si Sentry reçoit les releases du projet (et sentry.environment est réglé)
        ...(d.release ? [{ value: "release" as const, label: m.obs_since_release(), count: d.release.newCount }] : []),
        // seulement si sentry.environment et sentry.preprodEnvironments sont réglés
        ...(d.preprod ? [{ value: "preprod" as const, label: m.obs_before_prod(), count: d.preprod.length }] : []),
      ]
    : [];
  return (
    <Card
      title="Sentry"
      meta={d && <ExtLink href={d.projectUrl}>{m.obs_sentry_project()}</ExtLink>}
      controls={
        d && (
          <div className={css({ display: "flex", gap: "2", flexWrap: "wrap", justifyContent: "flex-end" })}>
            {!prodOnly && d.environments.length > 1 && (
              <Segmented
                label={m.obs_sentry_environment()}
                value={d.environment ?? ALL_ENVS}
                onChange={setEnv}
                items={[...d.environments.map((e) => ({ value: e, label: e })), { value: ALL_ENVS, label: m.obs_all_environments() }]}
              />
            )}
            <Segmented label={m.obs_sentry_error_view()} value={view} onChange={setView} items={views} />
          </div>
        )
      }
    >
      <SourceView query={q}>
        {(d) => {
          const list = view === "preprod" ? (d.preprod ?? []) : view === "release" ? (d.release?.newIssues ?? []) : d[view];
          const empty =
            view === "release"
              ? m.release_no_new_errors()
              : view === "preprod"
              ? m.obs_no_preprod_errors({ envs: d.preprodEnvironments.join(", "), prod: d.environment ?? "" })
              : view === "top"
                ? m.obs_no_unresolved_errors()
                : m.obs_no_new_errors_last_24();
          return (
            <div className={css({ mt: "3" })}>
              {view === "release" && d.release && (
                <p className={css({ mb: "2", fontSize: "sm", color: "muted", display: "flex", gap: "2", flexWrap: "wrap" })}>
                  <span>{m.obs_release_line({ version: d.release.version })}</span>
                  {d.release.since && <span>· {m.release_in_prod_since({ ago: ago(d.release.since) })}</span>}
                  <ExtLink href={d.release.url}>{m.release_sentry_link()}</ExtLink>
                  {d.release.newCount > d.release.newIssues.length && <span>· {m.obs_release_most_frequent({ shown: d.release.newIssues.length })}</span>}
                </p>
              )}
              {list.length ? (
                <FitScroll>
                  <List>
                    {list.map((i) => (
                      <li key={i.id}>
                        <SentryRow issue={i} env={view === "preprod" ? null : d.environment} />
                      </li>
                    ))}
                  </List>
                </FitScroll>
              ) : (
                <Empty>{empty}</Empty>
              )}
            </div>
          );
        }}
      </SourceView>
    </Card>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => `${((i / (values.length - 1 || 1)) * 72).toFixed(1)},${(18 - (v / max) * 16).toFixed(1)}`);
  return (
    <svg viewBox="0 0 72 20" className={css({ w: "72px", h: "20px", flex: "none" })} aria-hidden>
      <path d={`M${pts.join("L")}`} className={css({ fill: "none", stroke: "accent", strokeWidth: "1.5" })} />
    </svg>
  );
}

const LEVEL: Record<string, string> = { error: "bad", fatal: "bad", warning: "warn", info: "info" };

function SentryRow({ issue: i, env }: { issue: SentryIssue; env: string | null }) {
  const total = i.trend.reduce((a, b) => a + b, 0);
  return (
    <div className={css({ border: "1px solid token(colors.border)", borderRadius: "lg", bg: "surface.alt", p: "2px", transition: "border-color 0.12s", _hover: { borderColor: "accent" } })}>
      <Item href={i.url} flush>
        <div className={css({ display: "flex", alignItems: "center", gap: "2.5" })}>
          <span className={css({ w: "8px", h: "8px", borderRadius: "full", flex: "none" })} style={{ background: `var(--colors-${LEVEL[i.level] ?? "muted"})` }} title={i.level} />
          <div className={css({ flex: 1, minW: 0 })}>
            <ItemTitle>{i.title}</ItemTitle>
            <ItemMeta>
              <span>{i.shortId}</span>
              <span>· {i.culprit}</span>
              <span>· {m.obs_seen()} {ago(i.lastSeen)}</span>
              <span>· {nf.format(i.users)} {i.users > 1 ? m.obs_users_affected() : m.obs_user_affected()}</span>
              {i.environments && <span>· {m.obs_seen_in({ envs: i.environments.join(", ") })}</span>}
            </ItemMeta>
          </div>
          <Sparkline values={i.trend} />
          <div className={cx(css({ textAlign: "right", minW: "52px", fontWeight: "semibold" }), "tabular")} title={m.obs_events_over_last_24_h()}>
            {nf.format(total)}
            <div className={css({ fontSize: "sm", color: "muted", fontWeight: "normal" })}>{m.obs_24_h()}</div>
          </div>
        </div>
      </Item>
      <SentryTrace issueId={i.id} env={env} />
    </div>
  );
}

// Trace de la dernière occurrence, rattachée aux fichiers du projet (→ éditeur, → carte)
// (dans l'environnement affiché ; s'il n'y en a pas eu, la dernière tout court)
function SentryTrace({ issueId, env }: { issueId: string; env: string | null }) {
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ["frames", issueId, env], queryFn: () => getSentryFrames({ data: { issueId, ...(env && { env }) } }), enabled: open, staleTime: 10 * 60_000 });
  return (
    <Collapsible.Root open={open} onOpenChange={(d) => setOpen(d.open)}>
      <Collapsible.Trigger
        className={css({ display: "inline-flex", alignItems: "center", gap: "1", bg: "transparent", border: "none", px: "2", py: "1", ml: "5", mb: "1", borderRadius: "md", fontSize: "sm", color: "info", cursor: "pointer", _hover: { bg: "info.soft" } })}
      >
        <Collapsible.Indicator className={css({ transition: "transform 0.15s", _open: { transform: "rotate(90deg)" } })}>▸</Collapsible.Indicator>
        {m.obs_trace_code()}
      </Collapsible.Trigger>
      <Collapsible.Content className={css({ mx: "2", ml: "7", mb: "2" })}>
        {q.isPending ? (
          <Skeleton h={30} />
        ) : q.data && !q.data.ok ? (
          <ErrorBox error={q.data.error} />
        ) : (
          <FrameList frames={q.data?.ok ? q.data.data : []} />
        )}
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

function FrameList({ frames }: { frames: import("~/server/types").SentryFrame[] }) {
  const editor = useEditorName();
  const inProject = frames.filter((f) => f.file);
  if (!inProject.length)
    return (
      <Empty>
        {frames.length
          ? m.obs_none_trace_project_code_minified({ lines: m.common_lines_count({ count: frames.length }) })
          : m.obs_no_trace_error()}
      </Empty>
    );
  return (
    <>
    <ul className={css({ listStyle: "none", p: 0, m: 0, display: "flex", flexDirection: "column", gap: "1" })}>
      {inProject.map((f, k) => (
        <li key={k} className={css({ display: "flex", alignItems: "center", gap: "2", fontSize: "sm" })}>
          {k === 0 && <Badge tone="bad">{m.obs_error_location()}</Badge>}
          <span className={css({ flex: 1, minW: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "mono" })} title={f.file!}>
            {f.file}:{f.line ?? "?"}
            {f.fn && <span className={css({ color: "muted" })}> · {f.fn}</span>}
          </span>
          <button type="button" onClick={() => openInIde(f.file!, f.line ?? 1)} className={smallBtn} title={m.map_open_in({ editor })}>
            {editor}
          </button>
          <Link to="/carte" search={{ file: f.file! }} className={smallBtn}>
            {m.obs_map()}
          </Link>
        </li>
      ))}
    </ul>
    {/* sections du guide qui expliquent les fichiers de la trace (le point de l'erreur d'abord) */}
    <GuideForFiles
      files={inProject.map((f) => f.file!)}
      max={3}
      className={css({ mt: "2.5" })}
      title={<p className={css({ fontSize: "sm", fontWeight: "semibold", color: "muted", mb: "1" })}>{m.common_guide()}</p>}
    />
    </>
  );
}

const smallBtn = button({ size: "xs" });

// ---------- CloudWatch ----------
function CloudWatchCard() {
  const q = useCloudWatch();
  const d = q.data?.ok ? q.data.data : null;
  const charts = ok(useAlarmCharts(Boolean(d)));
  const chartOf = new Map((charts?.charts ?? []).map((c) => [c.name, c]));
  return (
    <Card title={m.obs_cloudwatch_alarms()} meta={d && <ExtLink href={d.consoleUrl}>{m.common_aws_console()}</ExtLink>}>
      {q.isPending && <Skeleton />}
      {/* session AWS expirée ou autre erreur : le message et la marche à suivre */}
      {q.data && !q.data.ok && <ErrorBox error={q.data.error} />}
      {q.data?.ok && q.data.stale && <StaleNotice fetchedAt={q.data.fetchedAt} stale={q.data.stale} />}
      {d && (
        <>
          <div className={css({ display: "flex", gap: "2", flexWrap: "wrap", alignItems: "center", mt: "2.5" })}>
            <Badge tone={d.counts.ALARM ? "bad" : "ok"}>{d.counts.ALARM} {m.obs_alarm_2()}</Badge>
            <Badge tone={d.counts.INSUFFICIENT_DATA ? "warn" : "neutral"}>{d.counts.INSUFFICIENT_DATA} {m.obs_no_data()}</Badge>
            <Badge>{d.counts.OK} OK</Badge>
            {d.hiddenAutoscaling > 0 && (
              <span className={css({ fontSize: "sm", color: "muted" })} title={m.obs_alarms_whose_only_action_scale()}>
                · {d.hiddenAutoscaling} {m.obs_autoscaling_alarms_hidden()}
              </span>
            )}
            <span className={css({ fontSize: "sm", color: "muted", ml: "auto" })}>{m.obs_charts_legend()}</span>
          </div>
          {d.alarms.length ? (
            <FitScroll className={css({ mt: "2" })}>
              <List>
                {d.alarms.map((a) => (
                  <li key={a.name}>
                    <Item href={a.url}>
                      <div className={css({ display: "flex", alignItems: "center", gap: "3" })}>
                        <div className={css({ flex: 1, minW: 0 })}>
                          <ItemTitle>{a.name}</ItemTitle>
                          <ItemMeta>
                            <Badge tone={a.state === "ALARM" ? "bad" : a.state === "OK" ? "ok" : "warn"}>
                              {a.state === "ALARM" ? m.obs_alarm_3() : a.state === "OK" ? "OK" : m.obs_no_data_2()}
                            </Badge>
                            <span>· {ago(a.updatedAt)}</span>
                            {a.triggers7d !== null && (
                              <span className={css({ color: a.triggers7d >= 5 ? "warn" : undefined })}>
                                · {a.triggers7d ? m.obs_triggers_7d({ count: a.triggers7d }) : m.obs_never_triggered_7d()}
                                {a.lastAlarmAt && a.state !== "ALARM" && ` (${m.obs_last_trigger({ ago: ago(a.lastAlarmAt) })})`}
                              </span>
                            )}
                          </ItemMeta>
                          {a.state !== "OK" && <ItemMeta>{a.reason.slice(0, 160)}</ItemMeta>}
                        </div>
                        {charts && <AlarmSparkline chart={chartOf.get(a.name)} start={charts.start} end={charts.end} />}
                      </div>
                    </Item>
                  </li>
                ))}
              </List>
            </FitScroll>
          ) : (
            <Empty>{m.obs_no_active_alarms()}</Empty>
          )}
        </>
      )}
    </Card>
  );
}

/**
 * Courbe d'une alarme sur 24 h : la série surveillée, et son seuil (pointillés) ou sa bande d'anomalie (zone claire).
 * En bleu ; en rouge si la série a dépassé le seuil ou la bande pendant ces 24 h (l'accent rose se confondrait avec le rouge).
 */
function AlarmSparkline({ chart, start, end }: { chart: AlarmChart | undefined; start: number; end: number }) {
  const W = 160;
  const H = 36;
  if (!chart || !chart.data.length) return <span className={css({ w: `${W}px`, flex: "none", fontSize: "xs", color: "muted", textAlign: "center" })}>{m.obs_no_curve()}</span>;
  const values = [...chart.data.map(([, v]) => v), ...(chart.threshold !== null ? [chart.threshold] : []), ...(chart.band ? [...chart.band.low, ...chart.band.high].map(([, v]) => v) : [])];
  const lo = Math.min(...values);
  const hi = Math.max(...values) === lo ? lo + 1 : Math.max(...values);
  const x = (t: number) => (((t - start) / (end - start || 1)) * W).toFixed(1);
  const y = (v: number) => (H - 2 - ((v - lo) / (hi - lo)) * (H - 4)).toFixed(1);
  const line = (pts: [number, number][]) => pts.map(([t, v], k) => `${k ? "L" : "M"}${x(t)},${y(v)}`).join("");
  // dépassement : au-delà du seuil, ou de la borne de la bande la plus proche dans le temps
  const bound = chart.band ? (chart.above ? chart.band.high : chart.band.low) : null;
  const nearest = (t: number) => bound?.reduce((b, p) => (Math.abs(p[0] - t) < Math.abs(b[0] - t) ? p : b), bound[0])?.[1];
  const beyond = chart.data.some(([t, v]) => {
    const limit = chart.threshold ?? nearest(t);
    return limit !== undefined && limit !== null && (chart.above ? v > limit : v < limit);
  });
  const peak = chart.above ? Math.max(...chart.data.map(([, v]) => v)) : Math.min(...chart.data.map(([, v]) => v));
  const label = m.obs_chart_label({ peak: nf.format(Math.round(peak * 100) / 100) });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={css({ w: `${W}px`, h: `${H}px`, flex: "none" })} role="img" aria-label={label}>
      <title>{label}</title>
      {chart.band && chart.band.low.length > 0 && (
        <path d={`${line(chart.band.high)}${[...chart.band.low].reverse().map(([t, v]) => `L${x(t)},${y(v)}`).join("")}Z`} className={css({ fill: "info.soft", stroke: "none" })} />
      )}
      {chart.threshold !== null && <line x1="0" x2={W} y1={y(chart.threshold)} y2={y(chart.threshold)} className={css({ stroke: "muted", strokeWidth: "1", strokeDasharray: "3 3" })} />}
      <path d={line(chart.data)} className={css({ fill: "none", strokeWidth: "1.5" })} style={{ stroke: `var(--colors-${beyond ? "bad" : "info"})` }} />
    </svg>
  );
}

// ---------- Logs Insights ----------
/** Volume parcouru, lisible (Logs Insights est facturé au Go parcouru) */
const bytes = (n: number) =>
  n < 1e6 ? m.logs_kb({ n: nf.format(Math.round(n / 1e3)) }) : n < 1e9 ? m.logs_mb({ n: nf.format(Math.round(n / 1e5) / 10) }) : m.logs_gb({ n: nf.format(Math.round(n / 1e8) / 10) });

/**
 * Requêtes Logs Insights enregistrées par l'équipe dans CloudWatch, lancées seulement au clic (sur 1 h ou 24 h) :
 * Logs Insights est facturé au volume parcouru.
 */
function LogsCard() {
  const q = useLogQueries();
  return (
    <Card title={m.logs_title()} meta={<span className={css({ fontSize: "sm", color: "muted" })}>{m.logs_on_demand()}</span>}>
      <SourceView query={q} skeletons={1}>
        {(list) =>
          list.length ? (
            <List>
              {list.map((lq) => (
                <li key={lq.id}>
                  <LogQueryRow lq={lq} />
                </li>
              ))}
            </List>
          ) : (
            <Empty>{m.logs_none_saved()}</Empty>
          )
        }
      </SourceView>
    </Card>
  );
}

function LogQueryRow({ lq }: { lq: LogQuery }) {
  const run = useMutation({ mutationFn: (window: LogWindow) => runLogQuery({ data: { id: lq.id, window } }) });
  const r = run.data;
  return (
    <div className={css({ border: "1px solid token(colors.border)", borderRadius: "lg", bg: "surface.alt", p: "2.5" })}>
      <div className={css({ display: "flex", alignItems: "center", gap: "2", flexWrap: "wrap" })}>
        <div className={css({ flex: 1, minW: 0 })}>
          <ItemTitle>{lq.name}</ItemTitle>
          <ItemMeta>
            <span title={lq.query}>{lq.logGroups.join(", ")}</span>
          </ItemMeta>
        </div>
        {(["1h", "24h"] as const).map((w) => (
          <button key={w} type="button" className={button({ size: "sm" })} disabled={run.isPending} onClick={() => run.mutate(w)}>
            {w === "1h" ? m.logs_run_hour() : m.logs_run_day()}
          </button>
        ))}
      </div>
      {run.isPending && <Skeleton h={40} />}
      {run.isError && <ErrorBox error={{ kind: "unknown", message: { key: "srv_raw", params: { text: m.common_n2_server_not_responding() } } }} />}
      {r && !r.ok && <ErrorBox error={r.error} />}
      {r?.ok && (
        <div className={css({ mt: "2" })}>
          <p className={css({ fontSize: "sm", color: "muted" })}>
            {m.logs_result_line({ matched: nf.format(r.data.matched), scanned: bytes(r.data.bytesScanned), window: r.data.window === "1h" ? m.logs_run_hour() : m.logs_run_day() })}
            {r.data.rows.length < r.data.matched && ` · ${m.logs_first_rows({ count: r.data.rows.length })}`}
          </p>
          {r.data.rows.length > 0 && (
            <div className={css({ mt: "1.5", overflowX: "auto", maxH: "320px", overflowY: "auto" })}>
              <table className={css({ borderCollapse: "collapse", fontSize: "xs", w: "full" })}>
                <thead>
                  <tr>
                    {r.data.columns.map((c) => (
                      <th key={c} className={css({ textAlign: "left", px: "2", py: "1", color: "muted", fontWeight: "semibold", position: "sticky", top: 0, bg: "surface.alt" })}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {r.data.rows.map((row, k) => (
                    <tr key={k}>
                      {row.map((v, j) => (
                        <td key={j} className={cx("tabular", css({ px: "2", py: "1", borderTop: "1px solid token(colors.border)", maxW: "480px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }))} title={v}>
                          {v}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
