// Mode démo : données inventées pour les sources à compte, sans appeler leurs CLI ; le reste est lu pour de vrai.
import { afterEach, describe, expect, it, vi } from "vitest";
import { demoConfig, demoData } from "../src/server/demo.ts";
import { cached } from "../src/server/run.ts";

afterEach(() => vi.unstubAllEnvs());

describe("mode démo", () => {
  it("chaque source à compte a ses données ; la carte du code et ma branche restent réelles", () => {
    for (const key of ["prs", "open-prs", "jira", "sentry:(config)", "frames:1", "cloudwatch", "alarm-charts", "log-queries", "log-query:demo-errors:1h", "deploy", "ci:", "ci:feat/x", "calendar", "slack", "activity", "stats", "libs"])
      expect(demoData(key), key).toBeDefined();
    for (const key of ["codemap", "branch:", "branches", "docs", "lib:react"]) expect(demoData(key), key).toBeUndefined();
  });

  it("config de démo : aucun compte réel, carte du code sur le dossier donné", () => {
    const c = demoConfig("/srv/n2");
    expect([c.github.repos, c.jira.site, c.codemap?.projectPath, c.libs.projectPath]).toEqual([["demo/boutique"], "demo.atlassian.net", "/srv/n2", "/srv/n2"]);
  });

  it("avec N2_DEMO=1, le cache sert la démo sans lancer la lecture réelle", async () => {
    vi.stubEnv("N2_DEMO", "1");
    const load = vi.fn(async () => ({ vrai: true }));
    const r = await cached("prs", 60_000, true, load);
    expect(load).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: true, data: { me: "moi" } });
  });

  it("la CI de démo suit la branche demandée", () => {
    expect((demoData("ci:feat/x") as { branch: { name: string } }).branch.name).toBe("feat/x");
    expect((demoData("ci:") as { branch: unknown }).branch).toBeNull();
  });
});
