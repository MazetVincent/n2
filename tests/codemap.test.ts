// Analyseur de la carte : parties, couches, liens, fichiers importants, exemples, fiches de librairies.
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { codeExamples, fetchCodeMap } from "../src/server/sources/codemap.ts";
import { parseReadme } from "../src/server/sources/codemap-detect.ts";
import { libDetails } from "../src/server/sources/lib-details.ts";
import { updateKind } from "../src/server/sources/libs.ts";
import { demoMonorepo, makeConfig, remove } from "./helpers.ts";

const root = demoMonorepo();
// seuil bas pour forcer le découpage de l'app web en sous-dossiers
const cfg = makeConfig(root, { splitThreshold: 2 });
afterAll(() => remove(root));
afterEach(() => vi.unstubAllGlobals());

describe("fetchCodeMap", async () => {
  const map = await fetchCodeMap(cfg);
  const node = (id: string) => map.nodes.find((n) => n.id === id);

  it("découpe une grosse partie par sous-dossier et regroupe les petits dossiers dans « autres »", () => {
    expect(node("apps/web/src/features")?.label).toBe("web · features");
    // le dossier server (1 fichier) est trop petit pour être une partie à lui seul
    expect(node("apps/web/(autres)")?.files).toBe(1);
  });

  it("classe chaque partie dans la bonne couche d'après ses imports", () => {
    expect(node("apps/web/src/features")?.category).toBe("front");
    expect(node("apps/web/(autres)")?.category).toBe("api"); // @trpc/server
    expect(node("packages/shared")?.category).toBe("shared");
    expect(node("infrastructure")?.category).toBe("infra"); // aws-cdk-lib
  });

  it("compte les tests à part", () => {
    const features = node("apps/web/src/features")!;
    expect(features.files).toBe(6);
    expect(features.testFiles).toBe(1);
    const vitest = features.libs.find((l) => l.name === "vitest");
    expect(vitest).toMatchObject({ files: 0, testFiles: 1 });
  });

  it("résout les imports via le champ exports et les alias tsconfig", () => {
    const edge = map.edges.find((e) => e.from === "apps/web/src/features" && e.to === "packages/shared");
    expect(edge?.weight).toBe(2); // Cart.tsx et helper.tsx
    // l'alias ~/ reste à l'intérieur de la partie : pas de lien vers elle-même
    expect(map.edges.some((e) => e.from === e.to)).toBe(false);
  });

  it("trouve les fichiers les plus importés", () => {
    expect(map.topFiles[0]).toMatchObject({ file: "packages/shared/src/money.ts", importers: 3, fromParts: 2 });
  });

  it("décrit les parties (package.json, puis README sans Markdown)", () => {
    expect(node("packages/shared")?.description).toBe("Contrats partagés : monnaie et formats.");
    expect(node("apps/web/src/features")?.parentDescription).toBe("Le site web de démo, construit avec React et une API tRPC partagée.");
  });

  it("détaille les sous-dossiers : fichiers, librairies et fichiers clés", () => {
    const cart = node("apps/web/src/features")!.contains.find((c) => c.name === "cart")!;
    expect(cart.files).toBe(6);
    expect(cart.libs).toContainEqual({ name: "react", files: 1 });
    expect(cart.topFiles.map((f) => f.file)).toContain("apps/web/src/features/cart/helper.tsx");
  });

  it("propose des exemples centrés sur la ligne qui utilise la librairie", () => {
    const [ex] = codeExamples(cfg, "apps/web/src/features", "react", false);
    expect(ex.file).toBe("apps/web/src/features/cart/Cart.tsx");
    expect(ex.lines[ex.line - ex.startLine]).toContain("useState(0)");
  });

  it("n'utilise les tests comme exemples que si on le demande", () => {
    expect(codeExamples(cfg, "apps/web/src/features", "vitest", false)).toEqual([]);
    expect(codeExamples(cfg, "apps/web/src/features", "vitest", true)).toHaveLength(1);
  });
});

describe("libDetails", () => {
  it("ne contacte jamais le registre public pour un scope privé du .npmrc", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const d = await libDetails(cfg, "@secret/sdk");
    expect(d.private).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("lit le résumé et la doc dans le registre npm, et la version installée dans le lockfile", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ version: "19.1.0", description: "UI library", homepage: "https://react.dev", license: "MIT" }))),
    );
    const d = await libDetails(cfg, "react");
    expect(d).toMatchObject({ summary: "UI library", docsUrl: "https://react.dev", installed: "19.0.0", latest: "19.1.0" });
  });

  it("ignore une page d'accueil non https", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ version: "1.0.0", homepage: "http://insecure.example" }))));
    expect((await libDetails(cfg, "some-lib")).docsUrl).toBeNull();
  });

  it.each(["../etc/passwd", "a b", "", "@scope/../x"])("refuse un nom invalide : %s", async (name) => {
    await expect(libDetails(cfg, name)).rejects.toThrow();
  });
});

describe("parseReadme", () => {
  it("garde le titre et le premier vrai paragraphe, sans Markdown", () => {
    const md = "# Titre\n\n[![ci](b.svg)](x)\n\n```sh\nnpm i\n```\n\nCe paquet fait **une chose** et la fait [bien](https://x).\n";
    expect(parseReadme(md)).toEqual({ title: "Titre", paragraph: "Ce paquet fait une chose et la fait bien." });
  });
});

describe("updateKind", () => {
  it.each([
    ["1.2.3", "2.0.0", "major"],
    ["1.2.3", "1.3.0", "minor"],
    ["1.2.3", "1.2.4", "patch"],
    ["1.2.3", "1.2.3", "none"],
    ["2.0.0", "1.9.9", "none"],
    [null, "1.0.0", "unknown"],
    ["v1.2.3", "1.2.4", "patch"],
  ])("%s → %s : %s", (installed, latest, kind) => expect(updateKind(installed, latest)).toBe(kind));
});
