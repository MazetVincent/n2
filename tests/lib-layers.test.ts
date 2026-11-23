// Onglet Librairies › Dépendances par package.json : couche de chaque package.json et ordre des filtres.
import { describe, expect, it } from "vitest";
import { groupByLayer, layerOfPackage, masonry } from "../src/features/libs/layers.ts";
import { CATS } from "../src/features/map/model.ts";
import type { Category, MapNode } from "../src/server/types.ts";

const node = (id: string, workspace: string, category: Category, files = 10): MapNode => ({
  id,
  label: id,
  workspace,
  path: id,
  category,
  mix: { [category]: files },
  files,
  testFiles: 0,
  libs: [],
  contains: [],
  topFiles: [],
});

const nodes = [
  node("apps/web", "apps/web", "front"),
  node("apps/api", "apps/api", "api"),
  // un dossier découpé en sous-parties : la couche qui a le plus de fichiers l'emporte
  node("packages/core/src/server", "packages/core", "back", 40),
  node("packages/core/src/types", "packages/core", "shared", 5),
  node("(racine)/scripts", "(racine)/scripts", "tooling"),
  node("(racine)/infra", "(racine)/infra", "infra", 3),
];

describe("layerOfPackage", () => {
  it.each([
    ["dossier qui est une partie", "apps/web", "front"],
    ["partie découpée : la couche majoritaire", "packages/core", "back"],
    ["sous-dossier plus profond que la carte : le parent le plus proche", "apps/api/lambdas/cron", "api"],
    ["racine : les parties de la racine", "", "tooling"],
    ["aucune partie", "tools/eslint-config", null],
  ])("%s", (_l, path, layer) => expect(layerOfPackage(path, nodes)).toBe(layer));
});

describe("groupByLayer", () => {
  const parts = [
    { path: "a", label: "a", n: 2, layer: "front" as const },
    { path: "b", label: "b", n: 9, layer: "front" as const },
    { path: "c", label: "c", n: 5, layer: null },
    { path: "d", label: "d", n: 9, layer: "back" as const },
    { path: "e", label: "e", n: 9, layer: "front" as const },
  ];
  const groups = groupByLayer(parts, (p) => p.layer, (p) => p.n, CATS);

  it("suit l'ordre des couches de la carte, « Autres » en dernier, sans groupe vide", () => {
    expect(groups.map((g) => g.layer)).toEqual(["front", "back", null]);
  });

  it("dans une couche : du plus grand nombre de dépendances au plus petit, puis par nom", () => {
    expect(groups[0].parts.map((p) => p.path)).toEqual(["b", "e", "a"]);
  });
});

describe("masonry", () => {
  it("place chaque bloc dans la colonne la moins haute, à égalité la plus à gauche", () => {
    expect(masonry([400, 100, 300, 100, 100], 3)).toEqual([[0], [1, 3, 4], [2]]);
  });

  it("utilise toutes les colonnes disponibles quand il y a assez de blocs", () => {
    expect(masonry([400, 400, 120, 100, 300], 4).every((c) => c.length > 0)).toBe(true);
  });

  it("jamais plus de colonnes que de blocs, et au moins une", () => {
    expect(masonry([200, 100], 4)).toEqual([[0], [1]]);
    expect(masonry([], 4)).toEqual([[]]);
    expect(masonry([100], 0)).toEqual([[0]]);
  });
});
