// Résultat d'une source et textes renvoyés par le serveur (clés de messages/*.json).
import type { m } from "../../paraglide/messages.js";

export type SourceErrorKind = "auth" | "config" | "unavailable" | "unknown";

/** Clé d'un texte de messages/*.json (code généré par Paraglide) */
export type MessageKey = keyof typeof m;

/**
 * Texte destiné à l'utilisateur, renvoyé par le serveur : une clé de messages/*.json et ses paramètres.
 * Le serveur n'écrit aucune phrase : l'interface la traduit à l'affichage (msg() dans src/lib/i18n.ts).
 */
export interface Message {
  key: MessageKey;
  params?: Record<string, string>;
}

export interface SourceError {
  kind: SourceErrorKind;
  message: Message;
  hint?: Message;
}

export type SourceResult<T> =
  /** `stale` : la dernière lecture a échoué, ce sont les dernières bonnes données (lues à `fetchedAt`) */
  | { ok: true; data: T; fetchedAt: string; stale?: { error: SourceError; failedAt: string } }
  | { ok: false; error: SourceError; fetchedAt: string };

/** Ce que N2 sait d'une source depuis son démarrage (en mémoire, page « État des sources ») */
export interface SourceStat {
  /** clé du cache : « sentry:(config) », « branch:feat/abc-12 », « lib:react »… */
  key: string;
  calls: number;
  failures: number;
  lastAt: string;
  lastMs: number;
  lastOk: boolean;
  /** la dernière lecture dit que la source n'est pas configurée (ce n'est pas un échec) */
  off: boolean;
  lastSuccessAt: string | null;
  /** dernière erreur, déjà nettoyée par redact() */
  lastError: SourceError | null;
}

/** État de N2 lui-même : depuis quand il tourne, comment, et chacune de ses sources */
export interface SourceStatus {
  startedAt: string;
  mode: "dev" | "production";
  /** commit de N2 en cours d'exécution (git), si lisible */
  commit: string | null;
  sources: SourceStat[];
}
