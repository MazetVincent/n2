// Slack : messages directs, mentions, salons suivis.


// ---------- Slack ----------
export interface SlackMessage {
  ts: string;
  channelId: string;
  /** « #salon », ou le nom de la personne pour un message direct */
  channel: string;
  author: string;
  /** texte lisible : mentions et liens Slack remplacés par des noms */
  text: string;
  /** lien vers le message (s'ouvre dans Slack) */
  url: string;
  /** nombre de réponses dans le fil */
  replies: number;
  mine: boolean;
  unread: boolean;
}

export interface SlackChannelFeed {
  id: string;
  name: string;
  url: string;
  /** messages non lus parmi ceux affichés (null si je ne suis pas membre du salon) */
  unread: number | null;
  messages: SlackMessage[];
}

export interface SlackDm {
  id: string;
  /** la personne, ou les participants d'un groupe */
  name: string;
  unread: number;
  last: SlackMessage;
}

export interface SlackData {
  team: string;
  url: string;
  mentions: SlackMessage[];
  dms: SlackDm[];
  channels: SlackChannelFeed[];
  /** salons de la config introuvables (mal orthographiés, archivés, privés sans en être membre) */
  missing: string[];
}
