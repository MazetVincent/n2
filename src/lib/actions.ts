// Ouvrir un lien (navigateur courant, ou onglet Chrome selon ui.links), ou un fichier du projet dans l'IDE.
// Ce que lance le serveur est vérifié par lui (liste blanche de sites, fichiers limités au dossier du projet).
import { createToaster } from "@ark-ui/react/toast";
import type { LinkTarget } from "~/features/prefs/logic";
import { usePreferences } from "~/lib/data";
import { m, msg } from "~/lib/i18n";
import { openFile, openUrl } from "~/server/fns";

export const toaster = createToaster({ placement: "bottom", overlap: false, gap: 8, max: 3 });
const toast = (title: string, type: "success" | "error" = "success") => toaster.create({ title, type, duration: 1800 });

export async function openInChrome(url: string) {
  try {
    const r = await openUrl({ data: { url } });
    if (!r.ok) throw new Error(msg(r.error));
    toast(m.lib_opened_chrome());
  } catch {
    // le serveur refuse ou ne répond pas : on ouvre dans le navigateur courant
    window.open(url, "_blank", "noopener");
  }
}

/** Où s'ouvrent les liens externes (préférence ui.links ; navigateur courant tant qu'elle n'est pas lue) */
export function useLinkTarget(): LinkTarget {
  const p = usePreferences().data;
  return p?.ok ? p.data.links : "browser";
}

/** Ouvre un lien hors d'un clic sur un <a> (palette ⌘K, notification) */
export function openLink(url: string, target: LinkTarget) {
  if (target === "chrome") return void openInChrome(url);
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function openInIde(file: string, line = 1) {
  try {
    const r = await openFile({ data: { file, line } });
    toast(r.ok ? m.lib_opened_in({ editor: r.editor }) : m.lib_could_not_open({ error: msg(r.error) }), r.ok ? "success" : "error");
  } catch {
    toast(m.lib_could_not_open_server_unreachable(), "error");
  }
}
