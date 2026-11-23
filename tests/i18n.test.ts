// Traductions : messages/fr.json et messages/en.json restent alignés, chaque clé sert, plus aucun texte en dur.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { m } from "../src/paraglide/messages.js";

type Variant = { declarations?: string[]; match: Record<string, string> };
type Value = string | Variant[];

const root = join(import.meta.dirname, "..");
const read = (locale: string) => {
  const { $schema: _schema, ...messages } = JSON.parse(readFileSync(join(root, "messages", `${locale}.json`), "utf8")) as Record<string, Value>;
  return messages;
};
const fr = read("fr");
const en = read("en");

/** Les paramètres d'un message : {nom} dans le texte (et dans chaque variante d'un pluriel), sans les accolades échappées */
function params(v: Value): string[] {
  const texts = typeof v === "string" ? [v] : v.flatMap((variant) => Object.values(variant.match));
  const found = new Set<string>();
  for (const t of texts) for (const [, name] of t.replace(/\\[{}]/g, "").matchAll(/\{(\w+)\}/g)) found.add(name);
  if (typeof v !== "string") for (const variant of v) for (const d of variant.declarations ?? []) if (d.startsWith("input ")) found.add(d.slice(6).trim());
  return [...found].sort();
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "paraglide" ? [] : sourceFiles(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}
const sources = sourceFiles(join(root, "src")).map((p) => ({ p, text: readFileSync(p, "utf8") }));

describe("messages/*.json", () => {
  it("les deux langues ont exactement les mêmes clés", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());
  });

  it("chaque clé a les mêmes paramètres dans les deux langues", () => {
    const diff = Object.keys(fr).filter((k) => en[k] !== undefined && params(fr[k]).join() !== params(en[k]).join());
    expect(diff).toEqual([]);
  });

  it("aucun texte vide", () => {
    const empty = [...Object.entries(fr), ...Object.entries(en)].filter(([, v]) => (typeof v === "string" ? !v.trim() : !v.length)).map(([k]) => k);
    expect(empty).toEqual([]);
  });

  it("les clés sont en snake_case, préfixées par leur partie (prs_, map_, srv_…)", () => {
    expect(Object.keys(fr).filter((k) => !/^[a-z]+(_[a-z0-9]+)+$/.test(k))).toEqual([]);
  });

  it("chaque clé est utilisée dans le code", () => {
    const all = sources.map((s) => s.text).join("\n");
    const unused = Object.keys(fr).filter((k) => !all.includes(`m.${k}`) && !all.includes(`"${k}"`));
    expect(unused).toEqual([]);
  });
});

describe("plus de texte en dur", () => {
  it("plus aucun appel à l'ancien tr(\"fr\", \"en\")", () => {
    const left = sources.filter((s) => /(?<![\w.$])tr\(/.test(s.text)).map((s) => s.p);
    expect(left).toEqual([]);
  });
});

describe("messages compilés", () => {
  it("variables et pluriels dans chaque langue", () => {
    expect(m.topbar_last_updated_at({ lastUpdate: "10:42" }, { locale: "fr" })).toBe("Dernière mise à jour à 10:42");
    expect(m.topbar_last_updated_at({ lastUpdate: "10:42" }, { locale: "en" })).toBe("Last updated at 10:42");
    expect(m.stats_prs_merged_count({ count: 1 }, { locale: "en" })).toBe("1 PR merged");
    expect(m.stats_prs_merged_count({ count: 3 }, { locale: "en" })).toBe("3 PRs merged");
    expect(m.stats_prs_merged_count({ count: 0 }, { locale: "fr" })).toBe("0 PR fusionnée");
  });

  it("accolades échappées rendues telles quelles", () => {
    expect(m.srv_hint_slack_config({}, { locale: "en" })).toBe('Add "slack": { "channels": [] } to config.local.json');
  });
});
