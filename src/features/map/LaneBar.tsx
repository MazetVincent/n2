// Bandeau des couches (Front, API, Back…) collé en haut de la carte.
// Clic : filtre sur la couche (second clic : annule). Survol : menu en cascade couche › parties › sous-dossiers,
// ouvert d'office sur le chemin de la sélection active.
// (Menu « maison » plutôt que le Menu d'Ark UI : le chemin déplié jusqu'au tag, masqué seulement pendant le
//  survol d'une autre branche, n'est pas un comportement prévu par Ark.)
import { Portal } from "@ark-ui/react/portal";
import { cx } from "styled-system/css";
import { count as countCls } from "~/components/ds";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { m, trPart } from "~/lib/i18n";
import type { Category, CodeMapData, MapNode } from "~/server/types";
import { catLabel, COL_W, GAP_X, PAD, type Selection } from "./model";

interface Props {
  data: CodeMapData;
  cols: Category[];
  nodes: MapNode[];
  zoom: number;
  width: number;
  sel: Selection;
  onLayer: (c: Category) => void;
  onSelect: (id: string, sub?: string) => void;
  onHover: (id: string | null) => void;
}

export function LaneBar({ data, cols, nodes, zoom, width, sel, onLayer, onSelect, onHover }: Props) {
  const [open, setOpen] = useState<{ lane: Category; rect: DOMRect } | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const menuRef = useRef<HTMLDivElement>(null);
  const selectedCat = sel.selected ? data.nodes.find((n) => n.id === sel.selected)?.category : null;

  const clear = () => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
  };
  const close = () => {
    clear();
    setOpen(null);
    onHover(null);
  };
  const scheduleClose = () => {
    clear();
    closeTimer.current = setTimeout(close, 250);
  };
  // fermeture au défilement / redimensionnement (le menu est positionné sur l'écran)
  useEffect(() => {
    if (!open) return;
    const onScroll = () => close();
    window.addEventListener("resize", onScroll);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("scroll", onScroll, true);
    };
  });

  const openLane = (lane: Category, el: HTMLElement, focus = false) => {
    clear();
    setOpen({ lane, rect: el.getBoundingClientRect() });
    if (focus) requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus());
  };

  return (
    <div className="lane-bar" style={{ width: Math.round(width * zoom) }}>
      {cols.map((c, i) => {
        const count = nodes.filter((n) => n.category === c).length;
        const cls = ["lane-btn", `cat-${c}`, sel.layer === c && "active", selectedCat === c && "has-current"].filter(Boolean).join(" ");
        return (
          <button
            key={c}
            type="button"
            className={cls}
            style={{ left: Math.round((PAD + i * (COL_W + GAP_X)) * zoom), width: Math.round(COL_W * zoom) }}
            aria-haspopup="menu"
            aria-expanded={open?.lane === c}
            title={`${sel.layer === c ? m.map_clear_filter() : m.map_filter_layer({ c: catLabel(c) })} · ${m.map_hover_parts_subfolders()}`}
            onClick={(e) => {
              e.stopPropagation();
              close();
              onLayer(c);
            }}
            onPointerEnter={(e) => {
              const el = e.currentTarget;
              clear();
              // menu déjà ouvert sur une autre couche : on bascule tout de suite ; sinon petit délai
              if (open && open.lane !== c) openLane(c, el);
              else if (!open) openTimer.current = setTimeout(() => openLane(c, el), 140);
            }}
            onPointerLeave={scheduleClose}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                openLane(c, e.currentTarget, true);
              }
            }}
          >
            <i className={`dot cat-${c}`} />
            <span className="lane-name">{catLabel(c)}</span>
            <span className={cx(countCls, "count")}>{count}</span>
            <span className="chev">▾</span>
          </button>
        );
      })}
      {open && (
        <Portal>
          <div
            ref={menuRef}
            className={`lane-menu${open.rect.left + 3 * 260 > window.innerWidth ? " flip" : ""}`}
            style={{ left: Math.max(8, Math.min(open.rect.left, window.innerWidth - 280)), top: open.rect.bottom + 4 }}
            onPointerEnter={clear}
            onPointerLeave={scheduleClose}
            onPointerOver={(e) => onHover((e.target as HTMLElement).closest<HTMLElement>("[data-hover]")?.dataset.hover ?? null)}
            onKeyDown={(e) => menuKeys(e, close)}
          >
            <LaneMenu
              lane={open.lane}
              nodes={nodes}
              sel={sel}
              onLayer={(c) => {
                close();
                onLayer(c);
              }}
              onSelect={(id, sub) => {
                close();
                onSelect(id, sub);
              }}
            />
          </div>
        </Portal>
      )}
    </div>
  );
}

function LaneMenu({ lane, nodes, sel, onLayer, onSelect }: { lane: Category; nodes: MapNode[]; sel: Selection; onLayer: (c: Category) => void; onSelect: (id: string, sub?: string) => void }) {
  const parts = nodes.filter((n) => n.category === lane).sort((a, b) => b.files - a.files);
  const files = parts.reduce((s, n) => s + n.files, 0);
  // les parties d'une même application / d'un même package sont regroupées
  const groups = new Map<string, MapNode[]>();
  for (const n of parts) groups.set(n.workspace, [...(groups.get(n.workspace) ?? []), n]);
  return (
    <ul className="lm-root" role="menu" aria-label={m.map_layer({ lane: catLabel(lane) })}>
      <li>
        <button type="button" role="menuitem" className="lm-head" onClick={() => onLayer(lane)}>
          <span className="lm-label">{sel.layer === lane ? m.map_clear_filter() : m.map_whole_layer({ lane: catLabel(lane) })}</span>
          <span className={cx(countCls, "count")}>
            {m.map_parties_fichiers({ parts: m.common_parts_count({ count: parts.length }), files: m.common_files_count({ count: files }) })}
          </span>
        </button>
      </li>
      <li className="lm-sep" role="separator" />
      {[...groups.values()].map((list) => {
        if (list.length === 1) return <PartItem key={list[0].id} n={list[0]} sel={sel} onSelect={onSelect} />;
        const name = list[0].label.split(" · ")[0];
        const holds = list.some((n) => n.id === sel.selected);
        return (
          <li key={list[0].workspace} className={`has-sub${holds ? " open on-path" : ""}`}>
            <button type="button" role="menuitem">
              <i className={`dot cat-${lane}`} />
              <span className="lm-label">{trPart(name)}</span>
              <span className={cx(countCls, "count")}>
                {m.map_parts({ list: list.length })} · {list.reduce((s, n) => s + n.files, 0)}
              </span>
              <span className="chev">›</span>
            </button>
            <ul className="lm-sub" role="menu">
              <li className="lm-title">{trPart(name)}</li>
              {list.map((n) => (
                <PartItem key={n.id} n={n} short sel={sel} onSelect={onSelect} />
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}

function PartItem({ n, short = false, sel, onSelect }: { n: MapNode; short?: boolean; sel: Selection; onSelect: (id: string, sub?: string) => void }) {
  const label = short ? (n.label.split(" · ")[1] ?? n.label) : n.label;
  const subs = n.contains ?? [];
  const current = n.id === sel.selected;
  const cls = [subs.length && "has-sub", current && "current", current && sel.sub && "open"].filter(Boolean).join(" ");
  return (
    <li className={cls}>
      <button type="button" role="menuitem" data-hover={n.id} aria-current={current && !sel.sub ? "true" : undefined} onClick={() => onSelect(n.id)}>
        <i className={`dot cat-${n.category}`} />
        <span className="lm-label">{trPart(label)}</span>
        <span className={cx(countCls, "count")}>{n.files}</span>
        {subs.length > 0 && <span className="chev">›</span>}
      </button>
      {subs.length > 0 && (
        <ul className="lm-sub" role="menu">
          <li className="lm-title">{m.map_subfolders({ label: trPart(label) })}</li>
          {subs.map((s) => {
            const cur = current && s.name === sel.sub;
            return (
              <li key={s.name} className={cur ? "current" : undefined}>
                <button type="button" role="menuitem" data-hover={n.id} title={m.common_files({ files: s.files })} aria-current={cur ? "true" : undefined} onClick={() => onSelect(n.id, s.name)}>
                  <span className="lm-label mono">{trPart(s.name)}</span>
                  <span className={cx(countCls, "count")}>{s.files}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

// Clavier dans le menu : ↑ ↓ dans une liste, → ouvre un sous-menu, ← y revient, Échap ferme
function menuKeys(e: KeyboardEvent<HTMLDivElement>, close: () => void) {
  const b = (e.target as HTMLElement).closest("button");
  if (!b) return;
  const li = b.parentElement!;
  const siblings = [...li.parentElement!.children].map((x) => x.querySelector<HTMLButtonElement>(":scope > button")).filter((x): x is HTMLButtonElement => Boolean(x));
  const i = siblings.indexOf(b);
  if (e.key === "ArrowDown") siblings[(i + 1) % siblings.length]?.focus();
  else if (e.key === "ArrowUp") siblings[(i - 1 + siblings.length) % siblings.length]?.focus();
  else if (e.key === "ArrowRight") li.querySelector<HTMLButtonElement>(":scope > .lm-sub button")?.focus();
  else if (e.key === "ArrowLeft") li.parentElement!.closest("li")?.querySelector<HTMLButtonElement>(":scope > button")?.focus();
  else if (e.key === "Escape") close();
  else return;
  e.preventDefault();
}
