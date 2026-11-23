// Librairies dans le panneau de la carte : fiche, exemples d'utilisation, librairie dans une partie, recherche d'une librairie.
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { cx } from "styled-system/css";
import { badge, button, ExtLink, Section, Skeleton } from "~/components/ds";
import { openInIde } from "~/lib/actions";
import { plural } from "~/lib/format";
import { m, msg, trPart } from "~/lib/i18n";
import { getExamples, getLibDetails } from "~/server/fns";
import { useEditorName } from "~/features/prefs/useEditorName";
import type { CodeExample, LibDetails, MapNode } from "~/server/types";
import { interactions, libCount, libLabel, visibleNodes } from "../model";
import type { PanelActions, PanelProps } from "../Panel";
import { Cols, StickyHead, Title } from "./common";
import { LibDocs } from "./docs";

// ---------- Fiche d'une librairie ----------
function LibInfo({ name }: { name: string }) {
  const q = useQuery({ queryKey: ["lib", name], queryFn: () => getLibDetails({ data: { name } }), staleTime: 60 * 60_000 });
  if (q.isPending) return <Skeleton h={50} />;
  if (!q.data?.ok) return <p className="muted small">{msg(q.data?.error.message) ?? m.map_details_unavailable()}</p>;
  const d: LibDetails = q.data.data;
  return (
    <>
      <p className="desc" style={d.private ? { fontStyle: "italic" } : undefined}>
        {d.private
          ? m.map_package_from_company_s_private()
          : (d.summary ?? m.common_no_published_description())}
      </p>
      {(d.installed || d.license) && (
        <p className="small muted">
          {d.installed && (
            <>
              {m.map_installed()}
              <span className="mono">{d.installed}</span>
              {d.latest && d.latest !== d.installed ? (
                <>
                  {" "}
                  · {m.map_latest()}
                  <span className="mono">{d.latest}</span>
                </>
              ) : d.latest ? (
                m.map_up_date()
              ) : null}
            </>
          )}
          {d.license && `${d.installed ? " · " : ""}${m.common_license()} ${d.license}`}
        </p>
      )}
      <div className="chip-list">
        {d.docsUrl && (
          <ExtLink href={d.docsUrl} tone="info">
            {m.map_docs()}
          </ExtLink>
        )}
        {d.npmUrl && (
          <ExtLink href={d.npmUrl} tone="neutral">
            npm ↗
          </ExtLink>
        )}
        {d.repoUrl && (
          <ExtLink href={d.repoUrl} tone="neutral">
            {m.map_source_code()}
          </ExtLink>
        )}
      </div>
    </>
  );
}

export function Example({ ex }: { ex: CodeExample }) {
  const editor = useEditorName();
  return (
    <figure className="example">
      <figcaption>
        <span className="mono small" title={ex.file}>
          {ex.file.split("/").slice(-3).join("/")}:{ex.line}
          {ex.isTest ? " · test" : ""}
        </span>
        <button type="button" className={button({ size: "sm" })} onClick={() => openInIde(ex.file, ex.line)}>
          {m.map_open_in({ editor })}
        </button>
      </figcaption>
      <pre className="code">
        {ex.lines.map((l, i) => {
          const n = ex.startLine + i;
          return (
            <span key={n} className={`code-line${n === ex.line ? " focus" : ""}`}>
              <span className="ln">{n}</span>
              {l || " "}
            </span>
          );
        })}
      </pre>
    </figure>
  );
}

// ---------- Fiche d'une librairie dans une partie (à la place de la liste) ----------
export function LibFocus({ node, sub, lib, n, tests, act }: { node: MapNode; sub?: { name: string; path: string }; lib: string; n: number; tests: boolean; act: PanelActions }) {
  const q = useQuery({ queryKey: ["examples", node.id, lib, tests], queryFn: () => getExamples({ data: { node: node.id, lib, tests } }), staleTime: 5 * 60_000 });
  const all = q.data?.ok ? q.data.data : [];
  // dans un sous-dossier, ses propres exemples d'abord (sinon ceux de la partie)
  const inSub = sub ? all.filter((ex) => ex.file.startsWith(`${sub.path}/`)) : [];
  const shown = inSub.length ? inSub : all;
  const where = trPart(inSub.length && sub ? sub.name : node.label);
  // la fiche s'ouvre sous « À quoi ça sert » et le guide : on la fait remonter juste sous l'en-tête du panneau
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    const panel = el?.closest<HTMLElement>(".map-panel");
    if (!el || !panel) return;
    // immédiat : un défilement animé serait interrompu par celui de la carte vers la partie choisie
    const raf = requestAnimationFrame(() => {
      const head = panel.querySelector<HTMLElement>(".panel-sticky")?.offsetHeight ?? 0;
      panel.scrollTop += el.getBoundingClientRect().top - panel.getBoundingClientRect().top - head - 32;
    });
    return () => cancelAnimationFrame(raf);
  }, [lib]);
  return (
    <div className="lib-focus" ref={ref}>
      <button type="button" className={cx(button({ variant: "link" }), "lib-back")} onClick={() => act.focusLib(null)}>
        {m.map_all_libraries()}
      </button>
      <h4 className="lib-focus-title">
        {libLabel(lib)} <span className="muted small">{plural(n, m.common_file(), m.common_files_2())}</span>
      </h4>
      <div className="lib-info">
        <LibInfo name={lib} />
      </div>
      <button type="button" className={cx(button({ size: "sm" }), "lib-all")} onClick={() => act.query(lib)}>
        {m.map_view_details_parts_that_use()}
      </button>
      <h4>{m.map_examples({ label: where })}</h4>
      {q.isPending && <Skeleton h={80} />}
      {q.data && !q.data.ok && <p className="muted small">{msg(q.data.error.message)}</p>}
      {q.data?.ok && (shown.length ? shown.map((ex) => <Example key={`${ex.file}:${ex.line}`} ex={ex} />) : <p className="muted small">{m.map_no_example_only_tests()}</p>)}
    </div>
  );
}

// ---------- Librairie ----------
export function LibPanel({ data, sel, tests, act }: PanelProps) {
  const hits = visibleNodes(data, tests)
    .map((n) => ({ n, l: n.libs.find((l) => l.name === sel.query) }))
    .filter((h): h is { n: MapNode; l: NonNullable<typeof h.l> } => Boolean(h.l) && libCount(h.l!, tests) > 0)
    .sort((a, b) => libCount(b.l, tests) - libCount(a.l, tests));
  const files = hits.reduce((s, h) => s + libCount(h.l, tests), 0);
  const max = Math.max(1, ...hits.map((h) => libCount(h.l, tests)));
  return (
    <>
      <StickyHead
        badge={<span className={badge()}>{m.common_library()}</span>}
        title={libLabel(sel.query)}
        act={act}
        subs={
          <p className="small muted">
            {plural(hits.length, m.common_part(), m.map_parts_2())} · {m.common_files({ files })}
          </p>
        }
      />
      <Cols
        left={
          <>
            <Section id="map.libabout" remember={false} title={m.map_what_s()}>
              <div className="lib-info">
                <LibInfo name={sel.query} />
              </div>
            </Section>
            <LibDocs name={sel.query} act={act} />
          </>
        }
        right={
          // pour une librairie, l'équivalent des interactions : les parties qui l'importent (ouvert, c'est l'essentiel de la vue)
          <Section id="map.libparts" remember={false} title={<Title label={m.map_used()} n={hits.length} />}>
            <p className="muted small">{hits.length ? m.map_click_part_see_examples() : m.map_no_part_uses_library()}</p>
            <ul className="lib-rows">
              {hits.map(({ n, l }) => (
                <li key={n.id}>
                  <button type="button" className="lib-row" data-hover={n.id} onClick={() => act.select(n.id, { openLib: sel.query })}>
                    <span>
                      <i className={`dot cat-${n.category}`} />
                      {trPart(n.label)}
                    </span>
                    <span className="lib-bar">
                      <i style={{ width: `${Math.round((libCount(l, tests) / max) * 100)}%` }} />
                    </span>
                    <span className="muted small">{libCount(l, tests)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        }
      />
    </>
  );
}
