// Ouvrir un lien dans un nouvel onglet Chrome, ou un fichier du projet dans l'IDE.
// Le serveur vérifie tout (liste blanche de sites, fichiers limités au dossier du projet).
import { createToaster } from "@ark-ui/react/toast";
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

export async function openInIde(file: string, line = 1) {
  try {
    const r = await openFile({ data: { file, line } });
    toast(r.ok ? m.lib_opened_in({ editor: r.editor }) : m.lib_could_not_open({ error: msg(r.error) }), r.ok ? "success" : "error");
  } catch {
    toast(m.lib_could_not_open_server_unreachable(), "error");
  }
}
