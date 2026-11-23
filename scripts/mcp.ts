// Serveur MCP de N2 (stdio) : une session Claude Code, Codex… peut demander ce qui l'attend sur le projet.
//   claude mcp add n2 -- bun /chemin/vers/n2/scripts/mcp.ts
// Lecture seule : il interroge N2 en marche (127.0.0.1:<N2_PORT>) avec le jeton de session (~/.config/n2/session),
// comme bun run status ; il ne lance aucune commande et n'écrit rien. N2 doit tourner.
// Protocole : JSON-RPC 2.0, un message par ligne sur stdin / stdout (diagnostics sur stderr).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { stateDir } from "../src/server/session.ts";

const PROTOCOL_VERSION = "2025-06-18";

type Json = Record<string, unknown>;
interface Request {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: Json;
}

export const TOOLS = [
  {
    name: "n2_status",
    description:
      "État du projet suivi par N2 : ce qui demande une action (revues demandées, PR bloquées, CI ou pipeline en échec, alarmes, nouvelles erreurs de production, failles), CI de la branche principale et de la branche actuelle, sources de N2 en échec.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "n2_branch",
    description:
      "Contexte d'une branche du projet suivi : fichiers modifiés depuis la branche principale et parties du code touchées, PR de la branche (CI, revue, conflits), workflows de CI, tickets Jira cités. Sans nom : la branche actuelle du dépôt.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string", description: "Branche locale ou distante (« feat/ABC-123 », « origin/fix/x »). Facultatif." } },
      additionalProperties: false,
    },
  },
] as const;

/** Appel à N2 avec le cookie de session ; renvoie le JSON, ou une erreur lisible pour l'agent */
export type N2Fetch = (path: string) => Promise<{ ok: true; body: unknown } | { ok: false; error: string }>;

export function n2Fetch(port = process.env.N2_PORT ?? "4747"): N2Fetch {
  return async (path) => {
    let token: string;
    try {
      token = readFileSync(join(stateDir(), "session"), "utf8").trim();
    } catch {
      return { ok: false, error: "Jeton de session de N2 introuvable : N2 n'a jamais démarré sur cette machine." };
    }
    try {
      const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers: { Cookie: `n2-session=${token}` }, signal: AbortSignal.timeout(60_000) });
      if (res.status === 404) return { ok: false, error: "Branche inconnue dans le projet suivi." };
      if (!res.ok) return { ok: false, error: `N2 a répondu ${res.status}.` };
      return { ok: true, body: await res.json() };
    } catch {
      return { ok: false, error: `N2 ne répond pas sur 127.0.0.1:${port} : il doit être lancé (bun run dev ou démarrage automatique).` };
    }
  };
}

const result = (id: Request["id"], value: unknown) => ({ jsonrpc: "2.0", id, result: value });
const failure = (id: Request["id"], code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

/** Réponse à un message (null pour une notification) */
export async function handle(req: Request, fetchN2: N2Fetch): Promise<Json | null> {
  const isNotification = req.id === undefined;
  switch (req.method) {
    case "initialize":
      return result(req.id, {
        protocolVersion: typeof req.params?.protocolVersion === "string" ? req.params.protocolVersion : PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "n2", version: "1.0.0" },
        instructions: "N2 est le tableau de bord local du développeur : appelle n2_status pour savoir ce qui attend, n2_branch pour le contexte d'une branche.",
      });
    case "ping":
      return result(req.id, {});
    case "tools/list":
      return result(req.id, { tools: TOOLS });
    case "tools/call": {
      const name = req.params?.name;
      const args = (req.params?.arguments ?? {}) as Json;
      let path: string;
      if (name === "n2_status") path = "/api/status";
      else if (name === "n2_branch") {
        if (args.name !== undefined && typeof args.name !== "string") return failure(req.id, -32602, "name doit être une chaîne");
        path = `/api/branch${typeof args.name === "string" && args.name ? `?name=${encodeURIComponent(args.name)}` : ""}`;
      } else return failure(req.id, -32602, `Outil inconnu : ${String(name)}`);
      const r = await fetchN2(path);
      return result(req.id, r.ok ? { content: [{ type: "text", text: JSON.stringify(r.body, null, 2) }] } : { content: [{ type: "text", text: r.error }], isError: true });
    }
    default:
      return isNotification ? null : failure(req.id, -32601, `Méthode non prise en charge : ${req.method}`);
  }
}

if (import.meta.main) {
  const fetchN2 = n2Fetch();
  const rl = createInterface({ input: process.stdin });
  rl.on("line", async (line) => {
    if (!line.trim()) return;
    let req: Request;
    try {
      req = JSON.parse(line) as Request;
    } catch {
      process.stdout.write(`${JSON.stringify(failure(null, -32700, "JSON invalide"))}\n`);
      return;
    }
    const res = await handle(req, fetchN2).catch((e) => failure(req.id, -32603, e instanceof Error ? e.message : String(e)));
    if (res) process.stdout.write(`${JSON.stringify(res)}\n`);
  });
}
