// Carte du projet : constantes, disposition (fonctions pures) et état de la sélection.
import { m } from "~/lib/i18n";
import type { Category, CodeMapData, MapLib, MapNode } from "~/server/types";

// Libellés résolus à l'affichage (la langue est lue au rendu, pas à l'import)
const CAT_NAMES: Record<Category, () => string> = {
  front: m.map_cat_front,
  api: m.map_cat_api,
  back: m.map_cat_back,
  shared: m.map_cat_shared,
  infra: m.map_cat_infra,
  tooling: m.map_cat_tooling,
};
export const CATS = Object.keys(CAT_NAMES) as Category[];
export const catLabel = (c: Category) => CAT_NAMES[c]();
export const layerInfo = (c: Category): string => {
  switch (c) {
    case "front":
      return m.map_what_runs_browser_pages_react();
    case "api":
      return m.map_exchange_layer_trpc_routers_generated();
    case "back":
      return m.map_what_runs_server_server_functions();
    case "shared":
      return m.map_environment_neutral_code_shared_across();
    case "infra":
      return m.map_infrastructure_as_code_deployment_cloud();
    case "tooling":
      return m.map_development_tooling_cli_scripts_code();
  }
};

export const COL_W = 190;
export const GAP_X = 80;
export const PAD = 24;
export const HEAD = 30;
export const GAP_Y = 12;

export const libLabel = (name: string) => (name === "node:*" ? "Node.js (node:*)" : name);
export const libCount = (l: MapLib, tests: boolean) => l.files + (tests ? l.testFiles : 0);
export const visibleNodes = (data: CodeMapData, tests: boolean) => data.nodes.filter((n) => n.files > 0 || (tests && n.testFiles > 0));
export const nodeLibs = (n: MapNode, tests: boolean) =>
  n.libs.filter((l) => libCount(l, tests) > 0).sort((a, b) => libCount(b, tests) - libCount(a, tests) || a.name.localeCompare(b.name));

export function allLibs(data: CodeMapData, tests: boolean) {
  const totals = new Map<string, { name: string; files: number; parts: number }>();
  for (const n of visibleNodes(data, tests)) {
    for (const l of n.libs) {
      const c = libCount(l, tests);
      if (!c) continue;
      const t = totals.get(l.name) ?? { name: l.name, files: 0, parts: 0 };
      t.files += c;
      t.parts += 1;
      totals.set(l.name, t);
    }
  }
  return [...totals.values()].sort((a, b) => b.files - a.files);
}

// ---------- Disposition : une colonne par couche, ordre qui limite les croisements ----------
export interface Pos {
  x: number;
  y: number;
  w: number;
  h: number;
  col: number;
}

export function layout(data: CodeMapData, tests: boolean) {
  const nodes = visibleNodes(data, tests);
  const cols = CATS.filter((c) => nodes.some((n) => n.category === c));
  const pos = new Map<string, Pos>();
  const height = (n: MapNode) => 44 + Math.min(56, Math.round(Math.sqrt(n.files + (tests ? n.testFiles : 0)) * 2.2));
  const byCol = cols.map((c) => nodes.filter((n) => n.category === c).sort((a, b) => b.files - a.files));
  const neighbors = new Map(nodes.map((n) => [n.id, [] as string[]]));
  for (const e of data.edges) {
    if (neighbors.has(e.from) && neighbors.has(e.to)) {
      neighbors.get(e.from)!.push(e.to);
      neighbors.get(e.to)!.push(e.from);
    }
  }
  const place = () =>
    byCol.forEach((list, ci) => {
      let y = PAD + HEAD;
      for (const n of list) {
        const h = height(n);
        pos.set(n.id, { x: PAD + ci * (COL_W + GAP_X), y, w: COL_W, h, col: ci });
        y += h + GAP_Y;
      }
    });
  place();
  // Deux passes « barycentre » : chaque partie se rapproche verticalement de ses voisines
  for (let pass = 0; pass < 2; pass++) {
    for (const list of byCol) {
      const score = new Map(
        list.map((n) => {
          const me = pos.get(n.id)!;
          const ys = neighbors
            .get(n.id)!
            .map((id) => pos.get(id))
            .filter((p): p is Pos => Boolean(p) && p!.col !== me.col)
            .map((p) => p.y + p.h / 2);
          return [n.id, ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : me.y] as const;
        }),
      );
      list.sort((a, b) => score.get(a.id)! - score.get(b.id)!);
    }
    place();
  }
  const width = PAD * 2 + cols.length * COL_W + Math.max(0, cols.length - 1) * GAP_X;
  const heightTotal = Math.max(...[...pos.values()].map((p) => p.y + p.h), 200) + PAD;
  return { cols, pos, width, height: heightTotal, nodes };
}

/** Courbe de Bézier entre deux parties (de droite à gauche selon le sens) */
export function edgePoints(a: Pos, b: Pos): [number, number][] {
  if (a.col === b.col) {
    const x = a.x + a.w;
    const y1 = a.y + a.h / 2;
    const y2 = b.y + b.h / 2;
    return [
      [x, y1],
      [x + 50, y1],
      [x + 50, y2],
      [x + 2, y2],
    ];
  }
  const fwd = b.col > a.col;
  const x1 = fwd ? a.x + a.w : a.x;
  const x2 = fwd ? b.x - 2 : b.x + b.w + 2;
  const y1 = a.y + a.h / 2;
  const y2 = b.y + b.h / 2;
  const dx = Math.max(40, Math.abs(x2 - x1) / 2);
  return [
    [x1, y1],
    [x1 + (fwd ? dx : -dx), y1],
    [x2 + (fwd ? -dx : dx), y2],
    [x2, y2],
  ];
}

/** Liens d'une couche avec les autres : nombre d'imports reçus (inc) et émis (out) par couche, du plus fort au plus faible */
export function layerInteractions(data: CodeMapData, c: Category, visible: Set<string>) {
  const cat = new Map(data.nodes.map((n) => [n.id, n.category]));
  const inc = new Map<Category, number>();
  const out = new Map<Category, number>();
  for (const e of data.edges) {
    const from = cat.get(e.from);
    const to = cat.get(e.to);
    if (!from || !to || from === to || !visible.has(e.from) || !visible.has(e.to)) continue;
    if (to === c) inc.set(from, (inc.get(from) ?? 0) + e.weight);
    if (from === c) out.set(to, (out.get(to) ?? 0) + e.weight);
  }
  const sorted = (m: Map<Category, number>) => [...m.entries()].map(([layer, weight]) => ({ layer, weight })).sort((a, b) => b.weight - a.weight);
  return { inc: sorted(inc), out: sorted(out) };
}

/** Interactions d'une partie, numérotées par groupe dans le sens du flux (appelants, puis appelés) */
export function interactions(data: CodeMapData, id: string, visible: Set<string>) {
  const inc = data.edges.filter((e) => e.to === id && visible.has(e.from)).sort((a, b) => b.weight - a.weight);
  const out = data.edges.filter((e) => e.from === id && visible.has(e.to)).sort((a, b) => b.weight - a.weight);
  return { inc, out };
}

// ---------- Sélection : partie, sous-dossier, librairie, couche ; historique sous forme de tags ----------
export type Tag = { type: "node" | "sub" | "lib" | "cat"; id: string };
export const SUB_SEP = "::";
export const splitSub = (id: string): [string, string | null] => {
  const i = id.lastIndexOf(SUB_SEP);
  return i < 0 ? [id, null] : [id.slice(0, i), id.slice(i + SUB_SEP.length)];
};
export const sameTag = (a: Tag, b: Tag) => a.type === b.type && a.id === b.id;

export interface Selection {
  selected: string | null;
  sub: string | null;
  query: string;
  layer: Category | null;
  trail: Tag[];
  /** librairie dont la fiche remplace la liste « Librairies » d'une partie */
  lib: string | null;
}

export const emptySelection: Selection = { selected: null, sub: null, query: "", layer: null, trail: [], lib: null };

export const activeTag = (s: Selection): Tag | null =>
  s.selected
    ? s.sub
      ? { type: "sub", id: `${s.selected}${SUB_SEP}${s.sub}` }
      : { type: "node", id: s.selected }
    : s.query
      ? { type: "lib", id: s.query }
      : s.layer
        ? { type: "cat", id: s.layer }
        : null;

const withTag = (trail: Tag[], tag: Tag) => [...trail.filter((t) => !sameTag(t, tag)), tag].slice(-8);

export type SelectionAction =
  | { type: "select"; id: string | null; sub?: string | null; openLib?: string | null; data: CodeMapData }
  | { type: "query"; lib: string }
  | { type: "layer"; layer: Category | null }
  | { type: "focusLib"; lib: string | null }
  | { type: "removeTag"; tag: Tag; data: CodeMapData }
  | { type: "activate"; tag: Tag | null; data: CodeMapData };

export function selectionReducer(s: Selection, a: SelectionAction): Selection {
  switch (a.type) {
    case "select": {
      if (!a.id) return { ...s, selected: null, sub: null, lib: null };
      const node = a.data.nodes.find((n) => n.id === a.id);
      if (!node) return s;
      const sub = a.sub && node.contains.some((c) => c.name === a.sub) ? a.sub : null;
      const tag: Tag = sub ? { type: "sub", id: `${a.id}${SUB_SEP}${sub}` } : { type: "node", id: a.id };
      // une seule mise en évidence à la fois : la sélection remplace la recherche ou la couche (leur tag reste)
      return { selected: a.id, sub, query: "", layer: null, trail: withTag(s.trail, tag), lib: a.openLib ?? null };
    }
    case "query":
      return { ...s, query: a.lib, selected: null, sub: null, layer: null, trail: a.lib ? withTag(s.trail, { type: "lib", id: a.lib }) : s.trail, lib: null };
    case "layer":
      return { ...s, layer: a.layer, selected: null, sub: null, query: "", trail: a.layer ? withTag(s.trail, { type: "cat", id: a.layer }) : s.trail };
    case "focusLib":
      return { ...s, lib: a.lib };
    case "activate": {
      const t = a.tag;
      if (!t) return { ...s, selected: null, sub: null, query: "", layer: null, lib: null };
      if (t.type === "node") return selectionReducer(s, { type: "select", id: t.id, data: a.data });
      if (t.type === "sub") {
        const [id, sub] = splitSub(t.id);
        return selectionReducer(s, { type: "select", id, sub, data: a.data });
      }
      if (t.type === "lib") return selectionReducer(s, { type: "query", lib: t.id });
      return selectionReducer(s, { type: "layer", layer: t.id as Category });
    }
    case "removeTag": {
      const active = activeTag(s);
      const idx = s.trail.findIndex((t) => sameTag(t, a.tag));
      const trail = s.trail.filter((t) => !sameTag(t, a.tag));
      const next = { ...s, trail };
      // fermer le tag actif ramène au tag d'avant (ou au suivant s'il n'y en a pas avant)
      if (active && sameTag(active, a.tag)) return selectionReducer(next, { type: "activate", tag: trail[idx - 1] ?? trail[idx] ?? null, data: a.data });
      return next;
    }
  }
}

// ---------- Sélection ↔ adresse (?node=…) : le bouton retour retrouve la carte telle qu'on l'a laissée ----------
/** Paramètres d'adresse de la carte (hors ?branche=, de la route racine) */
export interface MapParams {
  /** partie choisie, et son sous-dossier */
  node?: string;
  sub?: string;
  /** librairie cherchée (mise en évidence sur la carte) */
  lib?: string;
  /** fiche de librairie ouverte dans le panneau de la partie */
  fiche?: string;
  /** couche choisie */
  couche?: string;
  /** fichier dont l'impact est affiché */
  file?: string;
  /** « branche » : allume « Ma branche » (lien entrant, retiré ensuite) ; « chauds » : calque des points chauds */
  vue?: "branche" | "chauds";
}

/** Sélection décrite par l'adresse ; un fichier sans partie choisie sélectionne la partie qui le contient */
export function selectionFromParams(p: MapParams, data: CodeMapData): Selection {
  let s = emptySelection;
  if (p.couche && (CATS as string[]).includes(p.couche)) s = selectionReducer(s, { type: "layer", layer: p.couche as Category });
  if (p.lib) s = selectionReducer(s, { type: "query", lib: p.lib });
  const node = p.node ?? (p.file ? fileOwner(data, p.file) : undefined);
  if (node) s = selectionReducer(s, { type: "select", id: node, sub: p.sub ?? null, openLib: p.fiche ?? null, data });
  return s;
}

/** Adresse qui décrit la carte (clés absentes : undefined, pour les retirer de l'adresse) */
export function paramsFromSelection(s: Selection, impactFile: string | null, hot: boolean): Record<Exclude<keyof MapParams, "vue">, string | undefined> & { vue: "chauds" | undefined } {
  return {
    node: s.selected ?? undefined,
    sub: (s.selected && s.sub) || undefined,
    lib: s.query || undefined,
    fiche: (s.selected && s.lib) || undefined,
    couche: s.layer ?? undefined,
    file: impactFile ?? undefined,
    vue: hot ? "chauds" : undefined,
  };
}

/** Clé de comparaison de deux adresses de la carte (« vue=branche » n'en fait pas partie : il est retiré à l'arrivée) */
export const mapParamsKey = (p: MapParams) => JSON.stringify([p.node, p.sub, p.lib, p.fiche, p.couche, p.file, p.vue === "chauds"].map((v) => v ?? null));

/** Partie de la carte qui contient un fichier (la plus précise) */
export function fileOwner(data: CodeMapData, file: string): string | undefined {
  return data.nodes.filter((n) => file.startsWith(`${n.path}/`)).sort((a, b) => b.path.length - a.path.length)[0]?.id;
}
