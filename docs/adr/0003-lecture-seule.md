# 0003. N2 lit, il n'agit pas à la place du développeur

Statut : acceptée (novembre 2026)

## Contexte

Un tableau de bord qui fusionne, valide une mise en prod ou écrit dans Jira devrait être protégé comme les outils eux-mêmes, et une erreur de N2 aurait des effets réels.

## Décision

N2 est en lecture seule sur les outils : il ouvre la bonne page (GitHub, console AWS, Jira…) pour agir. Ses seules écritures : sa propre config (`config.local.json`, champs limités et chemins vérifiés), le fichier Markdown des rappels de « Remind me » ([0010](0010-fichier-de-rappels.md)), `git fetch` sans identifiants, et le script de reconnexion AWS déclaré dans la config. Le navigateur n'envoie jamais de commande ; les sites ouverts dans Chrome et les fichiers ouverts dans l'éditeur passent par une liste d'autorisations côté serveur.

## Conséquences

Valider une mise en prod se fait dans la console AWS. Les intégrations (`/api/status`, MCP) sont en lecture seule aussi.
