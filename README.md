# N2

Tableau de bord **local** pour le travail au quotidien : PR GitHub, sprint Jira, Slack, agenda, erreurs Sentry, alarmes et déploiements AWS, carte du code et guide de l'équipe, au même endroit.

N2 tourne sur ta machine (`http://n2.localhost:4747`), s'appuie sur les outils en ligne de commande **déjà connectés** (`gh`, `acli`, `aws`, `sentry-cli`) et ne garde aucun token dans le projet.

Stack : **TanStack Start + React + TanStack Query + Panda CSS + Ark UI**, lancé avec **Bun**.

- [Les parties de N2](#les-parties-de-n2)
- [Démarrer](#démarrer)
- [La configuration (`config.local.json`)](#la-configuration-configlocaljson)
- [Brancher chaque partie](#brancher-chaque-partie)
- [Fonctions transverses](#fonctions-transverses)
- [Démarrage automatique](#démarrage-automatique-facultatif)
- [Commandes](#commandes)
- [Dépannage](#dépannage)
- [Sécurité](#sécurité--rien-de-sensible-dans-git-rien-dexposé)
- [Architecture](#architecture)
- [Carte du projet : comment c'est calculé](#carte-du-projet--comment-cest-calculé)

---

## Les parties de N2

Les onglets sont rangés en trois groupes. Les touches **1 à 9** suivent cet ordre.

### Le travail du jour

| Touche | Onglet | Contenu | Branché sur |
|---|---|---|---|
| 1 | **Dashboard** | **À faire** : ce qui demande une action (revues demandées, PR bloquées ou prêtes à fusionner, tickets en revue sans PR, alarmes, nouvelles erreurs, failles, pipeline en échec, session AWS qui expire). **Remind me** : les points à revoir plus tard, dans ton fichier Markdown (`remind.path`) ; ajouter, cocher, supprimer ou modifier tout le texte depuis N2. **Agenda** du jour ou de la semaine, avec « Rejoindre ». **Slack** : messages directs, mentions, salons suivis. **GitHub · Jira** : mentions et réponses. **Ma branche** : fichiers modifiés, parties touchées, passages du guide à relire. | tout ce qui est configuré |
| 2 | **Pull requests** | Revues demandées, mes PR, approuvées, commentées. Pour chaque PR : CI, revue, conflits, tickets Jira liés, et si elle est en prod ou attend la prod. | `gh`, `acli`, `aws` |
| 3 | **Sprint Jira** | Tickets du sprint actif en 3 colonnes, avec les PR qui les citent. | `acli`, `gh` |

### Le code

| Touche | Onglet | Contenu | Branché sur |
|---|---|---|---|
| 4 | **Carte** | Les parties du projet par couche (Front / API / Back / Partagé / Infra / Outillage), leurs liens, leurs librairies et des exemples réels. **Analyse d'impact** d'un fichier, **points chauds** et **ma branche** en calques. Recherche avec autocomplétion : librairies, parties, fichiers clés, **README du projet** et **guide** ; la fiche d'une librairie liste les passages de la doc qui la citent. | le dépôt local (`codemap`) |
| 5 | **Guide** | Le guide de l'équipe (fichier HTML) affiché dans N2, ouvert à la bonne section depuis les autres onglets. **Passages à revoir** : le code cité par le guide qui a changé depuis sa révision. | `guide.path` |
| 6 | **Librairies** | Versions installées, mises à jour, alertes de sécurité, notes de version, PR de mise à jour ouvertes (Renovate, Dependabot ou faites à la main) et parties de la carte qui utilisent chaque librairie. Deux vues : les librairies **critiques** (`libs.packages`) et **toutes les dépendances**, par `package.json`. | le dépôt local, registre npm, `gh` |

### La prod

| Touche | Onglet | Contenu | Branché sur |
|---|---|---|---|
| 7 | **Observabilité** | Erreurs Sentry (nouvelles, plus fréquentes, depuis la mise en prod, avant la prod ; par environnement) avec leur **trace rattachée au code** (→ éditeur, → carte, → guide). Alarmes CloudWatch : état, **courbe sur 24 h** avec le seuil ou la bande d'anomalie de l'alarme (en rouge si la courbe les a dépassés, même sans déclenchement), et **déclenchements sur 7 jours** ; autoscaling masqué si on veut. **Logs Insights** : les requêtes enregistrées par l'équipe dans CloudWatch, lancées au clic sur 1 h ou 24 h (facturées au volume parcouru, affiché ; jamais lancées toutes seules). | `sentry-cli`, `aws` |
| 8 | **Déploiements** | **CI GitHub** (Actions) de la branche principale et de « ma branche » : dernière exécution de chaque workflow, échecs et relances réussies sur 14 jours (signe d'un test instable) ; une CI rouge sur la branche principale remonte dans « À faire ». Le pipeline CodePipeline de la branche principale en frise (Source → Staging/Quality → validation manuelle → Production), ce qui attend la prod, ce qui est en prod, les dernières exécutions, et les environnements dynamiques des branches (celui de « ma branche » en tête). **Lecture seule** : la validation prod se fait dans la console AWS. | `aws` |
| — | **Statistiques** (onglet discret, voir Préférences) | Délai de première revue, temps de l'ouverture à la fusion, PR fusionnées et erreurs Sentry sur 8 semaines, pour toute l'équipe ou mes PR seulement. | `gh`, `sentry-cli` |

Chaque partie est indépendante : si un outil n'est pas connecté ou qu'une section de la config manque, seules les cartes concernées affichent une erreur (avec la marche à suivre), le reste de N2 fonctionne.

---

## Démarrer

### Essayer sans rien configurer : le mode démo

```bash
bun install && bun run demo
```

N2 démarre sur `http://n2.localhost:4848` avec des données inventées pour tout ce qui demande un compte (PR, sprint, Sentry, AWS, Slack, agenda), sans `config.local.json` ni CLI connectée ; un badge « Démo » le rappelle sous le logo. La carte du code, « Ma branche » et la recherche dans les README analysent N2 lui-même. Déverrouille-le une fois avec `N2_PORT=4848 bun run open`. Les préférences ne sont pas enregistrées.

### Prérequis

- **macOS**, **Linux**, ou **Windows avec WSL2** (voir [Linux et Windows (WSL2)](#linux-et-windows-wsl2) ; Windows sans WSL n'est pas pris en charge) ;
- **[Bun](https://bun.sh)** ;
- **Google Chrome** (les liens s'ouvrent dans un nouvel onglet Chrome ; sous Linux sans Chrome et sous WSL, dans le navigateur par défaut) ;
- **PhpStorm** (facultatif, pour ouvrir un fichier à la bonne ligne ; un autre IDE JetBrains, VS Code ou Cursor marchent aussi) ;
- une copie locale (clonée) du **projet à suivre** ;
- les CLI des outils que tu veux brancher, voir [Brancher chaque partie](#brancher-chaque-partie).

### Installation

```bash
bun install
```

```bash
bun run setup
```

`setup` active les hooks anti-secrets (`.githooks/`), crée `config.local.json` à partir de `config.example.json` s'il n'existe pas, et génère les styles Panda.

Remplis ensuite `config.local.json` (voir plus bas), puis :

```bash
bun run dev
```

N2 répond sur **http://n2.localhost:4747**, mais il est **verrouillé** : seul ton navigateur peut l'ouvrir. La première fois (puis une fois par an et par navigateur), déverrouille-le avec :

```bash
bun run open
```

Chrome s'ouvre sur N2, déverrouillé ; ensuite tes favoris et `http://n2.localhost:4747` marchent directement. Voir [Qui peut ouvrir N2 ?](#qui-peut-ouvrir-n2-).

**Pourquoi `n2.localhost` ?** Tout nom en `.localhost` mène à ta machine, sans rien installer ni configurer (Chrome le sait). Un ancien favori sur `http://127.0.0.1:4747` est renvoyé vers `http://n2.localhost:4747` ; déverrouille alors N2 une fois sous ce nom (`bun run open`). Les préférences gardées dans le navigateur (éléments reportés, filtre « Ma branche », notifications, langue) sont propres à chaque adresse : à refaire une fois. Pour garder l'ancienne adresse (navigateur qui ne connaîtrait pas `.localhost`) : `N2_HOST=127.0.0.1`, pour le serveur comme pour `bun run open`.

Pour changer de port : `N2_PORT=4800 bun run dev` (puis `N2_PORT=4800 bun run open`). Le champ `port` de la config est obsolète.

> `config.local.json` est lu **une seule fois** au démarrage : relance le serveur après chaque modification (seul le fichier du guide est relu à chaud).

### Linux et Windows (WSL2)

N2 tourne aussi sous **Linux** et sous **Windows avec WSL2** (N2 dans la distribution Linux, le navigateur dans Windows). Installation identique (`bun install`, `bun run setup`, `bun run dev`) ; les CLI (`git`, `gh`, `aws`, `acli`) s'installent dans Linux. Ce qui change selon le système :

| | macOS | Linux | WSL2 |
|---|---|---|---|
| Liens | nouvel onglet Chrome (`open -a`) | `google-chrome` s'il est installé, sinon le navigateur par défaut (`xdg-open`) | navigateur par défaut de Windows (`rundll32.exe url.dll,FileProtocolHandler`) |
| `bun run open` | Chrome, par AppleScript | même commande que les liens ; sans écran graphique (SSH), l'adresse est affichée | même commande que les liens |
| Lanceur JetBrains | `/Applications/<IDE>.app/Contents/MacOS/<ide>` | script de JetBrains Toolbox (`~/.local/share/JetBrains/Toolbox/scripts/phpstorm`, défaut) ou `/opt/<IDE>/bin/<ide>.sh` | idem Linux (IDE installé dans WSL, affiché par WSLg) ; plus simple : VS Code ou Cursor |
| VS Code, Cursor | `vscode://file/…` | idem, par `xdg-open` | `vscode://vscode-remote/wsl+<distribution>/…` : l'éditeur de Windows ouvre le fichier dans WSL (extension **WSL** requise) |
| Token Slack | trousseau, ou `SLACK_USER_TOKEN` | `SLACK_USER_TOKEN` seulement | `SLACK_USER_TOKEN` seulement |
| Démarrage automatique | launchd | service utilisateur systemd | non (explication affichée), voir [Démarrage automatique](#démarrage-automatique-facultatif) |

**WSL2** : garde le projet suivi et N2 dans le système de fichiers Linux (`~/…`, pas `/mnt/c/…` : beaucoup plus lent). Le navigateur de Windows joint `http://n2.localhost:4747` (un nom en `.localhost` mène à `127.0.0.1`) grâce au renvoi de `localhost` de WSL2 (actif par défaut ; vérifier qu'il n'est pas coupé par `localhostForwarding=false` dans `.wslconfig`). Le lien de déverrouillage de `bun run open` s'ouvre dans ce navigateur.

**Windows sans WSL** : non pris en charge (scripts `sh`, droits des fichiers `600`, chemins `/`).

---

## La configuration (`config.local.json`)

Tout ce qui est propre à ton compte et à ton projet est dans `config.local.json`, **ignoré par git**. Seul `config.example.json` (valeurs factices) est versionné.

| Section | Obligatoire | Sert à |
|---|---|---|
| `github` | oui | Pull requests, Sprint (PR liées), GitHub · Jira, Statistiques, Déploiements (liens vers les commits) |
| `jira` | oui | Sprint Jira, tickets liés aux PR, GitHub · Jira, liens ⌘K |
| `libs` | oui | Librairies ; aussi le dépôt suivi par défaut (Carte, Ma branche) |
| `sentry` | oui | Observabilité, Statistiques, « À faire » |
| `aws` | oui | Observabilité (CloudWatch), Déploiements, session AWS dans la barre du haut |
| `codemap` | non | Carte, analyse d'impact, traces Sentry → code, ouverture dans l'IDE |
| `deploy` | pour l'onglet Déploiements | préfixe des pipelines, branche principale, adresse des environnements de branche |
| `calendar` | non | Agenda du Dashboard |
| `slack` | non | carte Slack du Dashboard |
| `guide` | non | onglet Guide et liens « Dans le guide » |
| `remind` | non | fichier Markdown de « Remind me » (`remind.path`, `~/.config/n2/remind.md` par défaut) |
| `links` | non | liens rapides personnels dans ⌘K |
| `ui` | non | préférences réglées dans N2 (boulon en haut à droite) : onglets affichés (`ui.tabs`), éditeur où ouvrir le code (`ui.editor` : `jetbrains`, `vscode`, `cursor` ou `github`) |

Les sections « obligatoires » doivent exister dans le fichier ; si tu n'utilises pas l'outil correspondant, laisse les valeurs d'exemple : la carte concernée affichera simplement une erreur.

**Préférences** (icône boulon, à droite de la cloche) : langue, onglets affichés (le Dashboard l'est toujours), éditeur où ouvrir le code (JetBrains, VS Code, Cursor ou GitHub), chemin du projet, guide activé ou non et son chemin. Tout sauf la langue (cookie du navigateur) est écrit dans `config.local.json` ; N2 vérifie les chemins avant d'enregistrer et relit ses sources aussitôt, sans redémarrage. Statistiques est un onglet discret : toujours le dernier à droite, invisible, absent de ⌘K et des touches 1 à 9. Un onglet masqué reste trouvable dans ⌘K ; les touches 1 à 9 suivent les onglets affichés.

Exemple complet : [`config.example.json`](config.example.json). Le détail de chaque option est dans la section de la partie concernée ci-dessous. Les chemins acceptent `~/`.

---

## Brancher chaque partie

Récapitulatif :

| Partie | Outil | Connexion | Config |
|---|---|---|---|
| GitHub (PR, statistiques, librairies) | `gh` | `gh auth login` | `github` |
| Jira | `acli` | `acli jira auth login` | `jira` |
| Projet local (carte, librairies, ma branche) | `git` | dépôt cloné en local | `libs`, `codemap` |
| Sentry | `sentry-cli` | `sentry-cli login` | `sentry` |
| AWS (CloudWatch, Déploiements) | `aws` | profil SSO avec une session valide | `aws`, `deploy` |
| Agenda Teams / Outlook | — | lien ICS ou Microsoft Graph | `calendar` |
| Slack | app Slack interne | token utilisateur dans le trousseau (Linux, WSL : `SLACK_USER_TOKEN`) | `slack` |
| Guide de l'équipe | — | fichier HTML local | `guide` |
| Liens rapides | — | — | `links` |

### GitHub

**Connexion** : installe [`gh`](https://cli.github.com) (`brew install gh`), puis connecte-toi avec ton compte pro :

```bash
gh auth login
```

N2 appelle `gh` à chaque requête : aucun token ne passe par N2.

**Config** :

```json
"github": { "repos": ["mon-org/mon-depot"], "recentDays": 14 }
```

| Option | Rôle |
|---|---|
| `repos` | dépôts suivis (`propriétaire/nom`) pour les PR, les statistiques, l'activité et les liens ⌘K |
| `recentDays` | fenêtre, en jours, des PR récentes et des fils GitHub · Jira du Dashboard |

### Jira

**Connexion** : installe l'[Atlassian CLI](https://developer.atlassian.com/cloud/acli/) (`acli`), puis :

```bash
acli jira auth login
```

**Config** :

```json
"jira": { "site": "mon-entreprise.atlassian.net", "projectKey": "ABC", "boardId": 1, "onlyMine": true }
```

| Option | Rôle |
|---|---|
| `site` | domaine Jira (sans `https://`) ; c'est aussi le seul site Jira que N2 accepte d'ouvrir |
| `projectKey` | clé du projet (`ABC` dans `ABC-123`) : sert à repérer les tickets cités dans les PR et les branches |
| `boardId` | identifiant du tableau (dans l'URL du board : `…/boards/1`) ; N2 y lit le sprint actif |
| `onlyMine` | `true` : seulement mes tickets dans l'onglet Sprint ; `false` : tout le sprint |

### Projet local : Carte, Librairies, Ma branche

N2 lit le dépôt cloné sur ta machine (fichiers, `package.json`, `package-lock.json`, `git log`, branches). Rien n'est écrit dans ce dépôt : choisir une branche dans N2 ne fait **aucun checkout**.

**Config** :

```json
"libs": {
  "projectPath": "~/chemin/vers/le/projet",
  "packages": ["react", "zod"]
},
"codemap": {
  "projectPath": "~/chemin/vers/le/projet",
  "ide": "/Applications/PhpStorm.app/Contents/MacOS/phpstorm",
  "splitThreshold": 400,
  "categories": {},
  "descriptions": {}
}
```

| Option | Défaut | Rôle |
|---|---|---|
| `libs.projectPath` | — | dossier du projet ; doit contenir un `package-lock.json` |
| `libs.packages` | — | librairies **critiques** suivies de près (vue par défaut de l'onglet Librairies, failles reprises dans « À faire ») |
| `codemap.projectPath` | `libs.projectPath` | dossier à cartographier, s'il diffère |
| `codemap.ide` | PhpStorm | lanceur de l'IDE JetBrains, appelé avec `--line N fichier` (ex. `/Applications/WebStorm.app/Contents/MacOS/webstorm` ; sous Linux `~/.local/share/JetBrains/Toolbox/scripts/webstorm` ou `/opt/WebStorm/bin/webstorm.sh`) ; réglable dans les Préférences |
| `codemap.splitThreshold` | `400` | au-delà de ce nombre de fichiers, une partie est découpée par sous-dossier de `src/` |
| `codemap.categories` | `{}` | corriger la couche d'une partie : `{ "apps/admin": "front" }` (`front`, `api`, `back`, `shared`, `infra`, `tooling`) |
| `codemap.descriptions` | `{}` | description d'une partie : `{ "apps/web/src/features": "Écrans et logique métier du site" }` |

**Ma branche** : le tag à côté de la recherche, dans la barre du haut. Par défaut, la branche sur laquelle est le dépôt ; un clic ouvre une fenêtre avec une recherche et trois sections (branche actuelle, branches locales, branches distantes) ; le bouton **git fetch** met à jour les branches distantes sans jamais demander d'identifiants. L'interrupteur **Filtrer** à côté du tag (retenu dans le navigateur) limite Pull requests, Sprint, Carte (calque « Ma branche »), Déploiements (environnement et exécutions de la branche) et Guide (sections à relire) à cette branche. Le Dashboard montre toujours sa carte « Ma branche », sur la même branche que le tag.

Les librairies utilisent aussi le registre npm public (versions, notes de version) et GitHub (failles, PR de mise à jour). Les **scopes npm privés** déclarés dans le `.npmrc` du projet ne sont jamais envoyés au registre public.

### Sentry

**Connexion** : installe `sentry-cli` (`brew install getsentry/tools/sentry-cli`), puis :

```bash
sentry-cli login
```

N2 lit le token dans `~/.sentryclirc` au moment de l'appel (ou dans la variable `SENTRY_AUTH_TOKEN`).

**Config** :

```json
"sentry": { "org": "mon-org", "project": "mon-projet", "environment": "production", "preprodEnvironments": ["staging"] }
```

| Option | Rôle |
|---|---|
| `org` | slug de l'organisation Sentry |
| `project` | slug du projet |
| `environment` | facultatif : environnement de production. Observabilité et « À faire » n'en montrent que les erreurs (chiffres de cet environnement seulement) ; un sélecteur dans Observabilité permet d'en voir un autre, ou tous. Absent : tous les environnements |
| `preprodEnvironments` | facultatif, avec `environment` : environnements d'avant la prod (`staging`, `qa`…). Vue **« Avant la prod »** : les erreurs vues dans ces environnements ces 7 derniers jours et jamais en production, à regarder avant de valider une mise en prod ; « À faire » les signale |

Pour que les traces soient rattachées au code (PhpStorm, carte, guide), il faut aussi que le projet local soit configuré (`codemap` ou `libs.projectPath`).

### AWS : CloudWatch, Déploiements, session

**Connexion** : installe la CLI `aws` et un profil (SSO ou autre) avec une session valide. La barre du haut affiche le temps restant de la session et passe en alerte quand elle expire ; « À faire » le signale aussi.

**Config** :

```json
"aws": {
  "profile": "mon-profil",
  "region": "eu-west-1",
  "alarmPrefix": "",
  "hideAutoscaling": true,
  "reconnectHint": "Reconnecte-toi à AWS puis rafraîchis",
  "reconnect": { "projectPath": "~/chemin/vers/le/projet", "script": "aws:login" }
},
"deploy": {
  "pipelinePrefix": "monprojet-",
  "mainBranch": "main",
  "envUrl": "https://preview-{slug}.site.example/"
}
```

| Option | Défaut | Rôle |
|---|---|---|
| `aws.profile` | — | profil AWS utilisé pour tous les appels |
| `aws.region` | — | région des alarmes et des pipelines |
| `aws.alarmPrefix` | `""` | ne garder que les alarmes dont le nom commence par ce préfixe |
| `aws.hideAutoscaling` | `true` | masque les alarmes d'autoscaling (`false` pour les voir) |
| `aws.reconnectHint` | — | message affiché quand la session a expiré |
| `aws.reconnect` | — | facultatif : un clic sur « AWS expirée » lance `npm run <script>` dans `projectPath` (le script ouvre lui-même le navigateur pour se connecter). Une seule à la fois, arrêtée au bout de 5 minutes. |
| `deploy.pipelinePrefix` | — | **obligatoire pour l'onglet Déploiements** : préfixe des pipelines du projet, nommés `<préfixe><branche ou ticket>-pipeline…` (ex. `monprojet-main-pipeline-…`, `monprojet-abc-123-pipeline-…`) |
| `deploy.mainBranch` | `main` | branche déployée en prod ; c'est aussi la référence des « Passages à revoir » du guide |
| `deploy.envUrl` | — | facultatif : modèle d'URL des environnements de branche ; `{slug}` est remplacé par le ticket de la branche (`abc-123`). Sans lui, pas de lien « Ouvrir » vers l'environnement, et N2 n'accepte d'en ouvrir aucun |

Seule la ligne `expiration` du fichier d'identifiants AWS est lue par N2, pour afficher le temps restant.

### Agenda Teams / Outlook

Deux façons de le brancher dans `calendar`, utilisables ensemble : Graph est utilisé dès qu'on est connecté, le lien ICS sinon.

```json
"calendar": {
  "icsUrl": "",
  "graph": { "tenantId": "mon-entreprise.onmicrosoft.com", "clientId": "00000000-0000-0000-0000-000000000000" }
}
```

**Option 1 : lien ICS (sans admin)**

1. Dans Outlook web : Paramètres → Calendrier → Calendriers partagés → **Publier un calendrier**, avec « Peut afficher tous les détails ».
2. Copier le lien **ICS** dans `calendar.icsUrl`.

Ce lien donne accès à ton agenda : il ne doit jamais sortir de `config.local.json`. Outlook met le fichier publié à jour avec un peu de retard.

**Option 2 : Microsoft Graph (à jour en temps réel)**

1. Déclarer une app dans **Entra ID** (Azure AD) avec la permission **déléguée** `Calendars.Read`, et activer « Autoriser les flux clients publics » (onglet Authentification).
2. Renseigner `calendar.graph.tenantId` et `calendar.graph.clientId`, relancer N2.
3. Cliquer sur **Se connecter à Microsoft** dans le Dashboard, puis saisir le code affiché sur la page Microsoft.

Les jetons sont gardés dans `~/.config/n2/microsoft.json` (lisible par toi seul), hors du projet, et ne sont jamais envoyés au navigateur.

### Slack

1. Sur [api.slack.com/apps](https://api.slack.com/apps) : **Create New App → From a manifest**, choisir l'espace de travail, coller [`slack-app-manifest.yml`](slack-app-manifest.yml). L'app ne demande que des droits de **lecture** (salons, messages directs, recherche, noms).
2. **Install to Workspace**. Selon les réglages de l'espace, un admin doit approuver l'app.
3. Copier le **User OAuth Token** (`xoxp-…`, page *OAuth & Permissions*) dans le trousseau macOS (sous Linux et WSL, voir plus bas). La commande le demande sans l'afficher ni le garder dans l'historique :

   ```bash
   security add-generic-password -a "$USER" -s n2-slack -w
   ```

   Pour le remplacer : la même commande avec `-U`. À défaut, N2 lit la variable d'environnement `SLACK_USER_TOKEN`.

   **Linux, WSL** : pas de trousseau, seule `SLACK_USER_TOKEN` compte. Avec le démarrage automatique, mets-la dans `~/.config/n2/env`, lisible par toi seul : crée le fichier, puis ajoutes-y la ligne `SLACK_USER_TOKEN=xoxp-…` dans ton éditeur,

   ```bash
   mkdir -p ~/.config/n2 && touch ~/.config/n2/env && chmod 600 ~/.config/n2/env && ${EDITOR:-nano} ~/.config/n2/env
   ```

   puis redémarre le service :

   ```bash
   systemctl --user restart n2-dashboard
   ```

   Sans le service : `export SLACK_USER_TOKEN=…` dans le terminal, avant `bun run dev`.
4. Dans `config.local.json` :

   ```json
   "slack": { "channels": ["dev-front", "releases"], "messages": 5 }
   ```

| Option | Défaut | Rôle |
|---|---|---|
| `channels` | `[]` | salons suivis, par nom (sans `#`) ou identifiant (`C0123ABCD`) ; 8 au plus |
| `messages` | `5` | nombre de messages affichés par salon (1 à 20) |

Les mentions et les messages directs marchent sans salon : `"slack": {}`.

### Guide de l'équipe

Un guide HTML de l'équipe (une application compilée, au format pris en charge par `src/features/guide/parse.ts`), affiché dans N2 et relié au code.

```json
"guide": {
  "path": "~/Documents/guide.html",
  "name": "Guide Monprojet",
  "links": {
    "deploy": ["guide/page-b/section-1"],
    "observability": ["guide/page-a/section-1"],
    "prs": ["guide/page-c/section-1"]
  }
}
```

| Option | Défaut | Rôle |
|---|---|---|
| `path` | — | chemin du fichier HTML |
| `name` | « Guide de l'équipe » | nom affiché (recherche ⌘K, passages à revoir) |
| `links` | aucun | sections proposées en haut des onglets Déploiements, Observabilité et Pull requests, par adresse dans le guide (`page/ancre`, celle de l'onglet Guide) ; leurs titres sont lus dans le guide, une adresse qui n'existe plus est ignorée |

Pour passer à une nouvelle version du guide, remplace le fichier : N2 le relit dès qu'il change, sans redémarrage.

- **Onglet Guide** : le guide s'ouvre directement à la section demandée. Les autres onglets y mènent :
  - Déploiements, Observabilité et Pull requests : liens « Dans le guide » vers les sections choisies dans `guide.links` ;
  - trace d'une erreur Sentry, analyse d'impact et parties de la Carte : sections qui citent ces fichiers ;
  - « Ma branche » : « À relire dans le guide », les sections qui parlent des fichiers modifiés.
- **⌘K** cherche aussi dans les sections et le glossaire du guide.
- **Passages à revoir** : compare le code cité entre le commit de révision du guide (son pied de page) et `origin/<deploy.mainBranch>`. Une citation avec des numéros de ligne est « modifiée » si ces lignes ont changé ; un fichier cité en entier n'est signalé que s'il a été déplacé ou supprimé. Le commit de révision doit être présent dans le dépôt local (`git fetch`). Une liste à copier est prête pour l'auteur du guide.
- **Isolement** : le guide contient du JS écrit par quelqu'un d'autre. N2 le sert dans un bac à sable (CSP `sandbox` sans `allow-same-origin`, `connect-src 'none'`) : il ne peut ni appeler N2, ni lire ses cookies, ni faire d'appel réseau. Côté serveur, N2 lit ses données sans jamais exécuter son JS.

### Liens rapides (⌘K)

Sans rien régler, ⌘K propose déjà les dépôts GitHub (code, PR ouvertes, actions), le tableau et le backlog Jira, le projet Sentry, les alarmes, tableaux de bord et journaux CloudWatch, CodePipeline, le pipeline de prod et les environnements dynamiques.

Pour ajouter tes propres liens (prod, staging, back-office…) :

```json
"links": [
  { "label": "Back-office", "url": "https://bo.site.example/", "group": "Prod", "keywords": "admin bo" }
]
```

| Champ | Rôle |
|---|---|
| `label` | texte affiché |
| `url` | lien `https` uniquement ; N2 accepte ensuite d'ouvrir ce site exact dans Chrome (pas ses sous-domaines) |
| `group` | rubrique dans ⌘K (« Liens » par défaut), cherchable |
| `keywords` | mots-clés supplémentaires pour la recherche (« prod bo ») |

### Ce qui marche sans configuration supplémentaire

- **GitHub · Jira** (Dashboard) : les fils où d'autres ont écrit depuis ton dernier message, sur `github.recentDays` jours. Un fil disparaît dès que tu y réponds.
  - *Mention* : `@login` sur GitHub, mention Jira ;
  - *Sur ta PR / ton ticket* : commentaire sur une PR dont tu es l'auteur ou l'assigné, ou sur un ticket qui t'est assigné ou que tu as créé ;
  - *Réponse* : nouveau message dans le fil d'un autre où tu avais écrit.

  Les robots sont ignorés ; la boîte de notifications de GitHub n'est pas utilisée.
- **Statistiques** : avec `gh` et `sentry-cli`.
  - *Délai de première revue* : du passage en « prête pour revue » (ou de l'ouverture) à la première revue d'une autre personne, compté dans la semaine de cette revue ;
  - *Ouverture → fusion* : du même point de départ à la fusion, compté dans la semaine de la fusion, plus le nombre de PR fusionnées ;
  - *Erreurs Sentry* (événements reçus) et *nouveaux problèmes* (Sentry ne compte pas au-delà de 100).

  Durées médianes en heures ouvrées (week-ends exclus), PR des robots exclues. Aussi : les PR les plus longues à fusionner des deux dernières semaines, et un tableau semaine par semaine.

---

## Fonctions transverses

**Reporter / ignorer** : l'horloge d'un élément de « À faire » le masque 1 heure, jusqu'au prochain jour ouvré à 9 h, ou jusqu'à ce qu'il change (nouvelle raison de blocage, nouvelle erreur, nouvelle faille ; 30 jours au plus). Les éléments masqués sont listés en bas de la carte. Choix gardés dans le navigateur.

**Notifications** : le titre de l'onglet affiche le nombre d'urgences (« (3) N2 ») et les onglets portent des compteurs. La cloche de la barre du haut active les notifications du système (via le navigateur) : nouvelles urgences, réunion dans 5 minutes (clic = rejoindre), messages directs et mentions Slack, nouveautés GitHub · Jira. Une seule fois par nouveauté, rien pour ce qui existait déjà à l'activation. Un onglet N2 doit rester ouvert.

**Recherche globale : ⌘K** : PR, tickets, erreurs, parties, sous-dossiers, librairies, fichiers, sections et glossaire du guide, liens rapides. Un élément externe s'ouvre dans un **nouvel onglet Chrome**, un fichier dans **l'éditeur choisi** (Préférences) à la bonne ligne.

**État des sources** (⌘K « État des sources », ou Préférences → Diagnostic) : pour chaque source depuis le démarrage de N2, l'état de la dernière lecture, sa durée, le dernier succès, le nombre de lectures et d'échecs, et la dernière erreur ; une source sans section de config est « non configurée », pas en échec. Le journal de N2 ne note que l'utile : les échecs, les lectures de plus de 5 s et le retour à la normale (`[n2] source=… ms échec=…`).

**Agents IA (MCP)** : une session Claude Code, Codex ou tout client MCP peut demander à N2 ce qui attend (`n2_status` : urgences, CI, sources en échec) et le contexte d'une branche (`n2_branch` : fichiers modifiés, parties touchées, PR, CI, tickets). Lecture seule, par N2 en marche et avec ton jeton de session, comme `bun run status`.

```bash
claude mcp add n2 -- bun /chemin/vers/n2/scripts/mcp.ts
```

Pour Codex : la même commande dans la section `mcp_servers` de `~/.codex/config.toml`. Ce que l'agent reçoit vient de tes outils pro (PR, alarmes, erreurs) : branche-le seulement sur un agent à qui tu confies déjà ce projet.

**Raccourcis** : touches **1 à 9** pour les onglets, **⌘K** pour la recherche. Le bouton de rafraîchissement recharge toutes les données et affiche l'heure de la dernière mise à jour.

**Langue** : français par défaut, anglais en option (sélecteur de la barre du haut, gardé dans un cookie). Tous les textes sont dans `messages/fr.json` et `messages/en.json`, voir [Traductions](#traductions).

---

## Démarrage automatique (facultatif)

```bash
sh scripts/autostart.sh install
```

N2 démarre avec la session et redémarre s'il plante : LaunchAgent sous macOS, service utilisateur systemd sous Linux (`~/.config/systemd/user/n2-dashboard.service`, variables secrètes dans `~/.config/n2/env`). Le cookie de déverrouillage dure un an : pas besoin de relancer `bun run open` après un redémarrage.

Le service lance N2 en **mode production** (`scripts/service.sh` → `bun run start` : build en quelques secondes, puis serveur de production). Rien n'est rechargé à chaud : après une mise à jour du code de N2 (`git pull`, fusion…), redémarre le service, qui refait le build :

```bash
launchctl kickstart -k gui/$(id -u)/local.n2.dashboard
```

Sous Linux : `systemctl --user restart n2-dashboard`. Pour développer N2 lui-même, arrête le service et lance `bun run dev` (rechargement à chaud).

**Journal (macOS)** : `~/Library/Logs/n2.log`. Au démarrage, s'il dépasse 5 Mo, il devient `n2.log.1` (un seul ancien journal gardé). Sous Linux, c'est journald qui s'en occupe.

Après une mise à jour de N2 qui change ce démarrage (comme le passage en mode production), réinstalle le service : `sh scripts/autostart.sh install`.

Sous Linux, le service démarre à l'ouverture de session ; pour qu'il démarre avec la machine, sans session ouverte : `loginctl enable-linger`. Sous **WSL**, rien n'est installé : la distribution s'arrête quand plus aucun terminal ne l'utilise, le script explique comment lancer N2 à la main (ou forcer le service systemd si systemd est activé dans WSL : `N2_FORCE_SYSTEMD=1`).

```bash
sh scripts/autostart.sh status
```

État du service et journal (`~/Library/Logs/n2.log` sous macOS, `journalctl --user -u n2-dashboard` sous Linux).

```bash
sh scripts/autostart.sh uninstall
```

---

## Commandes

| Commande | Rôle |
|---|---|
| `bun run setup` | hooks anti-secrets, `config.local.json`, traductions, styles Panda |
| `bun run dev` | serveur de développement (rechargement à chaud) |
| `bun run demo` | N2 avec des données inventées (port 4848), sans config ni compte : pour essayer, montrer ou tester |
| `bun run open` | ouvre N2 dans Chrome et le déverrouille pour ce navigateur ; `--reset` : nouveau jeton, déconnecte tous les navigateurs |
| `bun run status` | l'état de N2 en une ligne (urgences, CI de la branche principale et de ta branche, sources en échec) ; `--json` : le JSON versionné de `/api/status` (`schemaVersion`), pour une barre de menus ou un script |
| `bun run mcp` | serveur MCP de N2 (stdio), à déclarer dans Claude Code ou Codex ; voir [Fonctions transverses](#fonctions-transverses) |
| `bun run build` | build de production |
| `bun run start` | build puis serveur de production (utilisé par le démarrage automatique) |
| `bun run test` | tests (Vitest) : garde-fous, carte, impact, « À faire », agenda, Slack, déploiements, guide, recherche… |
| `bun run test:e2e` | tests de navigateur (Playwright, N2 en mode démo) : chaque onglet sans erreur, verrou, accessibilité. En local avec le Google Chrome installé ; à lancer depuis une autre copie que celle servie par le démarrage automatique |
| `bun run typecheck` | vérification TypeScript |
| `bun run codegen` | régénère les styles Panda (`styled-system/`) |
| `bun run i18n` | compile `messages/*.json` en fonctions typées (`src/paraglide/`) ; `dev`, `test` et `typecheck` le font déjà |
| `bun run lint` | linter Biome (règles dans `biome.jsonc`) ; aussi au commit sur les fichiers indexés, et en CI |
| `bun run check:secrets` | analyse de tous les fichiers suivis par git |
| `bun run check:server` | vérifie les protections du serveur en cours d'exécution (développement ou production) |
| `bun run autostart` | raccourci vers `scripts/autostart.sh` |

---

## Dépannage

| Symptôme | Cause probable |
|---|---|
| `config.local.json introuvable` | lancer `bun run setup`, puis remplir le fichier |
| « N2 est verrouillé » | lancer `bun run open` (le cookie a expiré, a été effacé, ou c'est un autre navigateur) |
| Une modification de la config n'est pas prise en compte | relancer le serveur (la config est lue une seule fois) |
| Une mise à jour du code de N2 n'apparaît pas | avec le démarrage automatique, N2 tourne en production : redémarrer le service (voir [Démarrage automatique](#démarrage-automatique-facultatif)) |
| « `gh` n'est pas installé » (ou `acli`, `aws`…) | installer l'outil ; s'il l'est, vérifier qu'il est dans le `PATH` du serveur (notamment avec le démarrage automatique) |
| Carte Jira, GitHub ou Sentry en erreur d'authentification | refaire la connexion de la CLI (`gh auth login`, `acli jira auth login`, `sentry-cli login`) |
| « Session AWS expirée » | se reconnecter au profil AWS, ou cliquer sur « AWS expirée » si `aws.reconnect` est configuré |
| « Déploiements non configurés » | ajouter `deploy.pipelinePrefix` dans `config.local.json` |
| « Aucun pipeline principal trouvé » | vérifier `deploy.pipelinePrefix` et `deploy.mainBranch` |
| `package-lock.json introuvable` | vérifier `libs.projectPath` |
| « IDE introuvable » | vérifier `codemap.ide` (sous Linux, le lanceur par défaut est le script PhpStorm de JetBrains Toolbox) |
| « Aucun token Slack trouvé » | ajouter le token au trousseau (service `n2-slack`) ; sous Linux et WSL, définir `SLACK_USER_TOKEN` |
| Linux : un lien ne s'ouvre pas | installer `xdg-utils` (`xdg-open`) ou Google Chrome |
| WSL : `http://n2.localhost:4747` ne répond pas dans Windows | vérifier que le renvoi de `localhost` de WSL2 est actif (`.wslconfig`) et que `bun run dev` tourne dans WSL |
| « Passages à revoir » vide ou en erreur | `git fetch` dans le projet, pour avoir le commit de révision du guide |
| Une carte reste en erreur, sans savoir pourquoi ni depuis quand | ⌘K « État des sources » : dernière erreur, dernier succès, nombre d'échecs ; et le journal (`sh scripts/autostart.sh status`) |
| Pas de notification | activer la cloche, autoriser le navigateur dans les notifications du système, garder un onglet N2 ouvert |

---

## Sécurité : rien de sensible dans git, rien d'exposé

- **Aucun token dans le projet** : N2 passe par les CLI déjà connectées. Le token Sentry et l'expiration AWS sont lus au moment de l'appel. Pour AWS, seule la ligne `expiration` du fichier d'identifiants est lue. Les jetons Microsoft (agenda) sont dans `~/.config/n2/microsoft.json`, le token Slack dans le trousseau macOS (Linux, WSL : la variable `SLACK_USER_TOKEN`, ou `~/.config/n2/env` en 600 avec le service) ; ni l'un ni l'autre n'est envoyé au navigateur.
- **Tout ce qui est propre au compte pro** est dans `config.local.json`, **ignoré par git** et lisible par toi seul (600 : `bun run setup` le crée ainsi, `bun run check:server` le vérifie ; il peut contenir le lien ICS de l'agenda). Seul `config.example.json` est versionné.
- **Garde-fous au commit** (`.githooks/pre-commit`, activé par `bun run setup`) et dans la CI : le script maison (`scripts/check-secrets.sh` : secrets ; et l'email pro et les noms du projet pro et de l'entreprise, listés hors du dépôt, une regex par ligne, dans `~/.config/n2/forbidden-words` (600) et dans le secret GitHub `N2_FORBIDDEN_WORDS` pour la CI), puis **gitleaks** s'il est installé (`brew install gitleaks`).
- **Serveur local verrouillé** :
  - il n'écoute que sur `127.0.0.1` ;
  - les requêtes adressées à un autre nom d'hôte que `n2.localhost`, `127.0.0.1` ou `localhost` sont refusées (anti « DNS rebinding ») ; une page ouverte sur `127.0.0.1` est renvoyée vers `n2.localhost` ;
  - **chaque requête doit porter le cookie de session** de la personne qui a lancé N2 (`src/server/session.ts`) : pages, fonctions serveur, mais aussi les fichiers sources, le client de Vite et son WebSocket de rechargement à chaud. Sans lui, N2 affiche « N2 est verrouillé » ;
  - les fonctions serveur exigent une requête venant de N2 lui-même (middleware CSRF de TanStack Start) ;
  - Vite refuse de servir `config.local.json`, `.env`, les clés et le dossier `.git` (`vite.config.ts`).

  Le verrou est appliqué par le serveur de Vite (`vite.config.ts`) et par les middlewares de TanStack Start (`src/start.ts`, pour un build de production). `bun run check:server` vérifie tout cela sur le serveur lancé.

### Qui peut ouvrir N2 ?

| Qui | Accès | Pourquoi |
|---|---|---|
| Toi, dans ton navigateur déverrouillé | ✅ | cookie de session (`HttpOnly`, `SameSite=Strict`, un an) |
| Un collègue sur le même réseau (Wi-Fi, VPN) | ❌ | N2 n'écoute que sur `127.0.0.1` : depuis le réseau, la connexion est refusée (vérifié avec l'adresse réseau du Mac) |
| Un site web ouvert dans ton navigateur | ❌ | nom d'hôte vérifié (anti DNS rebinding), cookie `SameSite=Strict`, CSRF sur les fonctions serveur |
| Un autre compte macOS sur ton Mac | ❌ | `127.0.0.1` est commun à tous les comptes du Mac, mais il n'a pas le cookie, et le jeton (`~/.config/n2/session`, 600) n'est lisible que par toi |
| Un programme lancé par toi | ⚠️ | il peut lire tes fichiers, donc le jeton, comme il peut déjà lire tes sessions `gh`, `aws`… Le verrou ne protège pas de ce cas, aucun outil local ne le peut |

**`127.0.0.1`, c'est quoi ?** L'adresse « cette machine-ci » (interface de bouclage). Elle ne sort jamais sur le réseau, et macOS refuse un paquet venu du réseau qui la viserait. Quand un collègue tape `http://127.0.0.1:4747`, il arrive **sur sa propre machine**, pas sur la tienne.

**Deux personnes avec N2 sur le même port, sur le même réseau ?** Aucun problème : chacun a son N2 sur sa machine, sur le port 4747, et chacun voit son propre compte (ses CLI `gh`, `acli`, `aws`… et sa config). Il n'y a ni conflit, ni croisement possible.

**Deux comptes macOS sur le même Mac ?** Un seul N2 peut écouter sur un port donné (`strictPort`). Le second doit prendre un autre port (`N2_PORT=4748`). Chacun a son propre jeton dans son dossier personnel : l'un ne peut pas ouvrir le N2 de l'autre.

**Le jeton** est créé au premier démarrage dans `~/.config/n2/session` (dossier 700, fichier 600). `bun run open` ne met jamais ce jeton dans une URL : il écrit un **code à usage unique** (`~/.config/n2/login`, 600, valable 2 minutes), que N2 vérifie, supprime, puis échange contre le cookie. L'adresse est passée à Chrome par AppleScript, sans apparaître dans la liste des processus. Pour changer de jeton et déconnecter tous les navigateurs : `bun run open --reset` (pris en compte tout de suite, sans redémarrer N2).

> Les cookies ne tiennent pas compte du port : un cookie posé pour `127.0.0.1` part vers **tous** les serveurs de `127.0.0.1`, quel que soit leur port. C'est pour cela que N2 s'ouvre sous `n2.localhost` : son cookie n'est envoyé qu'à ce nom, pas aux autres serveurs locaux (ouverts sous `localhost` ou `127.0.0.1`), et l'ancien cookie de `127.0.0.1` est effacé à la redirection. Reste un cas : un autre serveur de ta machine que tu ouvrirais toi-même sous `http://n2.localhost:<autre port>`. En cas de doute, `bun run open --reset` rend l'ancien cookie inutilisable.
- **Ouvertures contrôlées côté serveur** : Chrome n'ouvre que GitHub, le site Jira configuré, Sentry, la console AWS, npm, Teams, Outlook, la page de connexion Microsoft, Slack, les environnements dynamiques (`deploy.envUrl`), les liens rapides de la config (site exact) et les liens de documentation lus dans le registre npm. L'éditeur (JetBrains, VS Code, Cursor, GitHub) n'ouvre que des fichiers du projet cartographié.
- **Préférences écrites dans `config.local.json`** : seuls les onglets, l'éditeur, le chemin du projet, le lanceur JetBrains et le guide peuvent être changés depuis la page, et chaque chemin modifié est vérifié côté serveur (projet : chemin absolu d'un dépôt git ; lanceur : exécutable dans `…/Applications/<IDE>.app/Contents/MacOS/` ; guide : fichier `.html`). Une page compromise ne peut donc ni faire lancer un programme quelconque, ni faire servir un fichier qui n'est pas du HTML.
- **Commandes lancées** : uniquement celles prévues par le code ou la config (`aws.reconnect`) ; le navigateur n'envoie jamais de commande. `git fetch` ne demande jamais d'identifiants.
- **Scopes npm privés** (déclarés dans le `.npmrc` du projet) : leur nom n'est jamais envoyé au registre public.
- **Code du projet pro** : l'analyse de la carte et les extraits de code sont calculés à la demande, **en mémoire uniquement**. Rien n'est écrit dans le dépôt N2.

---

## Architecture

Les grands choix (et leurs raisons) sont dans [`docs/adr/`](docs/adr/README.md).

```
src/
  server/                    code serveur uniquement (jamais envoyé au navigateur)
    fns.ts                   fonctions serveur appelées par l'interface (createServerFn + validation zod)
    config.ts                lecture de config.local.json
    run.ts                   lancement des CLI (gh, acli, aws, git…), appels HTTP avec délai (httpFetch), cache
    open.ts                  ouverture dans Chrome / l'IDE, avec la liste des sites autorisés
    types.ts                 types partagés avec l'interface, rangés par source dans types/
    sources/                 une source = des fonctions pures :
                               github, jira, libs, sentry, cloudwatch, aws-session, aws-reconnect,
                               calendar + microsoft-auth (agenda), slack, activity (GitHub · Jira),
                               stats, deploy (CodePipeline), branches, guide,
                               codemap (carte, impact, points chauds, ma branche, traces),
                               codemap-detect (couches, imports, README), lib-details (fiche d'une librairie)
  start.ts                   middlewares de sécurité (hôte + CSRF)
  routes/                    un fichier par onglet (TanStack Router)
  components/                barre du haut, recherche ⌘K, liens
    ds/                      design system : boutons, pastilles, cartes, listes, contrôles, menus et fenêtres
                             (Panda + Ark UI) ; galerie dans l'onglet caché /design-system (⌘K « Design system »)
  features/                  logique d'interface, par partie : todo (« À faire » et reports), calendar, slack,
                             activity, notify, badges (compteurs), search, branches, map, libs, deploy,
                             guide, prs, stats, links ; map/panel/ : les vues du panneau de la carte
  lib/                       données (TanStack Query), actions (Chrome, PhpStorm), formats, langue (i18n.ts)
  paraglide/                 généré par Paraglide depuis messages/ (non versionné)
  styles/                    app.css (Panda) et map.css (carte)
messages/                    textes de l'interface : fr.json (référence) et en.json
project.inlang/              réglages Paraglide (langues, format des fichiers de messages)
tests/                       Vitest, sur un faux monorepo créé à la volée (aucun code pro)
scripts/                     autostart, service (lancé par le démarrage automatique), check-secrets, check-server, i18n
.github/workflows/ci.yml     CI GitHub Actions à chaque push (Linux) : secrets, typecheck, tests
```

**Styles** : couleurs, ombres et styles de texte (`textStyle` : `title`, `heading`, `body`, `caption`, `overline`, `label`) sont dans `panda.config.ts`. Un motif qui revient (bouton, pastille, menu, fenêtre…) passe par `src/components/ds` ; un `css()` dans un onglet ne sert qu'à sa mise en page. Pour remplacer une propriété d'une recette, fusionner : `css(button.raw({ variant: "link" }), { … })` (avec `cx`, deux classes sur la même propriété : c'est l'ordre de la feuille qui décide).

### Traductions

Les textes sont dans **`messages/fr.json`** (référence) et **`messages/en.json`**, une clé par texte. [Paraglide JS](https://paraglidejs.com) les compile en fonctions typées dans `src/paraglide/` : une clé ou un paramètre oublié est une erreur TypeScript.

```json
// messages/fr.json
"prs_review_requested": "Revue demandée",
"topbar_last_updated_at": "Dernière mise à jour à {lastUpdate}",
"sprint_left": [{ "declarations": ["input count", "local countPlural = count: plural"], "selectors": ["countPlural"],
                  "match": { "countPlural=one": "{count} jour restant", "countPlural=other": "{count} jours restants" } }]
```

```tsx
import { m } from "~/lib/i18n";
m.prs_review_requested();
m.topbar_last_updated_at({ lastUpdate: "10:42" });
m.sprint_left({ count: 3 });
```

- **Clés** en `snake_case`, préfixées par leur partie : `dashboard_`, `prs_`, `map_`, `libs_`, `topbar_`, `ds_`… ; `common_` pour un texte partagé, `srv_` pour les messages du serveur.
- **Accolades littérales** : `\\{` et `\\}` dans le JSON (`{nom}` est un paramètre).
- **Messages du serveur** : le serveur n'écrit aucune phrase. Il renvoie `{ key: "srv_…", params }` (`msg()` dans `src/server/messages.ts`), et l'interface l'affiche avec `msg()` de `src/lib/i18n.ts`. Les paramètres passent par `redact()` avant de partir vers le navigateur.
- **Langue** : `getLocale()` de Paraglide est branché sur le cookie `n2-lang` (`src/lib/i18n.ts`), côté serveur comme côté navigateur : la page arrive directement dans la bonne langue.
- **Plugin de format** : `@inlang/plugin-message-format` est installé avec npm et référencé en chemin local dans `project.inlang/settings.json`, pour que la compilation ne télécharge rien.
- `tests/i18n.test.ts` vérifie que les deux fichiers ont les mêmes clés et les mêmes paramètres, que chaque clé sert et qu'il ne reste aucun texte en dur.

**Ajouter une source** : une fonction pure dans `src/server/sources/`, une fonction serveur dans `fns.ts`, un hook dans `src/lib/data.ts`, puis l'affichage dans `routes/` ou `features/`. Si elle a besoin d'options, les déclarer dans l'interface `Config` (`src/server/config.ts`) et dans `config.example.json`.

> Dans `src/server/fns.ts`, tout le code serveur doit rester **dans** `.handler(...)`. C'est ce qui permet au compilateur de TanStack Start de le retirer du code envoyé au navigateur.

---

## Carte du projet : comment c'est calculé

- **Parties** : chaque dossier qui a son propre `package.json`. Celles de plus de `codemap.splitThreshold` fichiers (400 par défaut) sont découpées par sous-dossier de `src/`.
- **Liens** : imports résolus via les chemins relatifs, les alias de `tsconfig.json` / `tsconfig.base.json` (`~/…`) et le champ `exports` des `package.json`.
- **Couche** d'un fichier, déduite de ses imports :
  - Infra : `aws-cdk-lib` ;
  - Outillage : CLI, `scripts/` ;
  - API : `@trpc/server`, OpenAPI, dossiers `api/` ;
  - Back : `node:*`, sessions, cache, `server/` ;
  - Front : `react`, `@mui/*`, `.tsx`.

  La couche d'une partie est celle de la majorité de ses fichiers. Pour corriger un classement : `codemap.categories`.
- **Descriptions** : `codemap.descriptions`, sinon le `description` du `package.json`, sinon le premier paragraphe du README.
- **Impact** : tous les fichiers qui dépendent d'un fichier, directement ou en cascade, par partie.
- **Points chauds** : fichiers à la fois très importés et souvent modifiés (`git log` sur 30 jours).
- **Ma branche** : fichiers modifiés depuis la base (`origin/HEAD`), commités ou non, pour la branche choisie dans le sélecteur.
- **Navigation** :
  - survol = liens de la partie ; ⌘ + molette (ou pincement) = zoom ; glisser le fond = déplacement ;
  - bandeau des couches : clic = filtre, survol = menu en cascade ;
  - tags : historique des sélections, et fermer le tag actif ramène au précédent.

---

## Licence

[MIT](LICENSE) : libre d'utiliser, de modifier et de redistribuer N2, en gardant la mention de copyright.
