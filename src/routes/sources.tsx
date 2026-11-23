// État des sources : l'observabilité de N2 lui-même. Pour chaque source, depuis le démarrage du serveur : dernière
// lecture, durée, dernier succès, nombre de lectures et d'échecs, dernière erreur. Onglet caché, ouvert depuis ⌘K
// (« État des sources ») ou les Préférences. Les échecs, lectures lentes et rétablissements vont aussi dans le journal.
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { css, cx } from "styled-system/css";
import { Badge, Card, Empty, Skeleton } from "~/components/ds";
import { ago } from "~/lib/format";
import { m, msg } from "~/lib/i18n";
import { getSourceStatus } from "~/server/fns";
import { groupSources, type SourceGroup } from "~/features/sources/logic";

export const Route = createFileRoute("/sources")({ component: SourcesPage });

/** Nom affiché d'une source, d'après le début de sa clé de cache (« sentry:(config) » → Sentry) */
const LABELS: Record<string, () => string> = {
  prs: () => m.sources_prs(),
  "open-prs": () => m.sources_open_prs(),
  jira: () => "Jira",
  activity: () => m.sources_activity(),
  slack: () => "Slack",
  calendar: () => m.sources_calendar(),
  sentry: () => "Sentry",
  cloudwatch: () => "CloudWatch",
  deploy: () => m.sources_deploy(),
  stats: () => m.sources_stats(),
  libs: () => m.sources_libs(),
  "workspace-libs": () => m.sources_workspace_libs(),
  codemap: () => m.sources_codemap(),
  branch: () => m.sources_branch(),
  branches: () => m.sources_branches(),
  guide: () => m.sources_guide(),
  "guide-freshness": () => m.sources_guide_freshness(),
  docs: () => m.sources_docs(),
  lib: () => m.sources_lib_details(),
  "lib-overview": () => m.sources_lib_details(),
  ex: () => m.sources_examples(),
  impact: () => m.sources_impact(),
  frames: () => m.sources_frames(),
};

const cell = css({ py: "2", px: "2", borderTop: "1px solid token(colors.border)", fontSize: "sm", minW: 0 });
const head = css({ py: "1.5", px: "2", fontSize: "xs", color: "muted", textTransform: "uppercase", letterSpacing: "wide" });

function SourcesPage() {
  const q = useQuery({ queryKey: ["source-status"], queryFn: () => getSourceStatus(), refetchInterval: 10_000 });
  const d = q.data;
  const groups = d ? groupSources(d.sources) : [];
  const failing = groups.filter((g) => !g.last.lastOk && !g.last.off).length;
  return (
    <div className={css({ mt: "3" })}>
      <Card
        title={m.sources_title()}
        meta={
          d && (
            <span className={css({ fontSize: "sm", color: "muted" })}>
              {m.sources_started({ ago: ago(d.startedAt) })} · {d.mode === "dev" ? m.sources_mode_dev() : m.sources_mode_production()}
              {d.commit && ` · ${d.commit}`}
            </span>
          )
        }
      >
        {!d ? (
          <Skeleton h={160} />
        ) : !groups.length ? (
          <Empty>{m.sources_none_yet()}</Empty>
        ) : (
          <>
            <p className={css({ mt: "2", fontSize: "sm", color: failing ? "bad" : "muted" })}>
              {failing ? m.sources_failing({ count: failing }) : m.sources_all_ok()} · {m.sources_log_hint()}
            </p>
            <div className={css({ mt: "2", overflowX: "auto" })}>
              <div className={css({ display: "grid", gridTemplateColumns: "minmax(140px, 1.2fr) auto auto auto auto auto minmax(180px, 2fr)", alignItems: "center", minW: "760px" })}>
                {[m.sources_source(), m.sources_state(), m.sources_last_read(), m.sources_duration(), m.sources_last_success(), m.sources_reads(), m.sources_last_error()].map((h) => (
                  <div key={h} className={head}>
                    {h}
                  </div>
                ))}
                {groups.map((g) => (
                  <SourceRow key={g.name} g={g} />
                ))}
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function SourceRow({ g }: { g: SourceGroup }) {
  const s = g.last;
  return (
    <>
      <div className={cell}>
        <strong>{LABELS[g.name]?.() ?? g.name}</strong>
        {g.detail && <div className={css({ color: "muted", fontSize: "xs", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" })}>{g.detail}</div>}
      </div>
      <div className={cell}>
        <Badge tone={s.lastOk ? "ok" : s.off ? "neutral" : "bad"}>{s.lastOk ? m.sources_ok() : s.off ? m.sources_not_configured() : m.sources_failed()}</Badge>
      </div>
      <div className={cx(cell, css({ color: "muted" }))}>{ago(s.lastAt)}</div>
      <div className={cx(cell, "tabular", css({ color: s.lastMs > 5_000 ? "warn" : "muted" }))}>{(s.lastMs / 1000).toFixed(1)} s</div>
      <div className={cx(cell, css({ color: "muted" }))}>{g.lastSuccessAt ? ago(g.lastSuccessAt) : "—"}</div>
      <div className={cx(cell, "tabular", css({ color: "muted" }))}>
        {g.calls}
        {g.failures > 0 && <span className={css({ color: "bad" })}> · {m.sources_failures({ count: g.failures })}</span>}
      </div>
      <div className={cx(cell, css({ color: s.lastOk || s.off ? "muted" : "bad" }))}>
        {s.lastError ? (
          <>
            {msg(s.lastError.message)}
            {s.lastOk && <span className={css({ color: "muted" })}> ({m.sources_since_recovered()})</span>}
          </>
        ) : (
          "—"
        )}
      </div>
    </>
  );
}
