import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { css, cx } from "styled-system/css";
import { z } from "zod";
import { button, Badge, Card, Empty, ErrorBox, FitScroll, Icon, Segmented, Skeleton, Tabs, type Tone } from "~/components/ds";
import { useBranchFilter } from "~/features/branches/filter";
import { BranchFilterBar } from "~/features/branches/scope";
import { guideSettings } from "~/features/guide/embed";
import { GuideLink, GuideMatches } from "~/features/guide/GuideLinks";
import { freshnessMarkdown, guideTarget, isGuideTarget, pageTitle, sectionsForFiles, text } from "~/features/guide/logic";
import { openInIde, toaster } from "~/lib/actions";
import { useEditorName } from "~/features/prefs/useEditorName";
import { ok, useBranch, useGuide, useGuideFreshness, usePreferences } from "~/lib/data";
import { nf, plural } from "~/lib/format";
import { getLang, m } from "~/lib/i18n";
import { useThemeChoice } from "~/features/theme/theme";
import type { GuideFreshness, GuideIndex, GuideRefState, GuideStaleRef } from "~/server/types";

// Guide de l'équipe : son fichier HTML, affiché dans N2.
// ?p=guide/page-a/section-1 : section à ouvrir ; ?vue=a-revoir : passages de code cités qui ont changé.
// ?filtre=modifies|deplaces|introuvables : filtre des passages à revoir (tous par défaut)
const FILTER_PARAM = { changed: "modifies", gone: "deplaces", missing: "introuvables" } as const;
const search = z.object({
  p: z.string().max(200).refine(isGuideTarget).optional().catch(undefined),
  vue: z.enum(["a-revoir"]).optional().catch(undefined),
  filtre: z.enum(["modifies", "deplaces", "introuvables"]).optional().catch(undefined),
});
export const Route = createFileRoute("/guide")({ validateSearch: search, component: GuidePage });

function GuidePage() {
  const { p, vue } = Route.useSearch();
  const navigate = Route.useNavigate();
  const q = useGuide();
  const g = ok(q);
  const fresh = ok(useGuideFreshness(vue === "a-revoir" || !!g));
  const toReview = fresh?.sections.reduce((n, s) => n + s.refs.length, 0);

  return (
    <Tabs
      label={m.guide_guide_view()}
      value={vue ?? "read"}
      onChange={(v) => navigate({ search: (s) => ({ ...s, vue: v === "a-revoir" ? "a-revoir" : undefined, filtre: v === "a-revoir" ? s.filtre : undefined }), replace: true })}
      items={[
        { value: "read", label: m.guide_read() },
        { value: "a-revoir", label: m.guide_passages_review(), count: toReview },
      ]}
      aside={
        <>
          {g && (
            <span className={css({ fontSize: "sm", color: "muted" })}>
              {[
                g.revisedAt && m.guide_revised({ revisedAt: g.revisedAt }),
                plural(g.sections.length, "section"),
                m.guide_terms({ terms: nf.format(g.terms.length) }),
                m.guide_searchable_k(),
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
          <a
            href={`/guide-html${p ? `#/${p}` : ""}`}
            target="_blank"
            rel="noreferrer"
            className={css({ display: "inline-flex", alignItems: "center", gap: "1.5", fontSize: "sm", color: "info", textDecoration: "none", _hover: { textDecoration: "underline" } })}
          >
            {m.guide_open_tab()} <Icon name="external" size={13} />
          </a>
        </>
      }
    >
      <div className={css({ mt: "3", display: "flex", flexDirection: "column", gap: "3" })}>
        {q.data && !q.data.ok && <ErrorBox error={q.data.error} />}
        {g?.warnings.length ? (
          <p className={css({ fontSize: "sm", color: "warn" })}>
            {m.guide_guide_partly_read_new_format()}
            {g.warnings.join(" ")}
          </p>
        ) : null}
        <BranchSections />
        {vue === "a-revoir" ? g ? <Freshness guide={g} /> : <Skeleton h={200} /> : (!q.data || q.data.ok) && <GuideFrame target={p} />}
      </div>
    </Tabs>
  );
}

// Interrupteur « Ma branche » allumé : les sections du guide qui parlent des fichiers modifiés par la branche, à relire
function BranchSections() {
  const { branche } = Route.useSearch();
  const filtered = useBranchFilter();
  const q = useBranch(branche, filtered);
  const b = ok(q);
  const guide = ok(useGuide());
  const matches = useMemo(() => (filtered && b ? sectionsForFiles(guide, b.files.map((f) => f.file)) : []), [filtered, b, guide]);
  if (!filtered) return null;
  return (
    <div>
      <BranchFilterBar branch={b?.branch ?? branche} />
      <div className={css({ mt: "2.5", px: "1" })}>
        {q.isPending ? (
          <Skeleton h={40} />
        ) : matches.length ? (
          <GuideMatches matches={matches} max={6} showFiles />
        ) : (
          b && <p className={css({ fontSize: "sm", color: "muted" })}>{m.guide_branch_none()}</p>
        )}
      </div>
    </div>
  );
}

// Le guide dans un cadre isolé (voir src/routes/guide-html.ts). Chaque lien de N2 vers le guide y ouvre la section,
// même si on a navigué dans le guide entre-temps (d'où la clé de navigation). Le guide reçoit les réglages de N2 à
// son chargement : il est rechargé quand ils changent dans les préférences (thème compris). Le guide (autre origine) ne dit pas où
// on en était : après ce rechargement, il rouvre la section demandée par N2 (?p), ou son accueil.
function GuideFrame({ target }: { target?: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const navKey = useRouterState({ select: (s) => s.location.state.__TSR_key });
  const prefs = usePreferences().data;
  const theme = useThemeChoice();
  const settings = prefs?.ok ? JSON.stringify(guideSettings(prefs.data, getLang(), theme)) : undefined;
  // version de la page : un changement d'adresse limité au « # » ne recharge pas le guide, ce paramètre si
  const [version, setVersion] = useState(0);
  const lastSettings = useRef(settings);
  useEffect(() => {
    // préférences arrivées après le cadre : la page du guide a déjà été remplie avec elles
    if (lastSettings.current !== undefined && settings !== undefined && settings !== lastSettings.current) setVersion((v) => v + 1);
    if (settings !== undefined) lastSettings.current = settings;
  }, [settings]);
  const url = `/guide-html${version ? `?v=${version}` : ""}${target ? `#/${target}` : ""}`;
  // adresse du premier chargement ; les suivantes passent par l'effet (sinon le cadre serait chargé deux fois)
  const [initialUrl] = useState(url);
  const loaded = useRef({ url, navKey });
  useEffect(() => {
    if (url === loaded.current.url && navKey === loaded.current.navKey) return;
    loaded.current = { url, navKey };
    if (ref.current) ref.current.src = url;
  }, [url, navKey]);
  return (
    <iframe
      ref={ref}
      src={initialUrl}
      title={m.common_team_guide()}
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      className={css({ w: "full", h: "calc(100dvh - 180px)", minH: "480px", border: "1px solid token(colors.border)", borderRadius: "xl", bg: "surface", display: "block" })}
    />
  );
}

// ---------- Passages à revoir : le code cité a changé depuis la révision du guide ----------
type Filter = "all" | "changed" | "gone" | "missing";
const inFilter = (f: Filter, s: GuideRefState) => f === "all" || (f === "changed" && s === "changed") || (f === "gone" && (s === "moved" || s === "deleted")) || (f === "missing" && s === "missing");

const STATE: Record<GuideRefState, { tone: Tone; label: () => string; help: () => string }> = {
  changed: { tone: "warn", label: () => m.guide_changed(), help: () => m.guide_cited_lines_changed_since_guide() },
  moved: { tone: "info", label: () => m.guide_moved(), help: () => m.guide_file_was_renamed_or_moved() },
  deleted: { tone: "bad", label: () => m.guide_deleted(), help: () => m.guide_file_no_longer_exists() },
  missing: { tone: "neutral", label: () => m.guide_not_found(), help: () => m.guide_path_exists_neither_at_guide() },
};

function Freshness({ guide }: { guide: GuideIndex }) {
  const q = useGuideFreshness();
  // filtre gardé dans l'adresse : le bouton retour le retrouve
  const { filtre } = Route.useSearch();
  const navigate = Route.useNavigate();
  const filter: Filter = (Object.keys(FILTER_PARAM) as (keyof typeof FILTER_PARAM)[]).find((k) => FILTER_PARAM[k] === filtre) ?? "all";
  const setFilter = (f: Filter) => navigate({ search: (s) => ({ ...s, filtre: f === "all" ? undefined : FILTER_PARAM[f] }), replace: true, resetScroll: false });
  const f = ok(q);
  const lang = getLang();
  const filtered: GuideFreshness | undefined = useMemo(
    () => f && { ...f, sections: f.sections.map((s) => ({ ...s, refs: s.refs.filter((r) => inFilter(filter, r.state)) })).filter((s) => s.refs.length) },
    [f, filter],
  );
  const count = (fl: Filter) => f?.sections.reduce((n, s) => n + s.refs.filter((r) => inFilter(fl, r.state)).length, 0) ?? 0;

  const copy = async () => {
    if (!filtered) return;
    try {
      await navigator.clipboard.writeText(freshnessMarkdown(guide, filtered, lang));
      toaster.create({ title: m.guide_list_copied_markdown(), description: m.guide_ready_paste_into_slack_or(), type: "success" });
    } catch {
      toaster.create({ title: m.guide_could_not_copy(), type: "error" });
    }
  };

  return (
    <Card
      title={m.guide_guide_passages_review()}
      meta={
        f &&
        m.guide_cited_code_compared_between_guide({ base: f.base, target: f.target, commits: m.common_commits_count({ count: f.commits }) })
      }
    >
      {q.isPending && <Skeleton h={160} />}
      {q.data && !q.data.ok && <ErrorBox error={q.data.error} />}
      {filtered && (
        <>
          {/* les filtres sur leur propre ligne, sous l'en-tête : ils passent à la ligne en fenêtre étroite */}
          <Segmented
            label={m.guide_filter_passages()}
            value={filter}
            onChange={setFilter}
            className={css({ mt: "3" })}
            items={[
              { value: "all", label: m.guide_all(), count: count("all") },
              { value: "changed", label: m.guide_lines_changed(), count: count("changed") },
              { value: "gone", label: m.guide_moved_deleted(), count: count("gone") },
              { value: "missing", label: m.guide_not_found_2(), count: count("missing") },
            ]}
          />
          <div className={css({ display: "flex", alignItems: "center", gap: "3", flexWrap: "wrap", mt: "3" })}>
            <p className={css({ fontSize: "md", flex: 1, minW: "240px" })}>
              {m.guide_passages_review_sections_out_citations({ passages: m.guide_passages_count({ count: count("all") }), sections: m.guide_sections_count({ count: f!.sections.length }), checkedRefs: nf.format(f!.checkedRefs) })}
            </p>
            <button type="button" onClick={copy} disabled={!filtered.sections.length} className={btn}>
              {m.guide_copy_list_guide_s_author()}
            </button>
          </div>
          {filtered.sections.length ? (
            // la liste défile dans la carte, qui tient dans l'écran ; filtres et résumé restent visibles au-dessus
            <FitScroll bottom={48} min={260} className={css({ mt: "3", pr: "1" })}>
              <ul className={css({ listStyle: "none", p: 0, m: 0, display: "flex", flexDirection: "column", gap: "2.5" })}>
                {filtered.sections.map((s) => {
                  const sec = guide.sections.find((x) => x.page === s.page && x.id === s.id);
                  const target = guideTarget(s.page, s.id);
                  return (
                    <li key={target} className={css({ borderTop: "1px solid token(colors.border)", pt: "2.5" })}>
                      <div className={css({ fontSize: "md", fontWeight: "semibold" })}>
                        <GuideLink target={target}>{sec ? text(sec.title, lang) : target}</GuideLink>
                        <span className={css({ color: "muted", fontWeight: "normal", fontSize: "sm" })}> · {pageTitle(guide, s.page, lang)}</span>
                      </div>
                      <ul className={css({ listStyle: "none", p: 0, m: 0, mt: "1", display: "flex", flexDirection: "column", gap: "1" })}>
                        {s.refs.map((r, i) => (
                          <RefRow key={i} r={r} />
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            </FitScroll>
          ) : (
            <Empty>{m.guide_nothing_review_cited_code_hasn()}</Empty>
          )}
        </>
      )}
    </Card>
  );
}

function RefRow({ r }: { r: GuideStaleRef }) {
  const editor = useEditorName();
  const st = STATE[r.state];
  const where = r.from ? `${r.path}:${r.from}${r.to && r.to !== r.from ? `-${r.to}` : ""}` : r.path;
  const openable = r.state === "changed" || r.state === "moved";
  return (
    <li className={css({ display: "flex", alignItems: "center", gap: "2", fontSize: "sm", minW: 0 })}>
      <Badge tone={st.tone} title={st.help()}>
        {st.label()}
      </Badge>
      <span className={cx(css({ flex: 1, minW: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }), mono)} title={where}>
        {where}
        {r.state === "moved" && r.movedTo && <span className={css({ color: "muted" })}> → {r.movedTo}</span>}
        {r.state === "changed" && (
          <span className={css({ color: "muted" })}>
            {" "}
            · +{r.added} −{r.removed}
          </span>
        )}
      </span>
      {openable && (
        <button type="button" className={btn} onClick={() => openInIde(r.movedTo ?? r.path, r.from ?? 1)} title={m.guide_open_current_version_in({ editor })}>
          {editor}
        </button>
      )}
    </li>
  );
}

const mono = css({ fontFamily: "mono" });
const btn = button({ size: "xs" });
