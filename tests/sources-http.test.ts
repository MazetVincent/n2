// Sources lues par HTTP (API Sentry, connexion Microsoft) : lecture des réponses, erreurs, jetons.
// `fetch` est remplacé par une fausse API ; les jetons Microsoft vont dans un dossier temporaire (N2_STATE_DIR).
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accessToken, hasMicrosoftToken } from "../src/server/sources/microsoft-auth.ts";
import { fetchSentry, sentryFrames, token } from "../src/server/sources/sentry.ts";
import { demoMonorepo, makeConfig, remove, tempDir } from "./helpers.ts";

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
const api = (handler: Handler) => {
  const spy = vi.fn(async (url: string, init?: RequestInit) => handler(url, init));
  vi.stubGlobal("fetch", spy);
  return spy;
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// ---------- Sentry ----------
describe("Sentry", () => {
  const root = demoMonorepo();
  const cfg = makeConfig(root);
  afterAll(() => remove(root));
  beforeEach(() => vi.stubEnv("SENTRY_AUTH_TOKEN", "jeton-de-test"));

  const rawIssue = (id: string, count: string) => ({
    id,
    shortId: `DEMO-${id}`,
    title: `Erreur ${id}`,
    culprit: "cart",
    level: "error",
    count,
    userCount: 3,
    lastSeen: "2026-11-22T10:00:00Z",
    firstSeen: "2026-11-22T08:00:00Z",
    permalink: `https://demo.sentry.io/issues/${id}/`,
    stats: { "24h": [[0, 1], [3600, 4]] },
  });

  it("lit les erreurs fréquentes et nouvelles, avec le jeton en en-tête", async () => {
    const spy = api((url) => json(url.includes("firstSeen") ? [rawIssue("2", "5")] : [rawIssue("1", "120")]));
    const d = await fetchSentry(cfg);
    expect(d.top).toEqual([{ id: "1", shortId: "DEMO-1", title: "Erreur 1", culprit: "cart", level: "error", count: 120, users: 3, lastSeen: "2026-11-22T10:00:00Z", firstSeen: "2026-11-22T08:00:00Z", url: "https://demo.sentry.io/issues/1/", trend: [1, 4] }]);
    expect(d.fresh.map((i) => i.id)).toEqual(["2"]);
    expect(d.projectUrl).toBe("https://demo.sentry.io/projects/demo/");
    expect(new Headers(spy.mock.calls[0][1]?.headers).get("Authorization")).toBe("Bearer jeton-de-test");
    expect(spy.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("401 ou 403 : erreur de connexion ; autre code : Sentry indisponible", async () => {
    api(() => json({}, 401));
    await expect(fetchSentry(cfg)).rejects.toMatchObject({ detail: { kind: "auth", message: { key: "srv_sentry_denied", params: { status: "401" } }, hint: { key: "srv_hint_sentry_login" } } });
    api(() => json({}, 503));
    await expect(fetchSentry(cfg)).rejects.toMatchObject({ detail: { kind: "unavailable", message: { key: "srv_sentry_responded" } } });
  });

  it("sans jeton : marche à suivre pour se connecter", () => {
    vi.stubEnv("SENTRY_AUTH_TOKEN", "");
    vi.stubEnv("HOME", tempDir());
    expect(() => token()).toThrow(expect.objectContaining({ detail: expect.objectContaining({ kind: "auth", message: { key: "srv_sentry_no_token" } }) }));
  });

  it("trace : l'erreur d'abord, chemins rattachés aux fichiers du projet, 40 lignes au plus", async () => {
    const frame = (filename: string, lineNo: number, inApp = true) => ({ filename, lineNo, function: `fn${lineNo}`, inApp });
    api(() =>
      json({
        entries: [
          { type: "breadcrumbs", data: {} },
          {
            type: "exception",
            data: { values: [{ stacktrace: { frames: [frame("node_modules/react/index.js", 1, false), frame("/srv/app/apps/web/src/features/cart/helper.tsx", 2), frame("../../apps/web/src/features/cart/Cart.tsx", 7)] } }] },
          },
        ],
      }),
    );
    const frames = await sentryFrames(cfg, "123");
    expect(frames.map((f) => [f.file, f.line, f.inApp])).toEqual([
      ["apps/web/src/features/cart/Cart.tsx", 7, true],
      ["apps/web/src/features/cart/helper.tsx", 2, true],
      [null, 1, false],
    ]);
  });

  it("trace : refuse un identifiant qui n'est pas un nombre (pas d'appel)", async () => {
    const spy = api(() => json({}));
    await expect(sentryFrames(cfg, "1/../../organizations")).rejects.toMatchObject({ detail: { kind: "config", message: { key: "srv_sentry_invalid_issue" } } });
    expect(spy).not.toHaveBeenCalled();
  });
});

// ---------- Sentry : environnements ----------
describe("Sentry : environnement de production et « Avant la prod »", () => {
  const root = demoMonorepo();
  afterAll(() => remove(root));
  // un projet Sentry différent par test : les environnements et la vue « Avant la prod » sont gardés en mémoire par projet
  let n = 0;
  const cfgWith = (sentry: Record<string, unknown> = {}) => ({ ...makeConfig(root), sentry: { org: "demo", project: `p${++n}`, ...sentry } });
  const issue = (id: string) => ({ id, shortId: `DEMO-${id}`, title: `Erreur ${id}`, culprit: "x", level: "error", count: "1", userCount: 1, lastSeen: "2026-11-22T10:00:00Z", firstSeen: "2026-11-22T08:00:00Z", permalink: `https://demo.sentry.io/issues/${id}/` });
  /** Fausse API : environnements, erreurs (selon l'environnement demandé), environnements de chaque erreur */
  let release: Record<string, unknown> | null = null;
  beforeEach(() => {
    vi.stubEnv("SENTRY_AUTH_TOKEN", "jeton-de-test");
    release = null;
  });
  const sentryApi = (seen: Record<string, string[]> = {}) =>
    api((url) => {
      const u = new URL(url);
      if (u.pathname.endsWith("/environments/")) return json([{ name: "production" }, { name: "staging" }, { name: "qa" }]);
      if (/\/projects\/demo\/p\d+\/$/.test(u.pathname)) return json({ id: "42" });
      if (u.pathname.endsWith("/releases/")) return json(release ? [release] : []);
      if (u.searchParams.get("query")?.startsWith("firstRelease:")) return json([issue("31"), issue("32")]);
      const tags = u.pathname.match(/issues\/(\d+)\/tags\/environment\/$/);
      if (tags) return json({ topValues: (seen[tags[1]] ?? []).map((value) => ({ value })) });
      const envs = u.searchParams.getAll("environment");
      if (envs.includes("staging")) return json([issue("21"), issue("22")]);
      return json(envs.length ? [issue("1")] : [issue("1"), issue("9")]);
    });

  it("sans sentry.environment : tous les environnements, pas de vue « Avant la prod »", async () => {
    const spy = sentryApi();
    const d = await fetchSentry(cfgWith());
    expect(d.environment).toBeNull();
    expect(d.environments).toEqual(["production", "staging", "qa"]);
    expect(d.top.map((i) => i.id)).toEqual(["1", "9"]);
    expect(d.preprod).toBeNull();
    expect(spy.mock.calls.some(([url]) => new URL(url).searchParams.has("environment"))).toBe(false);
  });

  it("avec sentry.environment : seulement la production, et les erreurs d'avant la prod jamais vues en production", async () => {
    const spy = sentryApi({ "21": ["staging", "production"], "22": ["qa", "staging"] });
    const d = await fetchSentry(cfgWith({ environment: "production", preprodEnvironments: ["qa", "staging", "production", "../x"] }));
    expect(d.environment).toBe("production");
    expect(d.top.map((i) => i.id)).toEqual(["1"]);
    expect(d.preprodEnvironments).toEqual(["qa", "staging"]);
    expect(d.preprod?.map((i) => [i.id, i.environments])).toEqual([["22", ["qa", "staging"]]]);
    const issueCalls = spy.mock.calls.map(([url]) => new URL(url)).filter((u) => u.pathname.endsWith("/issues/"));
    expect(issueCalls.filter((u) => u.searchParams.getAll("environment").join() === "production")).toHaveLength(2);
  });

  it("release en production : la plus récente en production, et les erreurs apparues avec elle", async () => {
    release = { version: "1.2.3", firstEvent: "2026-11-20T16:29:00Z", newGroups: 10 };
    const spy = sentryApi();
    const d = await fetchSentry(cfgWith({ environment: "production" }));
    expect(d.release).toMatchObject({ version: "1.2.3", since: "2026-11-20T16:29:00Z", newCount: 10 });
    expect(d.release?.newIssues.map((i) => i.id)).toEqual(["31", "32"]);
    expect(d.release?.url).toBe("https://demo.sentry.io/releases/1.2.3/?project=42&environment=production");
    const calls = spy.mock.calls.map(([url]) => new URL(url));
    expect(calls.find((u) => u.pathname.endsWith("/releases/"))?.searchParams.get("environment")).toBe("production");
    expect(calls.find((u) => u.searchParams.get("query")?.startsWith("firstRelease:"))?.searchParams.get("query")).toBe('firstRelease:"1.2.3"');
  });

  it("pas de release : sans sentry.environment, sans release reçue, ou nom de release inutilisable", async () => {
    sentryApi();
    expect((await fetchSentry(cfgWith({ environment: "production" }))).release).toBeNull();
    release = { version: 'x" OR is:resolved' };
    expect((await fetchSentry(cfgWith({ environment: "production" }))).release).toBeNull();
    release = { version: "1.2.3" };
    expect((await fetchSentry(cfgWith())).release).toBeNull();
  });

  it("environnement choisi dans la page : « » = tous ; un nom inconnu du projet revient à la config", async () => {
    sentryApi();
    const cfg = cfgWith({ environment: "production" });
    expect((await fetchSentry(cfg, null)).environment).toBeNull();
    expect((await fetchSentry(cfg, "staging")).environment).toBe("staging");
    expect((await fetchSentry(cfg, "inconnu")).environment).toBe("production");
  });

  it("trace : dernière occurrence dans l'environnement affiché, sinon la dernière tout court", async () => {
    const spy = api((url) => (new URL(url).searchParams.get("environment") === "staging" ? json({}, 404) : json({ entries: [] })));
    expect(await sentryFrames(cfgWith(), "123", "staging")).toEqual([]);
    expect(spy.mock.calls.map(([url]) => new URL(url).searchParams.get("environment"))).toEqual(["staging", null]);
  });
});

// ---------- Microsoft (agenda) ----------
describe("Microsoft : jetons", () => {
  const g = { tenantId: "demo.onmicrosoft.com", clientId: "00000000-0000-0000-0000-000000000001" };
  const state = tempDir("n2-state-");
  const file = join(state, "microsoft.json");
  beforeEach(() => vi.stubEnv("N2_STATE_DIR", state));
  // le fichier temporaire, par son chemin : ne dépend pas de l'ordre des afterEach (N2_STATE_DIR encore réglé ou non)
  afterEach(() => rmSync(file, { force: true }));
  afterAll(() => remove(state));

  const store = (over: Record<string, unknown> = {}) =>
    writeFileSync(file, JSON.stringify({ ...g, accessToken: "acces-1", refreshToken: "renouv-1", expiresAt: Date.now() + 3_600_000, ...over }));

  it("pas de fichier, ou jetons d'une autre app : pas connecté", async () => {
    expect(await accessToken(g)).toBeNull();
    store({ clientId: "00000000-0000-0000-0000-000000000002" });
    expect(hasMicrosoftToken(g)).toBe(false);
  });

  it("jeton encore valide : utilisé sans appel réseau", async () => {
    const spy = api(() => json({}));
    store();
    expect(await accessToken(g)).toBe("acces-1");
    expect(spy).not.toHaveBeenCalled();
  });

  it("jeton bientôt expiré : renouvelé, gardé en 600, ancien jeton de renouvellement conservé si Microsoft n'en renvoie pas", async () => {
    const spy = api(() => json({ access_token: "acces-2", expires_in: 3600 }));
    store({ expiresAt: Date.now() + 10_000 });
    expect(await accessToken(g)).toBe("acces-2");
    expect(spy.mock.calls[0][0]).toBe("https://login.microsoftonline.com/demo.onmicrosoft.com/oauth2/v2.0/token");
    expect(String(spy.mock.calls[0][1]?.body)).toContain("grant_type=refresh_token");
    expect(JSON.parse(readFileSync(file, "utf8"))).toMatchObject({ accessToken: "acces-2", refreshToken: "renouv-1" });
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it("session révoquée (invalid_grant) : jetons supprimés, il faut se reconnecter", async () => {
    api(() => json({ error: "invalid_grant" }, 400));
    store({ expiresAt: 0 });
    expect(await accessToken(g)).toBeNull();
    expect(existsSync(file)).toBe(false);
  });

  it("autre refus : erreur affichée, jetons gardés", async () => {
    api(() => json({ error: "temporarily_unavailable" }, 503));
    store({ expiresAt: 0 });
    await expect(accessToken(g)).rejects.toMatchObject({ detail: { kind: "unavailable", message: { key: "srv_ms_renew_refused", params: { error: "temporarily_unavailable" } } } });
    expect(existsSync(file)).toBe(true);
  });

  it("tenant ou client mal formé : refusé avant d'entrer dans une URL", async () => {
    const spy = api(() => json({}));
    const bad = { tenantId: "demo/../../autre", clientId: g.clientId };
    writeFileSync(file, JSON.stringify({ ...bad, accessToken: "a", refreshToken: "r", expiresAt: 0 }));
    await expect(accessToken(bad)).rejects.toMatchObject({ detail: { kind: "config", message: { key: "srv_graph_config_invalid" } } });
    expect(spy).not.toHaveBeenCalled();
  });
});
