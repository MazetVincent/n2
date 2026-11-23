// « À faire » : éléments reportés (jusqu'à une heure donnée) ou ignorés (jusqu'à ce qu'ils changent).
// Gardé dans le navigateur (localStorage) : c'est une préférence personnelle, rien n'est envoyé au serveur.
import { useSyncExternalStore } from "react";
import type { TodoItem } from "./logic";

export interface SnoozeEntry {
  /** fin du report (ms) ; null = ignoré */
  until: number | null;
  /** version de l'élément au moment du report : s'il change, il réapparaît */
  version: string;
  /** date du report (ms), pour oublier les vieux éléments ignorés */
  at: number;
}
export type Snoozes = Record<string, SnoozeEntry>;

/** Un élément ignoré est oublié au bout de 30 jours */
export const IGNORE_MS = 30 * 86_400_000;

const versionOf = (item: TodoItem) => item.version ?? "";

export function isHidden(item: TodoItem, entry: SnoozeEntry | undefined, now: number): boolean {
  if (!entry || entry.version !== versionOf(item)) return false;
  return entry.until === null ? now - entry.at < IGNORE_MS : entry.until > now;
}

/** Sépare les éléments affichés de ceux reportés ou ignorés */
export function partition(items: TodoItem[], snoozes: Snoozes, now: number) {
  const visible: TodoItem[] = [];
  const hidden: { item: TodoItem; entry: SnoozeEntry }[] = [];
  for (const item of items) {
    const entry = snoozes[item.id];
    if (isHidden(item, entry, now)) hidden.push({ item, entry: entry! });
    else visible.push(item);
  }
  return { visible, hidden };
}

/** Reports terminés et éléments ignorés depuis plus de 30 jours : retirés du stockage */
export function prune(snoozes: Snoozes, now: number): Snoozes {
  return Object.fromEntries(Object.entries(snoozes).filter(([, e]) => (e.until === null ? now - e.at < IGNORE_MS : e.until > now)));
}

/** Prochain jour ouvré à 9 h : demain, ou lundi le vendredi et le week-end */
export function nextMorning(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}

// ---------- Stockage (partagé entre les composants et les onglets ouverts) ----------
const KEY = "n2.todo.snooze";
const EMPTY: Snoozes = {};
let cache: { raw: string | null; value: Snoozes } | null = null;
const listeners = new Set<() => void>();

function read(): Snoozes {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  if (cache && cache.raw === raw) return cache.value;
  let value = EMPTY;
  try {
    value = raw ? (JSON.parse(raw) as Snoozes) : EMPTY;
  } catch {
    /* valeur abîmée : on repart de zéro */
  }
  cache = { raw, value };
  return value;
}

function write(next: Snoozes) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prune(next, Date.now())));
  } catch {
    /* stockage indisponible (navigation privée…) : le report ne tient que jusqu'au rechargement */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => e.key === KEY && listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Reports et éléments ignorés (vide pendant le rendu serveur et l'hydratation) */
export const useSnoozes = () => useSyncExternalStore(subscribe, read, () => EMPTY);

export function snooze(item: TodoItem, until: number | null) {
  write({ ...read(), [item.id]: { until, version: versionOf(item), at: Date.now() } });
}

export function unsnooze(id: string) {
  const { [id]: _removed, ...rest } = read();
  write(rest);
}
