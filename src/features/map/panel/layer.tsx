import { cx } from "styled-system/css";
import { badge, button, count, Section } from "~/components/ds";
import { plural } from "~/lib/format";
import { m, trPart } from "~/lib/i18n";
import type { Category } from "~/server/types";
import { catLabel, layerInfo, layerInteractions, libCount, visibleNodes } from "../model";
import type { PanelProps } from "../Panel";
import { Cols, FileRows, Flow, Kpis, LibRows, StickyHead, Title } from "./common";
import { GuideSection, guidePaths } from "./docs";

// ---------- Couche ----------
export function LayerPanel({ data, sel, tests, act }: PanelProps) {
  const c = sel.layer!;
  const all = visibleNodes(data, tests);
  const parts = all.filter((n) => n.category === c).sort((a, b) => b.files - a.files);
  const files = parts.reduce((s, n) => s + n.files, 0);
  const testFiles = parts.reduce((s, n) => s + n.testFiles, 0);
  const changes = parts.reduce((s, n) => s + (n.changes30d ?? 0), 0);
  const libMap = new Map<string, number>();
  for (const n of parts) for (const l of n.libs) if (libCount(l, tests)) libMap.set(l.name, (libMap.get(l.name) ?? 0) + libCount(l, tests));
  const libs = [...libMap.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  const { inc, out } = layerInteractions(data, c, new Set(all.map((n) => n.id)));
  const topFiles = parts
    .flatMap((n) => n.topFiles)
    .sort((a, b) => b.importers - a.importers)
    .slice(0, 12);
  const short = (s?: string) => (s && s.length > 140 ? `${s.slice(0, 137).replace(/\s+\S*$/, "")}…` : s);
  const chip = (layer: Category, weight: number, i: number, dir: "in" | "out") => (
    <button key={layer} type="button" className="chip" title={plural(weight, "import")} onClick={() => act.layer(layer)}>
      <span className={`num num-${dir}`}>{i + 1}</span>
      <i className={`dot cat-${layer}`} />
      {catLabel(layer)} <span className={count}>{weight}</span>
    </button>
  );
  return (
    <>
      <StickyHead badge={<span className={cx(badge(), `cat-badge cat-${c}`)}>{catLabel(c)}</span>} title={m.map_layer_2({ c: catLabel(c) })} act={act} />
      <Cols
        left={
          <>
            <Section id="map.layerabout" remember={false} title={m.map_what_s()}>
              <p className="desc">{layerInfo(c)}</p>
              <Kpis
                items={[
                  { value: parts.length, label: m.map_kpi_parts() },
                  { value: files, label: m.map_kpi_files() },
                  { value: testFiles, label: m.map_kpi_tests() },
                  { value: changes, label: m.map_kpi_changes(), hint: m.map_changes_30_days({ changes30d: changes }) },
                ]}
              />
              <h4>
                {m.map_parts_3()} <span className={count}>{parts.length}</span>
              </h4>
              <ul className="lib-rows">
                {parts.map((n) => (
                  <li key={n.id}>
                    <button type="button" className="lib-row part-row" data-hover={n.id} onClick={() => act.select(n.id)}>
                      <span>
                        <strong>{trPart(n.label)}</strong>
                        <span className="file-part">{short(n.description ?? (n.parentDescription ? m.map_part_2({ label: trPart(n.label.split(" · ")[0]) }) : "")) || "—"}</span>
                      </span>
                      <span className="muted small">{m.common_files({ files: n.files })}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
            <GuideSection paths={guidePaths(data, parts)} hint={m.map_sections_cite_layer()} />
          </>
        }
        right={
          <>
            <Section id="map.layerlibs" remember={false} defaultOpen={false} title={<Title label={m.common_libraries()} n={libs.length} />}>
              <LibRows libs={libs} onPick={act.query} />
            </Section>
            <Section id="map.layerinteractions" remember={false} defaultOpen={false} title={<Title label="Interactions" n={inc.length + out.length} />}>
              <Flow who={catLabel(c)} inc={inc.map((e, i) => chip(e.layer, e.weight, i, "in"))} out={out.map((e, i) => chip(e.layer, e.weight, i, "out"))} />
            </Section>
            <Section id="map.layerfiles" remember={false} defaultOpen={false} title={<Title label={m.map_most_important_files()} n={topFiles.length} />}>
              <p className="muted small">{m.map_files_layer_most_other()}</p>
              <FileRows files={topFiles} data={data} act={act} />
            </Section>
          </>
        }
      />
    </>
  );
}
