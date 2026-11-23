// Système sur lequel tourne N2, et commandes qui en dépendent (ouvrir un lien, une adresse vscode://…).
//  - mac : `open` (comportement d'origine) ;
//  - linux : Google Chrome s'il est installé, sinon `xdg-open` (navigateur par défaut) ;
//  - wsl : Linux dans Windows (WSL2) ; le navigateur est celui de Windows, lancé par `rundll32.exe url.dll,FileProtocolHandler`.
//    Ni `cmd.exe /c start` ni `wslview` : l'adresse y passe par un interpréteur (cmd, PowerShell) où `&`, `^` ou `$`
//    d'une adresse pourraient lancer autre chose ; rundll32 reçoit l'adresse telle quelle ;
//  - other : Windows sans WSL, non pris en charge (on tente `xdg-open`, qui échouera proprement).
// Tout est injectable (système, variables d'environnement, présence d'une commande) pour les tests.
import { existsSync } from "node:fs";
import { release } from "node:os";
import { delimiter, join } from "node:path";

export type Platform = "mac" | "linux" | "wsl" | "other";

export interface PlatformInput {
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
  /** version du noyau (os.release()) : « …-microsoft-standard-WSL2 » sous WSL */
  release: string;
}

export function detectPlatform(input: PlatformInput = { platform: process.platform, env: process.env, release: release() }): Platform {
  if (input.platform === "darwin") return "mac";
  if (input.platform !== "linux") return "other";
  return input.env.WSL_DISTRO_NAME || input.env.WSL_INTEROP || /microsoft/i.test(input.release) ? "wsl" : "linux";
}

let current: Platform | undefined;
/** Système courant (calculé une fois) */
export const currentPlatform = (): Platform => (current ??= detectPlatform());

/** Vrai si `cmd` est un exécutable trouvé dans le PATH */
export function onPath(cmd: string, env: Record<string, string | undefined> = process.env, exists: (p: string) => boolean = existsSync): boolean {
  return (env.PATH ?? "").split(delimiter).some((dir) => dir && exists(join(dir, cmd)));
}

export interface Command {
  cmd: string;
  args: string[];
}

export interface CommandDeps {
  /** une commande est-elle disponible ? (PATH) */
  has: (cmd: string) => boolean;
  /** un fichier existe-t-il ? */
  exists: (path: string) => boolean;
}

const defaultDeps: CommandDeps = { has: (c) => onPath(c), exists: existsSync };

/** rundll32 de Windows vu depuis WSL : chemin absolu s'il est monté, sinon par le PATH (Windows l'y ajoute par défaut) */
const WSL_RUNDLL = "/mnt/c/Windows/System32/rundll32.exe";
// L'interopérabilité WSL reconstruit une ligne de commande Windows : on n'y passe que l'adresse normalisée (espaces,
// guillemets… encodés en %xx) et on refuse tout ce qui pourrait encore la couper ou changer ce que reçoit ShellExecute.
export function wslSafeUrl(url: string): string {
  const href = new URL(url).href;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: refuser les caractères de contrôle dans une adresse est le but de ce test
  if (/[\s"<>^`|]|[\u0000-\u001f\u007f]/.test(href)) throw new Error("Adresse refusée");
  return href;
}
const wslOpen = (url: string, deps: CommandDeps): Command => ({ cmd: deps.exists(WSL_RUNDLL) ? WSL_RUNDLL : "rundll32.exe", args: ["url.dll,FileProtocolHandler", wslSafeUrl(url)] });

/** Commande qui ouvre un lien web dans Chrome (macOS, Linux) ou dans le navigateur par défaut */
export function browserCommand(platform: Platform, url: string, deps: CommandDeps = defaultDeps): Command {
  switch (platform) {
    case "mac":
      // `open -a` passe l'URL au Chrome déjà lancé, qui l'ouvre dans un onglet de sa fenêtre active
      return { cmd: "open", args: ["-a", "Google Chrome", url] };
    case "linux": {
      const chrome = ["google-chrome", "google-chrome-stable"].find((c) => deps.has(c));
      return chrome ? { cmd: chrome, args: [url] } : { cmd: "xdg-open", args: [url] };
    }
    case "wsl":
      return wslOpen(url, deps);
    default:
      return { cmd: "xdg-open", args: [url] };
  }
}

/** Commande qui passe une adresse (vscode://, cursor://…) à l'application qui la gère */
export function handlerCommand(platform: Platform, url: string, deps: CommandDeps = defaultDeps): Command {
  if (platform === "mac") return { cmd: "open", args: [url] };
  if (platform === "wsl") return wslOpen(url, deps);
  return { cmd: "xdg-open", args: [url] };
}
