import { createFileRoute } from "@tanstack/react-router";

/*
 * État de N2 en JSON, versionné (schemaVersion) : pour une barre de menus, un script ou le serveur MCP.
 * Protégé comme tout N2 : nom d'hôte vérifié et cookie de session (bun run status le lit dans ~/.config/n2/session).
 */
export const Route = createFileRoute("/api/status")({
  server: {
    handlers: {
      GET: async () => {
        // import dans le gestionnaire : ce code (et node:*) reste côté serveur
        const { buildStatus } = await import("~/server/status");
        return new Response(JSON.stringify(await buildStatus()), {
          headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
        });
      },
    },
  },
});
