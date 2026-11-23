#!/bin/sh
# Vérifie les protections du serveur N2 en cours d'exécution : développement (bun run dev)
# ou production (bun run start, lancé par le démarrage automatique).
#   sh scripts/check-server.sh            (port 4747 par défaut, ou N2_PORT)
# Chaque ligne doit afficher « ✓ ». Un « ✗ » signale une protection cassée.
#
# Le jeton de session est lu dans ~/.config/n2/session et passé à curl par l'entrée standard (-K -),
# jamais en argument : il n'apparaît pas dans la liste des processus.

PORT="${N2_PORT:-4747}"
B="http://127.0.0.1:$PORT"
# nom sous lequel N2 s'ouvre dans le navigateur (src/server/session.ts, publicHost) ; curl le joint sans rien configurer
NAME="${N2_HOST:-n2.localhost}"
STATE="${N2_STATE_DIR:-$HOME/.config/n2}"
fail=0

code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
# même chose avec le cookie de session de la personne qui a lancé N2
authed() { printf 'header = "Cookie: n2-session=%s"\n' "$TOKEN" | curl -K - -s -o /dev/null -w '%{http_code}' "$@"; }
expect() { # libellé, code attendu, code obtenu
  if [ "$2" = "$3" ]; then echo "✓ $1 ($3)"; else echo "✗ $1 : attendu $2, obtenu $3"; fail=1; fi
}

if [ ! -r "$STATE/session" ]; then
  echo "✗ Jeton de session introuvable ($STATE/session) : lance d'abord bun run dev"
  exit 1
fi
TOKEN=$(cat "$STATE/session")

if [ "$(authed "$B/dashboard")" != "200" ]; then
  echo "✗ N2 ne répond pas sur $B : lance d'abord bun run dev"
  exit 1
fi

# Développement : Vite sert ses propres fichiers (client, sources, WebSocket de rechargement à chaud).
if [ "$(authed "$B/@vite/client")" = "200" ]; then MODE=dev; else MODE=prod; fi
echo "→ Serveur de $( [ "$MODE" = dev ] && echo développement || echo production )"

# --- Le verrou : sans le cookie de session, rien n'est servi ---
expect "page sans cookie de session" 401 "$(code "$B/dashboard")"
expect "fichier source sans cookie de session" 401 "$(code "$B/src/server/fns.ts")"
expect "client Vite sans cookie de session" 401 "$(code "$B/@vite/client")"
expect "mauvais cookie de session" 401 "$(code -H 'Cookie: n2-session=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' "$B/dashboard")"
expect "jeton permanent passé dans l'URL" 401 "$(printf 'url = "%s/?login=%s"\n' "$B" "$TOKEN" | curl -K - -s -o /dev/null -w '%{http_code}')"
expect "code de connexion inventé" 401 "$(code "$B/?login=invente")"
# WebSocket du rechargement à chaud, sans cookie ni Origin (comme un programme local)
WSKEY=$(head -c 16 /dev/urandom | base64) # clé de poignée de main WebSocket (aléatoire, sans valeur secrète)
WS="-H Connection:Upgrade -H Upgrade:websocket -H Sec-WebSocket-Version:13 -H Sec-WebSocket-Key:$WSKEY -H Sec-WebSocket-Protocol:vite-hmr"
# shellcheck disable=SC2086
expect "WebSocket Vite sans cookie de session" 401 "$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 $WS "$B/")"

# GNU (Linux) d'abord : sous Linux, `stat -f` décrit le système de fichiers ; BSD (macOS) refuse -c et passe à -f
case "$(stat -c '%a' "$STATE/session" 2>/dev/null || stat -f '%Lp' "$STATE/session")" in
  600) echo "✓ jeton lisible par toi seul (600)" ;;
  *) echo "✗ $STATE/session doit être en 600 (chmod 600 $STATE/session)"; fail=1 ;;
esac
# la config peut contenir un secret (lien ICS de l'agenda) : lisible par toi seul aussi
CONFIG="$(dirname "$0")/../config.local.json"
if [ -f "$CONFIG" ]; then
  case "$(stat -c '%a' "$CONFIG" 2>/dev/null || stat -f '%Lp' "$CONFIG")" in
    600) echo "✓ config.local.json lisible par toi seul (600)" ;;
    *) echo "✗ config.local.json doit être en 600 (chmod 600 config.local.json)"; fail=1 ;;
  esac
fi

# Identifiant d'une fonction serveur : en développement, lu dans le module envoyé au navigateur ;
# en production, dans le manifeste du build (getQuickLinks : rapide, sans appel extérieur).
if [ "$MODE" = dev ]; then
  FN=$(printf 'header = "Cookie: n2-session=%s"\n' "$TOKEN" | curl -K - -s "$B/src/server/fns.ts" | grep -oE 'createClientRpc\("[^"]+"' | head -1 | cut -d'"' -f2)
else
  FN=$(grep -B1 'functionName: "getQuickLinks_createServerFn_handler"' "$(dirname "$0")/../dist/server/server.js" 2>/dev/null | grep -oE '[a-f0-9]{64}' | head -1)
fi
if [ -z "$FN" ]; then
  echo "✗ Identifiant de fonction serveur introuvable (mode $MODE) : impossible de vérifier les fonctions serveur"
  exit 1
fi
U="$B/_serverFn/$FN"

expect "fonction serveur sans cookie, même « venant de N2 »" 401 "$(code -H 'Sec-Fetch-Site: same-origin' "$U")"

# --- Avec le cookie : les autres protections restent en place ---
expect "page avec un nom d'hôte falsifié (DNS rebinding)" 403 "$(authed -H 'Host: evil.example:'"$PORT" "$B/dashboard")"
expect "page sous un autre nom en .localhost" 403 "$(authed -H 'Host: evil.localhost:'"$PORT" "$B/dashboard")"
expect "page sur http://$NAME:$PORT avec le cookie" 200 "$(authed -H "Host: $NAME:$PORT" "$B/dashboard")"
if [ "$NAME" != "127.0.0.1" ]; then
  # un ancien favori (127.0.0.1) : renvoyé vers le nom de N2, ancien cookie effacé
  expect "page ouverte sur 127.0.0.1 renvoyée vers $NAME" 307 "$(authed -H 'Sec-Fetch-Dest: document' "$B/dashboard")"
fi
expect "fonction serveur sans en-tête d'origine" 403 "$(authed "$U")"
expect "fonction serveur appelée par un autre site" 403 "$(authed -H 'Sec-Fetch-Site: cross-site' "$U")"
expect "fonction serveur avec l'Origin d'un autre site" 403 "$(authed -H 'Origin: https://evil.example' "$U")"
if [ "$MODE" = dev ]; then
  # shellcheck disable=SC2086
  expect "WebSocket Vite avec le cookie de session" 101 "$(authed --max-time 2 $WS "$B/")"
fi
expect "fonction serveur appelée par N2 lui-même" 200 "$(authed -H 'Sec-Fetch-Site: same-origin' "$U")"
# développement : Vite refuse (403) ; production : seul dist/client est servi, le reste n'existe pas (404)
NOT_SERVED=$( [ "$MODE" = dev ] && echo 403 || echo 404 )
expect "config.local.json non servi" "$NOT_SERVED" "$(authed "$B/config.local.json")"
expect "config.local.json non servi (?raw)" "$NOT_SERVED" "$(authed "$B/config.local.json?raw")"
expect "fichier hors du projet non servi (/@fs)" "$NOT_SERVED" "$(authed "$B/@fs$HOME/.aws/credentials")"
expect "jeton de session non servi (/@fs)" "$NOT_SERVED" "$(authed "$B/@fs$STATE/session")"
# production : le code source n'est jamais servi, même avec le cookie (en développement, Vite le sert à la page)
[ "$MODE" = prod ] && expect "fichiers sources non servis" 404 "$(authed "$B/src/server/fns.ts")"

LISTEN=$(lsof -iTCP:"$PORT" -sTCP:LISTEN -n -P 2>/dev/null | awk 'NR>1{print $9}' | sort -u | tr '\n' ' ')
case "$LISTEN" in
  *"*:"* | *"0.0.0.0"* | *"[::]"*) echo "✗ N2 écoute sur le réseau : $LISTEN"; fail=1 ;;
  *) echo "✓ N2 n'écoute que sur la machine ($LISTEN)" ;;
esac

[ $fail -eq 0 ] && echo "→ Toutes les protections sont en place." || echo "→ Au moins une protection est cassée."
exit $fail
