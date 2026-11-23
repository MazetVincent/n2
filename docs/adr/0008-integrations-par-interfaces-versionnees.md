# 0008. Les autres outils lisent N2 par des interfaces versionnées

Statut : acceptée (novembre 2026)

## Contexte

Une barre de menus, un script ou un agent IA veulent savoir ce qui attend, sans dépendre des fonctions internes de N2 ni relancer les CLI.

## Décision

N2 expose `/api/status` et `/api/branch` en JSON avec `schemaVersion` (incrémenté à chaque changement incompatible), protégés comme le reste (hôte, cookie). `bun run status` et le serveur MCP (`scripts/mcp.ts`, stdio, sans dépendance) les lisent avec le jeton de session. Les deux partagent le cache des onglets (`src/server/sources.ts`).

## Conséquences

N2 doit tourner pour répondre. Les reports de « À faire », gardés dans le navigateur, ne sont pas connus de ces interfaces.
