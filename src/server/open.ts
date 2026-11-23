import { execFile, spawn } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { relative } from "node:path";
import { expandHome, type Config } from "./config.ts";
import { deployConfig } from "./sources/deploy.ts";
import { customLinks } from "../features/links/logic.ts";
import { defaultJetbrains, editorFileUrl, githubFileUrl } from "../features/prefs/logic.ts";
import { browserCommand, currentPlatform, handlerCommand, type Command } from "./platform.ts";
import { projectRoot } from "./sources/codemap.ts";
import { run } from "./run.ts";
import { msg } from "./messages.ts";
import { MessageError } from "./run.ts";

// Ouvre un lien dans un nouvel onglet de Google Chrome (fenêtre déjà ouverte ; Chrome est lancé s'il ne l'est pas),
// ou dans le navigateur par défaut sous Linux sans Chrome et sous WSL (voir platform.ts).
// Seuls les sites attendus sont autorisés : la page ne peut pas faire lancer n'importe quoi.
export function allowedHosts(cfg: Config): ((host: string) => boolean)[] {
  const exact = new Set(["github.com", "www.npmjs.com", "sentry.io", cfg.jira.site]);
  // liens rapides ajoutés dans la config (prod, staging, back-office…) : leur site exact, pas ses voisins
  const custom = new Set(customLinks(cfg).map((l) => new URL(l.url).hostname));
  // agenda : rejoindre une réunion Teams, ouvrir Outlook, page de connexion Microsoft (code d'appareil)
  const microsoft = new Set(["teams.microsoft.com", "teams.live.com", "outlook.office.com", "outlook.office365.com", "microsoft.com", "login.microsoft.com"]);
  return [
    (h) => microsoft.has(h),
    // environnements dynamiques : le modèle d'URL de la config, {slug} = un ticket ou un nom de branche
    (h) => envHost(cfg).test(h),
    // liens vers les messages Slack (https://mon-espace.slack.com/archives/…)
    (h) => h === "app.slack.com" || h.endsWith(".slack.com"),
    (h) => exact.has(h),
    (h) => custom.has(h),
    (h) => h.endsWith(".sentry.io"),
    (h) => h === "console.aws.amazon.com" || h.endsWith(".console.aws.amazon.com"),
  ];
}

function envHost(cfg: Config): RegExp {
  const envUrl = deployConfig(cfg).envUrl;
  if (!envUrl) return /^$/;
  let host = "";
  try {
    host = new URL(envUrl.replace("{slug}", "n2slugplaceholder")).hostname;
  } catch {
    return /^$/;
  }
  const escaped = host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace("n2slugplaceholder", "[a-z0-9-]{1,40}");
  return new RegExp(`^${escaped}$`);
}

// Liens de documentation des librairies : autorisés uniquement s'ils viennent du registre npm
// (ajoutés par la carte du code au moment où N2 les a lus), jamais une URL quelconque envoyée par la page.
const knownDocUrls = new Set<string>();
export const registerDocUrl = (url: string) => knownDocUrls.add(url);

export function isAllowedUrl(cfg: Config, raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length > 2048) return false;
  if (knownDocUrls.has(raw)) return true;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return url.protocol === "https:" && allowedHosts(cfg).some((ok) => ok(url.hostname));
}

// Ouvre un fichier du projet à la bonne ligne, là où les préférences le demandent (ui.editor) :
//  - JetBrains (défaut) : le lanceur (codemap.ide, PhpStorm par défaut) transmet la demande à l'IDE déjà ouvert ;
//    s'il ne l'est pas, il le démarre (d'où le processus détaché : N2 n'attend pas la fermeture de l'IDE) ;
//  - VS Code, Cursor : leur adresse vscode://file/… ou cursor://file/…, passée au système (`open`, `xdg-open`, rundll32 sous WSL ;
//    sous WSL l'adresse vise le dépôt dans WSL : vscode://vscode-remote/wsl+<distribution>/…) ;
//  - GitHub : le fichier sur github.com, dans Chrome (branche actuelle si elle est poussée, sinon la branche principale).
// `path` est un chemin absolu déjà vérifié (resolveProjectFile).
export const DEFAULT_IDE = expandHome(defaultJetbrains(currentPlatform()));

export async function openInIde(cfg: Config, path: string, line: number): Promise<void> {
  const editor = cfg.ui?.editor ?? "jetbrains";
  if (editor === "vscode" || editor === "cursor") {
    const wsl = currentPlatform() === "wsl" ? process.env.WSL_DISTRO_NAME : undefined;
    try {
      return await launch(handlerCommand(currentPlatform(), editorFileUrl(editor, path, line, wsl)));
    } catch {
      throw new MessageError(msg("srv_editor_not_opened"));
    }
  }
  if (editor === "github") return openInChrome(await githubUrl(cfg, path, line));
  const ide = cfg.codemap?.ide ?? DEFAULT_IDE;
  if (!existsSync(ide)) throw new MessageError(msg("srv_ide_not_found", { path: ide }));
  spawn(ide, ["--line", String(line), path], { detached: true, stdio: "ignore" }).unref();
}

async function githubUrl(cfg: Config, path: string, line: number): Promise<string> {
  const repo = cfg.github.repos[0];
  if (!repo) throw new MessageError(msg("srv_github_repo_missing"));
  const root = realpathSync(projectRoot(cfg));
  const git = (...args: string[]) => run("git", ["-C", root, ...args], 10_000).then((o) => o.trim());
  const branch = await git("rev-parse", "--abbrev-ref", "HEAD").catch(() => "");
  // la branche n'existe sur GitHub que si elle a été poussée : sinon, la branche principale
  const pushed = branch && branch !== "HEAD" && (await git("rev-parse", "--verify", "--quiet", `refs/remotes/origin/${branch}`).then(() => true, () => false));
  return githubFileUrl(repo, pushed ? branch : deployConfig(cfg).mainBranch, relative(root, path), line);
}

export async function openInChrome(url: string): Promise<void> {
  return launch(browserCommand(currentPlatform(), url));
}

// macOS : `open` rend la main tout de suite, son code de sortie dit si l'ouverture a marché (comportement d'origine).
// Ailleurs, la commande peut rester en vie (google-chrome lancé pour la première fois) : processus détaché,
// N2 n'attend que son démarrage (une commande introuvable échoue tout de suite).
function launch({ cmd, args }: Command): Promise<void> {
  return new Promise((resolve, reject) => {
    if (currentPlatform() === "mac") return void execFile(cmd, args, (err) => (err ? reject(err) : resolve()));
    const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}
