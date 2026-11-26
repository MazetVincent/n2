// Préférences de N2 : lecture et écriture dans la config, onglets affichés, adresses des éditeurs.
import { describe, expect, it } from "vitest";
import { applyPreferences, applySecret, CHOOSABLE_TABS, DEFAULT_JETBRAINS, defaultJetbrains, editorFileUrl, editorName, githubFileUrl, isJetbrainsLauncher, konamiMessage, readPreferences, readSecret, visibleTabs } from "../src/features/prefs/logic.ts";

const raw = {
  github: { repos: ["org/depot"] },
  libs: { projectPath: "~/Projet", packages: ["zod"] },
  guide: { path: "~/guide.html" },
  calendar: { icsUrl: "secret" },
};

describe("préférences", () => {
  it("valeurs par défaut : tous les onglets, JetBrains, guide actif s'il a un chemin", () => {
    const p = readPreferences(raw);
    expect(p).toEqual({
      tabs: [...CHOOSABLE_TABS],
      editor: "jetbrains",
      jetbrains: "/Applications/PhpStorm.app/Contents/MacOS/phpstorm",
      projectPath: "~/Projet",
      guide: { enabled: true, path: "~/guide.html", references: true, terms: true },
      remindPath: "~/.config/n2/remind.md",
      secret: { unlocked: false, guideTouched: false, statsFound: false },
    });
    expect(readPreferences({}).guide.enabled).toBe(false);
  });

  it("écrites sans toucher au reste de la config ; relues à l'identique", () => {
    const p = { ...readPreferences(raw), tabs: ["/carte", "/sprint", "/statistiques"] as never, editor: "cursor" as const, projectPath: "~/Autre", guide: { enabled: false, path: "~/guide.html", references: true, terms: false } };
    const out = applyPreferences(raw, p);
    expect(out.calendar).toEqual({ icsUrl: "secret" });
    expect(out.libs).toEqual({ projectPath: "~/Autre", packages: ["zod"] });
    expect(out.ui).toEqual({ tabs: ["/sprint", "/carte"], editor: "cursor" }); // ordre de la barre, Stats ignoré
    expect(out.guide).toEqual({ path: "~/guide.html", enabled: false, references: true, terms: false });
    expect(out.codemap).toBeUndefined(); // lanceur par défaut : rien d'écrit
    expect(raw.libs.projectPath).toBe("~/Projet"); // l'original n'est pas modifié
    expect(readPreferences(out)).toEqual({ ...p, tabs: ["/sprint", "/carte"] });
  });

  it("lecture du guide : réglages lus (allumés sauf si décochés), écrits avec le guide, gardés quand il n'a plus de chemin", () => {
    const read = (guide: unknown) => readPreferences({ ...raw, guide }).guide;
    expect(read({ path: "~/guide.html" })).toMatchObject({ references: true, terms: true });
    expect(read({ path: "~/guide.html", references: false, terms: "oui" })).toMatchObject({ references: false, terms: true });
    const p = readPreferences(raw);
    const on = applyPreferences(raw, { ...p, guide: { ...p.guide, references: false, terms: true } });
    expect(on.guide).toEqual({ path: "~/guide.html", enabled: true, references: false, terms: true });
    expect(readPreferences(on).guide).toMatchObject({ references: false, terms: true });
    const noPath = applyPreferences(on, { ...p, guide: { enabled: true, path: " ", references: true, terms: true } });
    expect(noPath.guide).toEqual({ path: "~/guide.html", enabled: false, references: true, terms: true });
  });

  it("le chemin du projet suit aussi codemap.projectPath s'il existe ; un autre lanceur JetBrains est retenu", () => {
    const out = applyPreferences({ ...raw, codemap: { projectPath: "~/Projet", splitThreshold: 400 } }, { ...readPreferences(raw), projectPath: "~/Autre", jetbrains: "/Applications/WebStorm.app/Contents/MacOS/webstorm" });
    expect(out.codemap).toEqual({ projectPath: "~/Autre", splitThreshold: 400, ide: "/Applications/WebStorm.app/Contents/MacOS/webstorm" });
    // les librairies peuvent pointer ailleurs (dossier avec package-lock.json) : non touchées
    expect(out.libs).toEqual(raw.libs);
    expect(editorName("jetbrains", "/Applications/WebStorm.app/Contents/MacOS/webstorm")).toBe("WebStorm");
    expect(editorName("vscode")).toBe("VS Code");
  });

  it("un chemin inchangé n'est pas réécrit ; lanceurs JetBrains acceptés", () => {
    const cfg = { ...raw, codemap: { ide: "~/Applications/PhpStorm.app/Contents/MacOS/phpstorm" } };
    expect(applyPreferences(cfg, { ...readPreferences(cfg), editor: "vscode" }).codemap).toEqual(cfg.codemap);
    expect(isJetbrainsLauncher("/Users/moi/Applications/WebStorm.app/Contents/MacOS/webstorm")).toBe(true);
    expect(isJetbrainsLauncher("/bin/sh")).toBe(false);
    expect(isJetbrainsLauncher("/Applications/../bin/x.app/Contents/MacOS/sh")).toBe(false);
  });

  it("Linux : lanceurs de JetBrains Toolbox et de /opt acceptés, rien d'autre", () => {
    expect(isJetbrainsLauncher("/home/moi/.local/share/JetBrains/Toolbox/scripts/phpstorm", "linux", "/home/moi")).toBe(true);
    expect(isJetbrainsLauncher("/home/moi/.local/share/JetBrains/Toolbox/scripts/idea-ce", "linux", "/home/moi")).toBe(true);
    expect(isJetbrainsLauncher("/opt/PhpStorm-2026.2/bin/phpstorm.sh", "linux", "/home/moi")).toBe(true);
    expect(isJetbrainsLauncher("/opt/pycharm/bin/pycharm.sh", "linux", "/home/moi")).toBe(true);
    // autre script du même dossier, autre programme, chemins détournés
    expect(isJetbrainsLauncher("/home/moi/.local/share/JetBrains/Toolbox/scripts/sh", "linux", "/home/moi")).toBe(false);
    expect(isJetbrainsLauncher("/home/moi/.local/share/JetBrains/Toolbox/scripts/phpstorm;rm", "linux", "/home/moi")).toBe(false);
    expect(isJetbrainsLauncher("/opt/PhpStorm/bin/fsnotifier", "linux", "/home/moi")).toBe(false);
    expect(isJetbrainsLauncher("/opt/PhpStorm/lib/phpstorm.sh", "linux", "/home/moi")).toBe(false);
    expect(isJetbrainsLauncher("/opt/../tmp/bin/phpstorm.sh", "linux", "/home/moi")).toBe(false);
    expect(isJetbrainsLauncher("/tmp/.local/share/JetBrains/Toolbox/scripts/phpstorm", "linux", "/home/moi")).toBe(false);
    expect(isJetbrainsLauncher("~/.local/share/JetBrains/Toolbox/scripts/phpstorm", "linux", "/home/moi")).toBe(false); // chemin absolu seulement
    // Toolbox dans le dossier personnel réel (/var/home sous Silverblue, /root), pas celui d'un autre compte
    expect(isJetbrainsLauncher("/var/home/moi/.local/share/JetBrains/Toolbox/scripts/goland", "linux", "/var/home/moi")).toBe(true);
    expect(isJetbrainsLauncher("/home/autre/.local/share/JetBrains/Toolbox/scripts/phpstorm", "linux", "/home/moi")).toBe(false);
    expect(isJetbrainsLauncher("/home/moi/.local/share/JetBrains/Toolbox/scripts/phpstorm", "wsl", "/home/moi")).toBe(true);
    // chaque système n'accepte que ses emplacements
    expect(isJetbrainsLauncher("/opt/homebrew/bin/phpstorm.sh", "mac")).toBe(false);
    expect(isJetbrainsLauncher("/opt/PhpStorm/bin/phpstorm.sh")).toBe(false); // défaut : macOS
    expect(isJetbrainsLauncher("/Applications/PhpStorm.app/Contents/MacOS/phpstorm", "linux", "/home/moi")).toBe(false);
  });

  it("lanceur par défaut selon le système ; nom affiché tiré du script Linux", () => {
    expect(defaultJetbrains("mac")).toBe(DEFAULT_JETBRAINS);
    expect(defaultJetbrains("linux")).toBe("~/.local/share/JetBrains/Toolbox/scripts/phpstorm");
    expect(defaultJetbrains("wsl")).toBe(defaultJetbrains("linux"));
    expect(readPreferences(raw, defaultJetbrains("linux")).jetbrains).toBe(defaultJetbrains("linux"));
    // le défaut du système n'est pas écrit dans la config
    const linux = defaultJetbrains("linux");
    const cfg = { ...raw, codemap: { ide: "/opt/WebStorm/bin/webstorm.sh" } };
    expect(applyPreferences(cfg, { ...readPreferences(cfg, linux), jetbrains: linux }, linux).codemap).toEqual({});
    expect(editorName("jetbrains", "/home/moi/.local/share/JetBrains/Toolbox/scripts/phpstorm")).toBe("PhpStorm");
    expect(editorName("jetbrains", "/home/moi/.local/share/JetBrains/Toolbox/scripts/idea-ce")).toBe("IntelliJ IDEA");
    expect(editorName("jetbrains", "/opt/WebStorm/bin/webstorm.sh")).toBe("WebStorm");
    expect(editorName("jetbrains", "/opt/x/bin/constructor.sh")).toBe("JetBrains");
  });

  it("VS Code sous WSL : le fichier est ouvert dans la distribution", () => {
    expect(editorFileUrl("vscode", "/home/moi/mon projet/a.ts", 7, "Ubuntu-24.04")).toBe("vscode://vscode-remote/wsl+Ubuntu-24.04/home/moi/mon%20projet/a.ts:7");
    expect(editorFileUrl("cursor", "/home/moi/a.ts", 1)).toBe("cursor://file/home/moi/a.ts:1");
  });

  it("barre d'onglets : Dashboard toujours, Guide s'il est activé ET débloqué, Stats en dernier", () => {
    const locked = { unlocked: false, guideTouched: false, statsFound: false };
    const open = { ...locked, unlocked: true };
    expect(visibleTabs({ tabs: ["/carte"], guide: { enabled: true, path: "x" }, secret: locked })).toEqual(["/dashboard", "/carte", "/statistiques"]);
    expect(visibleTabs({ tabs: [], guide: { enabled: true, path: "x" }, secret: open })).toEqual(["/dashboard", "/guide", "/statistiques"]);
    expect(visibleTabs({ tabs: [], guide: { enabled: false, path: "x" }, secret: open })).toEqual(["/dashboard", "/statistiques"]);
    expect(visibleTabs(undefined)).not.toContain("/guide"); // avant de lire les préférences : rien ne trahit le guide
  });

  it("secret : débloqué par le code, option du guide cliquée seulement une fois débloquée, Statistiques trouvée", () => {
    const cfg = { ...raw, ui: { editor: "cursor" } };
    expect(readSecret(applySecret(cfg, "guide"))).toEqual({ unlocked: false, guideTouched: false, statsFound: false });
    const unlocked = applySecret(cfg, "konami");
    expect(unlocked.ui).toEqual({ editor: "cursor", secret: { unlocked: true, guideTouched: false, statsFound: false } });
    expect(readSecret(applySecret(applySecret(unlocked, "guide"), "stats"))).toEqual({ unlocked: true, guideTouched: true, statsFound: true });
    // les préférences enregistrées ensuite gardent le secret
    expect(readSecret(applyPreferences(unlocked, readPreferences(unlocked)))).toEqual(readSecret(unlocked));
  });

  it("messages du code Konami", () => {
    const s = (unlocked: boolean, guideTouched: boolean, statsFound: boolean) => ({ unlocked, guideTouched, statsFound });
    expect(konamiMessage(s(false, false, false), 0.05)).toBe("changed"); // premier code : toujours « quelque chose a changé »
    expect(konamiMessage(s(true, false, false), 0.05)).toBe("lingers"); // une chance sur dix, Statistiques pas trouvée
    expect(konamiMessage(s(true, false, false), 0.5)).toBe("changed");
    expect(konamiMessage(s(true, true, false), 0.5)).toBe(null);
    expect(konamiMessage(s(true, true, true), 0.05)).toBe(null); // Statistiques trouvée : plus de « secret »
  });

  it("adresses des éditeurs, chemins encodés", () => {
    expect(githubFileUrl("org/depot", "feat/x", "apps/web/a b#.ts", 12)).toBe("https://github.com/org/depot/blob/feat/x/apps/web/a%20b%23.ts#L12");
    expect(githubFileUrl("org/depot", "master", "README.md", 1)).toBe("https://github.com/org/depot/blob/master/README.md");
    expect(editorFileUrl("vscode", "/Users/moi/Projet/a b.ts", 3)).toBe("vscode://file/Users/moi/Projet/a%20b.ts:3");
  });
});
