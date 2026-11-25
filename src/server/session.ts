/*
 * Verrou de N2 : seul le navigateur de la personne qui a lancé N2 peut l'ouvrir.
 *
 * Pourquoi : N2 n'écoute que sur 127.0.0.1, donc personne d'autre sur le réseau ne peut le joindre. Mais sur la MÊME
 * machine, 127.0.0.1 est partagé par tous les comptes macOS et tous les programmes. Sans verrou, un autre compte du Mac
 * (changement rapide d'utilisateur) ou un programme local pourrait lire les PR, Slack, l'agenda… de cette session.
 *
 * Comment :
 *  - un jeton aléatoire permanent, dans ~/.config/n2/session (dossier 700, fichier 600 : lisible par soi seul) ;
 *  - chaque requête doit porter le cookie n2-session=<jeton> (HttpOnly, SameSite=Strict) ;
 *  - pour obtenir le cookie, `bun run open` écrit un code à usage unique dans ~/.config/n2/login (600) et ouvre
 *    http://127.0.0.1:4747/?login=<code>. N2 vérifie le code, le supprime, pose le cookie et redirige vers l'adresse
 *    propre. Le jeton permanent n'apparaît donc jamais dans une URL, un historique, `ps` ou un journal.
 *
 * Appliqué deux fois : par le serveur de Vite (vite.config.ts, toutes les requêtes, y compris les fichiers sources)
 * et par les middlewares de TanStack Start (src/start.ts, pour un build de production).
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const SESSION_COOKIE = "n2-session";
/** Durée de vie du cookie : un an (le jeton, lui, ne change que si on supprime le fichier) */
const COOKIE_MAX_AGE = 365 * 24 * 3600;
/** Durée de validité d'un code de `bun run open` */
export const LOGIN_TTL_MS = 2 * 60_000;

/** Dossier des fichiers de N2 propres à l'utilisateur (N2_STATE_DIR : pour les tests) */
export const stateDir = () => process.env.N2_STATE_DIR ?? join(homedir(), ".config", "n2");
const sessionFile = () => join(stateDir(), "session");
const loginFile = () => join(stateDir(), "login");

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/; // 32 octets en base64url

let cached: { file: string; mtime: number; token: string } | undefined;

const writeToken = (file: string, token: string) => {
  mkdirSync(stateDir(), { recursive: true, mode: 0o700 });
  // écrit à côté puis renomme : jamais de fichier à moitié écrit, et toujours en 600
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${token}\n`, { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, file);
};

/**
 * Le jeton de session : lu dans ~/.config/n2/session, créé (600) s'il n'existe pas ou s'il est illisible.
 * Relu dès que le fichier change : `bun run open --reset` déconnecte tous les navigateurs sans redémarrer N2.
 */
export function sessionToken(): string {
  const file = sessionFile();
  const mtime = statSync(file, { throwIfNoEntry: false })?.mtimeMs;
  if (cached?.file === file && mtime !== undefined && cached.mtime === mtime) return cached.token;
  let token: string | undefined;
  if (mtime !== undefined) {
    const content = readFileSync(file, "utf8").trim();
    if (TOKEN_RE.test(content)) {
      token = content;
      // un fichier lisible par d'autres (copié, restauré…) est remis à 600
      if ((statSync(file).mode & 0o077) !== 0) chmodSync(file, 0o600);
    }
  }
  if (!token) {
    token = randomBytes(32).toString("base64url");
    writeToken(file, token);
  }
  cached = { file, mtime: statSync(file).mtimeMs, token };
  return token;
}

/** Nouveau jeton (`bun run open --reset`) : tous les navigateurs déjà déverrouillés devront repasser par `bun run open`. */
export function rotateSessionToken(): void {
  writeToken(sessionFile(), randomBytes(32).toString("base64url"));
  cached = undefined;
}

/** Oublie le jeton gardé en mémoire (tests, ou fichier supprimé pour changer de jeton) */
export const resetSessionCache = () => {
  cached = undefined;
};

/** Comparaison en temps constant (la durée ne dit rien du nombre de caractères justes) */
function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Valeur d'un cookie dans un en-tête Cookie */
export function readCookie(header: string | null | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

/** Crée le code à usage unique de `bun run open` (fichier 600) et le renvoie */
export function createLoginCode(now = Date.now()): string {
  const code = randomBytes(24).toString("base64url");
  mkdirSync(stateDir(), { recursive: true, mode: 0o700 });
  writeFileSync(loginFile(), JSON.stringify({ code, at: now }), { mode: 0o600 });
  chmodSync(loginFile(), 0o600);
  return code;
}

/**
 * Vérifie un code de `bun run open`. Le fichier est supprimé quand le code est bon (usage unique), expiré ou illisible.
 * Un mauvais code ne le supprime pas : sinon n'importe quel programme ou site (`<img src=…?login=x>`) pourrait
 * effacer le code avant que Chrome l'utilise. Deviner le code est impossible (24 octets aléatoires, 2 minutes).
 */
export function consumeLoginCode(code: string, now = Date.now()): boolean {
  const file = loginFile();
  if (!existsSync(file)) return false;
  let saved: { code?: unknown; at?: unknown };
  try {
    saved = JSON.parse(readFileSync(file, "utf8")) as { code?: unknown; at?: unknown };
  } catch {
    rmSync(file, { force: true });
    return false;
  }
  const valid = typeof saved.code === "string" && typeof saved.at === "number" && now - saved.at >= 0 && now - saved.at <= LOGIN_TTL_MS;
  if (!valid) {
    rmSync(file, { force: true });
    return false;
  }
  if (!same(code, saved.code as string)) return false;
  rmSync(file, { force: true });
  return true;
}

/** Nom d'hôte attendu : 127.0.0.1 ou localhost, sur le port de N2 (anti « DNS rebinding ») */
/**
 * Nom sous lequel N2 s'ouvre dans le navigateur : « n2.localhost » par défaut. Tout nom en .localhost mène à la machine
 * (Chrome le sait sans rien configurer), et le cookie posé pour ce nom n'est pas envoyé aux autres serveurs de 127.0.0.1.
 * N2_HOST=127.0.0.1 garde l'ancienne adresse (navigateur qui ne connaîtrait pas .localhost). Seuls 127.0.0.1, localhost
 * et les noms en .localhost sont acceptés : un nom quelconque ouvrirait la porte au « DNS rebinding ».
 */
export function publicHost(): string {
  const h = (process.env.N2_HOST ?? "").toLowerCase();
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(h) && (h === "127.0.0.1" || h === "localhost" || h.endsWith(".localhost")) ? h : "n2.localhost";
}

/** Noms sous lesquels N2 répond : le sien (publicHost), puis 127.0.0.1 et localhost (scripts, curl) */
export const allowedHosts = () => [...new Set([publicHost(), "127.0.0.1", "localhost"])];

/** Nom d'hôte attendu : un de allowedHosts(), sur le port de N2 seulement */
export function isAllowedHost(host: string | null | undefined, port: string): boolean {
  return allowedHosts().some((h) => host === `${h}:${port}`);
}

/**
 * Page ouverte par le navigateur sur 127.0.0.1 ou localhost (ancien favori, ancienne commande) : renvoyée vers l'adresse
 * de N2, en effaçant le cookie de session posé pour l'ancien nom (il partirait sinon vers tous les serveurs de 127.0.0.1).
 * Seulement pour une navigation (Sec-Fetch-Dest: document) : les scripts (curl, check-server) ne sont pas concernés.
 * `host` doit avoir passé isAllowedHost.
 */
export function canonicalRedirect(host: string | null | undefined, url: string, port: string, fetchDest: string | null | undefined): { location: string; setCookie: string } | null {
  const canonical = `${publicHost()}:${port}`;
  if (fetchDest !== "document" || !host || host === canonical) return null;
  const u = new URL(url, "http://n2.invalid");
  // un seul « / » en tête : le chemin reste sur N2
  const location = `http://${canonical}/${u.pathname.replace(/^[/\\]+/, "")}${u.search}`;
  return { location, setCookie: `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` };
}

/** La requête porte-t-elle le bon cookie de session ? (WebSocket de Vite : pas de connexion par code) */
export function hasValidSession(cookieHeader: string | null | undefined): boolean {
  const cookie = readCookie(cookieHeader, SESSION_COOKIE);
  return cookie !== undefined && same(cookie, sessionToken());
}

export type Gate =
  | { kind: "pass" }
  | { kind: "login"; location: string; setCookie: string }
  | { kind: "deny" };

/**
 * Décision pour une requête : laisser passer (bon cookie), connecter (bon code ?login=…) ou refuser.
 * `url` : chemin et paramètres de la requête (ex. « /dashboard?login=… »).
 */
export function sessionGate(url: string, cookieHeader: string | null | undefined): Gate {
  if (hasValidSession(cookieHeader)) return { kind: "pass" };
  const token = sessionToken();

  const u = new URL(url, "http://n2.invalid");
  const code = u.searchParams.get("login");
  if (code && consumeLoginCode(code)) {
    u.searchParams.delete("login");
    // un seul « / » en tête : « //site.example » serait une redirection vers un autre site
    const location = `/${u.pathname.replace(/^[/\\]+/, "")}${u.search}`;
    return { kind: "login", location, setCookie: `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${COOKIE_MAX_AGE}` };
  }
  return { kind: "deny" };
}

/** Textes de la page verrouillée, lus dans messages/<langue>.json (dossier de N2 = dossier courant du serveur) */
function lockedTexts(lang: "fr" | "en"): { title: string; body: string; foot: string } {
  const keys = { title: "srv_locked_title", body: "srv_locked_body", foot: "srv_locked_foot" } as const;
  try {
    const messages = JSON.parse(readFileSync(join(process.cwd(), "messages", `${lang}.json`), "utf8")) as Record<string, string>;
    return { title: messages[keys.title], body: messages[keys.body], foot: messages[keys.foot] };
  } catch {
    return keys;
  }
}

const escapeHtml = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Page affichée sans cookie valide (aucune donnée, aucun script) */
export function lockedPage(lang: "fr" | "en"): string {
  const t = lockedTexts(lang);
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>N2</title>
<style>:root{color-scheme:light dark}body{margin:0;min-height:100vh;display:grid;place-items:center;font:14px/1.5 system-ui,-apple-system,sans-serif;background:#f4f5f8;color:#1c2130}
@media (prefers-color-scheme:dark){body{background:#0d0a10;color:#f2edf4}main{background:#16111a!important;border-color:#2b2231!important}code{background:#1c1621!important}}
main{max-width:440px;margin:16px;padding:24px;background:#fff;border:1px solid #e3e6ec;border-radius:12px}h1{font-size:18px;margin:0 0 8px}
code{display:inline-block;margin:8px 0;padding:4px 8px;border-radius:6px;background:#f8f9fb;font:13px ui-monospace,Menlo,monospace}p{margin:0}.muted{opacity:.7;margin-top:8px}</style></head>
<body><main><h1>${escapeHtml(t.title)}</h1><p>${escapeHtml(t.body)}</p><code>bun run open</code><p class="muted">${escapeHtml(t.foot)}</p></main></body></html>`;
}

/** Langue de la page verrouillée : celle du cookie n2-lang */
export const lockedLang = (cookieHeader: string | null | undefined): "fr" | "en" => (readCookie(cookieHeader, "n2-lang") === "en" ? "en" : "fr");
