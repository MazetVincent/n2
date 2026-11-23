// Préférence « notifications activées » et clés déjà notifiées, gardées dans le navigateur.
import { useSyncExternalStore } from "react";
import type { SeenStore } from "./logic";

const ENABLED = "n2.notify";
const SEEN = "n2.notify.seen";
const listeners = new Set<() => void>();

const get = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const set = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* stockage indisponible : la préférence ne tient que jusqu'au rechargement */
  }
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => e.key === ENABLED && listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Notifications activées dans N2 (la permission du navigateur est vérifiée à part) */
export const useNotifyEnabled = () => useSyncExternalStore(subscribe, () => get(ENABLED) === "on", () => false);

export function setNotifyEnabled(on: boolean) {
  set(ENABLED, on ? "on" : "off");
  // à l'activation, on repart de zéro : ce qui existe déjà sera noté comme vu, sans rafale de notifications
  if (on) writeSeen({ seen: {}, sources: [] });
  for (const l of listeners) l();
}

export function readSeen(): SeenStore {
  try {
    const v = JSON.parse(get(SEEN) ?? "") as SeenStore;
    if (v && typeof v.seen === "object" && Array.isArray(v.sources)) return v;
  } catch {
    /* absent ou abîmé */
  }
  return { seen: {}, sources: [] };
}

export const writeSeen = (s: SeenStore) => set(SEEN, JSON.stringify(s));
