# 0011. Le thème est un réglage du navigateur, posé avant l'affichage

Statut : acceptée (novembre 2026).

## Contexte

N2 propose plusieurs thèmes (Préférences, rubrique « Apparence ») : un thème de jour, un thème de nuit, et quand les afficher (selon le réglage clair / sombre de macOS, toujours le jour, ou toujours la nuit). Avant, le sombre suivait seulement macOS (`@media (prefers-color-scheme: dark)`). Le thème doit être le bon dès la première image : un flash d'un autre thème à chaque chargement serait pire que pas de choix du tout.

## Décision

- Le choix est un **cookie** (`n2-theme`, un an), comme la langue, et non une ligne de `config.local.json` : c'est un réglage d'affichage, il s'applique sans « Enregistrer » et fonctionne aussi en mode démo (config en lecture seule).
- Le serveur pose le choix sur `<html>` (`data-mode`, `data-day`, `data-night`). Un script de quelques lignes dans `<head>`, lancé avant l'affichage, en tire le thème affiché (`data-theme`) et son schéma (`data-scheme`), puis suit macOS en mode Automatique.
- Les styles ne lisent plus macOS : la condition Panda `_dark` vise `[data-scheme=dark]`. Les couleurs restent des jetons clair / sombre ; chaque thème en redéfinira les valeurs.
- Le guide de l'équipe, dans son cadre isolé, ne voit que macOS : N2 lui donne le mode du thème quand il sert sa page, et le recharge quand le thème change.
- Le logo N2 (l'enseigne au néon) ne prend la couleur d'aucun thème.

## Conséquences

Le thème est propre à chaque navigateur, comme la langue. Un composant qui veut un style « sombre » passe par `_dark` (ou `[data-scheme=dark]` en CSS), jamais par `prefers-color-scheme`. La page de connexion (avant le déverrouillage) suit encore macOS : elle n'a pas de thème.
