// Vue d'ensemble du panneau (rien de sélectionné) et section « Ma branche ».
import { useState } from "react";
import { button, count, Section } from "~/components/ds";
import { openInIde } from "~/lib/actions";
import { plural } from "~/lib/format";
import { m, trPart } from "~/lib/i18n";
import type { BranchData, CodeMapData, MapNode } from "~/server/types";
import { CATS, catLabel, allLibs, libLabel } from "../model";
import type { PanelActions, PanelProps } from "../Panel";
import { Cols, FileRows, Title } from "./common";

// ---------- Vue d'ensemble ----------
export function Overview({ data, tests, branch, branchOn, act }: PanelProps) {
  const libs = allLibs(data, tests).slice(0, 12);
  return (
    <Cols
      left={
        <>
          {/* « Ma branche » allumé : la branche d'abord, ouverte ; sinon elle reste repliée en bas à droite */}
          {branch && branchOn && <BranchSection data={data} branch={branch} act={act} open />}
          {/* À l'arrivée sur la carte, seule cette section est ouverte (état non retenu) */}
          <Section id="map.howto" title={m.map_how_read_map()} remember={false} defaultOpen={!(branch && branchOn)}>
            <ul className="howto-list">
              <li>
                <strong>{m.map_one_block_one_part_project()}</strong>
                {m.map_placed_its_layer_s_column()}
              </li>
              <li>
                <strong>{m.map_hover_block()}</strong>
                {m.map_see_its_links_other_parts()}
              </li>
              <li>
                <strong>{m.map_click_block()}</strong>
                {m.map_its_interactions_are_numbered_flow()}
                <span className="num num-in">1</span>
                {m.map_parts_that_call()}
                <span className="num num-out">1</span>
                {m.map_ones_calls()}
              </li>
              <li>
                <strong>{m.map_move_around()}</strong>
                {m.map_scroll_or_pinch_zoom_drag()}
              </li>
            </ul>
            <div className="map-legend">
              {CATS.map((c) => (
                <button key={c} type="button" className="legend-btn" onClick={() => act.layer(c)} title={m.map_view_layer({ c: catLabel(c) })}>
                  <i className={`dot cat-${c}`} />
                  {catLabel(c)}
                </button>
              ))}
            </div>
          </Section>
        </>
      }
      right={
        <>
          <Section id="map.toplibs" defaultOpen={false} remember={false} title={m.map_most_used_libraries()}>
            <ul className="lib-rows">
              {libs.map((l) => (
                <li key={l.name}>
                  <button type="button" className="lib-row" onClick={() => act.query(l.name)}>
                    <span>{libLabel(l.name)}</span>
                    <span className="muted small">
                      {m.common_files({ files: l.files })} · {plural(l.parts, m.common_part(), m.map_parts_2())}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Section>
          <Section id="map.topfiles" defaultOpen={false} remember={false} title={m.map_most_important_files()}>
            <p className="muted small">{m.map_files_imported_by_most_other()}</p>
            <FileRows files={data.topFiles.slice(0, 15)} data={data} act={act} />
          </Section>
          <Section id="map.hotspots" defaultOpen={false} remember={false} title={m.map_hotspots()}>
            <p className="muted small">{m.map_files_that_are_both_heavily()}</p>
            {data.hotspots.length ? (
              <ul className="lib-rows">
                {data.hotspots.slice(0, 10).map((h) => (
                  <li key={h.file} className="file-item">
                    <button type="button" className="lib-row file-row" data-hover={h.node} title={h.file} onClick={() => act.select(h.node)}>
                      <span>
                        <span className="mono">{h.file.split("/").slice(-2).join("/")}</span>
                        <span className="file-part">{trPart(data.nodes.find((n) => n.id === h.node)?.label)}</span>
                      </span>
                      <span className="muted small">{m.map_changes_imports({ changes: h.changes, importers: h.importers })}</span>
                    </button>
                    <button type="button" className={button({ size: "sm" })} onClick={() => act.impact(h.file)}>
                      {m.map_impact()}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">{m.map_no_important_file_changed_recently()}</p>
            )}
          </Section>
          {branch && !branchOn && <BranchSection data={data} branch={branch} act={act} />}
        </>
      }
    />
  );
}

/**
 * Fichiers modifiés par la branche : toute la branche (vue d'ensemble, avec les parties touchées) ou la partie choisie.
 * `open` : section ouverte (interrupteur « Ma branche » allumé).
 */
export function BranchSection({ data, branch, act, node, open = false }: { data: CodeMapData; branch: BranchData; act: PanelActions; node?: MapNode; open?: boolean }) {
  const [all, setAll] = useState(false);
  const files = node ? branch.files.filter((f) => f.node === node.id) : branch.files;
  if (node && !files.length) return null;
  const parts = Object.entries(branch.nodes)
    .filter(([id]) => data.nodes.some((n) => n.id === id))
    .sort((a, b) => b[1] - a[1]);
  const shown = all ? files : files.slice(0, 20);
  return (
    <Section id="map.branch" defaultOpen={open} remember={false} title={<Title label={`${m.common_my_branch()} · ${branch.branch}`} n={files.length} />}>
      <p className="muted small">
        {plural(files.length, m.common_changed_file(), m.common_changed_files())} {m.common_since()} {branch.base}
        {node ? "." : <>, {m.map_across()} {plural(Object.keys(branch.nodes).length, m.common_part(), m.map_parts_2())}.</>}
      </p>
      {!node && parts.length > 0 && (
        <div className="tag-list">
          {parts.map(([id, n]) => (
            <button key={id} type="button" className="chip" data-hover={id} onClick={() => act.select(id)}>
              {trPart(data.nodes.find((x) => x.id === id)?.label ?? id)} <span className={count}>{n}</span>
            </button>
          ))}
        </div>
      )}
      <ul className="lib-rows">
        {shown.map((f) => (
          <li key={f.file} className="file-item">
            <button type="button" className="lib-row file-row" data-hover={f.node ?? undefined} title={f.file} onClick={() => (f.node ? act.select(f.node) : openInIde(f.file))}>
              <span>
                <span className="mono">{f.file.split("/").slice(-2).join("/")}</span>
                {!node && <span className="file-part">{f.node ? trPart(data.nodes.find((n) => n.id === f.node)?.label) : m.map_off_map()}</span>}
              </span>
              <span className="muted small">{f.status}</span>
            </button>
            {data.nodes.some((n) => n.id === f.node) && (
              <button type="button" className={button({ size: "sm" })} onClick={() => act.impact(f.file)}>
                {m.map_impact()}
              </button>
            )}
          </li>
        ))}
      </ul>
      {files.length > 20 && (
        <button type="button" className={button({ variant: "link" })} onClick={() => setAll((v) => !v)}>
          {all ? m.guide_fewer_sections() : plural(files.length - 20, m.common_changed_file(), m.common_changed_files())}
        </button>
      )}
    </Section>
  );
}
