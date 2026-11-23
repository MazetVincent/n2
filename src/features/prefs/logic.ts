// Préférences de N2 (fenêtre « Préférences », icône boulon) : onglets affichés, éditeur où ouvrir le code,
// chemin du projet et du guide. Elles sont écrites dans config.local.json (la langue, elle, reste un cookie du navigateur).
// Fonctions pures, partagées par le serveur (lecture, écriture) et la page (barre d'onglets).

/** Tous les onglets, dans l'ordre de la barre (trois groupes : le travail du jour, le code, la prod) */
export const TAB_GROUPS = [
  ["/dashboard", "/pull-requests", "/sprint"],
  ["/carte", "/guide", "/librairies"],
  ["/observabilite", "/deploiements", "/statistiques"],
] as const;
export type TabPath = (typeof TAB_GROUPS)[number][number];
export const ALL_TABS: readonly TabPath[] = TAB_GROUPS.flat();

/** Toujours affiché : la page d'accueil (lien du logo) */
export const HOME_TAB: TabPath = "/dashboard";
/** Onglet « fantôme » : toujours le dernier à droite, invisible, cliquable, absent de la recherche ⌘K */
export const GHOST_TAB: TabPath = "/statistiques";
/** Affiché selon l'interrupteur du guide, pas dans la liste des catégories */
export const GUIDE_TAB: TabPath = "/guide";
/** Ce qu'on peut cocher ou décocher dans les préférences */
export const CHOOSABLE_TABS: readonly TabPath[] = ALL_TABS.filter((t) => t !== HOME_TAB && t !== GHOST_TAB && t !== GUIDE_TAB);

export const EDITORS = ["jetbrains", "vscode", "cursor", "github"] as const;
export type Editor = (typeof EDITORS)[number];
export const EDITOR_LABEL: Record<Editor, string> = { jetbrains: "JetBrains", vscode: "VS Code", cursor: "Cursor", github: "GitHub" };

export interface Preferences {
  /** catégories cochées (parmi CHOOSABLE_TABS) */
  tabs: TabPath[];
  editor: Editor;
  /** lanceur de l'IDE JetBrains (PhpStorm, WebStorm…), appelé avec `--line N fichier` */
  jetbrains: string;
  /** dossier du projet suivi (tel qu'écrit dans la config, « ~/… » accepté) */
  projectPath: string;
  guide: GuidePrefs;
  /** le secret (code Konami) : lu ici, écrit seulement par recordSecret */
  secret: Secret;
}

/** Guide de l'équipe : activé, chemin du fichier, et sa lecture (réglages transmis au guide, src/features/guide/embed.ts) */
export interface GuidePrefs {
  enabled: boolean;
  path: string;
  /** « Références au code » : le guide cite les fichiers du projet dans le texte */
  references: boolean;
  /** « Expliquer les termes » : vocabulaire du guide souligné, définition au survol */
  terms: boolean;
}

/**
 * État du secret, dans config.local.json (ui.secret) :
 *  - unlocked : le code Konami a été fait une fois ; l'option « Guide de l'équipe » existe alors dans les préférences
 *    (avant, le guide est caché partout, quel que soit guide.enabled) ;
 *  - guideTouched : l'option du guide a été cliquée depuis (plus de « Vous sentez que quelque chose a changé. ») ;
 *  - statsFound : la page cachée Statistiques a été ouverte (plus de « Un secret perdure. »).
 */
export interface Secret {
  unlocked: boolean;
  guideTouched: boolean;
  statsFound: boolean;
}
export type SecretEvent = "konami" | "guide" | "stats";

export const DEFAULT_JETBRAINS = "/Applications/PhpStorm.app/Contents/MacOS/phpstorm";
/** Lanceur PhpStorm créé par JetBrains Toolbox sous Linux (et Linux de WSL) */
export const DEFAULT_JETBRAINS_LINUX = "~/.local/share/JetBrains/Toolbox/scripts/phpstorm";

/** Lanceur JetBrains par défaut selon le système (macOS : le paquet .app ; Linux, WSL : le script de Toolbox) */
export const defaultJetbrains = (platform: string) => (platform === "linux" || platform === "wsl" ? DEFAULT_JETBRAINS_LINUX : DEFAULT_JETBRAINS);

const isTab = (t: unknown): t is TabPath => typeof t === "string" && (ALL_TABS as readonly string[]).includes(t);
const isEditor = (e: unknown): e is Editor => typeof e === "string" && (EDITORS as readonly string[]).includes(e);

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);

/** Préférences lues dans la config (JSON brut de config.local.json) ; `defaultIde` : lanceur JetBrains par défaut du système */
export function readPreferences(raw: unknown, defaultIde = DEFAULT_JETBRAINS): Preferences {
  const cfg = obj(raw);
  const ui = obj(cfg.ui);
  const codemap = obj(cfg.codemap);
  const guide = obj(cfg.guide);
  const tabs = Array.isArray(ui.tabs) ? ui.tabs.filter(isTab).filter((t) => CHOOSABLE_TABS.includes(t)) : [...CHOOSABLE_TABS];
  return {
    tabs: CHOOSABLE_TABS.filter((t) => tabs.includes(t)),
    editor: isEditor(ui.editor) ? ui.editor : "jetbrains",
    jetbrains: str(codemap.ide, defaultIde),
    projectPath: str(codemap.projectPath) || str(obj(cfg.libs).projectPath),
    guide: { enabled: Boolean(str(guide.path)) && guide.enabled !== false, path: str(guide.path), references: guide.references !== false, terms: guide.terms !== false },
    secret: readSecret(cfg),
  };
}

export function readSecret(raw: unknown): Secret {
  const s = obj(obj(obj(raw).ui).secret);
  return { unlocked: s.unlocked === true, guideTouched: s.guideTouched === true, statsFound: s.statsFound === true };
}

/** Config (JSON brut) après un évènement du secret ; le reste est gardé tel quel */
export function applySecret(raw: unknown, event: SecretEvent): Raw {
  const cfg = structuredClone(obj(raw));
  const ui = obj(cfg.ui);
  const secret = readSecret(cfg);
  if (event === "konami") secret.unlocked = true;
  // l'option du guide n'existe qu'une fois débloquée
  if (event === "guide" && secret.unlocked) secret.guideTouched = true;
  if (event === "stats") secret.statsFound = true;
  cfg.ui = { ...ui, secret };
  return cfg;
}

/** Que montrer après un code Konami (`before` : l'état avant ce code ; `roll` : tirage entre 0 et 1) */
export function konamiMessage(before: Secret, roll: number): "changed" | "lingers" | null {
  if (!before.unlocked) return "changed";
  if (!before.statsFound && roll < 0.1) return "lingers";
  return before.guideTouched ? null : "changed";
}

/** Le guide est-il visible ? Activé dans la config, et le secret débloqué */
export const guideVisible = (p: { guide: Pick<GuidePrefs, "enabled" | "path">; secret: Secret } | undefined) => Boolean(p?.secret.unlocked && p.guide.enabled);

/**
 * Config (JSON brut) avec les préférences appliquées ; le reste de la config est gardé tel quel.
 * Le chemin du projet va dans codemap.projectPath si la config en a un, sinon dans libs.projectPath.
 */
export function applyPreferences(raw: unknown, p: Preferences, defaultIde = DEFAULT_JETBRAINS): Raw {
  const cfg = structuredClone(obj(raw));
  const before = readPreferences(cfg, defaultIde);
  const tabs = CHOOSABLE_TABS.filter((t) => p.tabs.includes(t));
  cfg.ui = { ...obj(cfg.ui), tabs, editor: p.editor };
  // seuls les chemins modifiés sont réécrits (codemap.projectPath et libs.projectPath peuvent différer)
  const codemap = obj(cfg.codemap);
  if (p.jetbrains.trim() !== before.jetbrains) {
    const ide = p.jetbrains.trim();
    if (ide && ide !== defaultIde) codemap.ide = ide;
    else delete codemap.ide;
    cfg.codemap = codemap;
  }
  if (p.projectPath !== before.projectPath) {
    // le chemin affiché est celui de la carte s'il existe, sinon celui des librairies : c'est lui qui change
    if (str(codemap.projectPath)) cfg.codemap = { ...codemap, projectPath: p.projectPath };
    else cfg.libs = { ...obj(cfg.libs), projectPath: p.projectPath };
  }
  const guidePath = p.guide.path.trim();
  const reading = { references: p.guide.references, terms: p.guide.terms };
  if (guidePath) cfg.guide = { ...obj(cfg.guide), path: guidePath, enabled: p.guide.enabled, ...reading };
  else if (cfg.guide) cfg.guide = { ...obj(cfg.guide), enabled: false, ...reading };
  return cfg;
}

/** Onglets de la barre, dans l'ordre : ceux cochés (le Dashboard toujours, le Guide s'il est visible), Stats en dernier */
export function visibleTabs(p: (Pick<Preferences, "tabs"> & Parameters<typeof guideVisible>[0]) | undefined): TabPath[] {
  return ALL_TABS.filter((t) => t === HOME_TAB || t === GHOST_TAB || (t === GUIDE_TAB ? guideVisible(p) : (p?.tabs ?? CHOOSABLE_TABS).includes(t))).sort(
    (a, b) => Number(a === GHOST_TAB) - Number(b === GHOST_TAB),
  );
}

/**
 * Lien GitHub vers un fichier du projet à une ligne : https://github.com/org/depot/blob/<ref>/<chemin>#L<ligne>.
 * Le chemin est encodé morceau par morceau (espaces, #, ?).
 */
export function githubFileUrl(repo: string, ref: string, file: string, line: number): string {
  const path = file.split("/").map(encodeURIComponent).join("/");
  return `https://github.com/${repo}/blob/${ref.split("/").map(encodeURIComponent).join("/")}/${path}${line > 1 ? `#L${line}` : ""}`;
}

/**
 * Adresse qui ouvre un fichier dans VS Code ou Cursor (gestionnaire d'URL de l'éditeur).
 * Sous WSL (`wslDistro` : nom de la distribution), l'éditeur de Windows ouvre le fichier dans WSL (extension WSL).
 */
export function editorFileUrl(editor: "vscode" | "cursor", absPath: string, line: number, wslDistro?: string): string {
  const path = absPath.split("/").map(encodeURIComponent).join("/");
  return wslDistro ? `${editor}://vscode-remote/wsl+${encodeURIComponent(wslDistro)}${path}:${line}` : `${editor}://file${path}:${line}`;
}

// IDE JetBrains reconnus dans les lanceurs Linux (nom du script → nom affiché)
const JETBRAINS_IDES: Record<string, string> = {
  phpstorm: "PhpStorm",
  webstorm: "WebStorm",
  idea: "IntelliJ IDEA",
  pycharm: "PyCharm",
  goland: "GoLand",
  clion: "CLion",
  rider: "Rider",
  rubymine: "RubyMine",
  datagrip: "DataGrip",
  rustrover: "RustRover",
  dataspell: "DataSpell",
};
const IDE = `(${Object.keys(JETBRAINS_IDES).join("|")})`;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Emplacements acceptés pour le lanceur, selon le système (`home` : dossier personnel, Linux) */
function jetbrainsLaunchers(platform: string, home?: string): RegExp[] {
  if (platform !== "linux" && platform !== "wsl") {
    // macOS : un exécutable dans le paquet .app d'une application (Applications du Mac ou de l'utilisateur)
    return [/^\/(?:Applications|Users\/[^/]+\/Applications)\/[^/]+\.app\/Contents\/MacOS\/[^/]+$/];
  }
  const homeRe = home && home.startsWith("/") && home !== "/" ? escapeRe(home.replace(/\/+$/, "")) : "/home/[^/]+";
  return [
    // script de JetBrains Toolbox, dans le dossier personnel (« pycharm », « idea-ce »…)
    new RegExp(`^${homeRe}/\\.local/share/JetBrains/Toolbox/scripts/${IDE}(?:-[a-z0-9]+)?$`),
    // archive installée dans /opt (/opt/PhpStorm-2026.2/bin/phpstorm.sh)
    new RegExp(`^/opt/[^/]+/bin/${IDE}\\.sh$`),
  ];
}

/** Lanceur JetBrains acceptable sur ce système : un des emplacements ci-dessus, chemin absolu sans « .. » */
export const isJetbrainsLauncher = (abs: string, platform = "mac", home?: string) =>
  jetbrainsLaunchers(platform, home).some((re) => re.test(abs)) && !abs.includes("..");

/** Nom de l'éditeur pour les boutons (« PhpStorm » tiré du lanceur JetBrains, « VS Code »…) */
export function editorName(editor: Editor | undefined, jetbrains?: string): string {
  if (editor && editor !== "jetbrains") return EDITOR_LABEL[editor];
  const path = jetbrains ?? DEFAULT_JETBRAINS;
  const app = /\/([^/]+)\.app\//.exec(path)?.[1];
  if (app) return app;
  // Linux : nom du script (« phpstorm », « idea-ce », « pycharm.sh »)
  const script = /\/([a-z]+)(?:-[a-z0-9]+)?(?:\.sh)?$/.exec(path)?.[1];
  return script && Object.hasOwn(JETBRAINS_IDES, script) ? JETBRAINS_IDES[script] : EDITOR_LABEL.jetbrains;
}
