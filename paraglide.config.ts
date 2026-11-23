/*
 * Traductions (Paraglide JS) : réglages partagés par le plugin Vite (bun run dev / build / test)
 * et par scripts/i18n.ts (bun run i18n, avant typecheck).
 *
 * - Textes : messages/fr.json (langue de référence) et messages/en.json, une clé par texte.
 * - Code généré : src/paraglide/ (non versionné), une fonction typée par clé : m.prs_review_requested().
 * - Plugin de format : installé avec npm (node_modules) et référencé en chemin local dans project.inlang/settings.json,
 *   pour que la compilation ne télécharge rien.
 * - Langue : cookie n2-lang, lu par src/lib/i18n.ts (getLocale de Paraglide est branché dessus).
 */
export const paraglideOptions = {
  project: "./project.inlang",
  outdir: "./src/paraglide",
  strategy: ["cookie", "baseLocale"],
  cookieName: "n2-lang",
  emitTsDeclarations: true,
  emitReadme: false,
} as const;
