<div align="center">

# N2

**Your whole working day on one local dashboard.**

GitHub pull requests · Jira sprint · Slack · calendar · Sentry errors · AWS alarms and deployments · code map · team guide

[![CI](https://github.com/MazetVincent/n2/actions/workflows/ci.yml/badge.svg)](https://github.com/MazetVincent/n2/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Runs with Bun](https://img.shields.io/badge/runs%20with-Bun-f9f1e1?logo=bun&logoColor=black)
![macOS · Linux · WSL2](https://img.shields.io/badge/macOS%20·%20Linux%20·%20WSL2-555)

**English** · [Français](README.fr.md)

</div>

---

N2 runs on your machine (`http://n2.localhost:4747`), relies on the command-line tools **you have already signed in to** (`gh`, `acli`, `aws`, `sentry-cli`) and keeps no token in the project.

```bash
bun install && bun run demo   # try it with made-up data, nothing to configure
```

|   |   |
|---|---|
| 🔒 **Local and locked** | Listens on `127.0.0.1` only, and every request needs your session cookie. Colleagues on the same network and websites in your browser get nothing. |
| 🔑 **No token in the project** | GitHub, Jira, Sentry and AWS go through their own CLIs. Your account settings live in an untracked `config.local.json`. |
| 👀 **Read-only** | N2 shows and links, it never merges, deploys or approves anything. |
| 🧩 **Independent parts** | A missing tool or config section only breaks its own cards, with the steps to fix it. The rest keeps working. |
| 🤖 **AI agents welcome** | An MCP server tells Claude Code, Codex and the like what is waiting and what a branch touches. |
| 🎨 **Themes** | A day theme and a night theme (Neon sign, Classic, Miami, Retrowave, Holo, Soft aubergine), following your system's light or dark setting. |

Stack: **TanStack Start + React + TanStack Query + Panda CSS + Ark UI**, run with **Bun**.

## Contents

| Use it | Set it up | Under the hood |
|---|---|---|
| [What's in N2](#whats-in-n2) | [Configuration](#configuration-configlocaljson) | [Security](#security-nothing-sensitive-in-git-nothing-exposed) |
| [Getting started](#getting-started) | [Connecting each part](#connecting-each-part) | [Architecture](#architecture) |
| [Everyday features](#everyday-features) | [Autostart](#autostart-optional) | [Project map: how it's computed](#project-map-how-its-computed) |
| [Commands](#commands) | [Troubleshooting](#troubleshooting) | [License](#license) |

---

## What's in N2

Tabs come in three groups. Keys **1 to 9** follow this order.

### Today's work

| Key | Tab | What it shows | Powered by |
|---|---|---|---|
| 1 | **Dashboard** | **To do**: what needs action (requested reviews, blocked or ready-to-merge PRs, tickets in review without a PR, alarms, new errors, vulnerabilities, failing pipeline, AWS session about to expire). **Remind me**: things to look at later, kept in your own Markdown file (`remind.path`); add, tick, delete or edit the whole text from N2. **Calendar** for the day or the week, with "Join". **Slack**: direct messages, mentions, followed channels. **GitHub · Jira**: mentions and replies. **My branch**: changed files, parts touched, guide sections to reread. | everything configured |
| 2 | **Pull requests** | Requested reviews, my PRs, approved, commented. For each PR: CI, review, conflicts, linked Jira tickets, and whether it is in production or waiting for it. | `gh`, `acli`, `aws` |
| 3 | **Jira sprint** | Active sprint tickets in 3 columns, with the PRs that mention them. | `acli`, `gh` |

### The code

| Key | Tab | What it shows | Powered by |
|---|---|---|---|
| 4 | **Map** | The project's parts by layer (Front / API / Back / Shared / Infra / Tooling), their links, their libraries and real examples. **Impact analysis** of a file, **hot spots** and **my branch** as overlays. Search with autocomplete: libraries, parts, key files, **the project's READMEs** and **the guide**; a library's card lists the doc passages that mention it. | the local repository (`codemap`) |
| 5 | **Guide** | The team guide (an HTML file) shown inside N2, opened at the right section from the other tabs. **Passages to review**: code quoted by the guide that changed since the guide's revision. | `guide.path` |
| 6 | **Libraries** | Installed versions, updates, security alerts, release notes, open update PRs (Renovate, Dependabot or hand-made) and the map parts that use each library. Two views: **critical** libraries (`libs.packages`) and **all dependencies**, per `package.json`. | the local repository, npm registry, `gh` |

### Production

| Key | Tab | What it shows | Powered by |
|---|---|---|---|
| 7 | **Observability** | Sentry errors (new, most frequent, since the last release, before production; per environment) with their **stack trace linked to the code** (→ editor, → map, → guide). CloudWatch alarms: state, **24-hour chart** with the alarm's threshold or anomaly band (red if the line crossed it, even without firing), and **firings over 7 days**; autoscaling can be hidden. **Logs Insights**: the queries your team saved in CloudWatch, run on click over 1 h or 24 h (billed by the data scanned, which is shown; never run on their own). | `sentry-cli`, `aws` |
| 8 | **Deployments** | **GitHub CI** (Actions) for the main branch and "my branch": latest run of each workflow, failures and successful reruns over 14 days (a sign of a flaky test); a red CI on the main branch shows up in "To do". The main branch's CodePipeline as a timeline (Source → Staging/Quality → manual approval → Production), what is waiting for production, what is in production, recent runs, and the branches' dynamic environments ("my branch" first). **Read-only**: production approval happens in the AWS console. | `aws` |
| — | **Statistics** (discreet tab, see Preferences) | Time to first review, open-to-merge time, merged PRs and Sentry errors over 8 weeks, for the whole team or only my PRs. | `gh`, `sentry-cli` |

Each part stands on its own: if a tool is not connected or a config section is missing, only the cards concerned show an error (with what to do), and the rest of N2 works.

> The interface is in **French by default**, with **English** one click away (language picker in the top bar).

---

## Getting started

### Try it without configuring anything: demo mode

```bash
bun install && bun run demo
```

N2 starts on `http://n2.localhost:4848` with made-up data for everything that needs an account (PRs, sprint, Sentry, AWS, Slack, calendar), without `config.local.json` or any connected CLI; a "Demo" badge under the logo reminds you. The code map, "My branch" and the README search analyse N2 itself. Unlock it once with `N2_PORT=4848 bun run open`. Preferences are not saved.

### Requirements

- **macOS**, **Linux**, or **Windows with WSL2** (see [Linux and Windows (WSL2)](#linux-and-windows-wsl2); Windows without WSL is not supported);
- **[Bun](https://bun.sh)**;
- **Google Chrome** (links open in a new Chrome tab; on Linux without Chrome and on WSL, in the default browser);
- **PhpStorm** (optional, to open a file at the right line; another JetBrains IDE, VS Code or Cursor work too);
- a local clone of **the project you want to follow**;
- the CLIs of the tools you want to connect, see [Connecting each part](#connecting-each-part).

### Installation

```bash
bun install
```

```bash
bun run setup
```

`setup` turns on the anti-secret hooks (`.githooks/`), creates `config.local.json` from `config.example.json` if it does not exist, and generates the Panda styles.

Then fill in `config.local.json` (see below), and run:

```bash
bun run dev
```

N2 answers on **http://n2.localhost:4747**, but it is **locked**: only your browser can open it. The first time (then once a year per browser), unlock it with:

```bash
bun run open
```

Chrome opens on N2, unlocked; from then on your bookmarks and `http://n2.localhost:4747` work directly. See [Who can open N2?](#who-can-open-n2).

**Why `n2.localhost`?** Any `.localhost` name leads to your own machine, with nothing to install or configure (Chrome knows it). An old bookmark on `http://127.0.0.1:4747` is redirected to `http://n2.localhost:4747`; unlock N2 once under that name (`bun run open`). Preferences kept in the browser (snoozed items, "My branch" filter, notifications, language) belong to each address: set them again once. To keep the old address (for a browser that would not know `.localhost`): `N2_HOST=127.0.0.1`, for the server as well as for `bun run open`.

To change the port: `N2_PORT=4800 bun run dev` (then `N2_PORT=4800 bun run open`). The config's `port` field is obsolete.

> `config.local.json` is read **only once** at startup: restart the server after each change (only the guide file is reloaded live).

### Linux and Windows (WSL2)

N2 also runs on **Linux** and on **Windows with WSL2** (N2 in the Linux distribution, the browser in Windows). Same installation (`bun install`, `bun run setup`, `bun run dev`); the CLIs (`git`, `gh`, `aws`, `acli`) are installed in Linux. What changes by system:

| | macOS | Linux | WSL2 |
|---|---|---|---|
| Links | new Chrome tab (`open -a`) | `google-chrome` if installed, otherwise the default browser (`xdg-open`) | Windows default browser (`rundll32.exe url.dll,FileProtocolHandler`) |
| `bun run open` | Chrome, through AppleScript | same command as links; without a display (SSH), the address is printed | same command as links |
| JetBrains launcher | `/Applications/<IDE>.app/Contents/MacOS/<ide>` | JetBrains Toolbox script (`~/.local/share/JetBrains/Toolbox/scripts/phpstorm`, default) or `/opt/<IDE>/bin/<ide>.sh` | same as Linux (IDE installed in WSL, shown through WSLg); simpler: VS Code or Cursor |
| VS Code, Cursor | `vscode://file/…` | same, through `xdg-open` | `vscode://vscode-remote/wsl+<distribution>/…`: the Windows editor opens the file in WSL (**WSL** extension required) |
| Slack token | keychain, or `SLACK_USER_TOKEN` | `SLACK_USER_TOKEN` only | `SLACK_USER_TOKEN` only |
| Autostart | launchd | systemd user service | no (explanation shown), see [Autostart](#autostart-optional) |

**WSL2**: keep the followed project and N2 in the Linux file system (`~/…`, not `/mnt/c/…`: much slower). The Windows browser reaches `http://n2.localhost:4747` (a `.localhost` name leads to `127.0.0.1`) thanks to WSL2's `localhost` forwarding (on by default; check it is not turned off by `localhostForwarding=false` in `.wslconfig`). The unlock link from `bun run open` opens in that browser.

**Windows without WSL**: not supported (`sh` scripts, `600` file permissions, `/` paths).

---

## Configuration (`config.local.json`)

Everything specific to your account and project lives in `config.local.json`, **ignored by git**. Only `config.example.json` (dummy values) is versioned.

| Section | Required | Used for |
|---|---|---|
| `github` | yes | Pull requests, Sprint (linked PRs), GitHub · Jira, Statistics, Deployments (links to commits) |
| `jira` | yes | Jira sprint, tickets linked to PRs, GitHub · Jira, ⌘K links |
| `libs` | yes | Libraries; also the default followed repository (Map, My branch) |
| `sentry` | yes | Observability, Statistics, "To do" |
| `aws` | yes | Observability (CloudWatch), Deployments, AWS session in the top bar |
| `codemap` | no | Map, impact analysis, Sentry traces → code, opening in the IDE |
| `deploy` | for the Deployments tab | pipeline prefix, main branch, branch environment address |
| `calendar` | no | Dashboard calendar |
| `slack` | no | Dashboard Slack card |
| `guide` | no | Guide tab and "In the guide" links |
| `remind` | no | Markdown file for "Remind me" (`remind.path`, `~/.config/n2/remind.md` by default; set here only, not in Preferences) |
| `links` | no | personal quick links in ⌘K |
| `ui` | no | preferences set inside N2 (bolt icon, top right): visible tabs (`ui.tabs`), editor to open code in (`ui.editor`: `jetbrains`, `vscode`, `cursor` or `github`) |

"Required" sections must exist in the file; if you don't use the matching tool, keep the example values: the card concerned will simply show an error.

**Preferences** (bolt icon, right of the bell): language, appearance, visible tabs (the Dashboard always is), editor to open code in (JetBrains, VS Code, Cursor or GitHub), project path, guide on or off and its path. Everything except language and appearance (browser cookies) is written to `config.local.json`; N2 checks paths before saving and reloads its sources straight away, without restarting. Statistics is a discreet tab: always last on the right, invisible, absent from ⌘K and from keys 1 to 9. A hidden tab can still be found in ⌘K; keys 1 to 9 follow the visible tabs.

Full example: [`config.example.json`](config.example.json). Each option is detailed in the section of the part concerned below. Paths accept `~/`.

---

## Connecting each part

Summary:

| Part | Tool | Sign-in | Config |
|---|---|---|---|
| GitHub (PRs, statistics, libraries) | `gh` | `gh auth login` | `github` |
| Jira | `acli` | `acli jira auth login` | `jira` |
| Local project (map, libraries, my branch) | `git` | repository cloned locally | `libs`, `codemap` |
| Sentry | `sentry-cli` | `sentry-cli login` | `sentry` |
| AWS (CloudWatch, Deployments) | `aws` | SSO profile with a valid session | `aws`, `deploy` |
| Teams / Outlook calendar | — | ICS link or Microsoft Graph | `calendar` |
| Slack | internal Slack app | user token in the keychain (Linux, WSL: `SLACK_USER_TOKEN`) | `slack` |
| Team guide | — | local HTML file | `guide` |
| Quick links | — | — | `links` |

### GitHub

**Sign-in**: install [`gh`](https://cli.github.com) (`brew install gh`), then sign in with your work account:

```bash
gh auth login
```

N2 calls `gh` on each request: no token goes through N2.

**Config**:

```json
"github": { "repos": ["my-org/my-repo"], "recentDays": 14 }
```

| Option | Purpose |
|---|---|
| `repos` | followed repositories (`owner/name`) for PRs, statistics, activity and ⌘K links |
| `recentDays` | window, in days, for recent PRs and the Dashboard's GitHub · Jira threads |

### Jira

**Sign-in**: install the [Atlassian CLI](https://developer.atlassian.com/cloud/acli/) (`acli`), then:

```bash
acli jira auth login
```

**Config**:

```json
"jira": { "site": "my-company.atlassian.net", "projectKey": "ABC", "boardId": 1, "onlyMine": true }
```

| Option | Purpose |
|---|---|
| `site` | Jira domain (without `https://`); also the only Jira site N2 agrees to open |
| `projectKey` | project key (`ABC` in `ABC-123`): used to spot tickets mentioned in PRs and branches |
| `boardId` | board ID (in the board's URL: `…/boards/1`); N2 reads the active sprint from it |
| `onlyMine` | `true`: only my tickets in the Sprint tab; `false`: the whole sprint |

### Local project: Map, Libraries, My branch

N2 reads the repository cloned on your machine (files, `package.json`, `package-lock.json`, `git log`, branches). Nothing is written to that repository: picking a branch in N2 does **no checkout**.

**Config**:

```json
"libs": {
  "projectPath": "~/path/to/project",
  "packages": ["react", "zod"]
},
"codemap": {
  "projectPath": "~/path/to/project",
  "ide": "/Applications/PhpStorm.app/Contents/MacOS/phpstorm",
  "splitThreshold": 400,
  "categories": {},
  "descriptions": {}
}
```

| Option | Default | Purpose |
|---|---|---|
| `libs.projectPath` | — | project folder; must contain a `package-lock.json` |
| `libs.packages` | — | **critical** libraries, watched closely (default view of the Libraries tab, vulnerabilities shown in "To do") |
| `codemap.projectPath` | `libs.projectPath` | folder to map, if different |
| `codemap.ide` | PhpStorm | JetBrains IDE launcher, called with `--line N file` (e.g. `/Applications/WebStorm.app/Contents/MacOS/webstorm`; on Linux `~/.local/share/JetBrains/Toolbox/scripts/webstorm` or `/opt/WebStorm/bin/webstorm.sh`); can be set in Preferences |
| `codemap.splitThreshold` | `400` | above this number of files, a part is split by `src/` subfolder |
| `codemap.categories` | `{}` | fix a part's layer: `{ "apps/admin": "front" }` (`front`, `api`, `back`, `shared`, `infra`, `tooling`) |
| `codemap.descriptions` | `{}` | a part's description: `{ "apps/web/src/features": "Site screens and business logic" }` |

**My branch**: the tag next to the search box, in the top bar. By default, the branch the repository is on; a click opens a window with a search and three sections (current branch, local branches, remote branches); the **git fetch** button updates remote branches without ever asking for credentials. The **Filter** switch next to the tag (remembered in the browser) narrows Pull requests, Sprint, Map ("My branch" overlay), Deployments (the branch's environment and runs) and Guide (sections to reread) to that branch. The Dashboard always shows its "My branch" card, on the same branch as the tag.

Libraries also use the public npm registry (versions, release notes) and GitHub (vulnerabilities, update PRs). **Private npm scopes** declared in the project's `.npmrc` are never sent to the public registry.

### Sentry

**Sign-in**: install `sentry-cli` (`brew install getsentry/tools/sentry-cli`), then:

```bash
sentry-cli login
```

N2 reads the token from `~/.sentryclirc` at call time (or from the `SENTRY_AUTH_TOKEN` variable).

**Config**:

```json
"sentry": { "org": "my-org", "project": "my-project", "environment": "production", "preprodEnvironments": ["staging"] }
```

| Option | Purpose |
|---|---|
| `org` | Sentry organization slug |
| `project` | project slug |
| `environment` | optional: production environment. Observability and "To do" only show its errors (counts for that environment only); a picker in Observability shows another one, or all. Absent: all environments |
| `preprodEnvironments` | optional, with `environment`: pre-production environments (`staging`, `qa`…). **"Before production"** view: errors seen in these environments over the last 7 days and never in production, to check before approving a release; "To do" flags them |

For traces to be linked to the code (PhpStorm, map, guide), the local project must be configured too (`codemap` or `libs.projectPath`).

### AWS: CloudWatch, Deployments, session

**Sign-in**: install the `aws` CLI and a profile (SSO or other) with a valid session. The top bar shows the session's remaining time and turns into an alert when it expires; "To do" flags it too.

**Config**:

```json
"aws": {
  "profile": "my-profile",
  "region": "eu-west-1",
  "alarmPrefix": "",
  "hideAutoscaling": true,
  "reconnectHint": "Sign in to AWS again, then refresh",
  "reconnect": { "projectPath": "~/path/to/project", "script": "aws:login" }
},
"deploy": {
  "pipelinePrefix": "myproject-",
  "mainBranch": "main",
  "envUrl": "https://preview-{slug}.site.example/"
}
```

| Option | Default | Purpose |
|---|---|---|
| `aws.profile` | — | AWS profile used for every call |
| `aws.region` | — | region of the alarms and pipelines |
| `aws.alarmPrefix` | `""` | keep only alarms whose name starts with this prefix |
| `aws.hideAutoscaling` | `true` | hides autoscaling alarms (`false` to see them) |
| `aws.reconnectHint` | — | message shown when the session has expired |
| `aws.reconnect` | — | optional: a click on "AWS expired" runs `npm run <script>` in `projectPath` (the script opens the browser itself to sign in). One at a time, stopped after 5 minutes. |
| `deploy.pipelinePrefix` | — | **required for the Deployments tab**: prefix of the project's pipelines, named `<prefix><branch or ticket>-pipeline…` (e.g. `myproject-main-pipeline-…`, `myproject-abc-123-pipeline-…`) |
| `deploy.mainBranch` | `main` | branch deployed to production; also the reference for the guide's "Passages to review" |
| `deploy.envUrl` | — | optional: URL template for branch environments; `{slug}` is replaced by the branch's ticket (`abc-123`). Without it, no "Open" link to the environment, and N2 agrees to open none |

N2 only reads the `expiration` line of the AWS credentials file, to show the remaining time.

### Teams / Outlook calendar

Two ways to connect it in `calendar`, usable together: Graph is used once you are signed in, the ICS link otherwise.

```json
"calendar": {
  "icsUrl": "",
  "graph": { "tenantId": "my-company.onmicrosoft.com", "clientId": "00000000-0000-0000-0000-000000000000" }
}
```

**Option 1: ICS link (no admin needed)**

1. In Outlook on the web: Settings → Calendar → Shared calendars → **Publish a calendar**, with "Can view all details".
2. Copy the **ICS** link into `calendar.icsUrl`.

This link gives access to your calendar: it must never leave `config.local.json`. Outlook updates the published file with some delay.

**Option 2: Microsoft Graph (real time)**

1. Register an app in **Entra ID** (Azure AD) with the **delegated** permission `Calendars.Read`, and turn on "Allow public client flows" (Authentication tab).
2. Fill in `calendar.graph.tenantId` and `calendar.graph.clientId`, restart N2.
3. Click **Sign in to Microsoft** on the Dashboard, then enter the code shown on the Microsoft page.

Tokens are kept in `~/.config/n2/microsoft.json` (readable by you only), outside the project, and are never sent to the browser.

### Slack

1. On [api.slack.com/apps](https://api.slack.com/apps): **Create New App → From a manifest**, pick the workspace, paste [`slack-app-manifest.yml`](slack-app-manifest.yml). The app only asks for **read** permissions (channels, direct messages, search, names).
2. **Install to Workspace**. Depending on the workspace settings, an admin has to approve the app.
3. Copy the **User OAuth Token** (`xoxp-…`, *OAuth & Permissions* page) into the macOS keychain (on Linux and WSL, see below). The command asks for it without showing it or keeping it in the history:

   ```bash
   security add-generic-password -a "$USER" -s n2-slack -w
   ```

   To replace it: the same command with `-U`. Failing that, N2 reads the `SLACK_USER_TOKEN` environment variable.

   **Linux, WSL**: no keychain, only `SLACK_USER_TOKEN` counts. With autostart, put it in `~/.config/n2/env`, readable by you only: create the file, then add the line `SLACK_USER_TOKEN=xoxp-…` in your editor,

   ```bash
   mkdir -p ~/.config/n2 && touch ~/.config/n2/env && chmod 600 ~/.config/n2/env && ${EDITOR:-nano} ~/.config/n2/env
   ```

   then restart the service:

   ```bash
   systemctl --user restart n2-dashboard
   ```

   Without the service: `export SLACK_USER_TOKEN=…` in the terminal, before `bun run dev`.
4. In `config.local.json`:

   ```json
   "slack": { "channels": ["dev-front", "releases"], "messages": 5 }
   ```

| Option | Default | Purpose |
|---|---|---|
| `channels` | `[]` | followed channels, by name (without `#`) or ID (`C0123ABCD`); 8 at most |
| `messages` | `5` | number of messages shown per channel (1 to 20) |

Mentions and direct messages work without any channel: `"slack": {}`.

### Team guide

A team guide in HTML (a compiled application, in the format supported by `src/features/guide/parse.ts`), shown in N2 and linked to the code.

```json
"guide": {
  "path": "~/Documents/guide.html",
  "name": "My project guide",
  "links": {
    "deploy": ["guide/page-b/section-1"],
    "observability": ["guide/page-a/section-1"],
    "prs": ["guide/page-c/section-1"]
  }
}
```

| Option | Default | Purpose |
|---|---|---|
| `path` | — | path of the HTML file |
| `name` | "Team guide" | displayed name (⌘K search, passages to review) |
| `links` | none | sections offered at the top of the Deployments, Observability and Pull requests tabs, by address in the guide (`page/anchor`, as in the Guide tab); their titles are read from the guide, an address that no longer exists is ignored |

To move to a new version of the guide, replace the file: N2 reloads it as soon as it changes, without restarting.

- **Guide tab**: the guide opens directly at the requested section. The other tabs lead to it:
  - Deployments, Observability and Pull requests: "In the guide" links to the sections picked in `guide.links`;
  - a Sentry error's trace, impact analysis and Map parts: sections that quote those files;
  - "My branch": "Reread in the guide", the sections about the changed files.
- **⌘K** also searches the guide's sections and glossary.
- **Passages to review**: compares the quoted code between the guide's revision commit (in its footer) and `origin/<deploy.mainBranch>`. A quote with line numbers is "changed" if those lines changed; a file quoted as a whole is only flagged if it was moved or deleted. The revision commit must be in the local repository (`git fetch`). A ready-to-copy list is prepared for the guide's author.
- **Isolation**: the guide contains JS written by someone else. N2 serves it in a sandbox (CSP `sandbox` without `allow-same-origin`, `connect-src 'none'`): it can neither call N2, nor read its cookies, nor make any network call. On the server side, N2 reads its data without ever running its JS.

### Quick links (⌘K)

Out of the box, ⌘K already offers the GitHub repositories (code, open PRs, actions), the Jira board and backlog, the Sentry project, CloudWatch alarms, dashboards and logs, CodePipeline, the production pipeline and dynamic environments.

To add your own links (production, staging, back office…):

```json
"links": [
  { "label": "Back office", "url": "https://bo.site.example/", "group": "Prod", "keywords": "admin bo" }
]
```

| Field | Purpose |
|---|---|
| `label` | displayed text |
| `url` | `https` links only; N2 then agrees to open that exact site in Chrome (not its subdomains) |
| `group` | section in ⌘K ("Links" by default), searchable |
| `keywords` | extra search keywords ("prod bo") |

### What works without extra configuration

- **GitHub · Jira** (Dashboard): threads where others wrote since your last message, over `github.recentDays` days. A thread disappears as soon as you reply.
  - *Mention*: `@login` on GitHub, Jira mention;
  - *On your PR / your ticket*: a comment on a PR you authored or are assigned to, or on a ticket assigned to you or created by you;
  - *Reply*: a new message in someone else's thread where you had written.

  Bots are ignored; GitHub's notification inbox is not used.
- **Statistics**: with `gh` and `sentry-cli`.
  - *Time to first review*: from "ready for review" (or opening) to the first review by someone else, counted in the week of that review;
  - *Open → merge*: from the same starting point to the merge, counted in the week of the merge, plus the number of merged PRs;
  - *Sentry errors* (events received) and *new issues* (Sentry does not count beyond 100).

  Median durations in working hours (weekends excluded), bot PRs excluded. Also: the slowest PRs to merge over the last two weeks, and a week-by-week table.

---

## Everyday features

**Snooze / ignore**: the clock on a "To do" item hides it for 1 hour, until the next working day at 9 am, or until it changes (new blocking reason, new error, new vulnerability; 30 days at most). Hidden items are listed at the bottom of the card. Choices are kept in the browser.

**Notifications**: the tab title shows the number of urgent items ("(3) N2") and tabs carry counters. The bell in the top bar turns on system notifications (through the browser): new urgent items, meeting in 5 minutes (click = join), Slack direct messages and mentions, GitHub · Jira news. Once per new item, nothing for what already existed when you turned it on. An N2 tab must stay open.

**Global search: ⌘K**: PRs, tickets, errors, parts, subfolders, libraries, files, guide sections and glossary, quick links. An external item opens in a **new Chrome tab**, a file in **the chosen editor** (Preferences) at the right line.

**Source status** (⌘K "Source status", or Preferences → Diagnostics): for each source since N2 started, the state of the last read, its duration, the last success, the number of reads and failures, and the last error; a source without a config section is "not configured", not failing. N2's log only records what matters: failures, reads longer than 5 s and the return to normal (`[n2] source=… ms échec=…`).

**AI agents (MCP)**: a Claude Code or Codex session, or any MCP client, can ask N2 what is waiting (`n2_status`: urgent items, CI, failing sources) and a branch's context (`n2_branch`: changed files, parts touched, PRs, CI, tickets). Read-only, through the running N2 and with your session token, like `bun run status`.

```bash
claude mcp add n2 -- bun /path/to/n2/scripts/mcp.ts
```

For Codex: the same command in the `mcp_servers` section of `~/.codex/config.toml`. What the agent receives comes from your work tools (PRs, alarms, errors): only connect it to an agent you already trust with this project.

**Appearance** (Preferences): a day theme (**Neon sign**, **Classic**, **Miami**) and a night theme (**Neon sign**, **Retrowave**, **Holo**, **Soft aubergine**), shown according to your system's light or dark setting, or always one of the two. Kept in a cookie, per browser, and applied before the first paint (no flash). The neon N2 logo flickers now and then and calls for help in Morse code; that can be turned off in the same place.

**Shortcuts**: keys **1 to 9** for tabs, **⌘K** for search. The refresh button reloads all data and shows the time of the last update.

**Language**: French by default, English as an option (picker in the top bar, kept in a cookie). All texts are in `messages/fr.json` and `messages/en.json`, see [Translations](#translations).

---

## Autostart (optional)

```bash
sh scripts/autostart.sh install
```

N2 starts with your session and restarts if it crashes: a LaunchAgent on macOS, a systemd user service on Linux (`~/.config/systemd/user/n2-dashboard.service`, secret variables in `~/.config/n2/env`). The unlock cookie lasts a year: no need to run `bun run open` again after a restart.

The service runs N2 in **production mode** (`scripts/service.sh` → `bun run start`: a build in a few seconds, then the production server). Nothing hot-reloads: after updating N2's code (`git pull`, merge…), restart the service, which rebuilds:

```bash
launchctl kickstart -k gui/$(id -u)/local.n2.dashboard
```

On Linux: `systemctl --user restart n2-dashboard`. To work on N2 itself, stop the service and run `bun run dev` (hot reload).

**Log (macOS)**: `~/Library/Logs/n2.log`. At startup, if it is over 5 MB, it becomes `n2.log.1` (a single old log is kept). On Linux, journald takes care of it.

After an N2 update that changes this startup (like the move to production mode), reinstall the service: `sh scripts/autostart.sh install`.

On Linux, the service starts when you log in; to start it with the machine, without an open session: `loginctl enable-linger`. On **WSL**, nothing is installed: the distribution stops when no terminal uses it anymore, and the script explains how to start N2 by hand (or force the systemd service if systemd is on in WSL: `N2_FORCE_SYSTEMD=1`).

```bash
sh scripts/autostart.sh status
```

Service state and log (`~/Library/Logs/n2.log` on macOS, `journalctl --user -u n2-dashboard` on Linux).

```bash
sh scripts/autostart.sh uninstall
```

---

## Commands

| Command | Purpose |
|---|---|
| `bun run setup` | anti-secret hooks, `config.local.json`, translations, Panda styles |
| `bun run dev` | development server (hot reload) |
| `bun run demo` | N2 with made-up data (port 4848), no config or account: to try it, show it or test it |
| `bun run open` | opens N2 in Chrome and unlocks it for that browser; `--reset`: new token, signs out every browser |
| `bun run status` | N2's state in one line (urgent items, CI of the main branch and of your branch, failing sources); `--json`: the versioned JSON from `/api/status` (`schemaVersion`), for a menu bar or a script |
| `bun run mcp` | N2's MCP server (stdio), to declare in Claude Code or Codex; see [Everyday features](#everyday-features) |
| `bun run build` | production build |
| `bun run start` | build, then production server (used by autostart) |
| `bun run test` | tests (Vitest): safeguards, map, impact, "To do", calendar, Slack, deployments, guide, search… |
| `bun run test:e2e` | browser tests (Playwright, N2 in demo mode): every tab without errors, lock, accessibility. Locally with the installed Google Chrome; run it from a different copy than the one served by autostart |
| `bun run typecheck` | TypeScript check |
| `bun run codegen` | regenerates the Panda styles (`styled-system/`) |
| `bun run i18n` | compiles `messages/*.json` into typed functions (`src/paraglide/`); `dev`, `test` and `typecheck` already do it |
| `bun run lint` | Biome linter (rules in `biome.jsonc`); also at commit time on staged files, and in CI |
| `bun run check:secrets` | scans every file tracked by git |
| `bun run check:server` | checks the protections of the running server (development or production) |
| `bun run autostart` | shortcut to `scripts/autostart.sh` |

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `config.local.json introuvable` (not found) | run `bun run setup`, then fill in the file |
| "N2 is locked" | run `bun run open` (the cookie expired, was cleared, or this is another browser) |
| A config change is not taken into account | restart the server (the config is read only once) |
| An update to N2's code does not show | with autostart, N2 runs in production: restart the service (see [Autostart](#autostart-optional)) |
| "`gh` is not installed" (or `acli`, `aws`…) | install the tool; if it is, check it is in the server's `PATH` (especially with autostart) |
| Jira, GitHub or Sentry card with an authentication error | sign in to the CLI again (`gh auth login`, `acli jira auth login`, `sentry-cli login`) |
| "AWS session expired" | sign in to the AWS profile again, or click "AWS expired" if `aws.reconnect` is configured |
| "Deployments not configured" | add `deploy.pipelinePrefix` to `config.local.json` |
| "No main pipeline found" | check `deploy.pipelinePrefix` and `deploy.mainBranch` |
| `package-lock.json introuvable` (not found) | check `libs.projectPath` |
| "IDE not found" | check `codemap.ide` (on Linux, the default launcher is JetBrains Toolbox's PhpStorm script) |
| "No Slack token found" | add the token to the keychain (service `n2-slack`); on Linux and WSL, set `SLACK_USER_TOKEN` |
| Linux: a link does not open | install `xdg-utils` (`xdg-open`) or Google Chrome |
| WSL: `http://n2.localhost:4747` does not answer in Windows | check that WSL2's `localhost` forwarding is on (`.wslconfig`) and that `bun run dev` runs in WSL |
| "Passages to review" empty or failing | `git fetch` in the project, to get the guide's revision commit |
| A card stays in error, with no idea why or since when | ⌘K "Source status": last error, last success, number of failures; and the log (`sh scripts/autostart.sh status`) |
| No notification | turn on the bell, allow the browser in the system's notification settings, keep an N2 tab open |

---

## Security: nothing sensitive in git, nothing exposed

- **No token in the project**: N2 goes through the CLIs you are already signed in to. The Sentry token and the AWS expiration are read at call time. For AWS, only the `expiration` line of the credentials file is read. Microsoft tokens (calendar) are in `~/.config/n2/microsoft.json`, the Slack token in the macOS keychain (Linux, WSL: the `SLACK_USER_TOKEN` variable, or `~/.config/n2/env` with mode 600 with the service); neither is sent to the browser.
- **Everything specific to your work account** is in `config.local.json`, **ignored by git** and readable by you only (600: `bun run setup` creates it that way, `bun run check:server` checks it; it may contain the calendar's ICS link). Only `config.example.json` is versioned.
- **Safeguards at commit time** (`.githooks/pre-commit`, turned on by `bun run setup`) and in CI: the in-house script (`scripts/check-secrets.sh`: secrets; plus the work email and the names of the work project and company, listed outside the repository, one regex per line, in `~/.config/n2/forbidden-words` (600) and in the GitHub secret `N2_FORBIDDEN_WORDS` for CI), then **gitleaks** if it is installed (`brew install gitleaks`).
- **Locked local server**:
  - it only listens on `127.0.0.1`;
  - requests addressed to any host name other than `n2.localhost`, `127.0.0.1` or `localhost` are refused (against DNS rebinding); a page opened on `127.0.0.1` is redirected to `n2.localhost`;
  - **every request must carry the session cookie** of the person who started N2 (`src/server/session.ts`): pages, server functions, but also source files, Vite's client and its hot-reload WebSocket. Without it, N2 shows "N2 is locked";
  - server functions require a request coming from N2 itself (TanStack Start's CSRF middleware);
  - Vite refuses to serve `config.local.json`, `.env`, keys and the `.git` folder (`vite.config.ts`).

  The lock is enforced by Vite's server (`vite.config.ts`) and by TanStack Start's middlewares (`src/start.ts`, for a production build). `bun run check:server` checks all of this on the running server.

### Who can open N2?

| Who | Access | Why |
|---|---|---|
| You, in your unlocked browser | ✅ | session cookie (`HttpOnly`, `SameSite=Strict`, one year) |
| A colleague on the same network (Wi-Fi, VPN) | ❌ | N2 only listens on `127.0.0.1`: from the network, the connection is refused (checked with the Mac's network address) |
| A website open in your browser | ❌ | host name checked (against DNS rebinding), `SameSite=Strict` cookie, CSRF on server functions |
| Another macOS account on your Mac | ❌ | `127.0.0.1` is shared by every account on the Mac, but it does not have the cookie, and the token (`~/.config/n2/session`, 600) is readable by you only |
| A program you run | ⚠️ | it can read your files, hence the token, just as it can already read your `gh`, `aws`… sessions. The lock does not protect against this, and no local tool can |

**What is `127.0.0.1`?** The "this machine" address (loopback interface). It never goes out on the network, and macOS refuses a packet from the network aimed at it. When a colleague types `http://127.0.0.1:4747`, they land **on their own machine**, not yours.

**Two people with N2 on the same port, on the same network?** No problem: each one has their own N2 on their own machine, on port 4747, and each sees their own account (their own `gh`, `acli`, `aws`… CLIs and config). No conflict, no crossover possible.

**Two macOS accounts on the same Mac?** Only one N2 can listen on a given port (`strictPort`). The second one has to use another port (`N2_PORT=4748`). Each has their own token in their home folder: one cannot open the other's N2.

**The token** is created at first start in `~/.config/n2/session` (folder 700, file 600). `bun run open` never puts this token in a URL: it writes a **one-time code** (`~/.config/n2/login`, 600, valid for 2 minutes), which N2 checks, deletes, then exchanges for the cookie. The address is passed to Chrome through AppleScript, without showing up in the process list. To change the token and sign out every browser: `bun run open --reset` (effective immediately, without restarting N2).

> Cookies ignore the port: a cookie set for `127.0.0.1` is sent to **every** server on `127.0.0.1`, whatever its port. That is why N2 opens as `n2.localhost`: its cookie is only sent to that name, not to other local servers (opened as `localhost` or `127.0.0.1`), and the old `127.0.0.1` cookie is erased on redirect. One case remains: another server on your machine that you would yourself open as `http://n2.localhost:<other port>`. When in doubt, `bun run open --reset` makes the old cookie useless.

- **Openings controlled on the server**: Chrome only opens GitHub, the configured Jira site, Sentry, the AWS console, npm, Teams, Outlook, the Microsoft sign-in page, Slack, dynamic environments (`deploy.envUrl`), quick links from the config (exact site) and documentation links read from the npm registry. The editor (JetBrains, VS Code, Cursor, GitHub) only opens files of the mapped project.
- **Preferences written to `config.local.json`**: only tabs, editor, project path, JetBrains launcher and guide can be changed from the page, and every changed path is checked on the server (project: absolute path of a git repository; launcher: executable inside `…/Applications/<IDE>.app/Contents/MacOS/`; guide: `.html` file). A compromised page can therefore neither launch an arbitrary program nor have a non-HTML file served.
- **Commands run**: only those planned by the code or the config (`aws.reconnect`); the browser never sends a command. `git fetch` never asks for credentials.
- **Private npm scopes** (declared in the project's `.npmrc`): their name is never sent to the public registry.
- **Work project code**: the map analysis and code excerpts are computed on demand, **in memory only**. Nothing is written to the N2 repository.

---

## Architecture

The main decisions (and their reasons) are in [`docs/adr/`](docs/adr/README.md) (in French).

```
src/
  server/                    server-only code (never sent to the browser)
    fns.ts                   server functions called by the UI (createServerFn + zod validation)
    config.ts                reads config.local.json
    run.ts                   runs the CLIs (gh, acli, aws, git…), HTTP calls with timeout (httpFetch), cache
    open.ts                  opens in Chrome / the IDE, with the list of allowed sites
    types.ts                 types shared with the UI, grouped by source in types/
    sources/                 one source = pure functions:
                               github, jira, libs, sentry, cloudwatch, aws-session, aws-reconnect,
                               calendar + microsoft-auth (calendar), slack, activity (GitHub · Jira),
                               stats, deploy (CodePipeline), branches, guide,
                               codemap (map, impact, hot spots, my branch, traces),
                               codemap-detect (layers, imports, READMEs), lib-details (a library's card)
  start.ts                   security middlewares (host + CSRF)
  routes/                    one file per tab (TanStack Router)
  components/                top bar, ⌘K search, links
    ds/                      design system: buttons, badges, cards, lists, controls, menus and dialogs
                             (Panda + Ark UI); gallery in the hidden /design-system tab (⌘K "Design system")
  features/                  UI logic, per part: todo ("To do" and snoozes), calendar, slack,
                             activity, notify, badges (counters), search, branches, map, libs, deploy,
                             guide, prs, stats, links, theme; map/panel/: the map panel's views
  lib/                       data (TanStack Query), actions (Chrome, PhpStorm), formats, language (i18n.ts)
  paraglide/                 generated by Paraglide from messages/ (not versioned)
  styles/                    app.css (Panda), map.css (map), themes.ts (what each theme changes)
messages/                    UI texts: fr.json (reference) and en.json
project.inlang/              Paraglide settings (languages, message file format)
tests/                       Vitest, on a fake monorepo created on the fly (no work code)
scripts/                     autostart, service (run by autostart), check-secrets, check-server, i18n
.github/workflows/ci.yml     GitHub Actions CI on every push (Linux): secrets, typecheck, tests
```

**Styles**: colors, shadows and text styles (`textStyle`: `title`, `heading`, `body`, `caption`, `overline`, `label`) are in `panda.config.ts`. A recurring pattern (button, badge, menu, dialog…) goes through `src/components/ds`; a `css()` in a tab is only for its layout. To override a recipe property, merge: `css(button.raw({ variant: "link" }), { … })` (with `cx`, two classes on the same property: the stylesheet order decides).

### Translations

Texts are in **`messages/fr.json`** (reference) and **`messages/en.json`**, one key per text. [Paraglide JS](https://paraglidejs.com) compiles them into typed functions in `src/paraglide/`: a forgotten key or parameter is a TypeScript error.

```json
// messages/en.json
"prs_review_required": "Review required",
"topbar_last_updated_at": "Last updated at {lastUpdate}",
"sprint_left": [{ "declarations": ["input count", "local countPlural = count: plural"], "selectors": ["countPlural"],
                  "match": { "countPlural=one": "{count} day left", "countPlural=other": "{count} days left" } }]
```

```tsx
import { m } from "~/lib/i18n";
m.prs_review_required();
m.topbar_last_updated_at({ lastUpdate: "10:42" });
m.sprint_left({ count: 3 });
```

- **Keys** in `snake_case`, prefixed by their part: `dashboard_`, `prs_`, `map_`, `libs_`, `topbar_`, `ds_`…; `common_` for a shared text, `srv_` for server messages.
- **Literal braces**: `\\{` and `\\}` in the JSON (`{name}` is a parameter).
- **Server messages**: the server writes no sentence. It returns `{ key: "srv_…", params }` (`msg()` in `src/server/messages.ts`), and the UI displays it with `msg()` from `src/lib/i18n.ts`. Parameters go through `redact()` before leaving for the browser.
- **Language**: Paraglide's `getLocale()` is wired to the `n2-lang` cookie (`src/lib/i18n.ts`), on the server as in the browser: the page arrives in the right language straight away.
- **Format plugin**: `@inlang/plugin-message-format` is installed with npm and referenced by local path in `project.inlang/settings.json`, so compiling downloads nothing.
- `tests/i18n.test.ts` checks that both files have the same keys and parameters, that every key is used and that no hard-coded text is left.

**Adding a source**: a pure function in `src/server/sources/`, a server function in `fns.ts`, a hook in `src/lib/data.ts`, then the display in `routes/` or `features/`. If it needs options, declare them in the `Config` interface (`src/server/config.ts`) and in `config.example.json`.

> In `src/server/fns.ts`, all server code must stay **inside** `.handler(...)`. That is what lets the TanStack Start compiler strip it from the code sent to the browser.

---

## Project map: how it's computed

- **Parts**: each folder with its own `package.json`. Those with more than `codemap.splitThreshold` files (400 by default) are split by `src/` subfolder.
- **Links**: imports resolved through relative paths, the aliases of `tsconfig.json` / `tsconfig.base.json` (`~/…`) and the `exports` field of `package.json` files.
- **Layer** of a file, deduced from its imports:
  - Infra: `aws-cdk-lib`;
  - Tooling: CLI, `scripts/`;
  - API: `@trpc/server`, OpenAPI, `api/` folders;
  - Back: `node:*`, sessions, cache, `server/`;
  - Front: `react`, `@mui/*`, `.tsx`.

  A part's layer is the one of most of its files. To fix a classification: `codemap.categories`.
- **Descriptions**: `codemap.descriptions`, otherwise the `package.json`'s `description`, otherwise the README's first paragraph.
- **Impact**: every file that depends on a file, directly or transitively, per part.
- **Hot spots**: files that are both heavily imported and often changed (`git log` over 30 days).
- **My branch**: files changed since the base (`origin/HEAD`), committed or not, for the branch picked in the selector.
- **Navigation**:
  - hover = the part's links; ⌘ + scroll wheel (or pinch) = zoom; drag the background = pan;
  - layer strip: click = filter, hover = cascading menu;
  - tags: selection history, and closing the active tag goes back to the previous one.

---

## License

[MIT](LICENSE): free to use, modify and redistribute N2, as long as the copyright notice is kept.
