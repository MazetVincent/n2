import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { css } from "styled-system/css";
import { JiraChips, PrChips, statusTone } from "~/components/links";
import { z } from "zod";
import { Badge, Card, Count, LIST_MAX_H, Empty, ExtLink, H3, Icon, Item, ItemMeta, ItemTitle, List, Segmented, Skeleton, SourceView, type Tone } from "~/components/ds";
import { GuideForFiles } from "~/features/guide/GuideLinks";
import { setBranchFilter } from "~/features/branches/filter";
import { BranchTabLink, useBranchScope } from "~/features/branches/scope";
import { deployStateOf, prStatusBadges } from "~/features/prs/status";
import { branchSlug } from "~/features/deploy/slug";
import { statusBadge } from "~/features/deploy/ui";
import { BranchPicker } from "~/features/branches/BranchPicker";
import { CalendarCard } from "~/features/calendar/CalendarCard";
import { SlackCard } from "~/features/slack/SlackCard";
import { ActivityCard } from "~/features/activity/ActivityCard";
import { prsByJiraKey, type TodoItem, type Urgency } from "~/features/todo/logic";
import { HiddenTodos, SnoozeMenu } from "~/features/todo/SnoozeMenu";
import { useTodo } from "~/features/todo/useTodo";
import { ok, useBranch, useCi, useDeploy, usePullRequests, useSprint } from "~/lib/data";
import { ciBadge } from "~/features/deploy/CiCard";
import { ago, plural } from "~/lib/format";
import { m, trPart } from "~/lib/i18n";

// Dashboard, grille en deux colonnes égales : « Ma branche » sur toute la largeur,
// puis « À faire » | GitHub · Jira, puis Agenda | Slack. Chaque carte se replie (retenu dans le navigateur) ;
// les listes ont une hauteur maximale et défilent dans leur carte.
// ?vue=surveiller : onglet « À surveiller » (« À traiter maintenant » par défaut)
// ?agenda=semaine : agenda de la semaine (la journée par défaut)
// ?slack=mentions|salons : vue de la carte Slack (messages directs par défaut)
// ?activite=github|jira : vue de la carte GitHub · Jira (tout par défaut)
// ?branche=… (déclaré sur la route racine, gardé sur tous les onglets) : branche affichée dans « Ma branche »
const search = z.object({ vue: z.enum(["surveiller"]).optional(), agenda: z.enum(["semaine"]).optional(), slack: z.enum(["mentions", "salons"]).optional(), activite: z.enum(["github", "jira"]).optional() });
export const Route = createFileRoute("/dashboard")({ validateSearch: search, component: TodoPage });

const GROUPS = (): [Urgency, string, Tone][] => [
  ["now", m.dashboard_act_now(), "bad"],
  ["watch", m.dashboard_keep_eye(), "warn"],
  ["info", m.dashboard_good_know(), "info"],
];
// deux onglets : l'urgent, et le reste (à surveiller, puis bon à savoir en bas)
const TABS = [
  { value: "now", label: m.dashboard_tab_now, urgencies: ["now"], empty: m.dashboard_empty_now },
  { value: "watch", label: m.dashboard_tab_watch, urgencies: ["watch", "info"], empty: m.dashboard_empty_watch },
] as const;

function TodoPage() {
  const prs = ok(usePullRequests());
  const sprint = ok(useSprint());
  // sans les éléments reportés ou ignorés (listés en bas de la carte)
  const { items, hidden, loading } = useTodo();
  const issues = new Map((sprint?.issues ?? []).map((i) => [i.key, i]));
  const prsOfKey = prsByJiraKey(prs);
  const { vue } = Route.useSearch();
  const navigate = Route.useNavigate();
  const tab = TABS.find((t) => t.value === (vue === "surveiller" ? "watch" : "now"))!;
  const countOf = (t: (typeof TABS)[number]) => items.filter((i) => (t.urgencies as readonly Urgency[]).includes(i.urgency)).length;

  return (
    <div className={css({ display: "grid", gridTemplateColumns: { base: "1fr", lg: "repeat(2, minmax(0, 1fr))" }, gap: "4", alignItems: "start" })}>
      <div className={css({ lg: { gridColumn: "1 / -1" }, minW: 0 })}>
        <MyBranch />
      </div>
      <Card
        collapse="todo"
        scroll={LIST_MAX_H}
        title={<>{m.common_do()} {items.length > 0 && <Count>{items.length}</Count>}</>}
        controls={
          <Segmented
            label={m.dashboard_urgency()}
            value={tab.value}
            onChange={(v) => navigate({ search: (s) => ({ ...s, vue: v === "watch" ? "surveiller" : undefined }), replace: true })}
            items={TABS.map((t) => ({ value: t.value, label: t.label(), count: loading ? undefined : countOf(t) }))}
          />
        }
      >
        {loading && <Skeleton />}
        {!loading && countOf(tab) === 0 && (
          <div className={css({ display: "flex", alignItems: "center", gap: "3", py: "6", justifyContent: "center", color: "muted" })}>
            <span className={css({ display: "grid", placeItems: "center", w: "32px", h: "32px", borderRadius: "full", bg: "ok.soft", color: "ok" })}>
              <Icon name="check" size={18} />
            </span>
            <span>{items.length === 0 ? m.dashboard_nothing_urgent_everything_up_date() : tab.empty()}</span>
          </div>
        )}
        {GROUPS().filter(([u]) => (tab.urgencies as readonly Urgency[]).includes(u)).map(([urgency, label, tone]) => {
          const group = items.filter((i) => i.urgency === urgency);
          if (!group.length) return null;
          return (
            <div key={urgency} className={css({ mt: "3" })}>
              {/* le premier groupe porte le nom de l'onglet : seul « Bon à savoir » a son propre titre */}
              {urgency !== tab.urgencies[0] && (
                <H3>
                  <span aria-hidden className={css({ w: "8px", h: "8px", borderRadius: "full" })} style={{ background: `var(--colors-${tone})` }} />
                  {label} <Count>{group.length}</Count>
                </H3>
              )}
              <List>
                {group.map((item) => (
                  <li key={item.id}>
                    <TodoRow item={item} tone={tone} issues={issues} prsOfKey={prsOfKey} />
                  </li>
                ))}
              </List>
            </div>
          );
        })}
        <HiddenTodos hidden={hidden} />
      </Card>
      <Activity />
      <Calendar />
      <Slack />
    </div>
  );
}

function TodoRow({ item, tone, issues, prsOfKey }: { item: TodoItem; tone: Tone; issues: Map<string, import("~/server/types").JiraIssue>; prsOfKey: Map<string, import("~/server/types").PullRequest[]> }) {
  const navigate = useNavigate();
  const detail = item.detail?.split(/`([^`]+)`/).map((p, i) => (i % 2 ? <code key={i}>{p}</code> : p));
  return (
    <Item href={item.url} tone={tone} onSelect={item.to ? () => navigate({ to: item.to, search: item.search } as never) : undefined}>
      <ItemMeta>
        <Badge tone={tone}>{item.label}</Badge>
        <SnoozeMenu item={item} />
      </ItemMeta>
      <ItemTitle>{item.title}</ItemTitle>
      {detail && <ItemMeta>{detail}</ItemMeta>}
      {(item.pr?.jira.length || (item.issue && prsOfKey.get(item.issue.key)?.length)) && (
        <ItemMeta>
          {item.pr && <JiraChips pr={item.pr} issues={issues} />}
          {item.issue && <PrChips prs={prsOfKey.get(item.issue.key) ?? []} />}
        </ItemMeta>
      )}
    </Item>
  );
}

function Slack() {
  const { slack } = Route.useSearch();
  const navigate = Route.useNavigate();
  const view = slack === "mentions" ? "mentions" : slack === "salons" ? "channels" : "dm";
  return (
    <SlackCard
      view={view}
      onViewChange={(v) => navigate({ search: (s) => ({ ...s, slack: v === "mentions" ? "mentions" : v === "channels" ? "salons" : undefined }), replace: true, resetScroll: false })}
    />
  );
}

function Activity() {
  const { activite } = Route.useSearch();
  const navigate = Route.useNavigate();
  return <ActivityCard view={activite ?? "all"} onViewChange={(v) => navigate({ search: (s) => ({ ...s, activite: v === "all" ? undefined : v }), replace: true, resetScroll: false })} />;
}

function Calendar() {
  const { agenda } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <CalendarCard
      view={agenda === "semaine" ? "week" : "day"}
      onViewChange={(v) => navigate({ search: (s) => ({ ...s, agenda: v === "week" ? "semaine" : undefined }), replace: true, resetScroll: false })}
    />
  );
}

// Ma branche dans le projet : fichiers modifiés et parties touchées (lien vers la carte).
// Le nom de la branche ouvre le sélecteur ; le choix est gardé dans l'URL (?branche=), Précédent y revient.
// C'est le même choix que le tag de la barre du haut : les deux restent synchronisés. Ici, pas de filtre : la carte montre tout.
function MyBranch() {
  const { branche } = Route.useSearch();
  const navigate = Route.useNavigate();
  const q = useBranch(branche);
  return (
    <Card collapse="branch" title={m.common_my_branch()} meta={
        <Link to="/carte" onClick={() => setBranchFilter(true)}>
          {m.dashboard_view_map()}
        </Link>
      }>
      <p className={css({ mt: "3", display: "flex", gap: "2", flexWrap: "wrap", alignItems: "center" })}>
        <BranchPicker value={branche} onChange={(b) => navigate({ search: (s) => ({ ...s, branche: b }), resetScroll: false })} />
        {q.data?.ok && (
          <span className={css({ color: "muted", fontSize: "sm" })}>
            {m.common_since()} {q.data.data.base} · {plural(q.data.data.ahead, "commit")} ·{" "}
            {plural(q.data.data.files.length, m.common_changed_file(), m.common_changed_files())}
            {!q.data.data.isCurrent && ` · ${m.dashboard_no_checkout()}`}
          </span>
        )}
      </p>
      <SourceView query={q} skeletons={1}>
        {(b) => (
          // pleine largeur : PR, tickets et environnement à gauche ; guide à relire puis parties touchées à droite
          <div className={css({ display: "grid", gridTemplateColumns: { base: "1fr", lg: "minmax(0, 3fr) minmax(0, 2fr)" }, columnGap: "6", alignItems: "start" })}>
            <div className={css({ minW: 0 })}>
              <BranchCi branch={b.branch} />
              <BranchEnv branch={b.branch} />
              <BranchLinks branche={branche} />
            </div>
            <div className={css({ minW: 0 })}>
              <GuideForFiles files={b.files.map((f) => f.file)} max={4} title={<H3>{m.common_read_guide()}</H3>} />
              <H3>{m.dashboard_affected_parts()}</H3>
              {Object.keys(b.nodes).length > 0 ? (
                <List>
                  {Object.entries(b.nodes)
                    .sort((x, y) => y[1] - x[1])
                    .map(([node, n]) => (
                      <li key={node} className={css({ display: "flex", justifyContent: "space-between", fontSize: "md" })}>
                        <Link to="/carte" search={{ node, branche }} className={css({ color: "inherit" })}>
                          {trPart(node)}
                        </Link>
                        <span className={css({ color: "muted" })}>{plural(n, m.common_file())}</span>
                      </li>
                    ))}
                </List>
              ) : (
                <Empty>{m.dashboard_no_changes_compared({ base: b.base })}</Empty>
              )}
            </div>
          </div>
        )}
      </SourceView>
    </Card>
  );
}

// CI GitHub de la branche : un résumé, chaque workflow en échec ou en cours, lien vers Déploiements (détail)
function BranchCi({ branch }: { branch: string }) {
  const ci = ok(useCi(branch));
  // la branche principale elle-même : sa CI est dans Déploiements
  const b = ci?.branch;
  if (!b || b.state === "none") return null;
  const shown = b.workflows.filter((w) => w.conclusion === "failure" || w.status === "running");
  return (
    <>
      <H3>
        {m.ci_title()}
        <Link to="/deploiements" className={css({ ml: "auto", textTransform: "none", letterSpacing: "normal", fontWeight: "semibold" })}>
          {m.dashboard_deployments()}
        </Link>
      </H3>
      <p className={css({ display: "flex", alignItems: "center", gap: "2", flexWrap: "wrap", fontSize: "md" })}>
        {shown.length ? (
          shown.map((w) => {
            const [label, tone] = ciBadge(w);
            return (
              <ExtLink key={w.name} href={w.url} className={css({ display: "inline-flex", gap: "1.5", alignItems: "center" })}>
                <Badge tone={tone}>{label}</Badge> {w.name}
              </ExtLink>
            );
          })
        ) : (
          <>
            <Badge tone="ok">{m.ci_success()}</Badge>
            <span className={css({ color: "muted", fontSize: "sm" })}>{m.ci_workflows_ok({ count: b.workflows.length })}</span>
          </>
        )}
      </p>
    </>
  );
}

// Environnement de la branche (pipeline « <deploy.pipelinePrefix><ticket>-pipeline »), s'il existe
function BranchEnv({ branch }: { branch: string }) {
  const deploy = ok(useDeploy());
  const env = deploy?.envs.find((e) => e.slug === branchSlug(branch));
  if (!env) return null;
  const [label, tone] = statusBadge(env.last?.status ?? null);
  return (
    <>
      <H3>
        {m.dashboard_dynamic_environment()}
        <Link to="/deploiements" className={css({ ml: "auto", textTransform: "none", letterSpacing: "normal", fontWeight: "semibold" })}>
          {m.dashboard_deployments()}
        </Link>
      </H3>
      <p className={css({ display: "flex", alignItems: "center", gap: "2", flexWrap: "wrap", fontSize: "md" })}>
        <Badge tone={tone}>{label}</Badge>
        {env.last && <span className={css({ color: "muted", fontSize: "sm" })}>{ago(env.last.startedAt)}</span>}
        {env.url && (
          <ExtLink href={env.url} className={css({ ml: "auto" })}>
            {m.common_open()}
          </ExtLink>
        )}
        <ExtLink href={env.consoleUrl} className={env.url ? undefined : css({ ml: "auto" })}>{m.common_pipeline()}</ExtLink>
      </p>
    </>
  );
}

// PR de la branche et tickets Jira (nom de la branche, titres des PR), avec des liens vers les onglets filtrés sur elle
function BranchLinks({ branche }: { branche: string | undefined }) {
  const navigate = useNavigate();
  const deploy = ok(useDeploy());
  const sprint = ok(useSprint());
  const { prs, jira, loading } = useBranchScope(branche);
  const issues = new Map((sprint?.issues ?? []).map((i) => [i.key, i]));

  return (
    <>
      <H3>
        {prs.length > 1 ? m.dashboard_pull_requests() : m.dashboard_pull_request()}
        {prs.length > 0 && <BranchTabLink to="/pull-requests">{m.dashboard_pull_requests_2()}</BranchTabLink>}
      </H3>
      {loading ? (
        <Skeleton h={56} />
      ) : prs.length ? (
        <List>
          {prs.map((p) => (
            <li key={p.url}>
              <Item onSelect={() => navigate({ to: "/pull-requests", search: { pr: p.number, repo: p.repo } })}>
                <ItemTitle>{p.title}</ItemTitle>
                <ItemMeta>
                  <span>#{p.number}</span>
                  <span>· {p.author}</span>
                  <span>· {ago(p.updatedAt)}</span>
                  {prStatusBadges(p, deployStateOf(p, deploy)).map(([t, tone]) => (
                    <Badge key={t} tone={tone}>
                      {t}
                    </Badge>
                  ))}
                  <ExtLink href={p.url} className={css({ ml: "auto" })}>
                    GitHub ↗
                  </ExtLink>
                </ItemMeta>
              </Item>
            </li>
          ))}
        </List>
      ) : (
        <Empty>{m.dashboard_no_pr_branch()}</Empty>
      )}
      <H3>
        {jira.length > 1 ? m.dashboard_jira_tickets() : m.dashboard_jira_ticket()}
        {jira.some((j) => issues.has(j.key)) && <BranchTabLink to="/sprint">{m.dashboard_sprint()}</BranchTabLink>}
      </H3>
      {jira.length ? (
        <List>
          {jira.map((j) => {
            const issue = issues.get(j.key);
            return (
              <li key={j.key}>
                <Item href={issue?.url ?? j.url}>
                  <ItemMeta>
                    <Badge tone={issue ? statusTone(issue.category) : "info"}>{j.key}</Badge>
                    <span>{issue ? `${issue.status} · ${issue.type}` : m.dashboard_outside_current_sprint()}</span>
                    <span className={css({ ml: "auto" })}>Jira ↗</span>
                  </ItemMeta>
                  {issue && <ItemTitle>{issue.summary}</ItemTitle>}
                </Item>
              </li>
            );
          })}
        </List>
      ) : (
        <Empty>{m.dashboard_no_jira_ticket_branch_name()}</Empty>
      )}
    </>
  );
}
