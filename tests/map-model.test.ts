// Sélection de la carte (tags, retour au précédent) et logique « À faire maintenant ».
import { describe, expect, it } from "vitest";
import { activeTag, emptySelection, layerInteractions, mapParamsKey, paramsFromSelection, selectionFromParams, selectionReducer, type Selection } from "../src/features/map/model.ts";
import { computeTodo } from "../src/features/todo/logic.ts";
import type { CodeMapData, MapNode, PullRequest, PullRequestsData } from "../src/server/types.ts";

const node = (id: string, contains: string[] = []): MapNode => ({
  id,
  label: id,
  workspace: id,
  path: id,
  category: "front",
  mix: {},
  files: 1,
  testFiles: 0,
  libs: [],
  contains: contains.map((name) => ({ name, path: `${id}/${name}`, files: 1, libs: [], topFiles: [] })),
  topFiles: [],
});
const data: CodeMapData = { project: "demo", nodes: [node("a", ["hooks"]), node("b")], edges: [], totalFiles: 2, topFiles: [], hotspots: [], durationMs: 1 };

describe("sélection de la carte ↔ adresse", () => {
  it("relit à l'identique ce qu'elle écrit : partie, sous-dossier, fiche, fichier, points chauds", () => {
    const s = selectionReducer(emptySelection, { type: "select", id: "a", sub: "hooks", openLib: "zod", data });
    const p = paramsFromSelection(s, "a/hooks/x.ts", true);
    expect(p).toEqual({ node: "a", sub: "hooks", lib: undefined, fiche: "zod", couche: undefined, file: "a/hooks/x.ts", vue: "chauds" });
    const back = selectionFromParams(p, data);
    expect(back).toMatchObject({ selected: "a", sub: "hooks", lib: "zod" });
    expect(mapParamsKey(paramsFromSelection(back, "a/hooks/x.ts", true))).toBe(mapParamsKey(p));
  });

  it("librairie cherchée, couche, fichier seul (sa partie est choisie)", () => {
    expect(selectionFromParams({ lib: "zod" }, data)).toMatchObject({ query: "zod", selected: null });
    expect(selectionFromParams({ couche: "api" }, data)).toMatchObject({ layer: "api" });
    expect(selectionFromParams({ couche: "inconnue" }, data).layer).toBeNull();
    expect(selectionFromParams({ file: "b/index.ts" }, data).selected).toBe("b");
  });

  it("ignore une partie inconnue ; « vue=branche » ne compte pas dans la clé", () => {
    expect(selectionFromParams({ node: "zzz" }, data)).toEqual(emptySelection);
    expect(mapParamsKey({ vue: "branche" })).toBe(mapParamsKey({}));
    expect(mapParamsKey({ vue: "chauds" })).not.toBe(mapParamsKey({}));
  });
});

describe("sélection de la carte", () => {
  const run = (...actions: Parameters<typeof selectionReducer>[1][]) => actions.reduce<Selection>(selectionReducer, emptySelection);

  it("la fiche d'une librairie remplace la liste, une nouvelle sélection la referme", () => {
    let s = run({ type: "select", id: "a", data }, { type: "focusLib", lib: "zod" });
    expect(s.lib).toBe("zod");
    s = selectionReducer(s, { type: "focusLib", lib: null });
    expect(s.lib).toBeNull();
    s = run({ type: "query", lib: "zod" }, { type: "select", id: "a", openLib: "zod", data });
    expect(s.lib).toBe("zod");
    expect(selectionReducer(s, { type: "select", id: "b", data }).lib).toBeNull();
  });

  it("ajoute un tag par sélection, sous-dossier compris", () => {
    const s = run({ type: "select", id: "a", data }, { type: "select", id: "a", sub: "hooks", data }, { type: "query", lib: "zod" });
    expect(s.trail.map((t) => t.id)).toEqual(["a", "a::hooks", "zod"]);
    expect(activeTag(s)).toEqual({ type: "lib", id: "zod" });
  });

  it("fermer le tag actif ramène au précédent, puis au suivant", () => {
    let s = run({ type: "select", id: "a", data }, { type: "select", id: "a", sub: "hooks", data }, { type: "layer", layer: "api" });
    s = selectionReducer(s, { type: "removeTag", tag: { type: "cat", id: "api" }, data });
    expect(activeTag(s)).toEqual({ type: "sub", id: "a::hooks" });
    s = selectionReducer(s, { type: "removeTag", tag: { type: "sub", id: "a::hooks" }, data });
    expect(activeTag(s)).toEqual({ type: "node", id: "a" });
    s = selectionReducer(s, { type: "removeTag", tag: { type: "node", id: "a" }, data });
    expect(activeTag(s)).toBeNull();
  });

  it("fermer un tag inactif ne change pas la sélection", () => {
    let s = run({ type: "select", id: "a", data }, { type: "select", id: "b", data });
    s = selectionReducer(s, { type: "removeTag", tag: { type: "node", id: "a" }, data });
    expect(activeTag(s)).toEqual({ type: "node", id: "b" });
  });

  it("ignore un sous-dossier inconnu et une partie inconnue", () => {
    expect(run({ type: "select", id: "a", sub: "nope", data }).sub).toBeNull();
    expect(run({ type: "select", id: "zzz", data }).selected).toBeNull();
  });
});

const pr = (over: Partial<PullRequest>): PullRequest => ({
  number: 1,
  title: "t",
  url: `https://github.com/x/${Math.random()}`,
  repo: "x/y",
  author: "a",
  state: "OPEN",
  isDraft: false,
  reviewDecision: "REVIEW_REQUIRED",
  mergeable: "MERGEABLE",
  ci: "SUCCESS",
  updatedAt: new Date().toISOString(),
  myReview: null,
  jira: [],
  branch: "feat/x",
  ...over,
});
const prs = (over: Partial<PullRequestsData>): PullRequestsData => ({ me: "me", mine: [], approved: [], commented: [], reviewRequested: [], searchUrl: "", ...over });

describe("À faire maintenant", () => {
  const now = Date.parse("2026-11-21T12:00:00Z");

  it("met en urgent une revue demandée depuis plus de 2 jours et une PR à la CI rouge", () => {
    const items = computeTodo({
      now,
      prs: prs({ reviewRequested: [pr({ updatedAt: "2026-11-18T12:00:00Z" })], mine: [pr({ ci: "FAILURE" })] }),
    });
    expect(items.map((i) => [i.label, i.urgency])).toEqual([
      ["Revue demandée", "now"],
      ["Ma PR bloquée", "now"],
    ]);
  });

  it("signale une PR prête à fusionner et un ticket en revue sans PR ouverte", () => {
    const items = computeTodo({
      now,
      prs: prs({ mine: [pr({ reviewDecision: "APPROVED", jira: [{ key: "D-1", url: "u" }] })] }),
      sprint: {
        sprint: { name: "S", goal: "", startDate: "", endDate: "", url: "" },
        issues: [
          { key: "D-1", summary: "a", url: "", type: "", priority: "", status: "En cours", category: "indeterminate", assignee: null },
          { key: "D-2", summary: "b", url: "", type: "", priority: "", status: "To Review", category: "indeterminate", assignee: null },
        ],
      },
    });
    expect(items.map((i) => i.label).sort()).toEqual(["En revue sans PR ouverte", "Prête à fusionner"]);
  });

  it("prévient quand la session AWS expire dans moins de 30 minutes", () => {
    const items = computeTodo({ now, aws: { profile: "p", expiresAt: new Date(now + 10 * 60_000).toISOString(), canReconnect: false } });
    expect(items[0]).toMatchObject({ label: "Session AWS", urgency: "info" });
  });
});

describe("liens d'une couche", () => {
  const n = (id: string, category: MapNode["category"]): MapNode => ({ ...node(id), category });
  const d: CodeMapData = {
    ...data,
    nodes: [n("f1", "front"), n("f2", "front"), n("a1", "api"), n("s1", "shared")],
    edges: [
      { from: "f1", to: "a1", weight: 3 },
      { from: "f2", to: "a1", weight: 2 },
      { from: "f1", to: "f2", weight: 9 },
      { from: "a1", to: "s1", weight: 4 },
      { from: "f1", to: "s1", weight: 1 },
    ],
  };
  it("additionne les imports par couche, sans les liens internes", () => {
    const all = new Set(d.nodes.map((x) => x.id));
    expect(layerInteractions(d, "front", all)).toEqual({ inc: [], out: [{ layer: "api", weight: 5 }, { layer: "shared", weight: 1 }] });
    expect(layerInteractions(d, "api", all)).toEqual({ inc: [{ layer: "front", weight: 5 }], out: [{ layer: "shared", weight: 4 }] });
  });
  it("ignore les parties masquées", () => {
    expect(layerInteractions(d, "api", new Set(["f1", "a1"])).inc).toEqual([{ layer: "front", weight: 3 }]);
  });
});
