import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Config } from "../config.ts";
import { httpFetch, SourceFailure } from "../run.ts";
import { stateDir } from "../session.ts";
import type { MicrosoftLogin } from "../types.ts";
import { msg } from "../messages.ts";
import type { Message } from "../types.ts";

// Connexion à Microsoft Graph par « code d'appareil » : N2 affiche un code, on le saisit sur la page Microsoft
// (dans Chrome, avec son compte pro), et N2 reçoit ses jetons. Pas de mot de passe ni de page de redirection.
// Les jetons sont gardés hors du projet, dans ~/.config/n2/microsoft.json (lisible par soi seul ; N2_STATE_DIR pour les tests),
// et ne sont jamais renvoyés au navigateur.

type GraphConfig = NonNullable<NonNullable<Config["calendar"]>["graph"]>;

const SCOPE = "offline_access Calendars.Read";
const tokenPath = () => join(stateDir(), "microsoft.json");

interface StoredToken {
  tenantId: string;
  clientId: string;
  accessToken: string;
  refreshToken: string;
  /** ms depuis l'epoch */
  expiresAt: number;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

// tenantId : GUID ou domaine (monentreprise.onmicrosoft.com…) ; clientId : GUID. Vérifiés avant d'entrer dans une URL.
const TENANT = /^[A-Za-z0-9.-]{1,100}$/;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function authority(g: GraphConfig): string {
  if (!TENANT.test(g.tenantId) || !GUID.test(g.clientId)) {
    throw new SourceFailure({ kind: "config", message: msg("srv_graph_config_invalid"), hint: msg("srv_hint_graph_ids") });
  }
  return `https://login.microsoftonline.com/${g.tenantId}/oauth2/v2.0`;
}

async function post(url: string, body: Record<string, string>): Promise<TokenResponse & Record<string, unknown>> {
  const res = await httpFetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
  return (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as TokenResponse & Record<string, unknown>;
}

function readToken(g: GraphConfig): StoredToken | null {
  if (!existsSync(tokenPath())) return null;
  try {
    const t = JSON.parse(readFileSync(tokenPath(), "utf8")) as StoredToken;
    // jetons d'une autre app ou d'un autre tenant : on les ignore
    return t.tenantId === g.tenantId && t.clientId === g.clientId && t.refreshToken ? t : null;
  } catch {
    return null;
  }
}

function saveToken(g: GraphConfig, r: TokenResponse): StoredToken {
  const t: StoredToken = {
    tenantId: g.tenantId,
    clientId: g.clientId,
    accessToken: r.access_token!,
    refreshToken: r.refresh_token!,
    expiresAt: Date.now() + (r.expires_in ?? 3600) * 1000,
  };
  const path = tokenPath();
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, JSON.stringify(t), { mode: 0o600 });
  chmodSync(path, 0o600);
  return t;
}

export const hasMicrosoftToken = (g: GraphConfig) => readToken(g) !== null;

export function logoutMicrosoft(): void {
  rmSync(tokenPath(), { force: true });
}

/** Un jeton d'accès valide (renouvelé si besoin), ou null si on n'est pas (ou plus) connecté. */
export async function accessToken(g: GraphConfig, forceRefresh = false): Promise<string | null> {
  const t = readToken(g);
  if (!t) return null;
  if (!forceRefresh && t.expiresAt - Date.now() > 60_000) return t.accessToken;
  const r = await post(`${authority(g)}/token`, { grant_type: "refresh_token", client_id: g.clientId, refresh_token: t.refreshToken, scope: SCOPE });
  if (r.access_token) return saveToken(g, { ...r, refresh_token: r.refresh_token ?? t.refreshToken }).accessToken;
  // invalid_grant : session révoquée ou expirée, il faut se reconnecter
  if (r.error === "invalid_grant" || r.error === "interaction_required") {
    logoutMicrosoft();
    return null;
  }
  throw new SourceFailure({ kind: "unavailable", message: msg("srv_ms_renew_refused", { error: r.error ?? "?" }) });
}

// ---------- Connexion en cours (une seule à la fois, gardée en mémoire) ----------
let login: MicrosoftLogin = { state: "idle" };
let attempt = 0;

export const microsoftLoginState = (): MicrosoftLogin => login;

/** Démarre une connexion (ou renvoie celle en cours) et attend sa validation en arrière-plan. */
export async function startMicrosoftLogin(g: GraphConfig, onDone: () => void): Promise<MicrosoftLogin> {
  if (login.state === "pending" && login.expiresAt && Date.parse(login.expiresAt) > Date.now() + 30_000) return login;
  const base = authority(g);
  const r = await post(`${base}/devicecode`, { client_id: g.clientId, scope: SCOPE });
  if (typeof r.device_code !== "string" || typeof r.user_code !== "string") {
    login = { state: "error", error: describe(r) };
    return login;
  }
  const expiresIn = Number(r.expires_in ?? 900);
  login = {
    state: "pending",
    userCode: r.user_code,
    verificationUri: typeof r.verification_uri === "string" ? r.verification_uri : "https://microsoft.com/devicelogin",
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
  const id = ++attempt;
  const deviceCode = r.device_code;
  let interval = Number(r.interval ?? 5) * 1000;

  const poll = async () => {
    if (id !== attempt) return; // une connexion plus récente a pris le relais
    const t = await post(`${base}/token`, { grant_type: "urn:ietf:params:oauth:grant-type:device_code", client_id: g.clientId, device_code: deviceCode }).catch(
      () => ({ error: "authorization_pending" }) as TokenResponse,
    );
    if (id !== attempt) return;
    if (t.access_token && t.refresh_token) {
      saveToken(g, t);
      login = { state: "done" };
      onDone();
    } else if (t.error === "authorization_pending" || t.error === "slow_down") {
      if (t.error === "slow_down") interval += 5000;
      if (Date.parse(login.expiresAt!) > Date.now()) setTimeout(poll, interval);
      else login = { state: "error", error: msg("srv_code_expired") };
    } else {
      login = { state: "error", error: describe(t) };
    }
  };
  setTimeout(poll, interval);
  return login;
}

function describe(r: TokenResponse): Message {
  if (r.error === "authorization_declined") return msg("srv_signin_declined");
  if (r.error === "expired_token") return msg("srv_code_expired");
  // AADSTS65001 : consentement manquant ; AADSTS7000218 : flux clients publics désactivés dans l'app Entra
  const code = r.error_description?.match(/AADSTS\d+/)?.[0];
  return msg("srv_ms_signin_refused", { error: [r.error, code].filter(Boolean).join(", ") || "?" });
}
