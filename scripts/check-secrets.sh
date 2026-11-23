#!/bin/sh
# Garde-fou N2 : refuse tout commit contenant un secret ou un fichier sensible.
#   sh scripts/check-secrets.sh           -> analyse tous les fichiers suivis par git
#   sh scripts/check-secrets.sh --staged  -> analyse seulement ce qui va être commité (hook pre-commit)
#
# Ce fichier contient lui-même les motifs recherchés : il est exclu de l'analyse de contenu.

set -u
SELF="scripts/check-secrets.sh"

# Noms de fichiers interdits (insensible à la casse)
FORBIDDEN_FILES='(^|/)(config\.local\.json|[^/]*\.local\.[^/]+|\.env(\..*)?|\.sentryclirc|credentials(\..*)?|id_(rsa|ed25519|ecdsa)[^/]*|[^/]*\.(pem|key|p12|pfx|bundle))$'

# Motifs de contenu interdits (regex étendues)
PATTERNS='gh[pousr]_[A-Za-z0-9]{20,}
github_pat_[A-Za-z0-9_]{20,}
sntry[su]_[A-Za-z0-9+/=_-]{20,}
ATATT[A-Za-z0-9_=-]{20,}
(AKIA|ASIA)[A-Z0-9]{16}
aws_(secret_access_key|session_token)
-----BEGIN [A-Z ]*PRIVATE KEY-----
[Bb]earer [A-Za-z0-9._~+/=-]{20,}
xox[abeoprs]-[A-Za-z0-9-]{10,}
eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}
/owa/calendar/[A-Za-z0-9]
(token|secret|password|api[_-]?key)["'"'"']?[[:space:]]*[:=][[:space:]]*["'"'"'][A-Za-z0-9._~+/=-]{16,}'

# Noms propres au projet pro et à l'entreprise, et l'email pro : jamais écrits dans ce dépôt, pas même ici.
# Une regex étendue par ligne, dans ~/.config/n2/forbidden-words (hook de commit, fichier en 600)
# ou dans la variable N2_FORBIDDEN_WORDS (CI : secret GitHub du même nom).
WORDS_FILE="${N2_FORBIDDEN_WORDS_FILE:-$HOME/.config/n2/forbidden-words}"
EXTRA="$({ if [ -r "$WORDS_FILE" ]; then cat "$WORDS_FILE"; fi; printf '%s\n' "${N2_FORBIDDEN_WORDS:-}"; } | grep -v '^[[:space:]]*#' | grep -v '^[[:space:]]*$' || true)"
if [ -z "$EXTRA" ]; then
  echo "ℹ Aucune liste de noms interdits ($WORDS_FILE ou N2_FORBIDDEN_WORDS) : seuls les secrets sont vérifiés."
fi

if [ "${1:-}" = "--staged" ]; then
  files=$(git diff --cached --name-only --diff-filter=ACMR)
  content() { git diff --cached -U0 --no-color -- . ":(exclude)$SELF" | grep -E '^\+' | grep -vE '^\+\+\+ '; }
else
  files=$(git ls-files)
  content() { git ls-files -z -- . ":(exclude)$SELF" | xargs -0 cat 2>/dev/null; }
fi

status=0

bad_files=$(printf '%s\n' "$files" | grep -iE "$FORBIDDEN_FILES" || true)
if [ -n "$bad_files" ]; then
  echo "✗ N2 : fichiers sensibles bloqués :"
  printf '   %s\n' $bad_files
  status=1
fi

hits=$(content | grep -nE "$(printf '%s' "$PATTERNS" | paste -sd'|' -)" || true)
# noms interdits : en ignorant la casse (« NOM », « Nom », « nOm » sont tous refusés)
if [ -n "$EXTRA" ]; then
  names=$(content | grep -inE "$(printf '%s' "$EXTRA" | paste -sd'|' -)" || true)
  if [ -n "$names" ]; then hits=$(printf '%s\n%s' "$hits" "$names" | sed '/^$/d'); fi
fi
if [ -n "$hits" ]; then
  echo "✗ N2 : contenu qui ressemble à un secret ou à une donnée pro :"
  # On n'affiche que le début de la ligne pour ne pas réimprimer le secret en entier
  printf '%s\n' "$hits" | cut -c1-60 | sed 's/^/   /'
  status=1
fi

if [ $status -ne 0 ]; then
  echo "→ Commit refusé. Mets ces valeurs dans config.local.json (ignoré par git)."
else
  echo "✓ N2 : aucun secret détecté."
fi
exit $status
