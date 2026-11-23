// Serveur MCP de N2 (stdio) : une session Claude Code, Codex… peut demander ce qui l'attend sur le projet.
//   claude mcp add n2 -- bun /chemin/vers/n2/scripts/mcp.ts
// Lecture seule : il interroge N2 en marche (127.0.0.1:<N2_PORT>) avec le jeton de session (~/.config/n2/session),
// comme bun run status, et seulement si ce N2 appartient au même compte (scripts/n2-client.ts) ; il ne lance aucune
// commande et n'écrit rien. N2 doit tourner.
// Protocole : JSON-RPC 2.0, un message par ligne sur stdin / stdout (diagnostics sur stderr).
import { createInterface } from "node:readline";
import { fetchN2, type N2Response } from "./n2-client.ts";

/** Versions du protocole MCP prises en charge, la plus récente d'abord */
const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

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

/** Appel à N2 (chemin de l'API) : la réponse, ou une erreur lisible */
export type N2Fetch = (path: string) => Promise<N2Response>;

/** Message pour l'agent quand N2 refuse ou échoue, selon l'outil */
function toolError(tool: "n2_status" | "n2_branch", r: Extract<N2Response, { ok: false }>): string {
  if (r.status === 404 && tool === "n2_branch") return "Branche inconnue dans le projet suivi.";
  if (r.status === 404) return "Ce N2 ne connaît pas /api/status : il est d'une version plus ancienne, redémarre-le pour le mettre à jour.";
  if (r.status === 503 && tool === "n2_branch") return "N2 n'a pas pu lire cette branche (projet introuvable ou dépôt git illisible).";
  return r.error;
}

const result = (id: Request["id"], value: unknown) => ({ jsonrpc: "2.0", id, result: value });
const failure = (id: Request["id"], code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

/** Réponse à un message ; null pour une notification (sans id), qui ne reçoit jamais de réponse */
export async function handle(raw: unknown, callN2: N2Fetch): Promise<Json | null> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw) || typeof (raw as Request).method !== "string") {
    const id = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? ((raw as Request).id ?? null) : null;
    return failure(id, -32600, "Requête JSON-RPC invalide");
  }
  const req = raw as Request;
  const res = await respond(req, callN2);
  return req.id === undefined ? null : res;
}

async function respond(req: Request, callN2: N2Fetch): Promise<Json> {
  switch (req.method) {
    case "initialize":
      return result(req.id, {
        // la version du client si elle est prise en charge, sinon la plus récente (le client décide alors s'il continue)
        protocolVersion: PROTOCOL_VERSIONS.includes(String(req.params?.protocolVersion)) ? String(req.params?.protocolVersion) : PROTOCOL_VERSIONS[0],
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
      const r = await callN2(path);
      return result(req.id, r.ok ? { content: [{ type: "text", text: JSON.stringify(r.body, null, 2) }] } : { content: [{ type: "text", text: toolError(name, r) }], isError: true });
    }
    default:
      return failure(req.id, -32601, `Méthode non prise en charge : ${req.method}`);
  }
}

if (import.meta.main) {
  const callN2: N2Fetch = (path) => fetchN2(path);
  const rl = createInterface({ input: process.stdin });
  rl.on("line", async (line) => {
    if (!line.trim()) return;
    let msg: unknown;
    try {
      msg = JSON.parse(line);
    } catch {
      process.stdout.write(`${JSON.stringify(failure(null, -32700, "JSON invalide"))}\n`);
      return;
    }
    const res = await handle(msg, callN2).catch((e) => {
      const id = typeof msg === "object" && msg !== null && "id" in msg ? ((msg as Request).id ?? null) : null;
      return id === null ? null : failure(id, -32603, e instanceof Error ? e.message : String(e));
    });
    if (res) process.stdout.write(`${JSON.stringify(res)}\n`);
  });
}
