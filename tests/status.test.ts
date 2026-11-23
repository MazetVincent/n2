// État de N2 en JSON : format versionné, « À faire » compté, CI et branche, sources en échec (non configurées exclues).
import { describe, expect, it, vi } from "vitest";
import type { CiBranch } from "../src/server/types.ts";

const ok = <T>(data: T) => ({ ok: true as const, data, fetchedAt: "2026-11-23T10:00:00Z" });
const ci = (name: string, state: CiBranch["state"], wf: { name: string; conclusion: string }[] = []): CiBranch => ({
  name,
  state,
  workflows: wf.map((w) => ({ ...w, status: "completed" as const, url: "https://github.com/demo/demo/actions/runs/1", startedAt: "2026-11-23T09:00:00Z", durationMs: 60_000, attempt: 1, sha: "abc1234", failures14d: 1, retriedOk14d: 0 })),
});

vi.mock("../src/server/sources.ts", () => ({
  readPullRequests: async () => ({ ok: false, error: { kind: "auth", message: { key: "srv_gh_not_logged_in" } }, fetchedAt: "" }),
  readSprint: async () => ok({ sprint: null, issues: [] }),
  readCloudWatch: async () => ok({ alarms: [{ name: "api-5xx", state: "ALARM", reason: "seuil dépassé", updatedAt: "", url: "https://x", triggers7d: 1, lastAlarmAt: null }], counts: { ALARM: 1, INSUFFICIENT_DATA: 0, OK: 0 }, hiddenAutoscaling: 0, consoleUrl: "" }),
  readSentry: async () => { throw new Error("réseau"); },
  readLibs: async () => ok([]),
  readDeploy: async () => ok({ main: null, envs: [], prStates: {}, region: "eu-west-1", links: { pr: "", jira: "" } }),
  readAwsSession: () => ({ profile: "demo", expiresAt: null, canReconnect: false }),
  readBranch: async () => ok({ branch: "origin/feat/DEMO-1", isCurrent: true, base: "origin/main", ahead: 2, files: [{ file: "a.ts", status: "M", node: "web" }], nodes: { web: 1 }, jira: [] }),
  readCi: async (_force: boolean, branch?: string) =>
    ok({ repo: "demo/demo", main: ci("main", "failure", [{ name: "CI", conclusion: "failure" }]), branch: branch ? ci(branch, "success") : null, actionsUrl: "" }),
}));

const { buildStatus, STATUS_SCHEMA_VERSION } = await import("../src/server/status.ts");
const { cached } = await import("../src/server/run.ts");

describe("buildStatus", () => {
  it("format versionné, urgences comptées, CI de la branche principale et de la branche actuelle (nom GitHub)", async () => {
    const s = await buildStatus(Date.parse("2026-11-23T10:00:00Z"));
    expect(s.schemaVersion).toBe(STATUS_SCHEMA_VERSION);
    expect(s.todo.counts.now).toBe(2); // alarme + CI de main en échec
    expect(s.todo.items.map((i) => i.id).sort()).toEqual(["alarm:api-5xx", "ci:main:CI"]);
    expect(s.ci).toEqual({ main: { name: "main", state: "failure" }, branch: { name: "feat/DEMO-1", state: "success" } });
    expect(s.branch).toEqual({ name: "origin/feat/DEMO-1", ahead: 2, files: 1, parts: ["web"] });
  });

  it("sources en échec : celles dont la dernière lecture a échoué, pas les non configurées", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await cached("status-test:panne", 60_000, true, async () => {
      throw new Error("panne");
    });
    await cached("status-test:off", 60_000, true, async () => {
      const { SourceFailure } = await import("../src/server/run.ts");
      throw new SourceFailure({ kind: "config", message: { key: "srv_slack_not_configured" } });
    });
    const s = await buildStatus();
    expect(s.failingSources).toContain("status-test:panne");
    expect(s.failingSources).not.toContain("status-test:off");
  });
});
