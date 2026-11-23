import { createFileRoute } from "@tanstack/react-router";

/*
 * Contexte d'une branche du projet suivi en JSON (serveur MCP) : ?name=<branche> (sinon la branche actuelle).
 * Protégé comme tout N2 (nom d'hôte, cookie de session). 404 : branche inconnue ou nom refusé.
 */
export const Route = createFileRoute("/api/branch")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { buildBranchContext } = await import("~/server/status");
        const name = new URL(request.url).searchParams.get("name") ?? undefined;
        const ctx = await buildBranchContext(name);
        return new Response(JSON.stringify(ctx ?? { error: "unknown-branch" }), {
          status: ctx ? 200 : 404,
          headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
        });
      },
    },
  },
});
