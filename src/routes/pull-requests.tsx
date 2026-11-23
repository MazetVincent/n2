import { Link, createFileRoute } from "@tanstack/react-router";
import { Collapsible } from "@ark-ui/react/collapsible";
import { css } from "styled-system/css";
import { JiraChips } from "~/components/links";
import { z } from "zod";
import { Badge, Card, Count, Empty, ExtLink, H3, Item, ItemMeta, ItemTitle, List, Skeleton, SourceView, cols3, type Tone } from "~/components/ds";
import { useBranchFilter } from "~/features/branches/filter";
import { BranchFilterBar, useBranchScope } from "~/features/branches/scope";
import { GuideForFiles, GuideReflexLinks } from "~/features/guide/GuideLinks";
import { deployStateOf, fromOpenPr, prStatusBadges } from "~/features/prs/status";
import { ok, useDeploy, useOpenPrs, usePullRequests, useSprint } from "~/lib/data";
import { ago } from "~/lib/format";
import { m } from "~/lib/i18n";
import type { JiraIssue, PullRequest } from "~/server/types";

// ?pr=1540&repo=org/depot : une seule PR (lien depuis l'onglet Librairies) ; ?lib= : la librairie qu'elle met à jour
// Interrupteur « Ma branche » allumé (barre du haut) : les PR de la branche choisie (?branche=, la branche actuelle par défaut)
const search = z.object({
  pr: z.number().int().positive().optional(),
  repo: z.string().max(200).optional(),
  lib: z.string().max(214).optional(),
});
export const Route = createFileRoute("/pull-requests")({ validateSearch: search, component: PrsPage });
const MY_REVIEW = (): Record<string, [string, Tone]> => ({
  CHANGES_REQUESTED: [m.prs_requested_changes(), "bad"],
  COMMENTED: [m.prs_commented(), "info"],
  DISMISSED: [m.prs_review_was_dismissed(), "neutral"],
});

function PrsPage() {
  const { pr, repo, lib, branche } = Route.useSearch();
  const q = usePullRequests();
  const sprint = ok(useSprint());
  const issues = new Map((sprint?.issues ?? []).map((i) => [i.key, i]));
  const filtered = useBranchFilter();
  // une PR demandée par un lien passe avant le filtre
  const onBranch = !pr && filtered;
  return (
    <div className={css({ display: "flex", flexDirection: "column", gap: "3" })}>
    <GuideReflexLinks tab="prs" />
    <Card
      title="Pull requests"
      meta={q.data?.ok && <ExtLink href={q.data.data.searchUrl}>@{q.data.data.me} ↗</ExtLink>}
    >
      {pr ? (
        <OnePr number={pr} repo={repo} lib={lib} issues={issues} />
      ) : onBranch ? (
        <BranchPrs branche={branche} issues={issues} />
      ) : (
        <AllPrs q={q} issues={issues} />
      )}
    </Card>
    </div>
  );
}

// Filtre « Ma branche » : les PR dont la branche est celle choisie (mes listes et toutes les PR ouvertes des dépôts suivis)
function BranchPrs({ branche, issues }: { branche?: string; issues: Map<string, JiraIssue> }) {
  const scope = useBranchScope(branche);
  const open = scope.prs.filter((p) => p.state === "OPEN");
  const done = scope.prs.filter((p) => p.state !== "OPEN");
  return (
    <>
      <BranchFilterBar branch={scope.branch?.branch ?? branche}>
        {!scope.loading && <Count>{scope.prs.length} PR</Count>}
      </BranchFilterBar>
      {scope.loading ? (
        <Skeleton h={70} />
      ) : scope.failed ? (
        <Empty>{m.prs_unable_read_branch_tracked_project()}</Empty>
      ) : scope.prs.length ? (
        <>
          {open.length > 0 && (
            <>
              <H3>
                {m.prs_open()} <Count>{open.length}</Count>
              </H3>
              <div className={cols3}>
                {open.map((p) => (
                  <PrItem key={p.url} pr={p} showAuthor issues={issues} />
                ))}
              </div>
            </>
          )}
          {done.length > 0 && (
            <>
              <H3>
                {m.prs_closed_merged()} <Count>{done.length}</Count>
              </H3>
              <div className={cols3}>
                {done.map((p) => (
                  <PrItem key={p.url} pr={p} showAuthor issues={issues} />
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <Empty>{m.prs_no_pr_branch({ branch: scope.branch?.branch ?? "" })}</Empty>
      )}
      {scope.branch && <BranchGuide files={scope.branch.files.map((f) => f.file)} />}
    </>
  );
}

// Sections du guide qui parlent des fichiers modifiés par la branche : à relire avant d'écrire ou de relire la PR
export function BranchGuide({ files }: { files: string[] }) {
  return <GuideForFiles files={files} max={5} title={<H3>{m.common_read_guide()}</H3>} />;
}

const samePr = (number: number, repo: string | undefined) => (p: { number: number; repo: string }) => p.number === number && (!repo || p.repo === repo);

// Filtre sur une PR : celle des listes de la page si elle y est, sinon celle des PR ouvertes du dépôt (robots compris)
function OnePr({ number, repo, lib, issues }: { number: number; repo?: string; lib?: string; issues: Map<string, JiraIssue> }) {
  const mine = ok(usePullRequests());
  const openQ = useOpenPrs(true);
  const open = ok(openQ);
  const lists = mine ? [...mine.reviewRequested, ...mine.mine, ...mine.approved, ...mine.commented] : [];
  const found = lists.find(samePr(number, repo)) ?? (open ? open.filter(samePr(number, repo)).map(fromOpenPr)[0] : undefined);
  const loading = !found && (openQ.isPending || !mine);
  return (
    <div className={css({ display: "flex", flexDirection: "column", gap: "3", mt: "1.5" })}>
      <div className={css({ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "2", px: "3", py: "2", borderRadius: "lg", bg: "accent.soft", fontSize: "md" })}>
        <span>
          {m.prs_filtered_pr()} <strong>#{number}</strong>
          {lib && <> · {m.prs_update()} <strong>{lib}</strong></>}
        </span>
        <Link to="/pull-requests" search={{}} className={css({ ml: "auto", fontSize: "sm", fontWeight: "semibold" })}>
          {m.prs_show_all_prs()}
        </Link>
      </div>
      {found ? (
        <div className={css({ maxW: "640px" })}>
          <PrItem pr={found} showAuthor issues={issues} />
        </div>
      ) : loading ? (
        <Skeleton h={70} />
      ) : (
        <Empty>
          {m.prs_pr_no_longer_among_open()}{" "}
          {repo && <ExtLink href={`https://github.com/${repo}/pull/${number}`}>{m.prs_view_github()}</ExtLink>}
        </Empty>
      )}
    </div>
  );
}

function AllPrs({ q, issues }: { q: ReturnType<typeof usePullRequests>; issues: Map<string, JiraIssue> }) {
  return (
      <SourceView query={q}>
        {(d) => (
          <>
            {d.reviewRequested.length > 0 && (
              <>
                <H3>
                  {m.prs_review_requests()} <Count>{d.reviewRequested.length}</Count>
                </H3>
                <div className={cols3}>
                  {d.reviewRequested.map((p) => (
                    <PrItem key={p.url} pr={p} showAuthor issues={issues} />
                  ))}
                </div>
              </>
            )}
            <div className={cols3}>
              <PrColumn title={m.common_my_prs()} prs={d.mine} issues={issues} />
              <PrColumn title={m.prs_approved_by_me()} prs={d.approved} showAuthor issues={issues} />
              <PrColumn title={m.prs_commented_reviewed()} prs={d.commented} showAuthor issues={issues} />
            </div>
          </>
        )}
      </SourceView>
  );
}

function PrColumn({ title, prs, showAuthor = false, issues }: { title: string; prs: PullRequest[]; showAuthor?: boolean; issues: Map<string, JiraIssue> }) {
  const open = prs.filter((p) => p.state === "OPEN");
  const done = prs.filter((p) => p.state !== "OPEN");
  return (
    <div>
      <H3>
        {title} <Count>{m.prs_open_count({ count: open.length })}</Count>
      </H3>
      {open.length ? (
        <List>
          {open.map((p) => (
            <li key={p.url}>
              <PrItem pr={p} showAuthor={showAuthor} issues={issues} />
            </li>
          ))}
        </List>
      ) : (
        <Empty>{m.prs_no_open_prs()}</Empty>
      )}
      {done.length > 0 && (
        <Collapsible.Root>
          <Collapsible.Trigger className={css({ bg: "transparent", border: "none", p: 0, mt: "3", cursor: "pointer", color: "muted", fontSize: "sm", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: "bold", display: "flex", gap: "1.5", alignItems: "center" })}>
            <Collapsible.Indicator className={css({ transition: "transform 0.15s", _open: { transform: "rotate(90deg)" } })}>▸</Collapsible.Indicator>
            {m.prs_recently_closed()} <Count>{done.length}</Count>
          </Collapsible.Trigger>
          <Collapsible.Content className={css({ mt: "1.5" })}>
            <List>
              {done.map((p) => (
                <li key={p.url}>
                  <PrItem pr={p} showAuthor={showAuthor} issues={issues} />
                </li>
              ))}
            </List>
          </Collapsible.Content>
        </Collapsible.Root>
      )}
    </div>
  );
}

export function PrItem({ pr, showAuthor = false, issues }: { pr: PullRequest; showAuthor?: boolean; issues: Map<string, JiraIssue> }) {
  const deploy = ok(useDeploy());
  const badges = prStatusBadges(pr, deployStateOf(pr, deploy));
  if (showAuthor && pr.myReview && MY_REVIEW()[pr.myReview]) badges.push(MY_REVIEW()[pr.myReview]);
  return (
    <Item href={pr.url}>
      <ItemTitle>{pr.title}</ItemTitle>
      <ItemMeta>
        <span>#{pr.number}</span>
        {showAuthor && <span>· {pr.author}</span>}
        <span>· {ago(pr.updatedAt)}</span>
      </ItemMeta>
      <ItemMeta>
        {badges.map(([t, tone]) => (
          <Badge key={t} tone={tone}>
            {t}
          </Badge>
        ))}
        <JiraChips pr={pr} issues={issues} />
      </ItemMeta>
    </Item>
  );
}
