// « Remind me » : lecture et écriture du fichier Markdown des rappels (remind.path, ~/.config/n2/remind.md par défaut).
// C'est le seul fichier, hors de sa config, que N2 écrit (docs/adr/0010-fichier-de-rappels.md) ; garde-fous :
//  - un chemin absolu vers un fichier .md (pas un dossier), 256 Ko au plus ;
//  - le dossier doit exister (seul celui du chemin par défaut est créé, en 700) ;
//  - réécriture d'un coup (fichier voisin puis renommage), droits gardés (600 pour un nouveau fichier) ;
//  - modification d'un rappel refusée s'il n'est plus à sa ligne, réécriture complète refusée si le fichier a changé depuis.
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";
import { expandHome, loadConfig } from "../config.ts";
import { msg } from "../messages.ts";
import { MessageError } from "../run.ts";
import { applyRemindChange, DEFAULT_REMIND_PATH, parseRemind, REMIND_MAX_BYTES, RemindConflict, type RemindChange, type RemindData } from "../../features/remind/logic.ts";

export const remindHash = (content: string) => createHash("sha256").update(content).digest("hex").slice(0, 16);

/** Chemin réglé (tel qu'écrit dans la config) */
export const remindSetting = (): string => loadConfig().remind?.path?.trim() || DEFAULT_REMIND_PATH;

/** Le chemin (« ~ » développé) peut-il servir de fichier de rappels ? Sinon, la clé du message d'erreur */
export function checkRemindPath(abs: string): "srv_remind_path_invalid" | "srv_remind_dir_missing" | null {
  if (!isAbsolute(abs) || !/\.md$/i.test(abs) || abs.includes("\0")) return "srv_remind_path_invalid";
  if (existsSync(abs) && !statSync(abs).isFile()) return "srv_remind_path_invalid";
  const dir = dirname(abs);
  if (!(existsSync(dir) && statSync(dir).isDirectory()) && abs !== expandHome(DEFAULT_REMIND_PATH)) return "srv_remind_dir_missing";
  return null;
}

function resolvePath(setting: string): string {
  const abs = expandHome(setting);
  const error = checkRemindPath(abs);
  if (error) throw new MessageError(msg(error, { path: setting }));
  return abs;
}

// mode démo : un fichier en mémoire (jamais écrit sur le disque), pour essayer la carte
let demoContent = `# Remind me

- [ ] Relire la doc du cache avant de toucher aux sources
- [ ] Demander à l'équipe si on garde la carte Slack sur deux colonnes

## Plus tard

- [ ] Essayer \`bun test\` à la place de vitest
- [x] Mettre à jour Biome
`;

function readFile(setting: string): { content: string; exists: boolean } {
  if (process.env.N2_DEMO === "1") return { content: demoContent, exists: true };
  const abs = resolvePath(setting);
  if (!existsSync(abs)) return { content: "", exists: false };
  if (statSync(abs).size > REMIND_MAX_BYTES) throw new MessageError(msg("srv_remind_too_big", { path: setting }));
  return { content: readFileSync(abs, "utf8"), exists: true };
}

function writeFile(setting: string, content: string): void {
  if (Buffer.byteLength(content) > REMIND_MAX_BYTES) throw new MessageError(msg("srv_remind_too_big", { path: setting }));
  if (process.env.N2_DEMO === "1") {
    demoContent = content;
    return;
  }
  const abs = resolvePath(setting);
  if (!existsSync(dirname(abs))) mkdirSync(dirname(abs), { recursive: true, mode: 0o700 });
  // lien symbolique : c'est le fichier pointé qui est réécrit (le lien reste un lien)
  const target = existsSync(abs) ? realpathSync(abs) : abs;
  const mode = existsSync(target) ? statSync(target).mode & 0o777 : 0o600;
  const tmp = `${target}.${process.pid}.tmp`;
  writeFileSync(tmp, content, { mode });
  chmodSync(tmp, mode);
  renameSync(tmp, target);
}

const dataOf = (setting: string, content: string, exists: boolean): RemindData => ({ path: setting, exists, content, version: remindHash(content), items: parseRemind(content) });

export function readRemind(): RemindData {
  const setting = remindSetting();
  const { content, exists } = readFile(setting);
  return dataOf(setting, content, exists);
}

export function changeRemind(change: RemindChange): RemindData {
  const setting = remindSetting();
  const { content, exists } = readFile(setting);
  let next: string;
  try {
    next = applyRemindChange(content, change, remindHash);
  } catch (e) {
    if (e instanceof RemindConflict) throw new MessageError(msg("srv_remind_changed"));
    throw e;
  }
  if (next === content) return dataOf(setting, content, exists);
  writeFile(setting, next);
  return dataOf(setting, next, true);
}
