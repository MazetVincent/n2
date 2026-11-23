# 0002. Serveur local verrouillé, ouvert sous n2.localhost

Statut : acceptée (novembre 2026)

## Contexte

N2 montre des données pro. `127.0.0.1` est joignable par tous les comptes et tous les programmes de la machine, et par un site web via le « DNS rebinding » ; un cookie posé pour `127.0.0.1` part vers tous les serveurs locaux, quel que soit leur port.

## Décision

N2 n'écoute que sur `127.0.0.1` et refuse tout autre nom d'hôte que `n2.localhost`, `127.0.0.1` et `localhost`. Chaque requête porte un cookie de session (HttpOnly, SameSite=Strict), obtenu par un code à usage unique écrit par `bun run open` (le jeton permanent ne passe jamais dans une URL). Les fonctions serveur exigent une requête de N2 lui-même (CSRF). La page s'ouvre sous `n2.localhost`, dont le cookie ne part pas vers les autres serveurs locaux ; une page ouverte sur `127.0.0.1` y est renvoyée.

## Conséquences

`bun run check:server` vérifie ces protections sur le serveur lancé (développement et production). Un programme lancé par l'utilisateur peut toujours lire le jeton : aucun outil local ne protège de ce cas.
