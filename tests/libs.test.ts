// Onglet Librairies : dépendances par partie du monorepo, extraits des notes de version.
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { fetchWorkspaceLibs, releaseExcerpt } from "../src/server/sources/libs.ts";
import { gitInit, makeConfig, remove, tempDir, writeFiles } from "./helpers.ts";

afterEach(() => vi.unstubAllGlobals());

/** Monorepo de démo : une racine, une app (React imbriqué dans une autre version), un package partagé */
function demo(): string {
  const root = tempDir("n2-libs-");
  writeFiles(root, {
    ".npmrc": "@secret:registry=https://npm.example.com/\n",
    "package.json": JSON.stringify({ name: "demo", workspaces: ["apps/*", "packages/*"], devDependencies: { typescript: "^5.0.0" } }),
    "apps/web/package.json": JSON.stringify({
      name: "@demo/web",
      description: "Le site de démo",
      dependencies: { react: "^19.0.0", "@demo/shared": "*", "@secret/sdk": "^1.0.0", zod: "^4.0.0" },
      devDependencies: { vitest: "^3.0.0" },
    }),
    "apps/backoffice/package.json": JSON.stringify({ name: "@demo/backoffice", dependencies: { react: "^18.0.0" } }),
    "packages/shared/package.json": JSON.stringify({ name: "@demo/shared" }),
    // hors workspaces, avec son propre lockfile
    "infra/package.json": JSON.stringify({ name: "cdk", dependencies: { "aws-cdk-lib": "^2.0.0" } }),
    "infra/package-lock.json": JSON.stringify({ packages: { "node_modules/aws-cdk-lib": { version: "2.100.0" } } }),
    // sans dépendance
    "scripts/package.json": JSON.stringify({ type: "module" }),
    // jeu de données de test : pas un endroit du projet
    "apps/web/test/fixtures/pkg/package.json": JSON.stringify({ name: "fixture", dependencies: { leftpad: "1.0.0" } }),
    "package-lock.json": JSON.stringify({
      packages: {
        "": { name: "demo" },
        "apps/web": { name: "@demo/web" },
        "apps/backoffice": { name: "@demo/backoffice" },
        "apps/backoffice/node_modules/react": { version: "18.3.1" },
        "packages/shared": { name: "@demo/shared" },
        "node_modules/react": { version: "19.0.0" },
        "node_modules/zod": { version: "4.1.0" },
        "node_modules/@secret/sdk": { version: "1.2.0" },
        "node_modules/vitest": { version: "3.0.0" },
        "node_modules/typescript": { version: "5.0.0" },
        "node_modules/@demo/web": { link: true },
      },
    }),
  });
  gitInit(root);
  return root;
}

describe("fetchWorkspaceLibs", () => {
  const root = demo();
  afterAll(() => remove(root));
  const latest: Record<string, string> = { react: "19.2.0", zod: "4.1.0", vitest: "4.0.0", typescript: "5.0.1", "aws-cdk-lib": "2.100.0" };

  const load = async () => {
    const fetchSpy = vi.fn(async (url: string) => {
      const name = decodeURIComponent(url.split("registry.npmjs.org/")[1].replace(/\/latest$/, ""));
      return new Response(JSON.stringify({ version: latest[name] ?? "1.0.0" }));
    });
    vi.stubGlobal("fetch", fetchSpy);
    return { parts: await fetchWorkspaceLibs(makeConfig(root)), fetchSpy };
  };

  it("liste chaque package.json suivi par git (la racine d'abord, puis par chemin), sans les autres parties du monorepo", async () => {
    const { parts } = await load();
    expect(parts.map((p) => p.path)).toEqual(["", "apps/backoffice", "apps/web", "infra", "packages/shared", "scripts"]);
    expect(parts.map((p) => p.label)).toEqual(["demo", "backoffice", "web", "infra", "shared", "scripts"]);
    expect(parts.find((p) => p.label === "scripts")!.deps).toEqual([]);
    const web = parts.find((p) => p.label === "web")!;
    expect(web.description).toBe("Le site de démo");
    expect(web.deps.map((d) => d.name)).toEqual(["@secret/sdk", "react", "zod", "vitest"]); // dev à la fin
    expect(web.deps.find((d) => d.name === "vitest")).toMatchObject({ dev: true, installed: "3.0.0", update: "major" });
  });

  it("prend la version imbriquée d'une partie avant celle de la racine", async () => {
    const { parts } = await load();
    expect(parts.find((p) => p.label === "backoffice")!.deps[0]).toMatchObject({ name: "react", installed: "18.3.1", update: "major" });
    expect(parts.find((p) => p.label === "web")!.deps.find((d) => d.name === "react")).toMatchObject({ installed: "19.0.0", update: "minor" });
  });

  it("lit la version dans le lockfile propre au dossier quand il en a un", async () => {
    const { parts } = await load();
    expect(parts.find((p) => p.label === "infra")!.deps[0]).toMatchObject({ name: "aws-cdk-lib", installed: "2.100.0", update: "none" });
  });

  it("n'envoie jamais un package privé au registre public", async () => {
    const { parts, fetchSpy } = await load();
    expect(parts.find((p) => p.label === "web")!.deps[0]).toMatchObject({ name: "@secret/sdk", private: true, latest: null });
    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes("secret"))).toBe(false);
  });
});

describe("releaseExcerpt", () => {
  it("retire la syntaxe Markdown et coupe proprement", () => {
    const md = "## What's Changed\n\n* **Fix** [a bug](https://x.y) in `useQuery`\n<!-- note -->\n```js\ncode()\n```\n![img](a.png)";
    expect(releaseExcerpt(md)).toBe("What's Changed • Fix a bug in useQuery");
    expect(releaseExcerpt("word ".repeat(100), 40).length).toBeLessThanOrEqual(40);
    expect(releaseExcerpt(null)).toBe("");
    expect(releaseExcerpt("A big thanks to the 12 contributors who made this release possible.\n\n- New Button")).toBe("• New Button");
  });
});
