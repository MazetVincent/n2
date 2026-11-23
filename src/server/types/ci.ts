// CI GitHub (GitHub Actions) : branche principale et « ma branche ».

/** Dernière exécution d'un workflow sur une branche, et ses 14 derniers jours */
export interface CiWorkflow {
  name: string;
  status: "completed" | "running";
  /** success, failure, cancelled… (null tant qu'elle tourne) */
  conclusion: string | null;
  url: string;
  startedAt: string;
  durationMs: number | null;
  /** n° de tentative : au-delà de 1, l'exécution a été relancée */
  attempt: number;
  sha: string;
  failures14d: number;
  /** exécutions réussies après relance sur 14 jours : signe d'une CI instable */
  retriedOk14d: number;
}

export interface CiBranch {
  name: string;
  /** état d'ensemble : un workflow en échec suffit */
  state: "failure" | "running" | "success" | "none";
  workflows: CiWorkflow[];
}

export interface CiData {
  repo: string;
  main: CiBranch;
  /** « ma branche », si elle diffère de la branche principale */
  branch: CiBranch | null;
  actionsUrl: string;
}
