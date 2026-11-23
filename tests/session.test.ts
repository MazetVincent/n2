// Verrou de N2 : jeton de session (fichier 600), code à usage unique de `bun run open`, décision pour chaque requête.
import { chmodSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canonicalRedirect,
  publicHost,
  consumeLoginCode,
  createLoginCode,
  hasValidSession,
  isAllowedHost,
  lockedLang,
  lockedPage,
  LOGIN_TTL_MS,
  readCookie,
  resetSessionCache,
  rotateSessionToken,
  SESSION_COOKIE,
  sessionGate,
  sessionToken,
} from "../src/server/session.ts";
import { remove, tempDir } from "./helpers.ts";

const dir = tempDir("n2-session-");
const state = join(dir, "state");
const previous = process.env.N2_STATE_DIR;
process.env.N2_STATE_DIR = state;
afterAll(() => {
  if (previous === undefined) delete process.env.N2_STATE_DIR;
  else process.env.N2_STATE_DIR = previous;
  remove(dir);
});

const mode = (p: string) => statSync(p).mode & 0o777;
const cookieOf = (token: string) => `n2-lang=fr; ${SESSION_COOKIE}=${token}; other=1`;

describe("sessionToken : le secret de la session", () => {
  beforeEach(() => resetSessionCache());

  it("est créé au premier appel, dans un dossier 700 et un fichier 600", () => {
    const token = sessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(mode(state)).toBe(0o700);
    expect(mode(join(state, "session"))).toBe(0o600);
    expect(readFileSync(join(state, "session"), "utf8").trim()).toBe(token);
  });

  it("--reset : nouveau jeton, relu sans redémarrer, l'ancien cookie ne passe plus", () => {
    const old = sessionToken();
    rotateSessionToken();
    const fresh = sessionToken();
    expect(fresh).not.toBe(old);
    expect(mode(join(state, "session"))).toBe(0o600);
    expect(sessionGate("/", cookieOf(old))).toEqual({ kind: "deny" });
    expect(sessionGate("/", cookieOf(fresh))).toEqual({ kind: "pass" });
  });

  it("relit le fichier s'il est remplacé pendant que N2 tourne", () => {
    sessionToken();
    const other = "B".repeat(43);
    writeFileSync(join(state, "session"), `${other}\n`, { mode: 0o600 });
    expect(sessionToken()).toBe(other);
  });

  it("reste le même d'un démarrage à l'autre", () => {
    const first = sessionToken();
    resetSessionCache();
    expect(sessionToken()).toBe(first);
  });

  it("remet le fichier à 600 s'il est lisible par d'autres", () => {
    sessionToken();
    chmodSync(join(state, "session"), 0o644);
    resetSessionCache();
    sessionToken();
    expect(mode(join(state, "session"))).toBe(0o600);
  });

  it("remplace un fichier abîmé par un nouveau jeton", () => {
    writeFileSync(join(state, "session"), "pas un jeton\n");
    resetSessionCache();
    expect(sessionToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe("code à usage unique de `bun run open`", () => {
  it("marche une seule fois", () => {
    const code = createLoginCode();
    expect(mode(join(state, "login"))).toBe(0o600);
    expect(consumeLoginCode(code)).toBe(true);
    expect(existsSync(join(state, "login"))).toBe(false);
    expect(consumeLoginCode(code)).toBe(false);
  });

  it("un mauvais code échoue sans effacer le vrai (sinon n'importe qui pourrait bloquer bun run open)", () => {
    const code = createLoginCode();
    expect(consumeLoginCode("mauvais")).toBe(false);
    expect(existsSync(join(state, "login"))).toBe(true);
    expect(consumeLoginCode(code)).toBe(true);
  });

  it("un code expiré est effacé", () => {
    const now = Date.now();
    createLoginCode(now);
    expect(consumeLoginCode("peu importe", now + LOGIN_TTL_MS + 1)).toBe(false);
    expect(existsSync(join(state, "login"))).toBe(false);
  });

  it("expire au bout de 2 minutes", () => {
    const now = Date.now();
    const code = createLoginCode(now);
    expect(consumeLoginCode(code, now + LOGIN_TTL_MS + 1)).toBe(false);
  });

  it("refuse un code daté du futur", () => {
    const now = Date.now();
    const code = createLoginCode(now + 60_000);
    expect(consumeLoginCode(code, now)).toBe(false);
  });
});

describe("sessionGate : décision pour chaque requête", () => {
  beforeEach(() => resetSessionCache());

  it("laisse passer avec le bon cookie, parmi d'autres cookies", () => {
    expect(sessionGate("/dashboard", cookieOf(sessionToken()))).toEqual({ kind: "pass" });
  });

  it.each([
    ["sans cookie", undefined],
    ["cookie vide", `${SESSION_COOKIE}=`],
    ["mauvais jeton", `${SESSION_COOKIE}=${"x".repeat(43)}`],
    ["jeton tronqué", () => `${SESSION_COOKIE}=${sessionToken().slice(0, 20)}`],
    ["autre nom de cookie", () => `n2-sessionx=${sessionToken()}`],
  ])("refuse : %s", (_label, cookie) => {
    expect(sessionGate("/dashboard", typeof cookie === "function" ? cookie() : cookie)).toEqual({ kind: "deny" });
  });

  it("refuse le jeton passé dans l'URL (seul un code de connexion est accepté)", () => {
    expect(sessionGate(`/?login=${sessionToken()}`, undefined)).toEqual({ kind: "deny" });
    expect(sessionGate(`/?k=${sessionToken()}`, undefined)).toEqual({ kind: "deny" });
  });

  it("connecte avec un bon code : cookie HttpOnly SameSite=Strict, redirection sans le code", () => {
    const code = createLoginCode();
    const gate = sessionGate(`/pull-requests?repo=x&login=${code}`, undefined);
    expect(gate.kind).toBe("login");
    if (gate.kind !== "login") return;
    expect(gate.location).toBe("/pull-requests?repo=x");
    expect(gate.setCookie).toContain(`${SESSION_COOKIE}=${sessionToken()}`);
    for (const attr of ["HttpOnly", "SameSite=Strict", "Path=/", "Max-Age=31536000"]) expect(gate.setCookie).toContain(attr);
    // le code ne resservira pas
    expect(sessionGate(`/?login=${code}`, undefined)).toEqual({ kind: "deny" });
  });

  it.each([
    ["/.//evil.example/x", "/evil.example/x"],
    ["/a/..//evil.example", "/evil.example"],
    ["//evil.example", "/"],
  ])("la redirection après connexion reste sur N2 : %s", (path, expected) => {
    const gate = sessionGate(`${path}?login=${createLoginCode()}`, undefined);
    expect(gate.kind).toBe("login");
    if (gate.kind === "login") {
      expect(gate.location.startsWith("//")).toBe(false);
      expect(gate.location.split("?")[0]).toBe(expected);
    }
  });

  it("hasValidSession (WebSocket) : cookie seul, jamais de code de connexion", () => {
    expect(hasValidSession(cookieOf(sessionToken()))).toBe(true);
    expect(hasValidSession(undefined)).toBe(false);
    expect(hasValidSession(`${SESSION_COOKIE}=${"x".repeat(43)}`)).toBe(false);
  });

  it("refuse un code inventé", () => {
    expect(sessionGate("/?login=abc", undefined)).toEqual({ kind: "deny" });
  });
});

describe("utilitaires", () => {
  it("readCookie lit le bon cookie", () => {
    expect(readCookie("a=1; n2-session=xyz; b=2", "n2-session")).toBe("xyz");
    expect(readCookie("a=1", "n2-session")).toBeUndefined();
    expect(readCookie(undefined, "n2-session")).toBeUndefined();
  });

  it("isAllowedHost : n2.localhost, 127.0.0.1 et localhost sur le port de N2 seulement", () => {
    expect(isAllowedHost("n2.localhost:4747", "4747")).toBe(true);
    expect(isAllowedHost("127.0.0.1:4747", "4747")).toBe(true);
    expect(isAllowedHost("localhost:4747", "4747")).toBe(true);
    for (const h of ["n2.localhost:4748", "evil.localhost:4747", "n2.localhost.evil.example:4747", "127.0.0.1:4748", "evil.example:4747", "192.168.1.20:4747", "[::1]:4747", "", undefined])
      expect(isAllowedHost(h, "4747")).toBe(false);
  });

  it("la page verrouillée ne contient ni script ni donnée, dans la langue du cookie", () => {
    const page = lockedPage(lockedLang("n2-lang=en"));
    expect(page).toContain('lang="en"');
    expect(page).toContain("bun run open");
    expect(page).not.toMatch(/<script/i);
    expect(lockedLang(undefined)).toBe("fr");
  });
});

describe("adresse de N2 : n2.localhost", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("N2_HOST : 127.0.0.1, localhost ou un nom en .localhost ; sinon n2.localhost", () => {
    expect(publicHost()).toBe("n2.localhost");
    vi.stubEnv("N2_HOST", "127.0.0.1");
    expect(publicHost()).toBe("127.0.0.1");
    vi.stubEnv("N2_HOST", "Moi.N2.localhost");
    expect(publicHost()).toBe("moi.n2.localhost");
    for (const bad of ["evil.example", "n2.localhost.evil.example", "n2.localhost:80", "a..localhost", "@evil.localhost"]) {
      vi.stubEnv("N2_HOST", bad);
      expect(publicHost()).toBe("n2.localhost");
    }
  });

  it("une page ouverte sur 127.0.0.1 est renvoyée vers n2.localhost, ancien cookie effacé", () => {
    const r = canonicalRedirect("127.0.0.1:4747", "/carte?node=a&login=code", "4747", "document");
    expect(r?.location).toBe("http://n2.localhost:4747/carte?node=a&login=code");
    expect(r?.setCookie).toMatch(/^n2-session=; .*Max-Age=0/);
    expect(canonicalRedirect("localhost:4747", "/", "4747", "document")?.location).toBe("http://n2.localhost:4747/");
  });

  it("pas de redirection : déjà sur n2.localhost, ou requête qui n'est pas une page (curl, fonction serveur, fichier)", () => {
    expect(canonicalRedirect("n2.localhost:4747", "/", "4747", "document")).toBeNull();
    for (const dest of [undefined, null, "empty", "script", "iframe"]) expect(canonicalRedirect("127.0.0.1:4747", "/", "4747", dest)).toBeNull();
  });

  it("le chemin reste sur N2 (« //site.example » n'emmène pas ailleurs)", () => {
    expect(canonicalRedirect("127.0.0.1:4747", "//evil.example/x", "4747", "document")?.location).toBe("http://n2.localhost:4747/x");
    // « /\evil.example » est lu comme « //evil.example » (nom d'hôte, pas chemin) : on retombe sur l'accueil de N2
    expect(canonicalRedirect("127.0.0.1:4747", "/\\evil.example", "4747", "document")?.location).toBe("http://n2.localhost:4747/");
  });
});
