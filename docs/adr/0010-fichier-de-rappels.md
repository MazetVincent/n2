# 0010. N2 écrit dans un fichier de rappels, le tien

Statut : acceptée (novembre 2026). Précise [0003](0003-lecture-seule.md).

## Contexte

Le Dashboard a une carte « Remind me » : des points à revoir plus tard, notés au fil de la journée. Ils doivent rester à toi, lisibles et modifiables hors de N2 (éditeur, Obsidian), et survivre à une réinstallation de N2. Les garder dans le navigateur (`localStorage`, comme les éléments reportés de « À faire ») les perdrait d'un navigateur à l'autre et les cacherait.

## Décision

Les rappels vivent dans un fichier Markdown (`remind.path`, `~/.config/n2/remind.md` par défaut), que N2 lit et écrit. C'est sa seule écriture hors de sa config, et elle ne touche aucun outil de l'équipe. Garde-fous :

- un chemin absolu vers un fichier `.md`, dans un dossier qui existe (seul le dossier du chemin par défaut est créé), 256 Ko au plus ; un chemin modifié dans les Préférences est vérifié avant d'être enregistré ;
- N2 ne réécrit que la ligne touchée (cocher, supprimer, ajouter à la fin) et garde le reste tel quel : titres, paragraphes, sous-listes, fins de ligne ;
- une modification est refusée si le rappel visé n'est plus à sa ligne, une réécriture complète si le fichier a changé depuis sa lecture (empreinte du contenu) : une modification faite ailleurs n'est jamais écrasée ;
- réécriture d'un coup (fichier voisin puis renommage), droits gardés (600 pour un nouveau fichier) ;
- en mode démo, le fichier est en mémoire : rien n'est écrit sur le disque.

## Conséquences

La règle de [0003](0003-lecture-seule.md) tient pour les outils (GitHub, Jira, AWS…). Une page compromise pourrait réécrire ce fichier, pas un autre : il ne doit rien contenir de secret.
