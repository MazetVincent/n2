// Recherche globale ⌘K : construction de l'index et filtrage.
import { describe, expect, it } from "vitest";
import { buildIndex, searchIndex } from "../src/features/search/index.ts";
import type { CodeMapData, PullRequest, PullRequestsData } from "../src/server/types.ts";

const pr = (n: number, title: string): PullRequest => ({
  number: n,
  title,
  url: `https://github.com/x/y/pull/${n}`,
  repo: "x/y",
  author: "a",
  state: "OPEN",
  isDraft: false,
  reviewDecision: null,
  mergeable: "MERGEABLE",
  ci: "SUCCESS",
  updatedAt: "",
  myReview: null,
  jira: [],
  branch: "feat/x",
});
const prs: PullRequestsData = { me: "me", mine: [pr(1, "Ajouter le panier")], approved: [pr(2, "Corriger la caisse")], commented: [pr(2, "Corriger la caisse")], reviewRequested: [], searchUrl: "" };
const map: CodeMapData = {
  project: "demo",
  nodes: [
    {
      id: "apps/web/src/features",
      label: "web · features",
      workspace: "apps/web",
      path: "apps/web/src/features",
      category: "front",
      mix: {},
      files: 10,
      testFiles: 0,
      libs: [{ name: "zod", files: 3, testFiles: 0 }],
      contains: [{ name: "checkout", path: "apps/web/src/features/checkout", files: 4, libs: [], topFiles: [] }],
      topFiles: [],
    },
  ],
  edges: [],
  totalFiles: 10,
  topFiles: [{ file: "packages/shared/src/money.ts", node: "packages/shared", importers: 9, fromParts: 2, generated: false }],
  hotspots: [],
  durationMs: 1,
};
const index = buildIndex({ tabs: [{ to: "/carte", label: "Carte" }], prs, map });

describe("recherche globale", () => {
  it("indexe chaque élément une seule fois (une PR approuvée et commentée n'apparaît qu'une fois)", () => {
    expect(index.filter((i) => i.id.startsWith("pr:"))).toHaveLength(2);
  });

  it("trouve sans tenir compte des accents ni de la casse, tous les mots devant correspondre", () => {
    expect(searchIndex(index, "CAISSE").map((i) => i.label)).toEqual(["Corriger la caisse"]);
    expect(searchIndex(index, "features checkout").map((i) => i.label)).toEqual(["web · features › checkout"]);
    expect(searchIndex(index, "panier caisse")).toEqual([]);
  });

  it("mène vers la carte pour une partie, une librairie ou un fichier (avec l'impact)", () => {
    expect(searchIndex(index, "zod")[0].action).toEqual({ kind: "route", to: "/carte", search: { lib: "zod" } });
    expect(searchIndex(index, "money")[0].action).toEqual({ kind: "route", to: "/carte", search: { file: "packages/shared/src/money.ts" } });
  });

  it("propose les onglets et les PR quand la recherche est vide", () => {
    expect(searchIndex(index, "").map((i) => i.group)).toEqual(["Onglets", "Pull requests", "Pull requests"]);
  });
});
