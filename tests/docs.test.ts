// Documentation du projet pour la recherche de la carte : README découpés par titre, recherche, librairies citées.
import { describe, expect, it } from "vitest";
import { libMentions, mdText, prepareDocs, readmePassages, searchDocs, snippet } from "../src/features/docs/logic.ts";
import type { DocPassage } from "../src/server/types.ts";

const README = `Intro avant le titre.

# Paquet UI

Composants partagés, basés sur [React](https://react.dev) et \`@mui/material\`.

## Installation

\`\`\`sh
# pas un titre : dans un bloc de code
npm i zod
\`\`\`

## Vide

### Formulaires ##
Validation avec zod. Encore zod, et zod-form-data (pas zod).
`;

const guide = (title: string, text: string, target: string): DocPassage => ({
  kind: "guide",
  key: `guide:${target}`,
  title: { fr: title, en: `${title} EN` },
  where: { fr: "Page", en: "Page" },
  text: { fr: text, en: `${text} (en)` },
  target,
});

describe("README découpés en passages", () => {
  const ps = readmePassages("packages/ui/README.md", README);
  it("un passage par titre, avec sa ligne ; les # d'un bloc de code ne sont pas des titres", () => {
    expect(ps.map((p) => [p.title.fr, p.line])).toEqual([
      ["packages/ui/README.md", 1],
      ["Paquet UI", 3],
      ["Installation", 7],
      ["Vide", 14],
      ["Formulaires", 16],
    ]);
  });
  it("texte sans la syntaxe Markdown des liens", () => {
    expect(ps[1].text.fr).toBe("Composants partagés, basés sur React et @mui/material.");
    expect(ps[2].text.fr).toContain("npm i zod");
    expect(ps[1]).toMatchObject({ kind: "readme", file: "packages/ui/README.md", where: { fr: "packages/ui/README.md" } });
  });
  it("mdText retire commentaires, images et balises", () => {
    expect(mdText("<!-- x --> ![logo](a.png) <b>Gras</b> **et** `code`")).toBe("Gras et code");
  });
});

describe("recherche dans la doc", () => {
  const docs = prepareDocs([...readmePassages("packages/ui/README.md", README), guide("Déployer en prod", "Le pipeline valide la prod.", "guide/deploy"), guide("Formulaires", "Utiliser zod partout.", "guide/forms")]);
  it("tous les mots, sans accents ; titre d'abord", () => {
    expect(searchDocs(docs, "formulaires", "fr").map((h) => h.key)).toEqual(["readme:packages/ui/README.md:16", "guide:guide/forms"]);
    expect(searchDocs(docs, "deployer prod", "fr").map((h) => h.title)).toEqual(["Déployer en prod"]);
    expect(searchDocs(docs, "z", "fr")).toEqual([]);
  });
  it("titre et page dans la langue demandée, avec un extrait", () => {
    const [h] = searchDocs(docs, "pipeline", "en");
    expect(h).toMatchObject({ kind: "guide", title: "Déployer en prod EN", target: "guide/deploy" });
    expect(h.snippet).toContain("pipeline");
  });
  it("librairies citées par leur nom exact", () => {
    const hits = libMentions(docs, "zod", "fr");
    // le titre ne la cite pas ; le passage qui la cite le plus d'abord ; « zod-form-data » ne compte pas
    expect(hits.map((h) => h.key)).toEqual(["readme:packages/ui/README.md:16", "guide:guide/forms", "readme:packages/ui/README.md:7"]);
    expect(libMentions(docs, "@mui/material", "fr").map((h) => h.key)).toEqual(["readme:packages/ui/README.md:3"]);
    expect(libMentions(docs, "react-dom", "fr")).toEqual([]);
    expect(libMentions(docs, "node:*", "fr")).toEqual([]);
  });
  it("extrait coupé sur des mots", () => {
    const long = `${"mot ".repeat(40)}cible ${"suite ".repeat(40)}`.trim();
    const s = snippet(long, long.indexOf("cible"), 5);
    expect(s.startsWith("…mot")).toBe(true);
    expect(s.endsWith("…")).toBe(true);
    expect(s).toContain("cible");
  });
});
