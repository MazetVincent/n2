# 0009. Le guide de l'équipe s'affiche dans un bac à sable

Statut : acceptée (novembre 2026)

## Contexte

Le guide est un fichier HTML compilé, écrit par quelqu'un d'autre, qui contient du JavaScript.

## Décision

N2 le sert avec une CSP `sandbox` sans `allow-same-origin`, `connect-src 'none'` et un `frame-ancestors` qui nomme N2 sous chacun de ses noms : il ne peut ni lire les cookies, ni appeler N2, ni faire d'appel réseau. Côté serveur, N2 lit ses données (sections, fichiers cités) sans exécuter son JS. Les réglages de N2 lui sont passés dans un stockage en mémoire.

## Conséquences

Un nom d'hôte oublié dans `frame-ancestors` empêche le guide de s'afficher (arrivé au passage à `n2.localhost`) : le test de la politique le vérifie.
