// Onglet Librairies : PR ouvertes qui mettent à jour une librairie (Renovate, Dependabot, à la main).
import { describe, expect, it } from "vitest";
import { findName, namesOf, parseManifestPatch, parsePrBody, prUpdates, updatePrsFor } from "../src/lib/update-prs.ts";
import type { OpenPr } from "../src/server/types.ts";

let n = 0;
const pr = (title: string, more: Partial<OpenPr> = {}): OpenPr => ({
  number: ++n,
  title,
  url: `https://github.com/demo/demo/pull/${n}`,
  repo: "demo/demo",
  author: "alice",
  branch: "feat/autre-chose",
  isDraft: false,
  updatedAt: "2026-11-01T10:00:00Z",
  reviewDecision: null,
  mergeable: "MERGEABLE",
  ci: null,
  updates: [],
  ...more,
});
const renovate = (title: string, branch: string, body?: string) => pr(title, { author: "renovate[bot]", branch, updates: parsePrBody(body) });
const dependabot = (title: string, branch: string, body?: string) => pr(title, { author: "dependabot[bot]", branch, updates: parsePrBody(body) });

describe("findName", () => {
  it("trouve le nom comme mot entier, pas à l'intérieur d'un autre package", () => {
    expect(findName("Update dependency react to v19", "react")).toBeGreaterThan(0);
    expect(findName("Bump react@19.0.0", "react")).toBe(5);
    expect(findName("Mise à jour de React.", "react")).toBeGreaterThan(0);
    expect(findName("Update dependency react-hook-form to v8", "react")).toBe(-1);
    expect(findName("Update @sentry/react to v9", "react")).toBe(-1);
    expect(findName("Update @tanstack/react-query to v6", "react")).toBe(-1);
    expect(findName("Update react.js docs", "react")).toBe(-1);
    expect(findName("Update @tanstack/react-query to v6", "@tanstack/react-query")).toBe(7);
  });
});

describe("PR de Renovate", () => {
  it("titre « update dependency X to vN » et branche renovate/x-N.x", () => {
    const p = renovate("chore(deps): update dependency zod to v4.2.0", "renovate/zod-4.x");
    expect(prUpdates(p, "zod")).toBe("4.2.0");
    expect(prUpdates(p, "react")).toBeUndefined();
  });

  it("package à scope : titre et branche slugifiée", () => {
    const p = renovate("fix(deps): update dependency @mui/material to ^7.0.0", "renovate/mui-material-7.x");
    expect(prUpdates(p, "@mui/material")).toBe("7.0.0");
    // branche seule : la version vient de la branche
    expect(prUpdates(renovate("Update MUI", "renovate/mui-material-7.x"), "@mui/material")).toBe("7.x");
  });

  it("monorepo : « Update react monorepo to v19 (major) »", () => {
    const p = renovate("Update react monorepo to v19 (major)", "renovate/major-react-monorepo");
    expect(prUpdates(p, "react")).toBe("19");
    expect(prUpdates(p, "react-hook-form")).toBeUndefined();
  });

  it("PR groupée : les librairies et versions viennent du tableau de la description", () => {
    const body = [
      "This PR contains the following updates:",
      "",
      "| Package | Change | Age |",
      "|---|---|---|",
      "| [@tanstack/react-query](https://tanstack.com/query) ([source](https://github.com/TanStack/query/tree/HEAD/packages/react-query)) | [`5.100.0` -> `5.105.3`](https://renovatebot.com/diffs/npm/@tanstack%2freact-query/5.100.0/5.105.3) | ![age](https://x) |",
      "| [dompurify](https://github.com/cure53/DOMPurify) | [`3.1.0` → `3.2.4`](https://github.com/cure53/DOMPurify/compare/3.1.0...3.2.4) | |",
    ].join("\n");
    const p = renovate("chore(deps): update all non-major dependencies", "renovate/all-minor-patch", body);
    expect(prUpdates(p, "@tanstack/react-query")).toBe("5.105.3");
    expect(prUpdates(p, "dompurify")).toBe("3.2.4");
    expect(prUpdates(p, "react")).toBeUndefined();
  });
});

describe("PR de Dependabot", () => {
  it("« Bump X from A to B in /dossier » et branche dependabot/…", () => {
    const p = dependabot("chore(deps): bump zod from 3.22.4 to 3.23.8 in /apps/web", "dependabot/npm_and_yarn/apps/web/zod-3.23.8");
    expect(prUpdates(p, "zod")).toBe("3.23.8");
  });

  it("package à scope : le @ disparaît de la branche", () => {
    const p = dependabot("Bump the tanstack group", "dependabot/npm_and_yarn/tanstack/react-query-5.105.3");
    expect(prUpdates(p, "@tanstack/react-query")).toBe("5.105.3");
    expect(prUpdates(p, "react")).toBeUndefined();
  });

  it("PR groupée : « Updates `x` from A to B » dans la description", () => {
    const body = "Bumps the npm_and_yarn group with 2 updates in the / directory: [iron-session](https://github.com/vvo/iron-session) and [dompurify](https://github.com/cure53/DOMPurify).\n\nUpdates `iron-session` from 8.0.1 to 8.0.4\n- [Release notes](https://github.com/vvo/iron-session/releases)\n\nUpdates `dompurify` from 3.1.0 to 3.2.4.\n";
    const p = dependabot("Bump the npm_and_yarn group across 1 directory with 2 updates", "dependabot/npm_and_yarn/npm_and_yarn-abc123", body);
    expect(prUpdates(p, "iron-session")).toBe("8.0.4");
    expect(prUpdates(p, "dompurify")).toBe("3.2.4");
  });

  it("« Bumps [x](…) from A to B. »", () => {
    expect(parsePrBody("Bumps [date-fns](https://github.com/date-fns/date-fns) from 3.6.0 to 4.1.0.\n- [Release notes]")).toEqual([{ name: "date-fns", from: "3.6.0", to: "4.1.0" }]);
  });
});

describe("PR faite à la main", () => {
  it("titre qui parle de mise à jour, avec la version", () => {
    expect(prUpdates(pr("Mise à jour de React en 19"), "react")).toBe("19");
    expect(prUpdates(pr("Montée de version react-hook-form v8"), "react-hook-form")).toBe("8");
    expect(prUpdates(pr("Migrate to zod@4"), "zod")).toBe("4");
    expect(prUpdates(pr("Upgrade @sentry/react"), "@sentry/react")).toBeNull();
  });

  it("titre qui cite la librairie sans parler de mise à jour : ignoré", () => {
    expect(prUpdates(pr("Corrige le schéma zod du panier"), "zod")).toBeUndefined();
    expect(prUpdates(pr("ABC-12 Formulaire react-hook-form du checkout"), "react-hook-form")).toBeUndefined();
  });

  it("branche feat/maj-x-N ou chore/upgrade-x", () => {
    expect(prUpdates(pr("ABC-42 Préparer la release", { branch: "chore/maj-react-19" }), "react")).toBe("19");
    expect(prUpdates(pr("ABC-43", { branch: "feat/upgrade-iron-session" }), "iron-session")).toBeNull();
    // sans mot de mise à jour dans la branche, ou un autre package : ignoré
    expect(prUpdates(pr("ABC-44", { branch: "feat/react-panier" }), "react")).toBeUndefined();
    expect(prUpdates(pr("ABC-45", { branch: "chore/maj-react-hook-form" }), "react")).toBeUndefined();
  });
});

describe("noms usuels et « Move to »", () => {
  it("noms sous lesquels on parle d'un package à scope", () => {
    expect(namesOf("zod")).toEqual(["zod"]);
    expect(namesOf("@tanstack/react-start")).toEqual(["@tanstack/react-start", "tanstack start", "tanstack-start"]);
    expect(namesOf("@biomejs/biome")).toContain("biome");
  });

  it("« (DEMO-101) Bump TanStack Start to 1.169 » et « Update iron-session to 9 »", () => {
    const start = pr("(DEMO-101) Bump TanStack Start to 1.169", { branch: "deps/DEMO-101-tanstack-start" });
    expect(prUpdates(start, "@tanstack/react-start")).toBe("1.169");
    expect(prUpdates(start, "@tanstack/react-router")).toBeUndefined();
    expect(prUpdates(pr("(DEMO-102) Update iron-session to 9"), "iron-session")).toBe("9");
    expect(prUpdates(pr("(DEMO-103) Update Biome to 2.6 and Prettier to 4"), "@biomejs/biome")).toBe("2.6");
  });

  it("« Move X to … » sans version n'est pas une mise à jour", () => {
    expect(prUpdates(pr("Move zod schemas to the shared package"), "zod")).toBeUndefined();
    expect(prUpdates(pr("(DEMO-104) Rewrite the e2e suite with TanStack"), "@tanstack/react-start")).toBeUndefined();
  });
});

describe("robot maison : diff des package.json", () => {
  it("versions qui changent dans le diff", () => {
    const patch = [
      "@@ -25,8 +25,8 @@",
      '   "devDependencies": {',
      '     "@types/react": "~18.3.31",',
      '-    "@vitejs/plugin-react": "^6.1.2",',
      '+    "@vitejs/plugin-react": "^6.3.0",',
      '-    "vite": "^8.3.5"',
      '+    "vite": "^8.3.8",',
      '+    "zod": "^4.0.0"',
      "   }",
    ].join("\n");
    expect(parseManifestPatch(patch)).toEqual([
      { name: "@vitejs/plugin-react", from: "6.1.2", to: "6.3.0" },
      { name: "vite", from: "8.3.5", to: "8.3.8" },
    ]);
  });

  it("le robot et sa branche deps/… sont reconnus", () => {
    const p = pr("(DEMO-105) weekly dependency updates", { author: "acme-deps-bot", branch: "deps/auto-update", updates: [{ name: "vite", from: "8.3.5", to: "8.3.8" }] });
    expect(updatePrsFor("vite", [p])).toMatchObject([{ bot: true, to: "8.3.8" }]);
    expect(updatePrsFor("react", [p])).toEqual([]);
  });
});

describe("updatePrsFor", () => {
  it("toutes les PR d'une librairie, les plus récentes d'abord, robots repérés", () => {
    const old = renovate("Update dependency zod to v4", "renovate/zod-4.x");
    const recent = pr("Passage à zod 4", { updatedAt: "2026-11-20T10:00:00Z" });
    const other = pr("Update react to v19");
    const got = updatePrsFor("zod", [old, other, recent]);
    expect(got.map((p) => p.number)).toEqual([recent.number, old.number]);
    expect(got.map((p) => [p.bot, p.to])).toEqual([
      [false, "4"],
      [true, "4"],
    ]);
  });
});
