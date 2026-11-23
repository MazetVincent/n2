#!/bin/sh
# Démarrage automatique de N2 avec la session (aucun droit administrateur) :
#  - macOS : LaunchAgent utilisateur (launchd) ;
#  - Linux : service utilisateur systemd (~/.config/systemd/user/n2-dashboard.service) ;
#  - WSL : pas de service, explication affichée (la distribution s'arrête quand plus rien ne tourne).
# Le service lance scripts/service.sh : build puis serveur de production (bun run start), sans rechargement à chaud.
# Après une modification du code de N2, redémarrer le service (voir README, « Démarrage automatique »).
#   sh scripts/autostart.sh install    → N2 démarre à l'ouverture de session et redémarre s'il plante
#   sh scripts/autostart.sh uninstall  → retire le démarrage automatique
#   sh scripts/autostart.sh status     → état et dernières lignes du journal
set -eu

DIR="$(cd "$(dirname "$0")/.." && pwd)"
ACTION="${1:-status}"
case "$ACTION" in
  install | uninstall | status) ;;
  *)
    echo "Usage : sh scripts/autostart.sh install | uninstall | status"
    exit 1
    ;;
esac

OS="$(uname -s)"
is_wsl() { [ -n "${WSL_DISTRO_NAME:-}" ] || grep -qi microsoft /proc/sys/kernel/osrelease 2>/dev/null; }

# ---------- WSL : explication seulement (sauf N2_FORCE_SYSTEMD=1) ----------
if [ "$OS" = "Linux" ] && is_wsl && [ "${N2_FORCE_SYSTEMD:-}" != "1" ]; then
  cat <<'TXT'
Pas de démarrage automatique sous WSL : la distribution Linux s'arrête quand plus aucun terminal ne l'utilise,
un service n'y démarrerait donc pas avec la session Windows.
  → lance N2 dans un terminal WSL : bun run dev (puis bun run open la première fois) ;
  → si systemd est activé dans WSL ([boot] systemd=true dans /etc/wsl.conf) et que la distribution reste allumée,
    le service Linux peut quand même être installé : N2_FORCE_SYSTEMD=1 sh scripts/autostart.sh install
TXT
  [ "$ACTION" = "status" ] && exit 0
  exit 1
fi

# ---------- Linux : service utilisateur systemd ----------
if [ "$OS" = "Linux" ]; then
  UNIT="n2-dashboard.service"
  UNIT_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/$UNIT"
  ENV_FILE="$HOME/.config/n2/env"
  if ! command -v systemctl >/dev/null 2>&1; then
    echo "✗ systemd introuvable : lance N2 avec bun run dev (ou depuis le démarrage automatique de ton bureau)."
    exit 1
  fi
  case "$ACTION" in
    install)
      # npm, sinon bun : sert à trouver le dossier à mettre dans le PATH du service
      NPM="$(command -v npm || command -v bun || true)"
      if [ -z "$NPM" ]; then
        echo "✗ Ni npm ni bun dans le PATH : installe Bun (https://bun.sh) puis relance."
        exit 1
      fi
      # sous WSL (N2_FORCE_SYSTEMD=1), le service n'hérite pas du nom de la distribution : VS Code en a besoin
      EXTRA_ENV=""
      if [ -n "${WSL_DISTRO_NAME:-}" ]; then EXTRA_ENV="Environment=\"WSL_DISTRO_NAME=$WSL_DISTRO_NAME\""; fi
      # systemd démarre avec un PATH minimal : on y met node/npm, les CLI (gh, aws, acli, git, gitleaks) et les dossiers habituels
      PATH_FOR_N2="$(dirname "$NPM")"
      add_dir() { case ":$PATH_FOR_N2:" in *":$1:"*) ;; *) PATH_FOR_N2="$PATH_FOR_N2:$1" ;; esac; }
      for tool in bun gh aws acli git gitleaks; do
        T="$(command -v "$tool" 2>/dev/null || true)"
        if [ -n "$T" ]; then add_dir "$(dirname "$T")"; fi
      done
      for d in "$HOME/.local/bin" /usr/local/bin /usr/bin /bin; do add_dir "$d"; done
      mkdir -p "$(dirname "$UNIT_FILE")"
      cat > "$UNIT_FILE" <<UNITEOF
[Unit]
Description=N2 (tableau de bord local)

[Service]
WorkingDirectory=$DIR
ExecStart=/bin/sh "$DIR/scripts/service.sh"
Environment="PATH=$PATH_FOR_N2"
Environment="N2_PORT=${N2_PORT:-4747}"
$EXTRA_ENV
# secrets facultatifs (SLACK_USER_TOKEN=…) : fichier lisible par toi seul (chmod 600), jamais dans le projet
EnvironmentFile=-$ENV_FILE
# redémarre seulement en cas d'arrêt anormal, au plus toutes les 30 s
Restart=on-failure
RestartSec=30

[Install]
WantedBy=default.target
UNITEOF
      systemctl --user daemon-reload
      systemctl --user enable --now "$UNIT"
      echo "✓ N2 démarrera avec ta session (http://127.0.0.1:${N2_PORT:-4747})."
      echo "  Première ouverture dans un navigateur : bun run open (déverrouille N2 pour ce navigateur)."
      echo "  Journal : journalctl --user -u $UNIT -f"
      echo "  Pour qu'il démarre avec la machine, sans ouvrir de session : loginctl enable-linger"
      ;;
    uninstall)
      systemctl --user disable --now "$UNIT" 2>/dev/null || true
      rm -f "$UNIT_FILE"
      systemctl --user daemon-reload
      echo "✓ Démarrage automatique retiré (N2 est arrêté)."
      ;;
    status)
      if systemctl --user is-enabled --quiet "$UNIT" 2>/dev/null; then
        echo "✓ Démarrage automatique actif"
        echo "  état : $(systemctl --user is-active "$UNIT" 2>/dev/null || true)"
      else
        echo "Démarrage automatique inactif (sh scripts/autostart.sh install)"
      fi
      echo "--- dernières lignes du journal"
      journalctl --user -u "$UNIT" -n 5 --no-pager 2>/dev/null || true
      ;;
  esac
  exit 0
fi

if [ "$OS" != "Darwin" ]; then
  echo "✗ Système non pris en charge ($OS) : macOS, Linux, ou Windows avec WSL2."
  exit 1
fi

# ---------- macOS : LaunchAgent utilisateur ----------
LABEL="local.n2.dashboard"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/n2.log"
# sortie de launchd lui-même (avant service.sh) : rare, mais c'est là qu'on voit pourquoi N2 ne démarre pas
LAUNCHD_LOG="$HOME/Library/Logs/n2-launchd.log"
DOMAIN="gui/$(id -u)"

case "$ACTION" in
  install)
    NPM="$(command -v npm)"
    # launchd démarre avec un PATH minimal : on y met node/npm, Homebrew (gh, aws, git, gitleaks…) et acli
    PATH_FOR_N2="$(dirname "$NPM"):$(dirname "$(command -v gh 2>/dev/null || echo /opt/homebrew/bin/gh)"):$(dirname "$(command -v acli 2>/dev/null || echo /usr/local/bin/acli)"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
    mkdir -p "$(dirname "$PLIST")" "$(dirname "$LOG")"
    cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <!-- build puis serveur de production ; le script tient aussi le journal (rotation au-delà de 5 Mo).
       Lancé par npm et non par /bin/sh : si le projet est dans un dossier protégé par macOS (Bureau, Documents),
       /bin/sh n'a pas le droit d'y lire le script (code de sortie 126), npm si. -->
  <array><string>$NPM</string><string>run</string><string>service</string><string>--</string><string>$LOG</string></array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>$PATH_FOR_N2</string></dict>
  <key>RunAtLoad</key><true/>
  <!-- redémarre seulement en cas d'arrêt anormal, au plus toutes les 30 s -->
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>30</integer>
  <!-- ce qui échoue avant que service.sh ouvre le journal (npm introuvable, droits…) -->
  <key>StandardOutPath</key><string>$LAUNCHD_LOG</string>
  <key>StandardErrorPath</key><string>$LAUNCHD_LOG</string>
</dict>
</plist>
EOF
    launchctl bootout "$DOMAIN" "$PLIST" 2>/dev/null || true
    launchctl bootstrap "$DOMAIN" "$PLIST"
    echo "✓ N2 démarrera avec ta session (http://127.0.0.1:${N2_PORT:-4747})."
    echo "  Première ouverture dans un navigateur : bun run open (déverrouille N2 pour ce navigateur)."
    echo "  Journal : $LOG"
    ;;
  uninstall)
    launchctl bootout "$DOMAIN" "$PLIST" 2>/dev/null || true
    rm -f "$PLIST"
    echo "✓ Démarrage automatique retiré (N2 est arrêté)."
    ;;
  status)
    if launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
      echo "✓ Démarrage automatique actif"
      launchctl print "$DOMAIN/$LABEL" | grep -E "state =|pid =" | sed 's/^/  /'
    else
      echo "Démarrage automatique inactif (sh scripts/autostart.sh install)"
    fi
    [ -f "$LOG" ] && echo "--- dernières lignes du journal" && tail -5 "$LOG"
    if [ -s "$LAUNCHD_LOG" ]; then echo "--- démarrage (launchd) : $LAUNCHD_LOG" && tail -5 "$LAUNCHD_LOG"; fi
    ;;
esac
