// CI GitHub (Actions) : branche principale et « ma branche », dernière exécution de chaque workflow.
// Une exécution réussie après relance est signalée : c'est le signe d'une CI instable (un test qui échoue au hasard).
import { css } from "styled-system/css";
import { Badge, Card, Empty, ExtLink, H3, Item, ItemMeta, List, SourceView, type Tone } from "~/components/ds";
import { useCi } from "~/lib/data";
import { ago } from "~/lib/format";
import { m } from "~/lib/i18n";
import type { CiBranch, CiWorkflow } from "~/server/types";
import { duration } from "./ui";

/** Libellé et couleur de l'état d'une exécution */
export function ciBadge(w: Pick<CiWorkflow, "status" | "conclusion">): [string, Tone] {
  if (w.status === "running") return [m.ci_running(), "info"];
  if (w.conclusion === "success") return [m.ci_success(), "ok"];
  if (w.conclusion === "failure") return [m.ci_failure(), "bad"];
  if (w.conclusion === "cancelled") return [m.ci_cancelled(), "neutral"];
  return [w.conclusion ?? "?", "warn"];
}

export function CiCard({ branch }: { branch?: string }) {
  const q = useCi(branch);
  return (
    <Card title={m.ci_title()} meta={q.data?.ok && <ExtLink href={q.data.data.actionsUrl}>GitHub Actions ↗</ExtLink>}>
      <SourceView query={q} skeletons={1}>
        {(d) => (
          <>
            <CiSection b={d.main} />
            {d.branch && <CiSection b={d.branch} mine />}
          </>
        )}
      </SourceView>
    </Card>
  );
}

function CiSection({ b, mine = false }: { b: CiBranch; mine?: boolean }) {
  const retried = b.workflows.reduce((n, w) => n + w.retriedOk14d, 0);
  return (
    <>
      <H3>
        {mine ? m.common_my_branch() : b.name} {mine && <span className={css({ textTransform: "none", letterSpacing: "normal", fontWeight: "normal" })}>· {b.name}</span>}
        {retried > 0 && (
          <span className={css({ ml: "auto", textTransform: "none", letterSpacing: "normal", fontWeight: "normal", color: "warn" })} title={m.ci_retried_hint()}>
            {m.ci_retried_14d({ count: retried })}
          </span>
        )}
      </H3>
      {b.workflows.length ? (
        <List>
          {b.workflows.map((w) => {
            const [label, tone] = ciBadge(w);
            return (
              <li key={w.name}>
                <Item href={w.url}>
                  <div className={css({ display: "flex", alignItems: "center", gap: "2", flexWrap: "wrap", fontSize: "md" })}>
                    <Badge tone={tone}>{label}</Badge>
                    <strong>{w.name}</strong>
                    {w.attempt > 1 && w.conclusion === "success" && <Badge tone="warn">{m.ci_after_retry({ attempt: w.attempt })}</Badge>}
                  </div>
                  <ItemMeta>
                    <span>{w.sha}</span>
                    <span>· {ago(w.startedAt)}</span>
                    {w.durationMs !== null && <span>· {w.durationMs < 60_000 ? m.ci_under_a_minute() : duration(w.durationMs)}</span>}
                    {w.failures14d > 0 && <span className={css({ color: "bad" })}>· {m.ci_failures_14d({ count: w.failures14d })}</span>}
                  </ItemMeta>
                </Item>
              </li>
            );
          })}
        </List>
      ) : (
        <Empty>{m.ci_no_runs()}</Empty>
      )}
    </>
  );
}
