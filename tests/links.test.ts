// Liens rapides de ⌘K : liens déduits de la config, liens ajoutés à la main, recherche et sites autorisés.
import { describe, expect, it } from "vitest";
import { buildQuickLinks, customLinks } from "../src/features/links/logic.ts";
import { buildIndex, searchIndex } from "../src/features/search/index.ts";
import { isAllowedUrl } from "../src/server/open.ts";
import type { Config } from "../src/server/config.ts";
import type { DeployData } from "../src/server/types.ts";
import { makeConfig } from "./helpers.ts";

const cfg: Config = {
  ...makeConfig("/tmp/n2-demo"),
  links: [
    { label: "Site en prod", url: "https://www.shop.example/", group: "Prod" },
    { label: "Back-office", url: "https://bo.shop.example/admin", group: "Prod", keywords: "admin commandes" },
    { label: "Ancien site", url: "http://old.shop.example/" }, // pas https : ignoré
    { label: "  ", url: "https://vide.shop.example/" }, // sans libellé : ignoré
    { label: "Cassé", url: "pas une url" },
  ],
};

describe("liens rapides", () => {
  const links = buildQuickLinks(cfg);

  it("garde seulement les liens https avec un libellé, en tête de liste", () => {
    expect(customLinks(cfg).map((l) => l.label)).toEqual(["Site en prod", "Back-office"]);
    expect(links.slice(0, 2).map((l) => [l.label, l.group])).toEqual([
      ["Site en prod", "Prod"],
      ["Back-office", "Prod"],
    ]);
  });

  it("déduit GitHub, Jira, Sentry et les consoles AWS de la config", () => {
    const urls = links.map((l) => l.url);
    expect(urls).toContain("https://github.com/demo/demo/pulls");
    expect(urls).toContain("https://demo.atlassian.net/jira/software/projects/DEMO/boards/1");
    expect(urls).toContain("https://demo.sentry.io/projects/demo/");
    expect(urls).toContain("https://eu-west-1.console.aws.amazon.com/cloudwatch/home?region=eu-west-1#alarmsV2:");
    expect(new Set(links.map((l) => l.id)).size).toBe(links.length);
  });

  it("n'invente pas de lien AWS avec une région mal formée", () => {
    const bad = buildQuickLinks({ ...cfg, aws: { ...cfg.aws, region: "evil.com/x" } });
    expect(bad.some((l) => l.group === "AWS")).toBe(false);
  });

  it("chaque lien proposé peut s'ouvrir dans Chrome", () => {
    for (const l of links) expect(isAllowedUrl(cfg, l.url), l.url).toBe(true);
  });

  it("autorise le site exact d'un lien ajouté, pas ses voisins ni les liens ignorés", () => {
    expect(isAllowedUrl(cfg, "https://bo.shop.example/admin/orders/42")).toBe(true);
    expect(isAllowedUrl(cfg, "https://autre.shop.example/")).toBe(false);
    expect(isAllowedUrl(cfg, "https://old.shop.example/")).toBe(false);
    expect(isAllowedUrl(cfg, "https://vide.shop.example/")).toBe(false);
    expect(isAllowedUrl(makeConfig("/tmp/n2-demo"), "https://bo.shop.example/admin")).toBe(false);
  });
});

describe("liens rapides dans ⌘K", () => {
  const deploy: DeployData = {
    main: { name: "monprojet-main", consoleUrl: "https://eu-west-1.console.aws.amazon.com/codesuite/codepipeline/pipelines/monprojet-main/view", stages: [], prod: null, pending: [], pendingState: null, executions: [] } as unknown as DeployData["main"],
    envs: [{ slug: "demo-123", pipeline: "monprojet-demo-123-pipeline", consoleUrl: "https://eu-west-1.console.aws.amazon.com/codesuite/codepipeline/pipelines/monprojet-demo-123-pipeline/view", url: "https://preview-demo-123.demo.example/", last: null }],
    prStates: {},
    region: "eu-west-1",
    links: { pr: "", jira: "" },
  };
  const index = buildIndex({ tabs: [{ to: "/dashboard", label: "Dashboard" }], links: buildQuickLinks(cfg), deploy });

  it("propose les onglets puis les liens quand la recherche est vide", () => {
    const groups = searchIndex(index, "").map((i) => i.group);
    expect(groups[0]).toBe("Onglets");
    expect(groups[1]).toBe("Prod");
    expect(groups).toContain("AWS");
  });

  it("trouve un lien par sa rubrique ou ses mots-clés, pas seulement son libellé", () => {
    expect(searchIndex(index, "prod back").map((i) => i.label)).toEqual(["Back-office"]);
    expect(searchIndex(index, "commandes").map((i) => i.label)).toEqual(["Back-office"]);
    expect(searchIndex(index, "aws alarmes").map((i) => i.label)).toEqual(["Alarmes CloudWatch"]);
  });

  it("ouvre les environnements dynamiques et le pipeline de prod", () => {
    expect(searchIndex(index, "123").map((i) => i.action)).toEqual([
      { kind: "url", url: "https://preview-demo-123.demo.example/" },
      { kind: "url", url: deploy.envs[0].consoleUrl },
    ]);
    expect(searchIndex(index, "pipeline prod")[0].action).toEqual({ kind: "url", url: deploy.main!.consoleUrl });
  });
});
