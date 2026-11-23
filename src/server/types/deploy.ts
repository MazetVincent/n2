// Déploiements (AWS CodePipeline).


// ---------- Déploiements (AWS CodePipeline) ----------
/** Où en est un commit de la branche principale */
export type DeployState = "prod" | "approval" | "deploying" | "failed";

export interface DeployCommit {
  sha: string;
  /** première ligne du message de commit */
  message: string;
  /** PR citée dans le message (« … (#654) ») */
  pr: number | null;
  jira: string[];
  executionId: string;
  /** état de l'exécution du pipeline lancée par ce commit (Succeeded, Superseded, Failed…) */
  status: string;
  startedAt: string;
  updatedAt: string;
  /** mise en production (première exécution réussie qui le contient) ; null s'il n'y est pas encore */
  prodAt: string | null;
}

export interface DeployStage {
  name: string;
  status: string | null;
  at: string | null;
  /** commit de la dernière exécution passée par cette étape */
  commit: DeployCommit | null;
  actions: { name: string; status: string | null }[];
}

export interface MainPipeline {
  name: string;
  consoleUrl: string;
  stages: DeployStage[];
  /** commit en production */
  prod: DeployCommit | null;
  /** commits fusionnés après celui en production, du plus récent au plus ancien */
  pending: DeployCommit[];
  /** où en est le dernier commit en attente */
  pendingState: { kind: Exclude<DeployState, "prod">; stage: string; since: string | null } | null;
  /** dernières exécutions, de la plus récente à la plus ancienne */
  executions: DeployCommit[];
}

export interface DynamicEnv {
  slug: string;
  pipeline: string;
  consoleUrl: string;
  /** adresse de l'environnement (deploy.envUrl) ; null si elle n'est pas configurée */
  url: string | null;
  last: DeployCommit | null;
}

export interface DeployData {
  main: MainPipeline | null;
  envs: DynamicEnv[];
  /** état de déploiement des PR fusionnées récemment, par numéro */
  prStates: Record<number, DeployState>;
  region: string;
  /** débuts de liens : PR GitHub (+ numéro), ticket Jira (+ clé) */
  links: { pr: string; jira: string };
}
