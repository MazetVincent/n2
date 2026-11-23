# 0004. Le démarrage automatique lance N2 en mode production

Statut : acceptée (novembre 2026)

## Contexte

Lancé en `vite dev`, N2 rechargeait à chaud toute modification du dossier (y compris les worktrees des sessions d'agents), réoptimisait ses dépendances au vol et remplissait son journal.

## Décision

Le service (launchd sous macOS, systemd sous Linux) lance `scripts/service.sh` : build puis `vite preview`. Le journal est renommé au-delà de 5 Mo au démarrage ; launchd passe par `npm run service`, car `/bin/sh` n'a pas le droit de lire un script sur le Bureau. `bun run dev` reste là pour développer N2.

## Conséquences

Une mise à jour du code de N2 ne compte qu'après un redémarrage du service, et un onglet déjà ouvert garde l'ancien code jusqu'à son rechargement.
