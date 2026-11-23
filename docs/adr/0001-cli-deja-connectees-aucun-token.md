# 0001. Passer par les CLI déjà connectées, ne garder aucun token

Statut : acceptée (novembre 2026)

## Contexte

N2 lit GitHub, Jira, AWS, Sentry et Slack pour le compte d'un développeur. Stocker leurs tokens dans N2 multiplierait les secrets à protéger et à renouveler.

## Décision

N2 appelle les CLI que le développeur a déjà connectées (`gh`, `acli`, `aws`, `sentry-cli`) avec `execFile` et des arguments fixés par le code, jamais par la page. Le token Sentry et l'expiration AWS sont lus au moment de l'appel ; le token Slack vit dans le trousseau (ou `SLACK_USER_TOKEN`), les jetons Microsoft dans `~/.config/n2/` (600). Rien de tout cela ne part vers le navigateur ; les messages d'erreur passent par `redact()`.

## Conséquences

Une CLI déconnectée se voit carte par carte, avec la commande à relancer. N2 dépend des formats de sortie de ces CLI (testés avec de fausses CLI). Une session expirée se corrige hors de N2 (ou par le bouton `aws.reconnect`).
