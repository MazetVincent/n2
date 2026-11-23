import type { Message, MessageKey } from "./types.ts";

/** Texte pour l'utilisateur : une clé de messages/*.json et ses paramètres (convertis en texte pour passer au navigateur). */
export const msg = (key: MessageKey, params?: Record<string, string | number>): Message =>
  params ? { key, params: Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) } : { key };
