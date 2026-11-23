// Couche de la carte (Front, API, Back…) de chaque package.json, pour regrouper les filtres de l'onglet
// « Dépendances par package.json ». Fonctions pures, testées dans tests/lib-layers.test.ts.
import type { Category, MapNode } from "../../server/types.ts";

const ROOT_WS = "(racine)";

/**
 * Couche d'un package.json (`path` relatif au projet, "" pour la racine) d'après les parties de la carte :
 * celles de son dossier, sinon du dossier parent le plus proche qui est une partie (la carte ne descend pas
 * à toutes les profondeurs). Si le dossier est découpé en sous-parties de couches différentes, la couche
 * qui a le plus de fichiers l'emporte. null : aucune partie de la carte ne correspond.
 */
export function layerOfPackage(path: string, nodes: readonly MapNode[]): Category | null {
  let mine: readonly MapNode[] = [];
  if (!path) mine = nodes.filter((n) => n.workspace.startsWith(ROOT_WS));
  else {
    const parts = path.split("/");
    for (let i = parts.length; i > 0 && !mine.length; i--) {
      const ws = parts.slice(0, i).join("/");
      mine = nodes.filter((n) => n.workspace === ws);
    }
  }
  if (!mine.length) return null;
  const score = new Map<Category, number>();
  for (const n of mine) score.set(n.category, (score.get(n.category) ?? 0) + Math.max(n.files + n.testFiles, 1));
  return [...score.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export interface LayerGroup<P> {
  /** null : package.json sans couche connue (« Autres ») */
  layer: Category | null;
  parts: P[];
}

/**
 * package.json regroupés par couche, dans l'ordre des couches de la carte (puis « Autres ») ;
 * dans chaque couche, du plus grand nombre de dépendances au plus petit (puis par nom).
 */
export function groupByLayer<P extends { path: string; label: string }>(
  parts: readonly P[],
  layerOf: (p: P) => Category | null,
  count: (p: P) => number,
  order: readonly Category[],
): LayerGroup<P>[] {
  const groups = [...order, null].map((layer) => ({ layer, parts: parts.filter((p) => layerOf(p) === layer) }));
  for (const g of groups) g.parts.sort((a, b) => count(b) - count(a) || a.label.localeCompare(b.label));
  return groups.filter((g) => g.parts.length);
}

/**
 * Répartition « maçonnerie » des blocs en `cols` colonnes : chaque bloc, dans l'ordre, va dans la colonne
 * la moins haute (à égalité, la plus à gauche). Renvoie les index des blocs de chaque colonne.
 */
export function masonry(heights: readonly number[], cols: number): number[][] {
  const n = Math.max(1, Math.min(cols, heights.length || 1));
  const columns = Array.from({ length: n }, () => ({ h: 0, items: [] as number[] }));
  heights.forEach((h, i) => {
    const col = columns.reduce((best, c) => (c.h < best.h ? c : best));
    col.items.push(i);
    col.h += h;
  });
  return columns.map((c) => c.items);
}
