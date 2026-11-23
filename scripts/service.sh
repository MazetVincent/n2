#!/bin/sh
# Lancé par le démarrage automatique (scripts/autostart.sh) : build puis serveur de production de N2.
#   sh scripts/service.sh [fichier de journal]
# Avec un fichier de journal (macOS) : s'il dépasse 5 Mo au démarrage, il devient <journal>.1
# (un seul ancien journal gardé), puis toute la sortie y est ajoutée. Sans (Linux) : journald s'en charge.
set -eu
cd "$(dirname "$0")/.."

LOG="${1:-}"
if [ -n "$LOG" ]; then
  mkdir -p "$(dirname "$LOG")"
  if [ -f "$LOG" ] && [ "$(wc -c <"$LOG")" -gt $((5 * 1024 * 1024)) ]; then mv -f "$LOG" "$LOG.1"; fi
  exec >>"$LOG" 2>&1
fi

echo "--- N2 démarre ($(date '+%Y-%m-%d %H:%M:%S')) : build puis serveur de production"
# npm, sinon bun (bun run start lance le même script)
RUNNER="$(command -v npm || command -v bun || true)"
if [ -z "$RUNNER" ]; then
  echo "✗ Ni npm ni bun dans le PATH : installe Bun (https://bun.sh) puis relance."
  exit 1
fi
exec "$RUNNER" run start
