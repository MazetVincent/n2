import { cx } from "styled-system/css";
import { button, count, Section } from "~/components/ds";
import { openInIde } from "~/lib/actions";
import { plural } from "~/lib/format";
import { m, trPart } from "~/lib/i18n";
import { useEditorName } from "~/features/prefs/useEditorName";
import type { MapNode } from "~/server/types";
import { catLabel, interactions, libCount, nodeLibs, visibleNodes } from "../model";
import type { PanelProps } from "../Panel";
import { CatBadge, Cols, Desc, FileRows, Flow, Kpis, LibRows, MixBar, StickyHead, Title } from "./common";
import { GuideSection, guidePaths } from "./docs";
import { LibFocus } from "./library";
import { BranchSection } from "./overview";

// ---------- Partie (et sous-dossier) ----------
export function NodePanel({ data, sel, tests, act, branch, branchOn, node: n }: PanelProps & { node?: MapNode }) {
  const editor = useEditorName();
  if (!n) return null;
  const visible = new Set(visibleNodes(data, tests).map((x) => x.id));
  const { inc, out } = interactions(data, n.id, visible);
  const sub = sel.sub ? n.contains.find((c) => c.name === sel.sub) : undefined;
  const group = n.label.includes(" · ") ? n.label.split(" · ")[0] : null;
  const short = group ? n.label.split(" · ")[1] : n.label;
  const labelOf = (id: string) => trPart(data.nodes.find((x) => x.id === id)?.label ?? id);
  // un sous-dossier n'a que ses fichiers, ses librairies et ses fichiers clés ; le reste est celui de la partie
  const libs = sub ? sub.libs.map((l) => ({ name: l.name, n: l.files })) : nodeLibs(n, tests).map((l) => ({ name: l.name, n: libCount(l, tests) }));
  // fiche ouverte seulement si la librairie est dans la liste (ex. librairie de tests quand les tests sont masqués : retour à la liste)
  const focused = sel.lib ? (libs.find((l) => l.name === sel.lib) ?? null) : null;
  const text = n.description ?? n.parentDescription;

  const chip = (id: string, weight: number, i: number, dir: "in" | "out") => (
    <button key={id} type="button" className="chip" data-hover={id} title={plural(weight, "import")} onClick={() => act.select(id)}>
      <span className={`num num-${dir}`}>{i + 1}</span>
      {labelOf(id)} <span className={count}>{weight}</span>
    </button>
  );

  return (
    <>
      <StickyHead
        badge={<CatBadge c={n.category} act={act} />}
        title={sub ? `${trPart(n.label)} › ${trPart(sub.name)}` : trPart(n.label)}
        act={act}
        subs={
          <>
            <nav className="crumbs" aria-label={m.map_location()}>
              <button type="button" onClick={() => act.layer(n.category)}>
                {catLabel(n.category)}
              </button>
              <span>›</span>
              {group && (
                <>
                  <span className="muted">{trPart(group)}</span>
                  <span>›</span>
                </>
              )}
              {sub ? (
                <>
                  <button type="button" onClick={() => act.select(n.id)}>
                    {trPart(short)}
                  </button>
                  <span>›</span>
                  <strong>{trPart(sub.name)}</strong>
                </>
              ) : (
                <strong>{trPart(short)}</strong>
              )}
            </nav>
            <p className="mono small muted">{sub ? sub.path : n.path}</p>
          </>
        }
      />
      <Cols
        left={
          <>
            {/* « Ma branche » allumé : les fichiers de la branche dans cette partie, en premier */}
            {branch && branchOn && <BranchSection data={data} branch={branch} act={act} node={n} open />}
            <Section id="map.about" remember={false} title={m.map_what_s()}>
              {sub && <p className="muted small">{m.map_subfolder_of({ label: trPart(n.label) })}</p>}
              {n.title && n.title !== n.label && !sub && <p className="small lead">{n.title}</p>}
              {text ? (
                <>
                  {!n.description && group && <p className="muted small">{m.map_part_2({ label: trPart(group) })}</p>}
                  <Desc text={text} />
                </>
              ) : (
                <p className="desc muted">{m.map_no_readme_or_description_part()}</p>
              )}
              <Kpis
                items={
                  sub
                    ? [{ value: sub.files, label: m.map_kpi_files() }]
                    : [
                        { value: n.files, label: m.map_kpi_files() },
                        { value: n.testFiles, label: m.map_kpi_tests() },
                        { value: n.changes30d ?? 0, label: m.map_kpi_changes(), hint: m.map_changes_30_days({ changes30d: n.changes30d ?? 0 }) },
                      ]
                }
              />
              {!sub && <MixBar mix={n.mix} />}
              {n.contains.length > 0 && (
                <>
                  <h4>{sub ? m.map_subfolders({ label: trPart(n.label) }) : m.map_contains()}</h4>
                  <div className="tag-list">
                    {n.contains.map((c) => (
                      <button key={c.name} type="button" className={`tag tag-btn${c.name === sel.sub ? " current" : ""}`} title={plural(c.files, m.common_file(), m.common_files_2())} onClick={() => act.select(n.id, { sub: c.name === sel.sub ? null : c.name })}>
                        {trPart(c.name)}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {n.readme && (
                <button type="button" className={cx(button({ size: "sm" }), "readme-btn")} onClick={() => openInIde(n.readme!)}>
                  {m.map_read_readme_in({ editor })}
                </button>
              )}
            </Section>
            <GuideSection paths={sub ? [sub.path] : guidePaths(data, [n])} hint={sub ? m.map_sections_cite_subfolder() : m.map_sections_that_cite_files_part()} />
          </>
        }
        right={
          <>
            <Section id="map.libs" remember={false} defaultOpen={Boolean(focused)} title={<Title label={m.common_libraries()} n={libs.length} />}>
              {focused ? <LibFocus node={n} sub={sub} lib={focused.name} n={focused.n} tests={tests} act={act} /> : <LibRows libs={libs} onPick={act.focusLib} />}
            </Section>
            <Section id="map.interactions" remember={false} defaultOpen={false} title={<Title label="Interactions" n={inc.length + out.length} />}>
              {sub && <p className="muted small">{m.map_part_interactions({ label: trPart(n.label) })}</p>}
              <Flow who={trPart(n.label)} inc={inc.map((e, i) => chip(e.from, e.weight, i, "in"))} out={out.map((e, i) => chip(e.to, e.weight, i, "out"))} />
            </Section>
            <Section id="map.nodefiles" remember={false} defaultOpen={false} title={<Title label={m.map_most_important_files()} n={(sub ? sub.topFiles : n.topFiles).length} />}>
              <p className="muted small">{sub ? m.map_files_subfolder_most_other() : m.map_files_part_that_most_other()}</p>
              <FileRows files={sub ? sub.topFiles : n.topFiles} data={data} act={act} showPart={false} />
            </Section>
          </>
        }
      />
    </>
  );
}
