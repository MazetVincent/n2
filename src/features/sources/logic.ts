// État des sources : regroupement des lectures par source (fonction pure, testable).
import type { SourceError, SourceStat } from "~/server/types";

/** Source volontairement absente (section de config manquante, guide coupé) : ni un échec, ni une alerte */
export const isNotConfigured = (e: SourceError | null | undefined) =>
  e?.kind === "config" && (/_not_configured$/.test(e.message.key) || e.message.key === "srv_guide_disabled");

export interface SourceGroup {
  name: string;
  /** détail de la dernière clé lue (« (config) », « feat/abc-12 », « react »…) */
  detail: string | null;
  calls: number;
  failures: number;
  last: SourceStat;
  lastSuccessAt: string | null;
}

/** Regroupe les clés d'une même source (une par branche, par librairie…) : la plus récente et les totaux. Échecs d'abord. */
export function groupSources(stats: SourceStat[]): SourceGroup[] {
  const groups = new Map<string, SourceGroup>();
  for (const s of stats) {
    const i = s.key.indexOf(":");
    const name = i < 0 ? s.key : s.key.slice(0, i);
    const g = groups.get(name);
    const newer = !g || s.lastAt > g.last.lastAt;
    groups.set(name, {
      name,
      detail: newer ? (i < 0 ? null : s.key.slice(i + 1)) : g.detail,
      calls: (g?.calls ?? 0) + s.calls,
      failures: (g?.failures ?? 0) + s.failures,
      last: newer ? s : g.last,
      lastSuccessAt: [g?.lastSuccessAt, s.lastSuccessAt].filter((x): x is string => !!x).sort().at(-1) ?? null,
    });
  }
  // en échec d'abord, puis celles qui répondent, puis les sources non configurées
  const rank = (g: SourceGroup) => (g.last.lastOk ? 1 : g.last.off ? 2 : 0);
  return [...groups.values()].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}
