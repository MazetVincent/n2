// Dessin SVG de la carte : parties, liens, numéros d'interaction, calques (points chauds, branche, impact).
import { m, trPart } from "~/lib/i18n";
import type { CodeMapData, MapNode } from "~/server/types";
import { CATS, catLabel, edgePoints, interactions, nodeLibs, type Pos, type Selection } from "./model";

export type Overlay = { kind: "none" } | { kind: "hot" } | { kind: "counts"; style: "branch" | "impact"; counts: Record<string, number>; label: string };

interface Props {
  data: CodeMapData;
  layoutResult: { pos: Map<string, Pos>; width: number; height: number; nodes: MapNode[] };
  zoom: number;
  sel: Selection;
  tests: boolean;
  allEdges: boolean;
  hovered: string | null;
  overlay: Overlay;
  onHover: (id: string | null) => void;
  onNode: (id: string) => void;
}

export function MapSvg({ data, layoutResult, zoom, sel, tests, allEdges, hovered, overlay, onHover, onNode }: Props) {
  const { pos, width, height, nodes } = layoutResult;
  const visible = new Set(nodes.map((n) => n.id));
  const catOf = new Map(nodes.map((n) => [n.id, n.category]));
  const { selected, query, layer } = sel;

  // Numéros des interactions de la partie sélectionnée (même ordre que dans le panneau)
  const inNum = new Map<string, number>();
  const outNum = new Map<string, number>();
  if (selected) {
    const { inc, out } = interactions(data, selected, visible);
    inc.forEach((e, i) => inNum.set(e.from, i + 1));
    out.forEach((e, i) => outNum.set(e.to, i + 1));
  }
  const connected = new Set(selected ? data.edges.filter((e) => e.from === selected || e.to === selected).flatMap((e) => [e.from, e.to]) : []);
  const matches = (n: MapNode) => (query && n.libs.some((l) => l.name === query && l.files + (tests ? l.testFiles : 0) > 0)) || (layer && n.category === layer);
  const counts = overlay.kind === "counts" ? overlay.counts : null;
  const maxChanges = Math.max(1, ...nodes.map((n) => n.changes30d ?? 0));

  const classes = ["map-svg"];
  if (selected) classes.push("has-selection");
  if (query || layer) classes.push("has-query");
  if (layer) classes.push("has-layer");
  if (!allEdges) classes.push("edges-hover");
  if (counts && !selected) classes.push("has-overlay");

  return (
    <svg className={classes.join(" ")} width={Math.round(width * zoom)} height={Math.round(height * zoom)} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={m.map_map({ project: data.project })}>
      <defs>
        {["arrow", "arrow-out", "arrow-in"].map((id) => (
          <marker key={id} id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className={`marker ${id}`} />
          </marker>
        ))}
      </defs>

      <g className="edges">
        {data.edges.map((e) => {
          const a = pos.get(e.from);
          const b = pos.get(e.to);
          if (!a || !b) return null;
          const p = edgePoints(a, b);
          let cls = "edge";
          let marker = "arrow";
          if (layer && (catOf.get(e.from) === layer || catOf.get(e.to) === layer)) cls += " layer-edge";
          if (hovered && (e.from === hovered || e.to === hovered)) cls += " hover-edge";
          if (selected && e.from === selected) {
            cls += " out";
            marker = "arrow-out";
          } else if (selected && e.to === selected) {
            cls += " in";
            marker = "arrow-in";
          }
          return (
            <path key={`${e.from}>${e.to}`} d={`M${p[0]} C${p[1]} ${p[2]} ${p[3]}`} className={cls} strokeWidth={(1 + Math.log2(e.weight) * 0.45).toFixed(2)} markerEnd={`url(#${marker})`}>
              <title>{`${label(data, e.from)} → ${label(data, e.to)}${m.map_text()}${e.weight} import${e.weight > 1 ? "s" : ""}`}</title>
            </path>
          );
        })}
      </g>

      {nodes.map((n) => {
        const p = pos.get(n.id)!;
        const cls = ["node", `cat-${n.category}`];
        if (n.id === selected) cls.push("selected");
        if (connected.has(n.id)) cls.push("connected");
        if (matches(n)) cls.push("match");
        if (n.id === hovered) cls.push("hover-target");
        if (counts?.[n.id]) cls.push("overlay-hit");
        const count = n.files + (tests ? n.testFiles : 0);
        const top = nodeLibs(n, tests).find((l) => l.name !== "node:*");
        const q = query ? n.libs.find((l) => l.name === query) : null;
        let sub =
          q && matches(n)
            ? m.map_file_s({ testFiles: q.files + (tests ? q.testFiles : 0), query })
            : `${m.map_file({ count, s: count > 1 ? "s" : "" })}${top ? ` · ${top.name}` : ""}`;
        if (overlay.kind === "hot") sub = m.map_changes_30_d_files({ changes30d: n.changes30d ?? 0, count });
        const nodeLabel = trPart(n.label);
        const total = Object.values(n.mix).reduce((a, b) => a + (b ?? 0), 0);
        let x = p.x + 12;
        return (
          <g
            key={n.id}
            className={cls.join(" ")}
            data-id={n.id}
            tabIndex={0}
            role="button"
            aria-label={`${trPart(n.label)}, ${catLabel(n.category)}`}
            onClick={(e) => {
              e.stopPropagation();
              onNode(n.id);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onNode(n.id);
              }
            }}
            onPointerEnter={() => onHover(n.id)}
            onPointerLeave={() => onHover(null)}
          >
            <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={9} />
            {overlay.kind === "hot" && (n.changes30d ?? 0) > 0 && (
              <g className="heat">
                <rect x={p.x} y={p.y} width={6} height={p.h} rx={3} opacity={0.2 + 0.8 * ((n.changes30d ?? 0) / maxChanges)} />
              </g>
            )}
            <text x={p.x + 12} y={p.y + 20} className="node-label">
              {nodeLabel.length > 27 ? `${nodeLabel.slice(0, 26)}…` : nodeLabel}
            </text>
            <text x={p.x + 12} y={p.y + 36} className="node-sub">
              {sub.length > 34 ? `${sub.slice(0, 33)}…` : sub}
            </text>
            {total > 0 &&
              CATS.map((c) => {
                const v = n.mix[c];
                if (!v) return null;
                const w = (v / total) * (p.w - 24);
                const r = <rect key={c} x={x} y={p.y + p.h - 10} width={Math.max(w, 1)} height={4} className={`mix cat-${c}`} />;
                x += w;
                return r;
              })}
            <title>{`${nodeLabel}\n${n.path}\n${m.common_files({ files: n.files })}${n.testFiles ? ` (+${n.testFiles} tests)` : ""}${n.changes30d ? `\n${m.map_changes_30_days({ changes30d: n.changes30d })}` : ""}`}</title>
          </g>
        );
      })}

      {/* Pastilles par-dessus tout : interactions (bleu = l'appelle, rose = appelée), puis calque */}
      <g className="num-badges">
        {[...inNum].map(([id, n]) => {
          const p = pos.get(id);
          return p && <Badge key={`in-${id}`} cls="num-badge num-in" x={p.x + 2} y={p.y + 2} text={n} />;
        })}
        {[...outNum].map(([id, n]) => {
          const p = pos.get(id);
          return p && <Badge key={`out-${id}`} cls="num-badge num-out" x={p.x + p.w - 2} y={p.y + 2} text={n} />;
        })}
        {counts &&
          overlay.kind === "counts" &&
          Object.entries(counts).map(([id, n]) => {
            const p = pos.get(id);
            return p && <Badge key={`ov-${id}`} cls={`overlay-badge ${overlay.style}`} x={p.x + p.w - 2} y={p.y + p.h - 2} text={n} r={11} />;
          })}
      </g>
    </svg>
  );
}

function Badge({ cls, x, y, text, r = 9 }: { cls: string; x: number; y: number; text: number | string; r?: number }) {
  return (
    <g className={cls}>
      <circle cx={x} cy={y} r={r} />
      <text x={x} y={y + 3.5} textAnchor="middle">
        {text}
      </text>
    </g>
  );
}

const label = (data: CodeMapData, id: string) => trPart(data.nodes.find((n) => n.id === id)?.label ?? id);
