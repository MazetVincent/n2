# 0007. Les erreurs d'une mise en prod viennent de la release Sentry, pas de l'heure

Statut : acceptée (novembre 2026)

## Contexte

Compter les erreurs apparues « depuis la mise en prod de 17 h » attribue à un déploiement tout ce qui naît ensuite (le week-end, un pic de trafic).

## Décision

N2 prend la release Sentry la plus récente de l'environnement de production et les erreurs nées avec elle (`firstRelease`), puis la relie à l'exécution CodePipeline réussie qui finit le plus près de son premier événement (à 1 h 30 près). Sans `sentry.environment` ou sans releases envoyées à Sentry, rien n'est affiché.

## Conséquences

Une mise en prod qui n'envoie pas de release reste sur la précédente ; les anciennes releases encore actives (onglets ouverts) ne sont pas montrées.
