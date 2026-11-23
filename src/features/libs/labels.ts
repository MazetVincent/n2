// Libellés partagés par l'onglet Librairies et la fiche d'une librairie.
import type { Tone } from "~/components/ds";
import { m } from "~/lib/i18n";
import type { UpdateKind } from "~/server/types";

const UPDATE_TONE: Record<UpdateKind, Tone> = { major: "bad", minor: "warn", patch: "info", none: "ok", unknown: "neutral" };
const updateLabel = (k: UpdateKind) =>
  ({ major: m.libs_major(), minor: m.libs_minor(), patch: m.libs_patch(), none: m.libs_up_date(), unknown: "?" })[k];
/** UPDATE[kind] → [libellé dans la langue courante, ton] */
export const UPDATE = new Proxy({} as Record<UpdateKind, [string, Tone]>, {
  get: (_, k: string) => (k in UPDATE_TONE ? [updateLabel(k as UpdateKind), UPDATE_TONE[k as UpdateKind]] : undefined),
});
export const SEVERITY: Record<string, Tone> = { critical: "bad", high: "bad", medium: "warn", moderate: "warn", low: "neutral" };
