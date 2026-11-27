import { createFileRoute } from "@tanstack/react-router";

/*
 * Le fichier HTML du guide de l'équipe, servi tel quel pour l'onglet Guide.
 *
 * Ce fichier vient d'un collègue et contient du JS : il est isolé par sa politique de sécurité (CSP).
 *  - `sandbox` sans allow-same-origin : la page a une origine opaque. Elle ne peut ni lire les cookies de N2,
 *    ni appeler ses fonctions serveur (refusées par le contrôle CSRF), ni lire la page qui l'affiche ;
 *  - `connect-src 'none'` : aucun appel réseau depuis le guide ;
 *  - scripts et styles intégrés au fichier seulement, polices Google Fonts (comme le fichier d'origine).
 *  - `frame-ancestors` : seul N2 peut l'afficher dans un cadre.
 * Le guide garde ses préférences (langue, pages lues) dans le stockage du navigateur, refusé dans ce bac à sable :
 * N2 lui en donne un en mémoire, rempli avec ses propres réglages, et lui ajoute ses couleurs (src/features/guide/embed.ts).
 */
/**
 * Politique de sécurité du guide. `frame-ancestors` nomme N2 lui-même, sous chacun de ses noms (n2.localhost, 127.0.0.1,
 * localhost : `hosts`) : dans le bac à sable, 'self' ne désigne plus rien, et un nom oublié empêche le guide de s'afficher.
 */
export const guideCsp = (port: string, hosts: string[]) => [
  "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox",
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com data:",
  "img-src data: blob:",
  "media-src data: blob:",
  "connect-src 'none'",
  `frame-ancestors ${hosts.map((h) => `http://${h}:${port}`).join(" ")}`,
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

export const Route = createFileRoute("/guide-html")({
  server: {
    handlers: {
      GET: async () => {
        // imports à l'intérieur du gestionnaire : ce code (et node:fs) reste côté serveur
        const { loadConfig } = await import("~/server/config");
        const { guideHtml } = await import("~/server/sources/guide");
        const { embedGuide, guideSettings } = await import("~/features/guide/embed");
        const { readPreferences } = await import("~/features/prefs/logic");
        const { getLang } = await import("~/lib/i18n");
        const { getTheme } = await import("~/features/theme/theme");
        const { allowedHosts } = await import("~/server/session");
        try {
          const cfg = loadConfig();
          const html = await guideHtml(cfg);
          // réglages de N2 : langue et thème (cookies) ; éditeur, dossier du projet et lecture du guide (préférences)
          const page = embedGuide(html, guideSettings(readPreferences(cfg), getLang(), getTheme()));
          return new Response(page, {
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Content-Security-Policy": guideCsp(process.env.N2_PORT ?? "4747", allowedHosts()),
              "X-Content-Type-Options": "nosniff",
              "Referrer-Policy": "no-referrer",
              // la page dépend de la langue, du thème et des préférences du moment
              "Cache-Control": "no-store",
            },
          });
        } catch (e) {
          // message traduit (langue du cookie), jamais une clé brute
          const { m, msg } = await import("~/lib/i18n");
          const { MessageError } = await import("~/server/run");
          const text = e instanceof MessageError ? msg(e.msg) : m.guide_unavailable();
          return new Response(text, { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Security-Policy": "default-src 'none'" } });
        }
      },
    },
  },
});
