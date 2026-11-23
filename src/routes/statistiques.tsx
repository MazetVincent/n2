import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { css, cx } from "styled-system/css";
import { z } from "zod";
import { Card, Empty, ErrorBox, Item, ItemMeta, ItemTitle, List, Segmented, Skeleton } from "~/components/ds";
import { change, formatDuration } from "~/features/stats/logic";
import { WeekChart, type WeekPoint } from "~/features/stats/WeekChart";
import { useStats } from "~/lib/data";
import { dateFr, nf } from "~/lib/format";
import { getLang, m, msg } from "~/lib/i18n";
import type { PrWeek, StatsData } from "~/server/types";
import { useStatsFound } from "~/features/secret/Konami";

// Statistiques de la semaine : délai de première revue, temps de l'ouverture à la fusion, PR fusionnées,
// erreurs Sentry, sur 8 semaines. ?portee=moi : mes PR seulement (toute l'équipe par défaut).
const search = z.object({ portee: z.enum(["moi"]).optional() });
export const Route = createFileRoute("/statistiques")({ validateSearch: search, component: StatsPage });

const dur = (v: number | null) => formatDuration(v, getLang());

function StatsPage() {
  useStatsFound();
  const q = useStats();
  const { portee } = Route.useSearch();
  const navigate = Route.useNavigate();
  const scope = portee === "moi" ? "mine" : "team";
  const d = q.data?.ok ? q.data.data : undefined;

  return (
    <div className={css({ display: "flex", flexDirection: "column", gap: "4" })}>
      {/* le filtre, au-dessus de tout ce qu'il change (les mesures des PR) */}
      <div className={css({ display: "flex", alignItems: "center", gap: "3", flexWrap: "wrap" })}>
        <Segmented
          label={m.stats_pull_requests_counted()}
          value={scope}
          onChange={(v) => navigate({ search: { portee: v === "mine" ? "moi" : undefined }, replace: true, resetScroll: false })}
          items={[
            { value: "team", label: m.stats_whole_team() },
            { value: "mine", label: m.common_my_prs() },
          ]}
        />
        <span className={css({ fontSize: "sm", color: "muted" })}>
          {m.stats_last_8_weeks_median_durations()}
        </span>
      </div>

      {q.isPending && (
        <div className={grid}>
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} title="…">
              <Skeleton h={190} />
            </Card>
          ))}
        </div>
      )}
      {q.data && !q.data.ok && <ErrorBox error={q.data.error} />}
      {d && <StatsBody data={d} scope={scope} />}
    </div>
  );
}

const grid = css({ display: "grid", gridTemplateColumns: { base: "1fr", md: "repeat(2, minmax(0, 1fr))", xl: "repeat(3, minmax(0, 1fr))" }, gap: "4" });

function StatsBody({ data, scope }: { data: StatsData; scope: "team" | "mine" }) {
  const weeks = data.weeks;
  const label = (start: string) => dateFr(`${start}T12:00:00`);
  const pr = (i: number): PrWeek => weeks[i][scope];
  const n = weeks.length - 1;
  const githubDown = data.failed.some((f) => f.source === "github");
  const sentryDown = data.failed.some((f) => f.source === "sentry");
  const capped = (v: number | null) => (v === null ? "—" : v >= data.newIssuesCap ? `${data.newIssuesCap}+` : nf.format(v));

  const points = (value: (i: number) => number | null, detail: (i: number) => string | undefined): WeekPoint[] => weeks.map((w, i) => ({ label: label(w.start), value: value(i), detail: detail(i) }));

  return (
    <>
      {data.failed.map((f) => (
        <p key={f.source} className={css({ fontSize: "sm", color: "warn" })}>
          {f.source === "github" ? "GitHub" : "Sentry"} : {msg(f.message)}
          {f.hint && <span className={css({ color: "muted" })}> · {msg(f.hint)}</span>}
        </p>
      ))}
      <div className={grid}>
        {!githubDown && (
          <>
            <Metric
              title={m.stats_time_first_review()}
              value={dur(pr(n).review)}
              delta={change(pr(n).review, pr(n - 1).review)}
              lowerIsBetter
              sub={pr(n).reviewed ? m.stats_median_reviewed_week({ prs: m.stats_prs_reviewed_count({ count: pr(n).reviewed }) }) : m.stats_no_first_review_week()}
              previous={m.stats_last_week({ review: dur(pr(n - 1).review) })}
            >
              <WeekChart
                label={m.stats_median_time_first_review_per()}
                kind="duration"
                format={dur}
                points={points((i) => pr(i).review, (i) => (pr(i).reviewed ? m.stats_prs_reviewed_count({ count: pr(i).reviewed }) : undefined))}
              />
            </Metric>
            <Metric
              title={m.stats_open_merge()}
              value={dur(pr(n).cycle)}
              delta={change(pr(n).cycle, pr(n - 1).cycle)}
              lowerIsBetter
              sub={pr(n).merged ? m.stats_median_merged_week({ prs: m.stats_prs_merged_count({ count: pr(n).merged }) }) : m.stats_no_pr_merged_week()}
              previous={m.stats_last_week_2({ cycle: dur(pr(n - 1).cycle) })}
            >
              <WeekChart
                label={m.stats_median_time_from_open_merge()}
                kind="duration"
                format={dur}
                points={points((i) => pr(i).cycle, (i) => (pr(i).merged ? m.stats_prs_merged_count({ count: pr(i).merged }) : undefined))}
              />
            </Metric>
            <Metric
              title={m.stats_prs_merged()}
              value={nf.format(pr(n).merged)}
              sub={m.stats_current_week()}
              previous={m.stats_last_week_3({ merged: pr(n - 1).merged })}
            >
              <WeekChart label={m.stats_prs_merged_per_week()} kind="count" format={(v) => nf.format(Math.round(v))} points={points((i) => pr(i).merged, () => undefined)} />
            </Metric>
          </>
        )}
        {!sentryDown && (
          <>
            <Metric
              title={m.common_sentry_errors()}
              value={weeks[n].errors === null ? "—" : nf.format(weeks[n].errors!)}
              sub={m.stats_events_received_current_week()}
              previous={m.stats_last_week_4({ errors: nf.format(weeks[n - 1].errors ?? 0) })}
            >
              <WeekChart label={m.stats_sentry_errors_received_per_week()} kind="count" format={compact} points={points((i) => weeks[i].errors, () => undefined)} />
            </Metric>
            <Metric
              title={m.stats_new_sentry_issues()}
              value={capped(weeks[n].newIssues)}
              sub={m.stats_first_seen_current_week()}
              previous={m.stats_last_week_5({ newIssues: capped(weeks[n - 1].newIssues) })}
            >
              <WeekChart
                label={m.stats_new_sentry_issues_per_week()}
                kind="count"
                format={(v) => nf.format(Math.round(v))}
                points={points((i) => weeks[i].newIssues, (i) => ((weeks[i].newIssues ?? 0) >= data.newIssuesCap ? m.stats_sentry_does_not_count_past({ newIssuesCap: data.newIssuesCap }) : undefined))}
              />
            </Metric>
          </>
        )}
        {!githubDown && <Slowest data={data} />}
      </div>
      <WeekTable data={data} scope={scope} label={label} capped={capped} />
    </>
  );
}

const compact = (v: number) => (v >= 10_000 ? `${nf.format(Math.round(v / 1000))}k` : nf.format(Math.round(v)));

function Metric({ title, value, delta, lowerIsBetter, sub, previous, children }: { title: string; value: string; delta?: number | null; lowerIsBetter?: boolean; sub: string; previous: string; children: ReactNode }) {
  // évolution : flèche + pourcentage signé ; couleur selon le sens et ce qui est souhaitable (moins long = mieux)
  const good = delta != null && delta !== 0 && (delta < 0) === !!lowerIsBetter;
  return (
    <Card title={title} meta={previous}>
      <div className={css({ display: "flex", alignItems: "baseline", gap: "2.5", mt: "2", flexWrap: "wrap" })}>
        <span className={css({ fontSize: "28px", fontWeight: "semibold", lineHeight: 1.1 })}>{value}</span>
        {delta != null && (
          <span
            title={m.stats_compared_last_week()}
            className={cx(css({ fontSize: "sm", fontWeight: "semibold", px: "1.5", borderRadius: "md" }), "tabular", delta === 0 ? css({ color: "muted" }) : good ? css({ color: "ok", bg: "ok.soft" }) : css({ color: "bad", bg: "bad.soft" }))}
          >
            {delta > 0 ? "↑" : delta < 0 ? "↓" : "="} {delta > 0 ? "+" : ""}
            {delta} %
          </span>
        )}
      </div>
      <p className={css({ fontSize: "sm", color: "muted", mt: "0.5" })}>{sub}</p>
      {children}
    </Card>
  );
}

function Slowest({ data }: { data: StatsData }) {
  return (
    <Card title={m.stats_slowest_merge()} meta={m.stats_last_2_weeks()}>
      {data.slowest.length ? (
        <List>
          {data.slowest.map((p) => (
            <li key={p.url}>
              <Item href={p.url}>
                <ItemTitle>{p.title}</ItemTitle>
                <ItemMeta>
                  <span className={cx(css({ fontWeight: "semibold" }), "tabular")}>{dur(p.cycle)}</span>
                  <span>
                    #{p.number} · {p.author}
                  </span>
                  <span>{m.stats_first_review({ review: dur(p.review) })}</span>
                </ItemMeta>
              </Item>
            </li>
          ))}
        </List>
      ) : (
        <Empty>{m.stats_no_pr_merged_last_two()}</Empty>
      )}
    </Card>
  );
}

// Toutes les valeurs, sans survol : la vue tableau des graphiques
function WeekTable({ data, scope, label, capped }: { data: StatsData; scope: "team" | "mine"; label: (s: string) => string; capped: (v: number | null) => string }) {
  // styles fusionnés par css() (et non cx) : la 1re colonne remplace l'alignement à droite au lieu de s'y ajouter
  const thBase = { textAlign: "right", fontWeight: "semibold", color: "muted", fontSize: "sm", px: "2.5", py: "2", whiteSpace: "nowrap", borderBottom: "1px solid token(colors.border)" } as const;
  const tdBase = { textAlign: "right", px: "2.5", py: "1.5", fontSize: "md", whiteSpace: "nowrap", borderBottom: "1px solid token(colors.border)" } as const;
  const th = css(thBase);
  const td = cx(css(tdBase), "tabular");
  const rows = [...data.weeks].reverse();
  return (
    <Card title={m.stats_week_by_week()} meta={scope === "mine" ? m.stats_my_prs() : m.stats_whole_team_2()}>
      <div className={css({ overflowX: "auto", mt: "2" })}>
        <table className={css({ w: "full", borderCollapse: "collapse" })}>
          <thead>
            <tr>
              <th className={css(thBase, { textAlign: "left" })}>{m.stats_week()}</th>
              <th className={th}>{m.stats_1st_review()}</th>
              <th className={th}>{m.stats_reviewed()}</th>
              <th className={th}>{m.stats_open_merge()}</th>
              <th className={th}>{m.stats_merged()}</th>
              <th className={th}>{m.common_sentry_errors()}</th>
              <th className={th}>{m.stats_new_issues()}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((w, i) => {
              const p = w[scope];
              return (
                <tr key={w.start}>
                  <td className={css(tdBase, { textAlign: "left", fontWeight: i === 0 ? "semibold" : "normal" })}>
                    {label(w.start)}
                    {i === 0 && <span className={css({ color: "muted", fontWeight: "normal" })}> {m.stats_current()}</span>}
                  </td>
                  <td className={td}>{dur(p.review)}</td>
                  <td className={td}>{p.reviewed}</td>
                  <td className={td}>{dur(p.cycle)}</td>
                  <td className={td}>{p.merged}</td>
                  <td className={td}>{w.errors === null ? "—" : nf.format(w.errors)}</td>
                  <td className={td}>{capped(w.newIssues)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
