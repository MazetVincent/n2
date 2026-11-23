import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { z } from "zod";
import { Badge, button, Card, Segmented, SourceView, ToggleButton } from "~/components/ds";
import { setBranchFilter, useBranchFilter } from "~/features/branches/filter";
import { LaneBar } from "~/features/map/LaneBar";
import { MapSearch, type MapSearchHit } from "~/features/map/MapSearch";
import { MapSvg, type Overlay } from "~/features/map/MapSvg";
import { Panel, type PanelActions } from "~/features/map/Panel";
import { Tags } from "~/features/map/Tags";
import { fileOwner, layout, mapParamsKey, paramsFromSelection, sameTag, selectionFromParams, selectionReducer, type Selection, type SelectionAction } from "~/features/map/model";
import { ok, useBranch, useCodeMap } from "~/lib/data";
import { m, msg } from "~/lib/i18n";
import { getImpact } from "~/server/fns";
import type { CodeMapData, DocHit } from "~/server/types";

// Paramètres d'URL : la sélection de la carte (partie, sous-dossier, librairie cherchée, fiche, couche, fichier
// d'impact, points chauds) y reste, mise à jour à chaque choix sans ajouter de page à l'historique : un lien d'un autre
// onglet, la recherche ⌘K et le bouton retour l'ouvrent telle quelle (src/features/map/model.ts, MapParams).
// ?branche=… (route racine, gardé sur tous les onglets) : branche du calque « Ma branche » (interrupteur de la barre
// du haut) ; ?vue=branche allume cet interrupteur, puis est retiré.
const text = z.string().max(300).optional().catch(undefined);
const search = z.object({
  node: text,
  sub: text,
  lib: text,
  fiche: text,
  couche: text,
  file: text,
  vue: z.enum(["branche", "chauds"]).optional().catch(undefined),
});

export const Route = createFileRoute("/carte")({ validateSearch: search, component: MapPage });

function MapPage() {
  const q = useCodeMap();
  const data = ok(q);
  return (
    <div className="map-root">
      {data ? (
        <MapView data={data} />
      ) : (
        <Card title={m.map_project_map()}>
          <SourceView query={q} skeletons={1}>
            {() => null}
          </SourceView>
        </Card>
      )}
    </div>
  );
}

const pref = (key: string, fallback: boolean) => {
  try {
    const v = localStorage.getItem(`n2.map.${key}`);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
};
// Panneau de droite : largeur de base, minimum, et largeur à partir de laquelle son contenu passe sur deux colonnes.
// La carte garde toujours MAP_MIN px (aussi en CSS : src/styles/map.css, .map-layout).
const PANEL_BASE = 360;
const PANEL_MIN = 300;
const PANEL_TWO_COLS = 620;
const MAP_MIN = 320;
const LAYOUT_GAP = 16;

/** Largeur retenue du panneau ; l'ancien choix « panneau large » (n2.map.expanded) devient les 2/3 */
function readPanelWidth(): number | null {
  try {
    const w = Number(localStorage.getItem("n2.map.panelWidth"));
    if (w >= PANEL_MIN) return Math.round(w);
  } catch {
    return null;
  }
  return pref("expanded", false) ? Math.round(((window.innerWidth - 80) * 2) / 3) : null;
}
function savePanelWidth(w: number | null) {
  try {
    if (w) localStorage.setItem("n2.map.panelWidth", String(w));
    else localStorage.removeItem("n2.map.panelWidth");
    localStorage.removeItem("n2.map.expanded");
  } catch {
    /* préférence non retenue */
  }
}

function MapView({ data }: { data: CodeMapData }) {
  const params = Route.useSearch();
  const navigate = Route.useNavigate();
  const branchQ = useBranch(params.branche);
  const branch = ok(branchQ);
  // état de départ tiré de l'adresse : la carte s'ouvre directement sur la sélection demandée
  const [sel, dispatch] = useReducer(mapReducer, undefined, () => selectionFromParams(params, data));
  // à l'arrivée : tests et stories + tous les liens affichés, calque « Couches »
  const [tests, setTests] = useState(true);
  const [allEdges, setAllEdges] = useState(true);
  // largeur du panneau de droite (px, null : largeur de base), choisie à la poignée : clic ou glisser ; retenue
  const [panelW, setPanelW] = useState<number | null>(null);
  // calque choisi ; l'interrupteur « Ma branche » de la barre du haut affiche à la place les parties touchées par la branche
  const [overlayKind, setOverlayKind] = useState<"none" | "hot">(params.vue === "chauds" ? "hot" : "none");
  const filtered = useBranchFilter();
  const [impactFile, setImpactFile] = useState<string | null>(params.file ?? null);
  // passage de README choisi dans la recherche (affiché en haut du panneau)
  const [doc, setDoc] = useState<DocHit | null>(null);
  const goTo = useNavigate();
  const [hovered, setHovered] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number | null>(null); // null = ajusté à la largeur
  const [fitWidth, setFitWidth] = useState(1000);
  const canvasRef = useRef<HTMLDivElement>(null);

  // préférences retenues (lues après le premier rendu : le serveur ne connaît pas le localStorage)
  useEffect(() => {
    setPanelW(readPanelWidth());
  }, []);

  // Adresse → carte : une nouvelle adresse alors que la carte est déjà ouverte (recherche ⌘K, onglet « Carte »…).
  // `written` : la dernière adresse écrite par la carte elle-même, qui n'est pas réappliquée.
  const written = useRef(mapParamsKey(params));
  useEffect(() => {
    if (params.vue === "branche") setBranchFilter(true);
    const key = mapParamsKey(params);
    if (key === written.current) return;
    written.current = key;
    dispatch({ type: "replace", sel: selectionFromParams(params, data) });
    setImpactFile(params.file ?? null);
    setOverlayKind(params.vue === "chauds" ? "hot" : "none");
    setDoc(null);
  }, [params, data]);

  // Carte → adresse : chaque choix remplace l'adresse (sans nouvelle page dans l'historique)
  useEffect(() => {
    const next = paramsFromSelection(sel, impactFile, overlayKind === "hot");
    const key = mapParamsKey(next);
    if (key === mapParamsKey(params) && params.vue !== "branche") return;
    written.current = key;
    void navigate({ search: (s) => ({ ...s, ...next }), replace: true, resetScroll: false });
    // l'adresse suit l'état ; elle n'est pas une dépendance (sinon elle serait réécrite avant d'être appliquée)
  }, [sel, impactFile, overlayKind]);

  const lay = useMemo(() => layout(data, tests), [data, tests]);
  const fit = Math.max(0.65, Math.min(1, (fitWidth - 4) / lay.width));
  const z = zoom ?? fit;

  // largeur disponible (pour le zoom « ajusté »)
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFitWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ⌘/Ctrl + molette (ou pincement du trackpad) : zoom autour du curseur
  const pendingScroll = useRef<{ left: number; top: number } | null>(null);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      setZoom((prev) => {
        const before = prev ?? fit;
        const after = Math.min(1.8, Math.max(0.35, before * Math.exp(-e.deltaY * 0.0015)));
        pendingScroll.current = { left: ((el.scrollLeft + mx) / before) * after - mx, top: ((el.scrollTop + my) / before) * after - my };
        return after;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [fit]);
  useLayoutEffect(() => {
    const el = canvasRef.current;
    if (el && pendingScroll.current) {
      el.scrollLeft = pendingScroll.current.left;
      el.scrollTop = pendingScroll.current.top;
      pendingScroll.current = null;
    }
  });

  // Glisser le fond de la carte pour se déplacer
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const [grabbing, setGrabbing] = useState(false);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as Element).closest(".node, .lane-btn, button")) return;
    const el = canvasRef.current!;
    drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) > 4) {
      d.moved = true;
      setGrabbing(true);
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    }
    if (d.moved) {
      canvasRef.current!.scrollLeft = d.left - dx;
      canvasRef.current!.scrollTop = d.top - dy;
    }
  };
  const onPointerUp = () => {
    const moved = drag.current?.moved;
    drag.current = null;
    setGrabbing(false);
    // un simple clic sur le fond désélectionne ; un glisser, non
    if (moved === false) dispatch({ type: "select", id: null, data });
  };

  const scrollTo = (id: string) => requestAnimationFrame(() => canvasRef.current?.querySelector(`[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" }));

  const act: PanelActions = {
    select: (id, opts) => {
      dispatch({ type: "select", id, sub: opts?.sub ?? null, openLib: opts?.openLib ?? null, data });
      scrollTo(id);
    },
    query: (lib) => dispatch({ type: "query", lib }),
    layer: (c) => dispatch({ type: "layer", layer: sel.layer === c ? null : c }),
    focusLib: (lib) => dispatch({ type: "focusLib", lib }),
    close: () => dispatch({ type: "activate", tag: null, data }),
    impact: setImpactFile,
    hover: setHovered,
    closeDoc: () => setDoc(null),
    openDoc: (hit) => {
      setDoc(hit);
      const owner = hit.file && ownerOf(data, hit.file);
      if (owner) dispatch({ type: "select", id: owner, data });
    },
  };

  // Calque affiché : impact (prioritaire), branche, points chauds
  const impactCounts = useImpactCounts(impactFile);
  const overlay: Overlay = impactCounts
    ? { kind: "counts", style: "impact", counts: impactCounts, label: m.map_impact() }
    : filtered && branch
      ? { kind: "counts", style: "branch", counts: branch.nodes, label: m.common_my_branch() }
      : overlayKind === "hot"
        ? { kind: "hot" }
        : { kind: "none" };

  // Poignée du panneau : un clic passe de la largeur de base au panneau large (2/3) et inversement ;
  // la glisser règle la largeur à la souris. Flèches du clavier : ±40 px.
  const layoutRef = useRef<HTMLDivElement>(null);
  const resize = useRef<{ x: number; moved: boolean } | null>(null);
  const [resizing, setResizing] = useState(false);
  const panelLimits = () => {
    const w = layoutRef.current?.clientWidth ?? 1200;
    return { w, max: Math.max(PANEL_MIN, w - MAP_MIN - LAYOUT_GAP) };
  };
  const applyWidth = (px: number | null) => {
    setPanelW(px);
    savePanelWidth(px);
  };
  const toggleExpanded = () => {
    const { w, max } = panelLimits();
    applyWidth((panelW ?? PANEL_BASE) > PANEL_BASE + 80 ? null : Math.min(max, Math.round(((w - LAYOUT_GAP) * 2) / 3)));
    if (sel.selected) scrollTo(sel.selected);
  };
  const onGripDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    resize.current = { x: e.clientX, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onGripMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const r = resize.current;
    if (!r) return;
    if (!r.moved && Math.abs(e.clientX - r.x) < 4) return;
    if (!r.moved) {
      r.moved = true;
      setResizing(true);
    }
    const rect = layoutRef.current!.getBoundingClientRect();
    const { max } = panelLimits();
    setPanelW(Math.round(Math.min(max, Math.max(PANEL_MIN, rect.right - e.clientX))));
  };
  const onGripUp = () => {
    const r = resize.current;
    resize.current = null;
    if (!r) return;
    if (!r.moved) return toggleExpanded(); // simple clic
    setResizing(false);
    setPanelW((w) => {
      savePanelWidth(w);
      return w;
    });
  };
  // geste interrompu (le système reprend la main) : ni clic, ni largeur retenue
  const onGripCancel = () => {
    resize.current = null;
    setResizing(false);
  };
  const onGripKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const { max } = panelLimits();
    applyWidth(Math.min(max, Math.max(PANEL_MIN, (panelW ?? PANEL_BASE) + (e.key === "ArrowLeft" ? 40 : -40))));
  };
  const expanded = (panelW ?? PANEL_BASE) >= PANEL_TWO_COLS;

  // Choix dans la recherche : librairie, partie, fichier (calque impact), passage de README ou du guide
  const pick = (h: MapSearchHit) => {
    if (h.kind !== "doc") setDoc(null);
    switch (h.kind) {
      case "lib":
        return dispatch({ type: "query", lib: h.name });
      case "node":
        return act.select(h.id);
      case "sub":
        return act.select(h.id, { sub: h.sub });
      case "file": {
        setImpactFile(h.file);
        const owner = ownerOf(data, h.file);
        return owner && act.select(owner);
      }
      case "doc": {
        if (h.hit.kind === "guide" && h.hit.target) return goTo({ to: "/guide", search: { p: h.hit.target } });
        setDoc(h.hit);
        const owner = h.hit.file && ownerOf(data, h.hit.file);
        return owner && act.select(owner);
      }
    }
  };

  return (
    <Card
      title={m.map_project_map()}
      meta={m.map_parts_files_analysed_ms({ project: data.project, nodes: data.nodes.length, totalFiles: data.totalFiles, durationMs: data.durationMs })}
      controls={
        <>
          {filtered ? (
            <Badge tone="accent">
              {m.map_branch_overlay()}
              {branch && ` · ${m.common_files({ files: branch.files.length })}`}
            </Badge>
          ) : (
            <Segmented
              label={m.map_map_overlay()}
              value={overlayKind}
              onChange={setOverlayKind}
              items={[
                { value: "none", label: m.map_layers() },
                { value: "hot", label: m.map_hotspots(), count: data.hotspots.length || undefined },
              ]}
            />
          )}
          {filtered && branchQ.data && !branchQ.data.ok && <span className="small" style={{ color: "var(--colors-bad)" }}>{msg(branchQ.data.error.message)}</span>}
          <Tags data={data} sel={sel} onActivate={(t) => dispatch({ type: "activate", tag: t, data })} onRemove={(t) => dispatch({ type: "removeTag", tag: t, data })} />
        </>
      }
    >
      <div className="map-toolbar">
        <MapSearch data={data} tests={tests} value={sel.query} onPick={pick} onClear={() => sel.query && dispatch({ type: "query", lib: "" })} />
        <ToggleButton pressed={tests} onChange={setTests}>
          {m.map_tests_stories()}
        </ToggleButton>
        <ToggleButton pressed={allEdges} onChange={setAllEdges}>
          {m.map_all_links()}
        </ToggleButton>
        <div className="map-zoom" role="group" aria-label={m.map_map_zoom()}>
          <button type="button" className={button({ size: "sm" })} aria-label={m.map_zoom_out()} onClick={() => setZoom(Math.max(0.35, z - 0.1))}>
            −
          </button>
          <span className="small muted">{Math.round(z * 100)} %</span>
          <button type="button" className={button({ size: "sm" })} aria-label={m.map_zoom()} onClick={() => setZoom(Math.min(1.8, z + 0.1))}>
            +
          </button>
          <button type="button" className={button({ size: "sm" })} onClick={() => setZoom(null)}>
            {m.map_fit()}
          </button>
        </div>
      </div>
      <div
        ref={layoutRef}
        className={`map-layout${expanded ? " expanded" : ""}${resizing ? " resizing" : ""}`}
        style={panelW ? ({ "--panel-w": `${panelW}px` } as React.CSSProperties) : undefined}
      >
        <div
          ref={canvasRef}
          className={`map-canvas${grabbing ? " grabbing" : ""}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <LaneBar
            data={data}
            cols={lay.cols}
            nodes={lay.nodes}
            zoom={z}
            width={lay.width}
            sel={sel}
            onLayer={(c) => act.layer(c)}
            onSelect={(id, sub) => act.select(id, { sub })}
            onHover={setHovered}
          />
          <MapSvg
            data={data}
            layoutResult={lay}
            zoom={z}
            sel={sel}
            tests={tests}
            allEdges={allEdges}
            hovered={hovered}
            overlay={overlay}
            onHover={setHovered}
            onNode={(id) => (id === sel.selected && !sel.sub ? dispatch({ type: "select", id: null, data }) : act.select(id))}
          />
        </div>
        <div className="map-side">
          <button
            type="button"
            className="panel-grip"
            onPointerDown={onGripDown}
            onPointerMove={onGripMove}
            onPointerUp={onGripUp}
            onPointerCancel={onGripCancel}
            onKeyDown={onGripKey}
            onClick={(e) => e.detail === 0 && toggleExpanded()} // Entrée ou Espace au clavier (la souris passe par onGripUp)
            aria-expanded={expanded}
            aria-label={expanded ? m.map_panel_narrow() : m.map_panel_widen()}
            title={`${expanded ? m.map_panel_narrow() : m.map_panel_widen()} · ${m.map_panel_drag()}`}
          >
            <span aria-hidden="true">{expanded ? "›" : "‹"}</span>
          </button>
          <Panel data={data} sel={sel} tests={tests} impactFile={impactFile} doc={doc} branch={branch} branchOn={filtered} act={act} />
        </div>
      </div>
    </Card>
  );
}

const ownerOf = fileOwner;

/** Les actions de la sélection, plus « replace » : la sélection décrite par une nouvelle adresse (les tags déjà posés restent) */
function mapReducer(s: Selection, a: SelectionAction | { type: "replace"; sel: Selection }): Selection {
  if (a.type !== "replace") return selectionReducer(s, a);
  const trail = [...s.trail.filter((t) => !a.sel.trail.some((n) => sameTag(n, t))), ...a.sel.trail].slice(-8);
  return { ...a.sel, trail };
}

// Nombre de fichiers touchés par partie, pour le calque « impact »
function useImpactCounts(file: string | null): Record<string, number> | null {
  const q = useQuery({ queryKey: ["impact", file], queryFn: () => getImpact({ data: { file: file! } }), enabled: Boolean(file), staleTime: 5 * 60_000 });
  return file && q.data?.ok ? q.data.data.byNode : null;
}
