// Lecture des sources du tableau de bord, partagée par les fonctions serveur (fns.ts), l'état en JSON (/api/status)
// et le serveur MCP : mêmes clés de cache et mêmes durées partout, donc une seule lecture des CLI pour tous.
// Code serveur uniquement (importé depuis les gestionnaires).
import { loadConfig } from "./config.ts";
import { cached } from "./run.ts";
import { awsSession } from "./sources/aws-session.ts";
import { fetchCi } from "./sources/ci.ts";
import { fetchCloudWatch } from "./sources/cloudwatch.ts";
import { branchChanges } from "./sources/codemap.ts";
import { fetchDeploy } from "./sources/deploy.ts";
import { fetchPullRequests } from "./sources/github.ts";
import { fetchSprint } from "./sources/jira.ts";
import { fetchLibs } from "./sources/libs.ts";
import { fetchSentry } from "./sources/sentry.ts";

const MIN = 60_000;

export const readPullRequests = (force = false) => cached("prs", 2 * MIN, force, () => fetchPullRequests(loadConfig()));
export const readSprint = (force = false) => cached("jira", 2 * MIN, force, () => fetchSprint(loadConfig()));
export const readLibs = (force = false) => cached("libs", 6 * 60 * MIN, force, () => fetchLibs(loadConfig()));
export const readCloudWatch = (force = false) => cached("cloudwatch", 1 * MIN, force, () => fetchCloudWatch(loadConfig()));
export const readDeploy = (force = false) => cached("deploy", 1 * MIN, force, () => fetchDeploy(loadConfig()));
/** `env` : choisi dans Observabilité (null : tous) ; absent : sentry.environment de la config */
export const readSentry = (force = false, env?: string | null) =>
  cached(`sentry:${env === undefined ? "(config)" : (env ?? "")}`, 2 * MIN, force, () => fetchSentry(loadConfig(), env));
/** `branch` : nom sur GitHub (sans « origin/ ») ; absent : branche principale seulement */
export const readCi = (force = false, branch?: string) => cached(`ci:${branch ?? ""}`, 2 * MIN, force, () => fetchCi(loadConfig(), branch));
/** « Ma branche » : `branch` choisie, sinon la branche actuelle du projet */
export const readBranch = (force = false, branch?: string) => cached(`branch:${branch ?? ""}`, 1 * MIN, force, () => branchChanges(loadConfig(), branch));
export const readAwsSession = () => awsSession(loadConfig());
