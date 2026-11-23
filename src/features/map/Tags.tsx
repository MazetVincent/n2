// Tags des sélections récentes, à côté du titre de la carte : clic = y revenir, ✕ = retirer (le tag actif
// ramène alors au précédent).
import { m, trPart } from "~/lib/i18n";
import type { Category, CodeMapData } from "~/server/types";
import { catLabel, activeTag, libLabel, sameTag, splitSub, type Selection, type Tag } from "./model";

export function Tags({ data, sel, onActivate, onRemove }: { data: CodeMapData; sel: Selection; onActivate: (t: Tag) => void; onRemove: (t: Tag) => void }) {
  const active = activeTag(sel);
  return (
    <div className="map-tags" aria-label={m.map_selections()}>
      {sel.trail.map((t) => {
        const [nodeId, sub] = t.type === "sub" ? splitSub(t.id) : [t.id, null];
        const node = t.type === "node" || t.type === "sub" ? data.nodes.find((n) => n.id === nodeId) : null;
        if ((t.type === "node" || t.type === "sub") && !node) return null;
        const isActive = Boolean(active && sameTag(active, t));
        const label = node ? (sub ? `${trPart(node.label)} › ${trPart(sub)}` : trPart(node.label)) : t.type === "cat" ? catLabel(t.id as Category) : libLabel(t.id);
        return (
          <span key={`${t.type}:${t.id}`} className={`sel-tag${isActive ? " active" : ""}`}>
            <button type="button" title={isActive ? m.map_current_selection() : m.map_back_selection()} onClick={() => onActivate(t)}>
              {node ? (
                <i className={`dot cat-${node.category}`} />
              ) : t.type === "cat" ? (
                <>
                  <i className={`dot cat-${t.id}`} />
                  <span className="tag-kind">{m.map_layer_3()}</span>
                </>
              ) : (
                <span className="tag-kind">lib</span>
              )}
              {label}
            </button>
            <button type="button" className="sel-tag-x" aria-label={m.map_remove({ label })} onClick={() => onRemove(t)}>
              ✕
            </button>
          </span>
        );
      })}
    </div>
  );
}
