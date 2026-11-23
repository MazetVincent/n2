// Observabilité : Sentry et CloudWatch.


// ---------- Observabilité ----------
export interface SentryIssue {
  id: string;
  shortId: string;
  title: string;
  culprit: string;
  level: string;
  count: number;
  users: number;
  lastSeen: string;
  firstSeen: string;
  url: string;
  trend: number[];
  /** environnements où l'erreur a été vue (vue « Avant la prod » seulement) */
  environments?: string[];
}

/** Release Sentry actuellement en production, et les erreurs apparues avec elle */
export interface SentryRelease {
  version: string;
  /** premier événement de production de cette release (≈ sa mise en prod) */
  since: string | null;
  url: string;
  /** nombre d'erreurs apparues avec cette release (selon Sentry) */
  newCount: number;
  /** les plus fréquentes de ces erreurs (10 au plus) */
  newIssues: SentryIssue[];
}

export interface SentryData {
  top: SentryIssue[];
  fresh: SentryIssue[];
  /** environnement affiché (sentry.environment, ou choisi dans la page) ; null : tous */
  environment: string | null;
  /** environnements du projet Sentry (sélecteur de la page) */
  environments: string[];
  /** erreurs vues avant la prod (7 derniers jours) et jamais en production ; null si sentry.environment ou sentry.preprodEnvironments manque */
  preprod: SentryIssue[] | null;
  /** environnements d'avant la prod (sentry.preprodEnvironments) */
  preprodEnvironments: string[];
  /** release en production (avec sentry.environment, si le projet envoie ses releases à Sentry) ; null sinon */
  release: SentryRelease | null;
  projectUrl: string;
}

export interface CloudWatchAlarm {
  name: string;
  state: "ALARM" | "INSUFFICIENT_DATA" | "OK";
  reason: string;
  updatedAt: string;
  url: string;
  /** passages en ALARM sur les 7 derniers jours (null : historique illisible) */
  triggers7d: number | null;
  /** dernier passage en ALARM sur 7 jours */
  lastAlarmAt: string | null;
}

/** Série d'une courbe : [horodatage en ms, valeur], du plus ancien au plus récent */
export type ChartPoints = [number, number][];

/** Courbe d'une alarme sur 24 h, tirée de sa propre définition (métrique, filtres, calcul) */
export interface AlarmChart {
  name: string;
  data: ChartPoints;
  /** seuil fixe de l'alarme (null pour une bande d'anomalie) */
  threshold: number | null;
  /** bande d'anomalie (« plus haut que d'habitude ») : bornes basse et haute */
  band: { low: ChartPoints; high: ChartPoints } | null;
  /** l'alarme se déclenche au-dessus (sinon en dessous) */
  above: boolean;
}

export interface AlarmCharts {
  start: number;
  end: number;
  charts: AlarmChart[];
}

export interface CloudWatchData {
  alarms: CloudWatchAlarm[];
  counts: { ALARM: number; INSUFFICIENT_DATA: number; OK: number };
  /** Alarmes d'autoscaling retirées de la liste (0 si aws.hideAutoscaling = false) */
  hiddenAutoscaling: number;
  consoleUrl: string;
}

/** Fenêtre d'une requête Logs Insights (facturée au volume parcouru : pas plus de 24 h) */
export type LogWindow = "1h" | "24h";

/** Requête Logs Insights enregistrée par l'équipe */
export interface LogQuery {
  id: string;
  name: string;
  logGroups: string[];
  query: string;
}

export interface LogQueryResult {
  id: string;
  window: LogWindow;
  columns: string[];
  /** 100 lignes au plus */
  rows: string[][];
  matched: number;
  bytesScanned: number;
  ranAt: string;
}
