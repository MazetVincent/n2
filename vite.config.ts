import { paraglideVitePlugin } from "@inlang/paraglide-js";
import pandacss from "@pandacss/dev/postcss";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Connect, type Plugin } from "vite";
import { paraglideOptions } from "./paraglide.config.ts";
import { canonicalRedirect, hasValidSession, isAllowedHost, lockedLang, lockedPage, sessionGate, sessionToken } from "./src/server/session.ts";

/*
 * N2 tourne en local uniquement :
 *  - écoute sur 127.0.0.1 (jamais sur le réseau) ;
 *  - nom d'hôte vérifié (isAllowedHost) : n2.localhost, 127.0.0.1 ou localhost seulement (anti « DNS rebinding ») ;
 *    une page ouverte sur 127.0.0.1 est renvoyée vers http://n2.localhost:<port> (canonicalRedirect) ;
 *  - les fonctions serveur sont en plus protégées par les middlewares de src/start.ts (hôte + CSRF).
 */
const server = { host: "127.0.0.1", port: Number(process.env.N2_PORT ?? 4747), strictPort: true };

/*
 * En développement, Vite sert les fichiers du dossier : on lui interdit tout ce qui est sensible.
 * (valeurs par défaut de Vite + config pro locale, secrets, hooks git)
 */
const deny = [
  ".env",
  ".env.*",
  "*.{crt,pem,key,p12,pfx}",
  "**/.git/**",
  "**/config.local.json",
  "**/*.local.*",
  "**/.sentryclirc",
  "**/credentials",
  "**/credentials.*",
  "**/*.bundle",
];

/*
 * Dépendances pré-optimisées dès le démarrage. Sans cette liste, Vite découvre les composants Ark UI d'un onglet
 * à sa première ouverture, ré-optimise à chaud et crée une 2e copie de React dans la page ouverte
 * (« Invalid hook call » : l'application plante). À compléter si on importe un nouveau module.
 */
const optimizeDeps = {
  include: [
    "react",
    "react-dom",
    "react-dom/client",
    "react/jsx-runtime",
    "react/jsx-dev-runtime",
    "@tanstack/react-query",
    "@tanstack/react-router",
    "@ark-ui/react/checkbox",
    "@ark-ui/react/collapsible",
    "@ark-ui/react/collection",
    "@ark-ui/react/combobox",
    "@ark-ui/react/dialog",
    "@ark-ui/react/listbox",
    "@ark-ui/react/popover",
    "@ark-ui/react/portal",
    "@ark-ui/react/segment-group",
    "@ark-ui/react/toast",
    "zod",
  ],
};

/*
 * Verrou de N2 sur TOUT ce que sert Vite (pages, fonctions serveur, fichiers sources, client HMR) :
 * nom d'hôte attendu, puis cookie de session de la personne qui a lancé N2 (voir src/server/session.ts).
 * Posé avant les middlewares internes de Vite : rien n'est servi sans lui.
 */
function sessionGuard(): Plugin {
  const port = String(server.port);
  const guard: Connect.NextHandleFunction = (req, res, next) => {
    const send = (status: number, headers: Record<string, string>, body = "") => {
      res.writeHead(status, { "Cache-Control": "no-store", ...headers });
      res.end(body);
    };
    if (!isAllowedHost(req.headers.host, port)) return send(403, { "Content-Type": "text/plain" }, "Forbidden");
    const moved = canonicalRedirect(req.headers.host, req.url ?? "/", port, req.headers["sec-fetch-dest"] as string | undefined);
    if (moved) return send(307, { Location: moved.location, "Set-Cookie": moved.setCookie });
    const gate = sessionGate(req.url ?? "/", req.headers.cookie, req.headers["sec-fetch-site"] as string | undefined, req.headers["sec-fetch-dest"] as string | undefined);
    if (gate.kind === "pass") return next();
    if (gate.kind === "login") return send(303, { Location: gate.location, "Set-Cookie": gate.setCookie });
    send(401, { "Content-Type": "text/html; charset=utf-8" }, lockedPage(lockedLang(req.headers.cookie), gate.kind === "retry"));
  };
  return {
    name: "n2-session",
    configureServer(s) {
      sessionToken(); // crée ~/.config/n2/session au démarrage s'il n'existe pas
      s.middlewares.use(guard);
      // Le WebSocket du rechargement à chaud ne passe pas par les middlewares : même verrou, avant Vite.
      // (Vite ne demande son propre jeton que si l'en-tête Origin est présent ; un programme local peut l'omettre.)
      s.httpServer?.prependListener("upgrade", (req, socket) => {
        if (isAllowedHost(req.headers.host, port) && hasValidSession(req.headers.cookie)) return;
        socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
        socket.destroy();
      });
    },
    configurePreviewServer(s) {
      sessionToken();
      s.middlewares.use(guard);
    },
  };
}

/*
 * Fichiers que Vite ne surveille pas. Les worktrees des sessions Claude (.claude/worktrees/) sont des copies
 * complètes du projet rangées dans ce dossier : sans cette exclusion, chaque modification dans une worktree
 * (tsconfig, styles générés…) rechargerait le N2 qui tourne depuis la copie principale.
 */
const watch = { ignored: ["**/.claude/**"] };

export default defineConfig({
  server: { ...server, fs: { deny }, watch },
  preview: server,
  optimizeDeps,
  resolve: { tsconfigPaths: true },
  css: {
    postcss: {
      // Panda CSS : extrait les styles utilisés (css(), cva()…) et les écrit à la place de la ligne @layer de app.css
      plugins: [pandacss()],
    },
  },
  // Paraglide : compile messages/*.json en fonctions typées (src/paraglide/), recompile à chaque modification
  // (pas de verrou pendant les tests : Vitest réutilise cette config et ne doit rien écrire dans ~/.config/n2)
  plugins: [...(process.env.VITEST ? [] : [sessionGuard()]), paraglideVitePlugin({ ...paraglideOptions, strategy: [...paraglideOptions.strategy] }), tanstackStart(), react()],
});
