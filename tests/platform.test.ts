// Système (macOS, Linux, WSL) et commandes qui en dépendent : ouvrir un lien, une adresse vscode://, le token Slack.
import { describe, expect, it } from "vitest";
import { browserCommand, detectPlatform, handlerCommand, onPath, wslSafeUrl, type CommandDeps } from "../src/server/platform.ts";
import { slackToken } from "../src/server/sources/slack.ts";
import { SourceFailure } from "../src/server/run.ts";

describe("detectPlatform", () => {
  it.each([
    ["macOS", { platform: "darwin", env: {}, release: "25.6.0" }, "mac"],
    ["Linux", { platform: "linux", env: {}, release: "6.8.0-45-generic" }, "linux"],
    ["WSL2 (variable de la distribution)", { platform: "linux", env: { WSL_DISTRO_NAME: "Ubuntu" }, release: "6.8.0" }, "wsl"],
    ["WSL2 (noyau Microsoft)", { platform: "linux", env: {}, release: "5.15.167.4-microsoft-standard-WSL2" }, "wsl"],
    ["Windows sans WSL", { platform: "win32", env: {}, release: "10.0.26100" }, "other"],
  ] as const)("%s", (_l, input, expected) => expect(detectPlatform({ ...input, env: { ...input.env } })).toBe(expected));
});

describe("onPath", () => {
  it("cherche la commande dans chaque dossier du PATH", () => {
    const exists = (p: string) => p === "/usr/bin/xdg-open";
    expect(onPath("xdg-open", { PATH: "/usr/local/bin:/usr/bin" }, exists)).toBe(true);
    expect(onPath("google-chrome", { PATH: "/usr/local/bin:/usr/bin" }, exists)).toBe(false);
    expect(onPath("xdg-open", {}, exists)).toBe(false);
  });
});

const url = "https://github.com/org/depot/pull/1?a=1&b=2";
const deps = (cmds: string[] = [], files: string[] = []): CommandDeps => ({ has: (c) => cmds.includes(c), exists: (p) => files.includes(p) });

describe("browserCommand : ouvrir un lien web", () => {
  it("macOS : open -a Google Chrome (inchangé)", () => {
    expect(browserCommand("mac", url, deps())).toEqual({ cmd: "open", args: ["-a", "Google Chrome", url] });
  });

  it("Linux : Google Chrome s'il est installé, sinon xdg-open", () => {
    expect(browserCommand("linux", url, deps(["google-chrome"]))).toEqual({ cmd: "google-chrome", args: [url] });
    expect(browserCommand("linux", url, deps(["google-chrome-stable"]))).toEqual({ cmd: "google-chrome-stable", args: [url] });
    expect(browserCommand("linux", url, deps())).toEqual({ cmd: "xdg-open", args: [url] });
  });

  it("WSL : rundll32 de Windows, l'adresse en un seul argument (aucun interpréteur cmd ou PowerShell)", () => {
    expect(browserCommand("wsl", url, deps([], ["/mnt/c/Windows/System32/rundll32.exe"]))).toEqual({
      cmd: "/mnt/c/Windows/System32/rundll32.exe",
      args: ["url.dll,FileProtocolHandler", url],
    });
    // C: non monté là : celui du PATH (Windows l'y ajoute par défaut)
    expect(browserCommand("wsl", url, deps()).cmd).toBe("rundll32.exe");
    // même si Chrome est installé dans Linux, le navigateur est celui de Windows
    expect(browserCommand("wsl", url, deps(["google-chrome"])).cmd).toBe("rundll32.exe");
  });

  it("WSL : adresse normalisée, rien qui puisse couper la ligne de commande Windows", () => {
    // isAllowedUrl accepte une chaîne brute que new URL() sait lire : espaces et guillemets sont encodés avant de partir
    expect(browserCommand("wsl", 'https://github.com/x" "C:\\Windows\\calc.exe', deps()).args[1]).toBe("https://github.com/x%22%20%22C:/Windows/calc.exe");
    expect(wslSafeUrl("https://sentry.io/a b")).toBe("https://sentry.io/a%20b");
    expect(() => wslSafeUrl("https://github.com/?q=a|b")).toThrow();
    expect(() => wslSafeUrl("pas une adresse")).toThrow();
    // macOS et Linux ne passent par aucun interpréteur : l'adresse reste telle quelle
    expect(browserCommand("mac", "https://sentry.io/a b", deps()).args[2]).toBe("https://sentry.io/a b");
  });

  it("Windows sans WSL (non pris en charge) : xdg-open, qui échouera", () => {
    expect(browserCommand("other", url, deps()).cmd).toBe("xdg-open");
  });
});

describe("handlerCommand : adresse d'un éditeur (vscode://…)", () => {
  const editor = "vscode://file/home/moi/projet/a.ts:3";
  it("macOS : open ; Linux : xdg-open ; WSL : rundll32", () => {
    expect(handlerCommand("mac", editor, deps())).toEqual({ cmd: "open", args: [editor] });
    expect(handlerCommand("linux", editor, deps(["google-chrome"]))).toEqual({ cmd: "xdg-open", args: [editor] });
    expect(handlerCommand("wsl", editor, deps())).toEqual({ cmd: "rundll32.exe", args: ["url.dll,FileProtocolHandler", editor] });
  });
});

describe("slackToken", () => {
  const fail = async (p: Promise<unknown>) => {
    const e = await p.then(() => null, (err: unknown) => err);
    expect(e).toBeInstanceOf(SourceFailure);
    return (e as SourceFailure).detail;
  };

  it("SLACK_USER_TOKEN passe en premier, sur tous les systèmes", async () => {
    const exec = async () => "xoxp-trousseau";
    expect(await slackToken("mac", { SLACK_USER_TOKEN: "xoxp-env" }, exec)).toBe("xoxp-env");
    expect(await slackToken("linux", { SLACK_USER_TOKEN: "xoxp-env" }, exec)).toBe("xoxp-env");
  });

  it("macOS : trousseau (security), sinon conseil du trousseau", async () => {
    const calls: string[] = [];
    const exec = async (cmd: string) => (calls.push(cmd), "xoxp-trousseau\n");
    expect(await slackToken("mac", {}, exec)).toBe("xoxp-trousseau");
    expect(calls).toEqual(["security"]);
    expect((await fail(slackToken("mac", {}, async () => ""))).hint).toEqual({ key: "srv_hint_slack_keychain" });
  });

  it("Linux, WSL : pas de trousseau, conseil de la variable d'environnement", async () => {
    const calls: string[] = [];
    const exec = async (cmd: string) => (calls.push(cmd), "xoxp-trousseau");
    for (const p of ["linux", "wsl"] as const) {
      const detail = await fail(slackToken(p, {}, exec));
      expect(detail.kind).toBe("auth");
      expect(detail.hint).toEqual({ key: "srv_hint_slack_env" });
    }
    expect(calls).toEqual([]);
  });
});
