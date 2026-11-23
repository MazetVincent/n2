# 0006. Cache en mémoire par source, dernières bonnes données en cas d'échec

Statut : acceptée (novembre 2026)

## Contexte

Les sources sont lentes (CLI, API) et tombent parfois (session expirée, réseau). Une carte vide à chaque panne passagère est pire qu'une donnée de quelques minutes.

## Décision

`cached()` garde chaque source en mémoire avec une durée propre ; une erreur n'est gardée que 15 s. Si une lecture échoue après un succès, les dernières bonnes données sont resservies (24 h au plus) avec l'erreur et l'heure de l'échec, et la carte l'affiche. Chaque lecture est comptée (durée, échecs) pour la page « État des sources » ; le journal ne note que les échecs, les lectures lentes et les retours à la normale. Rien n'est écrit sur disque.

## Conséquences

Un redémarrage repart de zéro. Une source non configurée n'est pas un échec.
