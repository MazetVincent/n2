# 0010. N2 écrit dans un fichier de rappels, le tien

Statut : acceptée (novembre 2026). Précise [0003](0003-lecture-seule.md).

## Contexte

Le Dashboard a une carte « Remind me » : des points à revoir plus tard, notés au fil de la journée. Ils doivent rester à toi, lisibles et modifiables hors de N2 (éditeur, Obsidian), et survivre à une réinstallation de N2. Les garder dans le navigateur (`localStorage`, comme les éléments reportés de « À faire ») les perdrait d'un navigateur à l'autre et les cacherait.

## Décision

Les rappels vivent dans un fichier Markdown (`remind.path`, `~/.config/n2/remind.md` par défaut), que N2 lit et écrit. C'est sa seule écriture hors de sa config, et elle ne touche aucun outil de l'équipe. Garde-fous :

- le chemin se règle **à la main** dans `config.local.json` ; les Préférences l'affichent sans pouvoir le changer. Sinon une page compromise pourrait d'abord viser un autre `.md` (un `CLAUDE.md`, un README) puis le réécrire ;
- un chemin absolu vers un fichier `.md`, dans un dossier qui existe (seul le dossier du chemin par défaut est créé), 256 Ko au plus ; un lien symbolique doit mener à un fichier `.md` existant ;
- N2 ne réécrit que les lignes touchées (cocher, supprimer un rappel et ses lignes en retrait, ajouter dans la première section) et garde le reste tel quel : en-tête YAML, titres, paragraphes, blocs de code, fins de ligne. Un rappel dont un bloc de code ne se ferme pas n'est pas modifié ;
- une modification faite ailleurs n'est jamais écrasée : cocher pose l'état voulu (pas une bascule), un rappel qui n'est plus à sa ligne est refusé, « vider les faits » et la réécriture complète sont refusés si le fichier a changé depuis sa lecture (empreinte du contenu) ;
- réécriture d'un coup (fichier voisin puis renommage), droits gardés (600 pour un nouveau fichier) ;
- en mode démo, le fichier est en mémoire : rien n'est écrit sur le disque.

## Conséquences

La règle de [0003](0003-lecture-seule.md) tient pour les outils (GitHub, Jira, AWS…). Une page compromise pourrait réécrire le fichier de rappels, et lui seul : il ne doit rien contenir de secret. Changer de fichier demande d'éditer `config.local.json` et de redémarrer N2.
