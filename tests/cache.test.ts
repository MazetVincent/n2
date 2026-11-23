// Cache mémoire des sources : durée de vie, rafraîchissement forcé, erreurs gardées peu de temps.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cached, httpFetch, SourceFailure, sourceStats } from "../src/server/run.ts";
import { groupSources } from "../src/features/sources/logic.ts";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("cached", () => {
  it("réutilise le résultat pendant sa durée de vie, puis recharge", async () => {
    vi.useFakeTimers();
    const load = vi.fn(async () => Math.random());
    const a = await cached("ttl", 60_000, false, load);
    const b = await cached("ttl", 60_000, false, load);
    expect(load).toHaveBeenCalledTimes(1);
    expect(b).toEqual(a);
    vi.advanceTimersByTime(60_001);
    await cached("ttl", 60_000, false, load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("recharge immédiatement quand on force", async () => {
    const load = vi.fn(async () => 1);
    await cached("force", 60_000, false, load);
    await cached("force", 60_000, true, load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("transforme une erreur en résultat lisible, sans la garder plus de 15 s", async () => {
    vi.useFakeTimers();
    const load = vi.fn(async () => {
      throw new SourceFailure({ kind: "auth", message: { key: "srv_aws_session_expired" }, hint: { key: "srv_raw", params: { text: "Reconnecte-toi" } } });
    });
    const r = await cached("err", 600_000, false, load);
    expect(r).toMatchObject({ ok: false, error: { kind: "auth", message: { key: "srv_aws_session_expired" }, hint: { key: "srv_raw", params: { text: "Reconnecte-toi" } } } });
    await cached("err", 600_000, false, load);
    expect(load).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(15_001);
    await cached("err", 600_000, false, load);
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe("dernières bonnes données en cas d'échec", () => {
  const fail = async (): Promise<number> => {
    throw new SourceFailure({ kind: "unavailable", message: { key: "srv_sentry_responded", params: { status: "503" } } });
  };

  it("après un succès, un échec resert les dernières données avec l'erreur et l'heure de l'échec", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-11-23T10:00:00Z"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await cached("jira", 60_000, true, async () => 42);
    vi.setSystemTime(Date.parse("2026-11-23T10:05:00Z"));
    const r = await cached("jira", 60_000, true, fail);
    expect(r).toMatchObject({ ok: true, data: 42, fetchedAt: "2026-11-23T10:00:00.000Z", stale: { error: { message: { key: "srv_sentry_responded" } }, failedAt: "2026-11-23T10:05:00.000Z" } });
    // un nouveau succès efface l'alerte
    expect(await cached("jira", 60_000, true, async () => 43)).toEqual({ ok: true, data: 43, fetchedAt: "2026-11-23T10:05:00.000Z" });
  });

  it("lecture à la demande (git fetch, branche, requête de logs) : l'échec se voit, pas d'anciennes données", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const key of ["branches", "branch:feat/x", "log-query:q:1h"]) {
      await cached(key, 60_000, true, async () => 1);
      expect((await cached(key, 60_000, true, fail)).ok, key).toBe(false);
    }
  });

  it("au-delà de 24 h, l'erreur s'affiche seule ; sans succès préalable aussi", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-11-20T10:00:00Z"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await cached("slack", 60_000, true, async () => 1);
    vi.setSystemTime(Date.parse("2026-11-21T10:00:01Z"));
    expect((await cached("slack", 60_000, true, fail)).ok).toBe(false);
    expect((await cached("stale:c", 60_000, true, fail)).ok).toBe(false);
  });
});

describe("httpFetch", () => {
  it("passe un délai maximal à chaque appel", async () => {
    const spy = vi.fn(async (_url: string, init?: RequestInit) => new Response(init?.signal ? "avec délai" : "sans délai"));
    vi.stubGlobal("fetch", spy);
    const res = await httpFetch("https://sentry.io/api/0/x", { headers: { Accept: "application/json" } });
    expect(await res.text()).toBe("avec délai");
    expect(spy.mock.calls[0][1]).toMatchObject({ headers: { Accept: "application/json" } });
  });

  it("transforme un délai dépassé en message lisible, sans le chemin de l'adresse", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    }));
    await expect(httpFetch("https://agenda.example/publie/jeton-prive/calendrier.ics", {}, 15_000)).rejects.toMatchObject({
      detail: { kind: "unavailable", message: { key: "srv_timeout", params: { host: "agenda.example", seconds: "15" } } },
    });
  });

  it("délai dépassé pendant la lecture de la réponse : message traduit, pas le texte brut", async () => {
    const r = await cached("timeout-body", 60_000, true, async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    expect(r).toMatchObject({ ok: false, error: { kind: "unavailable", message: { key: "srv_timeout_reading" } } });
  });

  it("laisse passer les autres erreurs réseau", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("fetch failed");
    }));
    await expect(httpFetch("https://slack.com/api/x")).rejects.toThrow("fetch failed");
  });
});

describe("état des sources", () => {
  const stat = (key: string) => sourceStats().find((x) => x.key === key)!;

  it("compte lectures et échecs, garde le dernier succès et la dernière erreur", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await cached("etat:a", 60_000, true, async () => 1);
    expect(stat("etat:a")).toMatchObject({ calls: 1, failures: 0, lastOk: true, lastError: null });
    const success = stat("etat:a").lastSuccessAt;
    await cached("etat:a", 60_000, true, async () => {
      throw new SourceFailure({ kind: "auth", message: { key: "srv_sentry_no_token" } });
    });
    expect(stat("etat:a")).toMatchObject({ calls: 2, failures: 1, lastOk: false, lastSuccessAt: success, lastError: { kind: "auth", message: { key: "srv_sentry_no_token" } } });
    // journal : l'échec (type et clé du message, sans ses paramètres), puis le retour à la normale ; rien pour une lecture normale
    expect(warn.mock.calls.at(-1)?.[0]).toMatch(/\[n2\] source=etat:a \d+ ms échec=auth message=srv_sentry_no_token$/);
    await cached("etat:a", 60_000, true, async () => 2);
    expect(log.mock.calls.at(-1)?.[0]).toMatch(/source=etat:a \d+ ms rétablie$/);
    expect(stat("etat:a")).toMatchObject({ calls: 3, failures: 1, lastOk: true });
    // la dernière erreur reste affichée (« rétablie depuis »)
    expect(stat("etat:a").lastError?.message.key).toBe("srv_sentry_no_token");
    log.mockClear();
    await cached("etat:a", 60_000, true, async () => 3);
    expect(log).not.toHaveBeenCalled();
    warn.mockRestore();
    log.mockRestore();
  });

  it("source non configurée : ni échec, ni ligne dans le journal", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await cached("etat:off", 60_000, true, async () => {
      throw new SourceFailure({ kind: "config", message: { key: "srv_slack_not_configured" } });
    });
    expect(stat("etat:off")).toMatchObject({ calls: 1, failures: 0, lastOk: false, off: true });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("une lecture servie par le cache n'est pas comptée", async () => {
    await cached("etat:b", 60_000, false, async () => 1);
    await cached("etat:b", 60_000, false, async () => 1);
    expect(stat("etat:b").calls).toBe(1);
  });

  it("regroupe les clés d'une même source (par branche, par librairie), échecs d'abord", () => {
    const s = (key: string, lastAt: string, lastOk: boolean, lastSuccessAt: string | null = lastOk ? lastAt : null) =>
      ({ key, calls: 1, failures: lastOk ? 0 : 1, lastAt, lastMs: 10, lastOk, off: false, lastSuccessAt, lastError: null });
    const g = groupSources([s("lib:react", "2026-11-22T10:00:00Z", true), s("lib:zod", "2026-11-22T11:00:00Z", true), s("jira", "2026-11-22T09:00:00Z", false), s("sentry:(config)", "2026-11-22T08:00:00Z", true)]);
    expect(g.map((x) => [x.name, x.detail, x.calls])).toEqual([["jira", null, 1], ["lib", "zod", 2], ["sentry", "(config)", 1]]);
    expect(g[1].lastSuccessAt).toBe("2026-11-22T11:00:00Z");
  });
});
