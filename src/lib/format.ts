import { getLang, locale, m } from "./i18n";

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31536000],
  ["month", 2592000],
  ["week", 604800],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

export function ago(iso: string): string {
  const rtf = new Intl.RelativeTimeFormat(getLang(), { numeric: "auto" });
  const s = (new Date(iso).getTime() - Date.now()) / 1000;
  for (const [u, n] of UNITS) if (Math.abs(s) >= n) return rtf.format(Math.round(s / n), u);
  return m.lib_just_now();
}

export const dateFr = (iso: string) => new Date(iso).toLocaleDateString(locale(), { day: "numeric", month: "short" });
export const dayFr = (iso: string) => new Date(iso).toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" });
export const timeFr = (d: Date | number) => new Date(d).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
export const nf = { format: (n: number) => new Intl.NumberFormat(locale()).format(n) };
export const plural = (n: number, word: string, plural = `${word}s`) => `${n} ${n > 1 ? plural : word}`;

/** « 2 h 41 » / « 12 min » jusqu'à une date ; null si dépassée */
export function remaining(iso: string | null): string | null {
  if (!iso) return null;
  const min = Math.floor((new Date(iso).getTime() - Date.now()) / 60_000);
  if (min <= 0) return null;
  return hoursMinutes(min);
}

/** « 12 min », « 2 h 41 » (« 2h 41m » en anglais) */
export function hoursMinutes(min: number): string {
  if (min < 60) return m.lib_duration_minutes({ minutes: min });
  return m.lib_duration_hours_minutes({ hours: Math.floor(min / 60), minutes: String(min % 60).padStart(2, "0") });
}
