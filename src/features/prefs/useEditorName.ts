import { usePreferences } from "~/lib/data";
import { editorName } from "./logic";

/** Nom de l'éditeur choisi dans les préférences, pour les boutons « Ouvrir dans … » */
export function useEditorName(): string {
  const p = usePreferences().data;
  return p?.ok ? editorName(p.data.editor, p.data.jetbrains) : editorName(undefined);
}
