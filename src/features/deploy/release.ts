// Release Sentry en production ↔ mise en prod CodePipeline (partagé par Déploiements et « À faire »). Fonctions pures.
import type { DeployCommit, MainPipeline } from "~/server/types";

/** Écart maximal entre la fin d'une mise en prod et le premier événement de production d'une release */
const MATCH_WINDOW_MS = 90 * 60_000;

/**
 * Mise en prod qui a livré la release : l'exécution réussie du pipeline principal dont la fin est la plus proche
 * du premier événement de production de la release (à 1 h 30 près). null si aucune ne correspond.
 */
export function deployOfRelease(main: MainPipeline | null | undefined, since: string | null | undefined): DeployCommit | null {
  const at = since ? Date.parse(since) : NaN;
  if (!main || Number.isNaN(at)) return null;
  let best: DeployCommit | null = null;
  let gap = MATCH_WINDOW_MS;
  for (const c of main.executions) {
    if (c.status !== "Succeeded") continue;
    const d = Math.abs(Date.parse(c.updatedAt) - at);
    if (d <= gap) [best, gap] = [c, d];
  }
  return best;
}

/** La release est arrivée en prod il y a moins de `hours` heures */
export const isRecentRelease = (since: string | null | undefined, now: number, hours = 24) => {
  const at = since ? Date.parse(since) : NaN;
  return !Number.isNaN(at) && now - at < hours * 3_600_000;
};
