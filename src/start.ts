import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";

/*
 * Sécurité de l'API locale (appliquée à chaque requête, côté serveur) :
 *
 * 1. Nom d'hôte : seules les requêtes adressées à n2.localhost, 127.0.0.1 ou localhost sur le port de N2 passent.
 *    Bloque le « DNS rebinding » (un site qui ferait pointer son domaine vers 127.0.0.1). Une page ouverte sur
 *    127.0.0.1 ou localhost est renvoyée vers http://n2.localhost:<port>.
 * 2. Session : la requête doit porter le cookie secret de la personne qui a lancé N2 (src/server/session.ts).
 *    Bloque les autres comptes du Mac et les programmes locaux, qui joignent aussi 127.0.0.1.
 * 3. CSRF : un appel de fonction serveur (/_serverFn/…) doit venir d'une page de N2 elle-même
 *    (Sec-Fetch-Site same-origin, sinon Origin ou Referer identiques). Un autre site ouvert dans
 *    le navigateur ne peut donc ni lire les données pro, ni ouvrir Chrome / l'éditeur, ni réécrire les préférences.
 * 4. Préférences (savePreferences) : en plus, le serveur n'accepte que des chemins vérifiés (src/server/sources/prefs.ts),
 *    pour qu'une page compromise ne puisse pas faire lancer un programme ni servir un fichier quelconque.
 *
 * En développement, le serveur de Vite applique déjà 1 et 2 à tout ce qu'il sert (vite.config.ts) ;
 * ces middlewares couvrent aussi un build de production.
 */
const port = () => process.env.N2_PORT ?? "4747";

const hostGuard = createMiddleware().server(async ({ request, next }) => {
  const { canonicalRedirect, isAllowedHost } = await import("./server/session");
  const host = request.headers.get("host");
  if (!isAllowedHost(host, port())) return new Response("Forbidden", { status: 403 });
  const url = new URL(request.url);
  const moved = canonicalRedirect(host, `${url.pathname}${url.search}`, port(), request.headers.get("sec-fetch-dest"));
  if (moved) return new Response(null, { status: 307, headers: { Location: moved.location, "Set-Cookie": moved.setCookie, "Cache-Control": "no-store" } });
  return next();
});

const sessionGuard = createMiddleware().server(async ({ request, next }) => {
  const { lockedLang, lockedPage, sessionGate } = await import("./server/session");
  const url = new URL(request.url);
  const cookie = request.headers.get("cookie");
  const gate = sessionGate(`${url.pathname}${url.search}`, cookie, request.headers.get("sec-fetch-site"), request.headers.get("sec-fetch-dest"));
  if (gate.kind === "pass") return next();
  if (gate.kind === "login") return new Response(null, { status: 303, headers: { Location: gate.location, "Set-Cookie": gate.setCookie, "Cache-Control": "no-store" } });
  return new Response(lockedPage(lockedLang(cookie), gate.kind === "retry"), { status: 401, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
});

const csrf = createCsrfMiddleware({
  filter: ({ request }) => new URL(request.url).pathname.startsWith("/_serverFn"),
});

export const startInstance = createStart(() => ({ requestMiddleware: [hostGuard, sessionGuard, csrf] }));
