import { chmodSync, existsSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { msg } from "./messages.ts";
import { MessageError, SourceFailure } from "./run.ts";
import { demoConfig } from "./demo.ts";

export interface Config {
  /** obsolète : le port se règle avec la variable N2_PORT (4747 par défaut) */
  port?: number;
  github: { repos: string[]; recentDays: number };
  jira: { site: string; projectKey: string; boardId: number; onlyMine: boolean };
  libs: { projectPath: string; packages: string[] };
  sentry: {
    org: string;
    project: string;
    /** environnement de production (« production ») : Observabilité et « À faire » n'en montrent que les erreurs ; absent = tous */
    environment?: string;
    /** environnements d'avant la prod (« qa », « staging ») : vue « Avant la prod », erreurs qui n'ont pas (encore) atteint la prod */
    preprodEnvironments?: string[];
  };
  aws: {
    profile: string;
    region: string;
    alarmPrefix: string;
    reconnectHint: string;
    hideAutoscaling?: boolean;
    /** clic sur « AWS expirée » : `npm run <script>` lancé dans ce projet (ex. { projectPath: "~/monprojet", script: "aws:login" }) */
    reconnect?: { projectPath: string; script: string };
  };
  codemap?: {
    /** dossier du projet à cartographier (défaut : libs.projectPath) */
    projectPath?: string;
    /** lanceur de l'IDE, appelé avec `--line N fichier` */
    ide?: string;
    /** au-delà de ce nombre de fichiers, une partie est découpée en sous-dossiers */
    splitThreshold?: number;
    /** corrections manuelles : { "chemin/de/la/partie": "front" | "api" | "back" | "shared" | "infra" | "tooling" } */
    categories?: Record<string, string>;
    /** descriptions manuelles : { "apps/web/src/features": "Écrans et logique métier du site" } */
    descriptions?: Record<string, string>;
  };
  /** Déploiements (AWS CodePipeline, même profil et même région que CloudWatch) */
  deploy?: {
    /** préfixe des pipelines du projet, nommés « <préfixe><branche ou ticket>-pipeline… » (sans lui, l'onglet demande de le régler) */
    pipelinePrefix?: string;
    /** branche principale, déployée en prod (défaut « main ») */
    mainBranch?: string;
    /** URL d'un environnement de branche, {slug} = ticket de la branche (facultatif : sans elle, pas de lien vers l'environnement) */
    envUrl?: string;
  };
  /** Slack du Dashboard : mentions, messages directs et derniers messages de quelques salons (token dans le trousseau macOS) */
  slack?: {
    /** salons suivis : nom sans # (« dev-front ») ou identifiant (« C0123ABCD ») */
    channels?: string[];
    /** nombre de messages affichés par salon (5 par défaut) */
    messages?: number;
  };
  /**
   * Liens rapides du lanceur ⌘K (prod, staging, back-office, tableaux AWS…), en plus de ceux déduits de la config.
   * Liens https uniquement ; leurs sites sont ajoutés aux sites que N2 accepte d'ouvrir dans Chrome.
   */
  links?: { label: string; url: string; group?: string; keywords?: string }[];
  /** Agenda Teams / Outlook du Dashboard : Microsoft Graph si connecté, sinon le lien ICS publié */
  calendar?: {
    /** lien ICS publié depuis Outlook (Paramètres → Calendrier → Calendriers partagés → Publier). Secret : il donne accès à l'agenda. */
    icsUrl?: string;
    /** app Entra ID (Azure AD) avec la permission déléguée Calendars.Read et les « flux clients publics » activés */
    graph?: { tenantId: string; clientId: string };
  };
  /** Guide de l'équipe : son fichier HTML (onglet Guide, liens vers les sections depuis la carte, Sentry, les PR…) */
  guide?: {
    /**
     * chemin du fichier (ex. « ~/Documents/guide.html ») ; remplacer le fichier suffit à passer à une nouvelle version.
     * Un guide.json (format n2-guide/1) posé dans le même dossier sert à l'index, plus complet que ce que N2 lit dans le HTML.
     */
    path: string;
    /** nom affiché (onglet, recherche ⌘K) ; défaut « Guide de l'équipe » */
    name?: string;
    /** sections proposées en haut de certains onglets, par adresse dans le guide (« page/ancre ») ; titres lus dans le guide */
    links?: { deploy?: string[]; observability?: string[]; prs?: string[] };
    /** false : guide coupé (onglet masqué, plus de liens vers lui), le chemin reste retenu */
    enabled?: boolean;
    /** lecture du guide (préférences de N2) : fichiers du projet cités dans le texte, vocabulaire expliqué au survol */
    references?: boolean;
    terms?: boolean;
  };
  /** Préférences réglées dans la fenêtre « Préférences » de N2 */
  ui?: {
    /** onglets affichés (le Dashboard l'est toujours ; Stats est un onglet fantôme ; le Guide suit guide.enabled) */
    tabs?: string[];
    /** où ouvrir le code : IDE JetBrains (codemap.ide), VS Code, Cursor ou GitHub */
    editor?: "jetbrains" | "vscode" | "cursor" | "github";
    /** état du secret (voir src/features/prefs/logic.ts) : tant qu'il n'est pas débloqué, le guide est caché */
    secret?: { unlocked?: boolean; guideTouched?: boolean; statsFound?: boolean };
  };
}

// Racine du projet N2 : le premier dossier parent qui contient le package.json de N2
// (ce fichier est dans src/server/ en développement, dans dist/server/assets/ après un build).
function findRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  for (let dir = here, i = 0; i < 6; dir = dirname(dir), i++) {
    try {
      if ((JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { name?: string }).name === "n2") return dir;
    } catch {
      /* pas de package.json ici : on remonte */
    }
  }
  return join(here, "..", "..");
}
export const ROOT = findRoot();
const CONFIG_PATH = join(ROOT, "config.local.json");

export const expandHome = (p: string) => (p.startsWith("~/") ? join(homedir(), p.slice(2)) : p);

let loaded: Config | null = null;

/** Oublie la config lue : la prochaine lecture repart du fichier (après un enregistrement des préférences) */
export const resetConfig = () => {
  loaded = null;
};

/** config.local.json tel quel (sans « ~ » développé), pour le modifier */
export function readRawConfig(): Record<string, unknown> {
  // mode démo : la config de démo, jamais ta vraie config (préférences affichées, secret)
  if (process.env.N2_DEMO === "1") return demoConfig(ROOT) as unknown as Record<string, unknown>;
  if (!existsSync(CONFIG_PATH)) throw new SourceFailure({ kind: "config", message: msg("srv_config_missing") });
  return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Record<string, unknown>;
}

/**
 * Réécrit config.local.json d'un coup (fichier voisin puis renommage), en gardant ses droits (il peut contenir un secret).
 * Si c'est un lien symbolique, c'est le fichier pointé qui est réécrit (le lien reste un lien).
 */
export function writeRawConfig(cfg: Record<string, unknown>): void {
  // mode démo : rien n'est écrit (ni préférences, ni secret)
  if (process.env.N2_DEMO === "1") throw new MessageError(msg("srv_demo_read_only"));
  const target = realpathSync(CONFIG_PATH);
  const mode = statSync(target).mode & 0o777;
  const tmp = `${target}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(cfg, null, 2)}\n`, { mode });
  chmodSync(tmp, mode);
  renameSync(tmp, target);
  resetConfig();
}

/** Lit config.local.json une fois, puis la garde en mémoire (relance le serveur après l'avoir modifiée à la main). */
export function loadConfig(): Config {
  if (loaded) return loaded;
  loaded = readConfig();
  return loaded;
}

function readConfig(): Config {
  // mode démo : comptes factices, carte du code sur N2 lui-même (src/server/demo.ts)
  if (process.env.N2_DEMO === "1") return demoConfig(ROOT);
  if (!existsSync(CONFIG_PATH)) {
    throw new SourceFailure({ kind: "config", message: msg("srv_config_missing") });
  }
  const cfg = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Config;
  cfg.libs.projectPath = expandHome(cfg.libs.projectPath);
  if (cfg.codemap?.projectPath) cfg.codemap.projectPath = expandHome(cfg.codemap.projectPath);
  if (cfg.codemap?.ide) cfg.codemap.ide = expandHome(cfg.codemap.ide);
  return cfg;
}
