// Préférences de N2 : lues et écrites dans config.local.json (fenêtre « Préférences »).
// Les chemins MODIFIÉS sont vérifiés avant d'écrire (un réglage qu'on n'a pas touché ne bloque pas l'enregistrement) :
//  - projet : chemin absolu d'un dépôt git ;
//  - lanceur JetBrains : exécutable d'un paquet …/Applications/<IDE>.app/Contents/MacOS/ sous macOS,
//    script de JetBrains Toolbox ou /opt/<IDE>/bin/<ide>.sh sous Linux (N2 le lance, voir isJetbrainsLauncher) ;
//  - guide : fichier .html (N2 le sert à la page) .
// Ces garde-fous limitent ce qu'une page compromise pourrait faire de cette fonction (lancer un programme, lire un fichier).
import { accessSync, constants, existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { expandHome, readRawConfig, writeRawConfig } from "../config.ts";
import { msg } from "../messages.ts";
import { forgetAll, MessageError } from "../run.ts";
import { applyPreferences, applySecret, defaultJetbrains, isJetbrainsLauncher, readPreferences, type Preferences, type SecretEvent } from "../../features/prefs/logic.ts";
import { currentPlatform } from "../platform.ts";

// lanceur JetBrains affiché quand la config n'en donne pas (dépend du système)
const defaultIde = () => defaultJetbrains(currentPlatform());
export const getPrefs = (): Preferences => readPreferences(readRawConfig(), defaultIde());

const isDir = (p: string) => existsSync(p) && statSync(p).isDirectory();
const isFile = (p: string) => existsSync(p) && statSync(p).isFile();
const isExecutable = (p: string) => {
  try {
    accessSync(p, constants.X_OK);
    return isFile(p);
  } catch {
    return false;
  }
};

export function savePrefs(input: Preferences): Preferences {
  const p: Preferences = { ...input, projectPath: input.projectPath.trim(), jetbrains: input.jetbrains.trim(), guide: { ...input.guide, path: input.guide.path.trim() } };
  const before = getPrefs();
  if (p.projectPath !== before.projectPath) {
    const project = expandHome(p.projectPath);
    if (!isAbsolute(project) || !isDir(project) || !isDir(join(project, ".git"))) throw new MessageError(msg("srv_prefs_project_not_found", { path: p.projectPath }));
  }
  if (p.jetbrains !== before.jetbrains && p.jetbrains) {
    const ide = expandHome(p.jetbrains);
    if (!isJetbrainsLauncher(ide, currentPlatform(), homedir()) || !isExecutable(ide)) throw new MessageError(msg("srv_prefs_ide_invalid", { path: p.jetbrains }));
  }
  if (p.guide.enabled && (p.guide.path !== before.guide.path || !before.guide.enabled)) {
    const guide = expandHome(p.guide.path);
    if (!isAbsolute(guide) || !/\.html?$/i.test(guide) || !isFile(guide)) throw new MessageError(msg("srv_prefs_guide_not_found", { path: p.guide.path }));
  }
  writeRawConfig(applyPreferences(readRawConfig(), p, defaultIde()));
  // projet, guide… ont pu changer : toutes les sources repartent de zéro
  forgetAll();
  return getPrefs();
}

/** Évènement du secret (code Konami, option du guide cliquée, page Statistiques ouverte) : retenu dans config.local.json */
export function recordSecret(event: SecretEvent): Preferences {
  const before = getPrefs();
  const already = event === "konami" ? before.secret.unlocked : event === "stats" ? before.secret.statsFound : before.secret.guideTouched || !before.secret.unlocked;
  if (!already) {
    writeRawConfig(applySecret(readRawConfig(), event));
    // le guide apparaît (ou non) : ses sources repartent de zéro
    if (event === "konami") forgetAll();
  }
  return getPrefs();
}
