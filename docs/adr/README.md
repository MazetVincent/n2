# Décisions d'architecture (ADR)

Les grands choix de N2, en quelques lignes chacun : le contexte, la décision, ce qu'elle implique. Une décision qui change donne une nouvelle ADR, qui renvoie à l'ancienne.

| N° | Décision |
|---|---|
| 0001 | [Passer par les CLI déjà connectées, ne garder aucun token](0001-cli-deja-connectees-aucun-token.md) |
| 0002 | [Serveur local verrouillé, ouvert sous n2.localhost](0002-verrou-local-et-n2-localhost.md) |
| 0003 | [N2 lit, il n'agit pas à la place du développeur](0003-lecture-seule.md) |
| 0004 | [Le démarrage automatique lance N2 en mode production](0004-mode-production-sous-launchd.md) |
| 0005 | [Rien de propre au projet suivi dans le code](0005-rien-de-propre-au-projet-dans-le-code.md) |
| 0006 | [Cache en mémoire par source, dernières bonnes données en cas d'échec](0006-cache-memoire-et-dernieres-bonnes-donnees.md) |
| 0007 | [Les erreurs d'une mise en prod viennent de la release Sentry, pas de l'heure](0007-erreurs-d-une-mise-en-prod-par-release.md) |
| 0008 | [Les autres outils lisent N2 par des interfaces versionnées](0008-integrations-par-interfaces-versionnees.md) |
| 0009 | [Le guide de l'équipe s'affiche dans un bac à sable](0009-guide-dans-un-bac-a-sable.md) |
| 0010 | [N2 écrit dans un fichier de rappels, le tien](0010-fichier-de-rappels.md) |
