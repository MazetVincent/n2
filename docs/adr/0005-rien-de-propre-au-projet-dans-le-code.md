# 0005. Rien de propre au projet suivi dans le code

Statut : acceptée (novembre 2026)

## Contexte

N2 a été écrit autour d'un projet précis (conventions de pipeline, guide d'équipe, adresses). Pour le partager, le code ne doit rien en révéler.

## Décision

Tout ce qui est propre au projet ou à l'entreprise vit dans `config.local.json` (ignoré par git) : préfixe et branche des pipelines, adresse des environnements, nom et sections du guide, environnements Sentry. Les noms du projet et de l'entreprise sont listés hors du dépôt (`~/.config/n2/forbidden-words`, secret CI `N2_FORBIDDEN_WORDS`) et `check-secrets.sh` les refuse au commit et en CI, sans tenir compte de la casse. Les exemples (tests, README) sont inventés.

## Conséquences

Une nouvelle option doit avoir un défaut neutre ou être facultative. Le dépôt public est parti d'un seul commit, sans l'historique d'avant le nettoyage.
