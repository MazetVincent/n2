// GitHub · Jira : mentions, commentaires, réponses.
import type { m } from "../../paraglide/messages.js";
import type { Message } from "./common.ts";

// ---------- Activité GitHub et Jira (mentions, commentaires, réponses) ----------
/**
 * mention : on m'a mentionné ; comment : commentaire sur ma PR ou mon ticket ;
 * reply : réponse dans un fil où j'avais écrit (PR ou ticket d'un autre)
 */
export type ActivityKind = "mention" | "comment" | "reply";

/** Un fil (PR, issue ou ticket) où d'autres ont écrit depuis mon dernier message : une réponse est attendue */
export interface ActivityItem {
  /** stable : « github:<url de la PR> », « jira:<clé> » */
  id: string;
  source: "github" | "jira";
  kind: ActivityKind;
  /** « #654 », « ABC-321 » */
  ref: string;
  title: string;
  /** dépôt (GitHub) ou statut du ticket (Jira) */
  where: string;
  /** lien vers le dernier commentaire */
  url: string;
  author: string;
  /** texte du dernier commentaire, en clair et raccourci */
  excerpt: string;
  at: string;
  /** messages des autres depuis mon dernier message */
  count: number;
}

export interface ActivityData {
  items: ActivityItem[];
  /** fenêtre lue, en jours (github.recentDays) */
  days: number;
  /** une des deux sources a échoué : l'autre est quand même affichée */
  failed: { source: "github" | "jira"; message: Message; hint?: Message }[];
}
