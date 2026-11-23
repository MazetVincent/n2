// État de N2 depuis le terminal ou une barre de menus (voir src/server/status.ts) :
//   bun run status            → une ligne lisible (« N2 · 2 urgents · 1 à surveiller · CI master ✓ … »)
//   bun run status --json     → le JSON versionné (schemaVersion), tel que N2 le renvoie
// Lit le jeton de session dans ~/.config/n2/session (N2_STATE_DIR) et l'envoie en cookie à 127.0.0.1:<N2_PORT>.
// Code de sortie : 0 si N2 a répondu, 1 sinon (N2 arrêté, jeton absent ou refusé).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stateDir } from "../src/server/session.ts";
import type { N2Status } from "../src/server/status.ts";

const port = process.env.N2_PORT ?? "4747";
const json = process.argv.includes("--json");

let token: string;
try {
  token = readFileSync(join(stateDir(), "session"), "utf8").trim();
} catch {
  console.error("✗ Jeton de session introuvable : lance d'abord N2 (bun run dev, ou le démarrage automatique).");
  process.exit(1);
}

let res: Response;
try {
  res = await fetch(`http://127.0.0.1:${port}/api/status`, { headers: { Cookie: `n2-session=${token}` }, signal: AbortSignal.timeout(60_000) });
} catch {
  console.error(`✗ N2 ne répond pas sur 127.0.0.1:${port}.`);
  process.exit(1);
}
if (!res.ok) {
  console.error(`✗ N2 a répondu ${res.status}.`);
  process.exit(1);
}
const status = (await res.json()) as N2Status;
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
].filter(Boolean);
console.log(parts.join(" · "));
for (const i of status.todo.items.filter((x) => x.urgency === "now")) console.log(`  • ${i.label} : ${i.title}`);
