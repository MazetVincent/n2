// Interrupteur « Ma branche » de la barre du haut : quand il est allumé, les onglets (Pull requests, Sprint, Carte,
// Déploiements, Guide) ne montrent que ce qui concerne la branche choisie (?branche=, la branche actuelle par défaut).
// Retenu dans le navigateur (localStorage) et partagé entre les onglets ouverts ; éteint côté serveur (premier rendu).
import { useSyncExternalStore } from "react";

const KEY = "n2.branchFilter";
const listeners = new Set<() => void>();
// sans localStorage (navigation privée bloquée…), l'interrupteur marche quand même pour cette page
let memory = false;

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return memory;
  }
}

export function setBranchFilter(on: boolean) {
  memory = on;
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* retenu pour cette page seulement */
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // un autre onglet du navigateur a changé l'interrupteur
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** L'interrupteur « Ma branche » est-il allumé ? */
export const useBranchFilter = () => useSyncExternalStore(subscribe, read, () => false);
