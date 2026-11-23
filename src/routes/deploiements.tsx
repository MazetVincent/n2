import { Link, createFileRoute } from "@tanstack/react-router";
import { Fragment, type ReactNode } from "react";
import { css, cx } from "styled-system/css";
import { Badge, Card, Count, Empty, ExtLink, FitScroll, H3, Item, ItemMeta, List, Skeleton, SourceView } from "~/components/ds";
import { branchSlug } from "~/features/deploy/slug";
import { EnvRow } from "~/features/deploy/EnvRow";
import { CiCard } from "~/features/deploy/CiCard";
import { GuideReflexLinks } from "~/features/guide/GuideLinks";
import { CommitChips, cleanMessage, commitLine, duration, stageLabel, statusBadge } from "~/features/deploy/ui";
import { useBranchFilter } from "~/features/branches/filter";
import { BranchFilterBar, useBranchScope } from "~/features/branches/scope";
import { deployOfRelease } from "~/features/deploy/release";
import { ok, useBranch, useDeploy, useSentry } from "~/lib/data";
import { ago, timeFr } from "~/lib/format";
import { m } from "~/lib/i18n";
import type { DeployCommit, DeployData, MainPipeline, SentryRelease } from "~/server/types";

// Déploiements : pipeline de la branche principale (étapes, ce qui attend la prod, historique)
// et environnements dynamiques des branches. Lecture seule : la validation prod se fait dans la console AWS.
export const Route = createFileRoute("/deploiements")({ component: DeployPage });

/** Interrupteur « Ma branche » allumé : l'environnement dynamique de la branche et les exécutions qui contiennent ses PR */
interface BranchOnly {
  slug: string;
  prs: Set<number>;
}
const keep = (only: BranchOnly | null) => (c: DeployCommit) => !only || (c.pr !== null && only.prs.has(c.pr));

function DeployPage() {
  const { branche } = Route.useSearch();
  const q = useDeploy();
  const filtered = useBranchFilter();
  const scope = useBranchScope(branche, filtered);
  // environnement de la branche mis en avant, même sans filtre
  const branch = ok(useBranch(branche));
  const only = filtered && scope.branch ? { slug: branchSlug(scope.branch.branch), prs: new Set(scope.prs.map((p) => p.number)) } : null;
  return (
    <SourceView query={q} skeletons={3}>
      {(d) => (
        <>
        <GuideReflexLinks tab="deploy" />
        {filtered && <BranchFilterBar branch={scope.branch?.branch ?? branche} />}
        {/* filtre allumé mais branche pas encore lue (ou illisible) : rien de non filtré sous le bandeau */}
        {filtered && !only ? (
          scope.failed ? <Empty>{m.prs_unable_read_branch_tracked_project()}</Empty> : <Skeleton h={160} />
        ) : (
        <div className={css({ mt: "3", display: "grid", gridTemplateColumns: { base: "1fr", xl: "minmax(0, 2fr) minmax(0, 1fr)" }, gap: "4", alignItems: "start" })}>
          <div className={css({ display: "flex", flexDirection: "column", gap: "4", minW: 0 })}>
            {d.main ? <MainCard main={d.main} links={d.links} only={only} /> : <Card title={m.deploy_main_pipeline()}><Empty>{m.deploy_no_main_pipeline_found_check()}</Empty></Card>}
            {!only && <ReleaseCard main={d.main} links={d.links} />}
            {d.main && <HistoryCard main={d.main} links={d.links} only={only} />}
          </div>
          <div className={css({ display: "flex", flexDirection: "column", gap: "4", minW: 0 })}>
            <CiCard branch={branch?.branch} />
            <EnvsCard d={d} mine={branch ? branchSlug(branch.branch) : null} only={only} />
          </div>
        </div>
        )}
        </>
      )}
    </SourceView>
  );
}

// ---------- Pipeline principal ----------
function MainCard({ main, links, only }: { main: MainPipeline; links: DeployData["links"]; only: BranchOnly | null }) {
  const p = main.pendingState;
  const pending = main.pending.filter(keep(only));
  return (
    <Card title={m.deploy_release_production()} meta={<ExtLink href={main.consoleUrl}>{m.common_aws_console()}</ExtLink>}>
      {p && (
        <div
          className={css({ mt: "3", p: "3", borderRadius: "lg", fontSize: "md", display: "flex", gap: "3", alignItems: "center", flexWrap: "wrap" })}
          style={{ background: `var(--colors-${p.kind === "failed" ? "bad" : p.kind === "approval" ? "warn" : "info"}-soft)` }}
        >
          <strong className={css({ color: p.kind === "failed" ? "bad" : p.kind === "approval" ? "warn" : "info" })}>
            {p.kind === "approval"
              ? m.deploy_waiting_production_approval()
              : p.kind === "failed"
                ? m.deploy_failed_at({ stage: stageLabel(p.stage) })
                : m.deploy_deploying({ stage: stageLabel(p.stage) })}
          </strong>
          {p.since && <span className={css({ color: "muted" })}>{m.common_since()} {ago(p.since).replace(/^il y a /, "")}</span>}
          <ExtLink href={main.consoleUrl} tone={p.kind === "failed" ? "bad" : "warn"} className={css({ ml: "auto" })}>
            {p.kind === "approval" ? m.deploy_approve_console() : m.deploy_open_console()}
          </ExtLink>
        </div>
      )}

      <Stages main={main} links={links} />

      <H3>
        {m.deploy_awaiting_production()} {pending.length > 0 && <Count>{pending.length}</Count>}
      </H3>
      {pending.length ? (
        <List>
          {pending.map((c) => (
            <li key={c.executionId}>
              <CommitRow c={c} links={links} />
            </li>
          ))}
        </List>
      ) : (
        <Empty>{only ? m.deploy_branch_no_pending() : m.deploy_everything_merged_production()}</Empty>
      )}

      <H3>{m.deploy_production()}</H3>
      {main.prod ? <CommitRow c={main.prod} links={links} extra={main.prod.prodAt && <span>· {m.deploy_live()} {ago(main.prod.prodAt)}</span>} /> : <Empty>{m.deploy_no_production_release_recent_runs()}</Empty>}
    </Card>
  );
}

// ---------- Release en production et ses nouvelles erreurs (Sentry) ----------
/**
 * Release Sentry en production, la mise en prod CodePipeline qui l'a livrée (par l'heure), et les erreurs apparues
 * avec elle. Rien si Sentry n'est pas réglé pour (sentry.environment) ou ne reçoit pas de releases.
 */
function ReleaseCard({ main, links }: { main: MainPipeline | null; links: DeployData["links"] }) {
  const s = ok(useSentry());
  const r: SentryRelease | null | undefined = s?.release;
  if (!r) return null;
  const deploy = deployOfRelease(main, r.since);
  return (
    <Card title={m.release_errors_title()} meta={<ExtLink href={r.url}>{m.release_sentry_link()}</ExtLink>}>
      <p className={css({ mt: "2", display: "flex", gap: "2", alignItems: "center", flexWrap: "wrap", fontSize: "md" })}>
        <Badge tone={r.newCount ? "warn" : "ok"}>{r.version}</Badge>
        {r.since && <span className={css({ color: "muted" })}>{m.release_in_prod_since({ ago: ago(r.since) })}</span>}
      </p>
      {deploy && (
        <div className={css({ mt: "2" })}>
          <CommitRow c={deploy} links={links} extra={<span>· {m.release_delivered_by()}</span>} />
        </div>
      )}
      <H3>
        {m.release_new_errors({ count: r.newCount })} {r.newCount > 0 && <Count>{r.newCount}</Count>}
      </H3>
      {r.newIssues.length ? (
        <>
          <List>
            {r.newIssues.slice(0, 5).map((i) => (
              <li key={i.id}>
                <Item href={i.url}>
                  <div className={commitLine}>{i.title}</div>
                  <ItemMeta>
                    <span>{i.shortId}</span>
                    <span>· {m.release_events({ count: i.count })}</span>
                    <span>· {ago(i.firstSeen)}</span>
                  </ItemMeta>
                </Item>
              </li>
            ))}
          </List>
          <Link to="/observabilite" search={{ erreurs: "release" }} className={css({ display: "inline-block", mt: "2", fontSize: "sm", color: "info" })}>
            {m.release_see_all()}
          </Link>
        </>
      ) : (
        <Empty>{m.release_no_new_errors()}</Empty>
      )}
    </Card>
  );
}

/** Frise des étapes : état, heure et PR de la dernière exécution passée par chacune */
function Stages({ main, links }: { main: MainPipeline; links: DeployData["links"] }) {
  return (
    <ol className={css({ listStyle: "none", m: 0, mt: "3", p: 0, display: "flex", alignItems: "stretch", gap: "1.5", flexWrap: "wrap" })}>
      {main.stages.map((s, i) => {
        const approval = /approv|validation/i.test(s.name);
        const [label, tone] = statusBadge(s.status, approval);
        return (
          <Fragment key={s.name}>
            {i > 0 && (
              <li aria-hidden className={css({ alignSelf: "center", color: "muted", fontSize: "sm" })}>
                →
              </li>
            )}
            <li
              className={css({ flex: "1 1 120px", minW: "120px", p: "2.5", borderRadius: "lg", border: "1px solid token(colors.border)", bg: "surface.alt", display: "flex", flexDirection: "column", gap: "1" })}
              style={tone !== "neutral" && tone !== "ok" ? { borderColor: `var(--colors-${tone})` } : undefined}
            >
              <span className={css({ fontSize: "sm", fontWeight: "semibold" })}>{stageLabel(s.name)}</span>
              <span>
                <Badge tone={tone}>{label}</Badge>
              </span>
              <span className={css({ fontSize: "xs", color: "muted", display: "flex", gap: "1", alignItems: "center", flexWrap: "wrap" })}>
                {s.commit && <CommitChips c={s.commit} links={links} />}
                {s.at && <span title={new Date(s.at).toLocaleString()}>{ago(s.at)}</span>}
              </span>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

function CommitRow({ c, links, extra }: { c: DeployCommit; links: DeployData["links"]; extra?: ReactNode }) {
  return (
    <Item href={c.pr !== null ? `${links.pr}${c.pr}` : undefined}>
      <div className={commitLine}>{cleanMessage(c.message)}</div>
      <ItemMeta>
        <CommitChips c={c} links={links} />
        <span>· {m.common_merged()} {ago(c.startedAt)}</span>
        {extra}
      </ItemMeta>
    </Item>
  );
}

// ---------- Historique ----------
function HistoryCard({ main, links, only }: { main: MainPipeline; links: DeployData["links"]; only: BranchOnly | null }) {
  const executions = main.executions.filter(keep(only));
  return (
    <Card title={m.deploy_recent_runs()} meta={m.deploy_last({ executions: executions.length })}>
      {only && !executions.length && <Empty>{m.deploy_branch_no_runs()}</Empty>}
      <FitScroll className={css({ mt: "2" })}>
        <table className={css({ w: "100%", borderCollapse: "collapse", fontSize: "sm", "& td": { py: "1.5", pr: "3", borderBottom: "1px solid token(colors.border)", verticalAlign: "middle" }, "& tr:last-child td": { borderBottom: "none" } })}>
          <tbody>
            {executions.map((c) => {
              const [label, tone] = statusBadge(c.status);
              return (
                <tr key={c.executionId}>
                  <td className={css({ whiteSpace: "nowrap" })}>
                    <Badge tone={tone}>{label}</Badge>
                  </td>
                  <td className={css({ maxW: 0, w: "100%" })}>
                    <div className={css({ display: "flex", gap: "1.5", alignItems: "center", minW: 0 })}>
                      <CommitChips c={c} links={links} />
                      <span className={cx(commitLine, css({ fontSize: "sm" }))} title={c.message}>
                        {cleanMessage(c.message)}
                      </span>
                    </div>
                  </td>
                  <td className={cx(css({ whiteSpace: "nowrap", color: "muted" }), "tabular")} title={new Date(c.startedAt).toLocaleString()}>
                    {ago(c.startedAt)}
                  </td>
                  <td className={cx(css({ whiteSpace: "nowrap", color: "muted" }), "tabular")}>{c.status === "InProgress" ? "—" : duration(Date.parse(c.updatedAt) - Date.parse(c.startedAt))}</td>
                  <td className={cx(css({ whiteSpace: "nowrap", color: c.prodAt ? "ok" : "muted" }), "tabular")}>
                    {c.prodAt ? `${m.deploy_prod()} ${timeFr(Date.parse(c.prodAt))}` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </FitScroll>
    </Card>
  );
}

// ---------- Environnements dynamiques ----------
function EnvsCard({ d, mine, only }: { d: DeployData; mine: string | null; only: BranchOnly | null }) {
  const envs = [...d.envs].filter((e) => !only || e.slug === only.slug).sort((a, b) => Number(b.slug === mine) - Number(a.slug === mine));
  return (
    <Card title={<>{m.deploy_dynamic_environments()} {envs.length > 0 && <Count>{envs.length}</Count>}</>}>
      {envs.length ? (
        <List>
          {envs.map((e) => (
            <li key={e.pipeline}>
              <EnvRow e={e} mine={e.slug === mine} links={d.links} />
            </li>
          ))}
        </List>
      ) : (
        <Empty>{only ? m.deploy_branch_no_env() : m.deploy_no_dynamic_environment_right_now()}</Empty>
      )}
      <p className={css({ mt: "3", fontSize: "sm", color: "muted" })}>
        {m.deploy_created_from_branch_npm_run()}
      </p>
    </Card>
  );
}
