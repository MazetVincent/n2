import { createFileRoute } from "@tanstack/react-router";
import { css, cx } from "styled-system/css";
import { PrChips } from "~/components/links";
import { Badge, Card, Count, Empty, ExtLink, H3, Icon, Item, ItemMeta, ItemTitle, List, Progress, Skeleton, SourceView, cols3, type Tone } from "~/components/ds";
import { useBranchFilter } from "~/features/branches/filter";
import { BranchFilterBar, useBranchScope } from "~/features/branches/scope";
import { prsByJiraKey } from "~/features/todo/logic";
import { ok, usePullRequests, useSprint } from "~/lib/data";
import { dateFr, plural } from "~/lib/format";
import { m } from "~/lib/i18n";
import type { JiraIssue } from "~/server/types";

// Interrupteur « Ma branche » allumé (barre du haut) : les tickets de la branche (cités dans son nom ou dans ses PR ;
// ?branche=, gardé sur tous les onglets, la branche actuelle par défaut)
export const Route = createFileRoute("/sprint")({ component: SprintPage });

const CATEGORY = (): [JiraIssue["category"], string][] => [
  ["new", m.common_do()],
  ["indeterminate", m.common_progress()],
  ["done", m.sprint_done()],
];
const tone = (c: JiraIssue["category"]): Tone => ({ new: "neutral", indeterminate: "info", done: "ok" } as const)[c];

function SprintPage() {
  const { branche } = Route.useSearch();
  const onBranch = useBranchFilter();
  const scope = useBranchScope(branche, onBranch);
  const q = useSprint();
  const prsOfKey = prsByJiraKey(ok(usePullRequests()));
  const s = q.data?.ok ? q.data.data.sprint : null;
  const daysLeft = s ? Math.ceil((new Date(s.endDate).getTime() - Date.now()) / 86_400_000) : 0;
  return (
    <Card
      title={m.sprint_jira_sprint()}
      meta={
        s && (
          <>
            <ExtLink href={s.url}>{s.name} ↗</ExtLink>
            <br />
            {dateFr(s.startDate)} → {dateFr(s.endDate)}
          </>
        )
      }
    >
      <SourceView query={q}>
        {(d) => {
          if (!d.sprint) return <Empty>{m.sprint_no_active_sprint_board()}</Empty>;
          const done = d.issues.filter((i) => i.category === "done").length;
          const branchKeys = new Set(scope.jira.map((j) => j.key));
          return (
            <>
              <div className={css({ display: "flex", alignItems: "center", gap: "3", mt: "3", flexWrap: "wrap" })}>
                <Progress value={done} max={d.issues.length} label={m.sprint_sprint_progress()} />
                <span className={cx(css({ fontSize: "md", fontWeight: "semibold", whiteSpace: "nowrap" }), "tabular")}>
                  {done}/{d.issues.length} {m.sprint_done_2()} · {d.issues.length ? Math.round((done / d.issues.length) * 100) : 0} %
                </span>
                <Badge tone={daysLeft <= 1 ? "bad" : daysLeft <= 3 ? "warn" : "neutral"}>{daysLeft > 0 ? m.sprint_left({ count: daysLeft }) : m.sprint_last_day()}</Badge>
              </div>
              {d.sprint.goal && (
                <p className={css({ mt: "2.5", display: "flex", gap: "2", alignItems: "flex-start", color: "muted", fontSize: "sm" })}>
                  <Icon name="target" size={14} className={css({ mt: "2px", color: "accent" })} />
                  <span>
                    <strong className={css({ color: "text", fontWeight: "semibold" })}>{m.sprint_goal()}</strong> {d.sprint.goal}
                  </span>
                </p>
              )}
              {onBranch && <BranchIssues scope={scope} sprintKeys={new Set(d.issues.map((i) => i.key))} branche={branche} />}
              {onBranch && scope.loading ? (
                <Skeleton h={70} />
              ) : (
              <div className={cols3}>
                {CATEGORY().map(([cat, label]) => {
                  const items = d.issues.filter((i) => i.category === cat && (!onBranch || branchKeys.has(i.key)));
                  return (
                    <div key={cat}>
                      <H3>
                        {label} <Count>{items.length}</Count>
                      </H3>
                      {items.length ? (
                        <List>
                          {items.map((i) => (
                            <li key={i.key}>
                              <Item href={i.url}>
                                <ItemTitle>{i.summary}</ItemTitle>
                                <ItemMeta>
                                  <span>{i.key}</span>
                                  <span>· {i.type}</span>
                                  <Badge tone={tone(i.category)}>{i.status}</Badge>
                                  {i.priority && i.priority !== "Unqualified" && <Badge>{i.priority}</Badge>}
                                </ItemMeta>
                                {(prsOfKey.get(i.key)?.length ?? 0) > 0 && (
                                  <ItemMeta>
                                    PR : <PrChips prs={prsOfKey.get(i.key)!} />
                                  </ItemMeta>
                                )}
                              </Item>
                            </li>
                          ))}
                        </List>
                      ) : (
                        <Empty>{m.sprint_no_tickets()}</Empty>
                      )}
                    </div>
                  );
                })}
              </div>
              )}
            </>
          );
        }}
      </SourceView>
    </Card>
  );
}

// Bandeau du filtre « Ma branche » : branche, nombre de tickets du sprint, et tickets cités hors du sprint (lien Jira)
function BranchIssues({ scope, sprintKeys, branche }: { scope: ReturnType<typeof useBranchScope>; sprintKeys: Set<string>; branche?: string }) {
  const inSprint = scope.jira.filter((j) => sprintKeys.has(j.key));
  const outside = scope.jira.filter((j) => !sprintKeys.has(j.key));
  return (
    <BranchFilterBar branch={scope.branch?.branch ?? branche}>
      {scope.failed ? (
        <span className={css({ color: "muted" })}>{m.sprint_branch_unreadable_tracked_project()}</span>
      ) : (
        !scope.loading && (
          <>
            <Count>{plural(inSprint.length, "ticket")}</Count>
            {scope.jira.length === 0 && <span className={css({ color: "muted" })}>{m.sprint_no_jira_ticket_branch_name()}</span>}
            {outside.length > 0 && (
              <span className={css({ display: "inline-flex", gap: "1.5", alignItems: "center", flexWrap: "wrap", color: "muted" })}>
                {m.sprint_outside_sprint()}
                {outside.map((j) => (
                  <ExtLink key={j.key} href={j.url} tone="info">
                    {j.key}
                  </ExtLink>
                ))}
              </span>
            )}
          </>
        )
      )}
    </BranchFilterBar>
  );
}
