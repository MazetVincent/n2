// Badges d'état d'une PR (brouillon, CI, revue, conflits) : page Pull requests et onglet Librairies.
import type { Tone } from "~/components/ds";
import { m } from "~/lib/i18n";
import type { DeployState, OpenPr, PullRequest } from "~/server/types";

/** PR ouverte (liste de toutes les PR ouvertes des dépôts suivis) au format des PR de la page Pull requests */
export const fromOpenPr = (p: OpenPr): PullRequest => ({ ...p, state: "OPEN", myReview: null, jira: [] });

const CI: Record<string, [string, Tone]> = { SUCCESS: ["CI ✓", "ok"], FAILURE: ["CI ✗", "bad"], ERROR: ["CI ✗", "bad"], PENDING: ["CI …", "warn"], EXPECTED: ["CI …", "warn"] };
const DECISION = (): Record<string, [string, Tone]> => ({
  APPROVED: [m.prs_approved(), "ok"],
  CHANGES_REQUESTED: [m.prs_changes_requested(), "bad"],
  REVIEW_REQUIRED: [m.prs_review_required(), "warn"],
});

type Status = Pick<PullRequest, "isDraft" | "ci" | "reviewDecision" | "mergeable"> & { state?: PullRequest["state"] };

const DEPLOY = (): Record<DeployState, [string, Tone]> => ({
  prod: [m.prs_prod(), "ok"],
  approval: [m.prs_awaiting_prod(), "warn"],
  deploying: [m.prs_deploying(), "info"],
  failed: [m.common_deploy_failed(), "bad"],
});

/** [libellé, ton] de chaque badge d'état ; `deploy` : où en est une PR fusionnée (onglet Déploiements) */
export function prStatusBadges(pr: Status, deploy?: DeployState): [string, Tone][] {
  if (pr.state === "MERGED") return deploy ? [[m.prs_merged(), "accent"], DEPLOY()[deploy]] : [[m.prs_merged(), "accent"]];
  if (pr.state === "CLOSED") return [[m.prs_closed(), "neutral"]];
  const out: [string, Tone][] = [];
  if (pr.isDraft) out.push([m.prs_draft(), "neutral"]);
  if (pr.ci && CI[pr.ci]) out.push(CI[pr.ci]);
  if (pr.reviewDecision && DECISION()[pr.reviewDecision]) out.push(DECISION()[pr.reviewDecision]);
  if (pr.mergeable === "CONFLICTING") out.push([m.prs_conflicts(), "bad"]);
  return out;
}

/** Où en est une PR fusionnée, d'après les déploiements (seulement pour le dépôt déployé par le pipeline) */
export function deployStateOf(pr: Pick<PullRequest, "number" | "repo" | "state">, deploy: import("~/server/types").DeployData | undefined): DeployState | undefined {
  if (pr.state !== "MERGED" || !deploy || !deploy.links.pr.includes(`/${pr.repo}/pull/`)) return undefined;
  return deploy.prStates[pr.number];
}
