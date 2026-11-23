// Comparaison de versions (sans dépendance serveur : utilisée par le serveur ET par la page).
import type { UpdateKind } from "../server/types.ts";

const parse = (v: string | null) => v?.replace(/^[^\d]*/, "").split(/[.-]/).slice(0, 3).map(Number) ?? null;

/** Type de mise à jour pour passer de `installed` à `latest` */
export function updateKind(installed: string | null, latest: string | null): UpdateKind {
  const a = parse(installed);
  const b = parse(latest);
  if (!a || !b || a.some(Number.isNaN) || b.some(Number.isNaN)) return "unknown";
  if (b[0] !== a[0]) return b[0] > a[0] ? "major" : "none";
  if (b[1] !== a[1]) return b[1] > a[1] ? "minor" : "none";
  return b[2] > a[2] ? "patch" : "none";
}
