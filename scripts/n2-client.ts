// Client de N2 pour les scripts (bun run status, serveur MCP) : appelle N2 en marche avec le jeton de session.
// Le jeton permanent n'est envoyé qu'à un serveur qui appartient au même compte : sur un Mac à plusieurs comptes,
// un autre compte qui écouterait sur le port de N2 (N2 arrêté, redémarrage) ne doit pas le recevoir.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stateDir } from "../src/server/session.ts";

export type N2Response = { ok: true; status: number; body: unknown } | { ok: false; status?: number; error: string };

/**
 * Le processus qui écoute sur `port` appartient-il à ce compte ? Il faut une preuve : `lsof` (macOS, Linux) doit le
 * montrer avec notre uid. Sans preuve (autre compte, outil absent, rien à l'écoute), la réponse est non.
 * N2_SKIP_OWNER_CHECK=1 lève la vérification (système sans lsof).
 */
export function listenerIsMine(port: string, run = (args: string[]) => execFileSync("lsof", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })): boolean {
  if (process.env.N2_SKIP_OWNER_CHECK === "1") return true;
  let out: string;
  try {
    out = run(["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fu"]);
  } catch {
    return false;
  }
  const uids = out.split("\n").filter((l) => l.startsWith("u")).map((l) => Number(l.slice(1)));
  return uids.length > 0 && uids.every((u) => u === process.getuid?.());
}

export async function fetchN2(path: string, port = process.env.N2_PORT ?? "4747", check = listenerIsMine): Promise<N2Response> {
  if (!/^\d{2,5}$/.test(port)) return { ok: false, error: `N2_PORT invalide : ${port}` };
  let token: string;
  try {
    token = readFileSync(join(stateDir(), "session"), "utf8").trim();
  } catch {
    return { ok: false, error: "Jeton de session de N2 introuvable : N2 n'a jamais démarré sur cette machine." };
  }
  if (!check(port)) {
    return { ok: false, error: `Aucun N2 à toi n'écoute sur 127.0.0.1:${port} (N2 arrêté, ou un autre compte de la machine occupe le port) : jeton non envoyé.` };
  }
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers: { Cookie: `n2-session=${token}` }, signal: AbortSignal.timeout(60_000) });
    const body = await res.json().catch(() => null);
    return res.ok ? { ok: true, status: res.status, body } : { ok: false, status: res.status, error: `N2 a répondu ${res.status}.` };
  } catch {
    return { ok: false, error: `N2 ne répond pas sur 127.0.0.1:${port} : il doit être lancé (bun run dev ou démarrage automatique).` };
  }
}
