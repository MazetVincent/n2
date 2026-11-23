// État de N2 depuis le terminal ou une barre de menus (voir src/server/status.ts) :
//   bun run status            → une ligne lisible (« N2 · 2 urgents · 1 à surveiller · CI master ✓ … »)
//   bun run status --json     → le JSON versionné (schemaVersion), tel que N2 le renvoie
// Lit le jeton de session dans ~/.config/n2/session (N2_STATE_DIR) et l'envoie en cookie à 127.0.0.1:<N2_PORT>,
// seulement si le serveur qui écoute appartient à ce compte (scripts/n2-client.ts).
// Code de sortie : 0 si N2 a répondu, 1 sinon (N2 arrêté, jeton absent ou refusé).
import { fetchN2 } from "./n2-client.ts";
import type { N2Status } from "../src/server/status.ts";

const port = process.env.N2_PORT ?? "4747";
const json = process.argv.includes("--json");

const r = await fetchN2("/api/status", port);
if (!r.ok) {
  console.error(`✗ ${r.error}`);
  process.exit(1);
}
const status = r.body as N2Status;
if (json) {
  console.log(JSON.stringify(status, null, 2));
  process.exit(0);
}

const mark = { success: "✓", failure: "✗", running: "…", none: "–" } as const;
const { now, watch } = status.todo.counts;
const parts = [
  "N2",
  `${now} urgent${now > 1 ? "s" : ""}`,
  `${watch} à surveiller`,
  status.ci.main && `CI ${status.ci.main.name} ${mark[status.ci.main.state]}`,
  status.ci.branch && `${status.ci.branch.name} ${mark[status.ci.branch.state]}`,
  status.failingSources.length > 0 && `${status.failingSources.length} source(s) en échec`,
  status.staleSources.length > 0 && `${status.staleSources.length} source(s) périmée(s)`,
  status.n2.demo && "mode démo",
].filter(Boolean);
console.log(parts.join(" · "));
for (const i of status.todo.items.filter((x) => x.urgency === "now")) console.log(`  • ${i.label} : ${i.title}`);
