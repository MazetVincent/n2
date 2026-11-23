// Serveur MCP de N2 : poignée de main, liste des outils, appels transmis à N2 (lecture seule), erreurs lisibles.
import { describe, expect, it, vi } from "vitest";
import { handle, TOOLS, type N2Fetch } from "../scripts/mcp.ts";

const fake = (body: unknown = { schemaVersion: 1 }) => vi.fn<N2Fetch>(async () => ({ ok: true, body }));

describe("serveur MCP", () => {
  it("initialize : reprend la version du client et annonce des outils", async () => {
    const r = await handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } }, fake());
    expect(r).toMatchObject({ id: 1, result: { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "n2" } } });
  });

  it("notification : pas de réponse ; méthode inconnue : erreur -32601", async () => {
    expect(await handle({ jsonrpc: "2.0", method: "notifications/initialized" }, fake())).toBeNull();
    expect(await handle({ jsonrpc: "2.0", id: 2, method: "resources/list" }, fake())).toMatchObject({ error: { code: -32601 } });
  });

  it("tools/list : n2_status et n2_branch", async () => {
    const r = await handle({ jsonrpc: "2.0", id: 3, method: "tools/list" }, fake());
    expect((r as { result: { tools: { name: string }[] } }).result.tools.map((t) => t.name)).toEqual(TOOLS.map((t) => t.name));
  });

  it("tools/call : n2_status lit /api/status ; n2_branch passe le nom encodé", async () => {
    const f = fake({ schemaVersion: 1, todo: { counts: { now: 2 } } });
    const r = await handle({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "n2_status", arguments: {} } }, f);
    expect(f).toHaveBeenLastCalledWith("/api/status");
    expect(JSON.parse((r as { result: { content: { text: string }[] } }).result.content[0].text)).toMatchObject({ todo: { counts: { now: 2 } } });
    await handle({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "n2_branch", arguments: { name: "feat/ABC-1&x=1" } } }, f);
    expect(f).toHaveBeenLastCalledWith("/api/branch?name=feat%2FABC-1%26x%3D1");
    await handle({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "n2_branch", arguments: {} } }, f);
    expect(f).toHaveBeenLastCalledWith("/api/branch");
  });

  it("N2 arrêté : l'outil répond une erreur lisible (isError), pas une exception", async () => {
    const down: N2Fetch = async () => ({ ok: false, error: "N2 ne répond pas" });
    const r = await handle({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "n2_status" } }, down);
    expect(r).toMatchObject({ result: { isError: true, content: [{ type: "text", text: "N2 ne répond pas" }] } });
  });

  it("outil inconnu ou argument mal typé : erreur -32602, sans appel à N2", async () => {
    const f = fake();
    expect(await handle({ jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "rm_rf" } }, f)).toMatchObject({ error: { code: -32602 } });
    expect(await handle({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "n2_branch", arguments: { name: 42 } } }, f)).toMatchObject({ error: { code: -32602 } });
    expect(f).not.toHaveBeenCalled();
  });
});
