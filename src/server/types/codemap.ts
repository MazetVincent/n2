// Carte du code : parties, liens, impact, ma branche, exemples.


// ---------- Carte du code ----------
export type Category = "front" | "api" | "back" | "shared" | "infra" | "tooling";

export interface MapLib {
  name: string;
  /** fichiers (hors tests) qui importent la librairie */
  files: number;
  /** fichiers de test / stories qui l'importent */
  testFiles: number;
}

export interface MapNode {
  id: string;
  label: string;
  workspace: string;
  path: string;
  category: Category;
  /** répartition des fichiers par catégorie détectée */
  mix: Partial<Record<Category, number>>;
  files: number;
  testFiles: number;
  libs: MapLib[];
  /** titre du README (ex. « @mon-org/web — runtime du site ») */
  title?: string;
  /** à quoi sert la partie : config > package.json > README */
  description?: string;
  /** pour un sous-dossier : la description de la partie parente */
  parentDescription?: string;
  /** README de la partie, relatif au projet (ouvrable dans l'IDE) */
  readme?: string;
  /** sous-dossiers principaux : nombre de fichiers, librairies et fichiers les plus importés */
  contains: SubFolder[];
  /** fichiers de la partie dont le plus de fichiers dépendent */
  topFiles: ImportantFile[];
  /** nombre de modifications de fichiers de la partie sur 30 jours (git log) */
  changes30d?: number;
}

export interface SubFolder {
  name: string;
  path: string;
  files: number;
  libs: { name: string; files: number }[];
  topFiles: ImportantFile[];
}

export interface ImportantFile {
  file: string;
  node: string;
  /** nombre de fichiers (hors tests) qui l'importent */
  importers: number;
  /** nombre d'autres parties qui l'importent */
  fromParts: number;
  generated: boolean;
}

export interface LibDetails {
  name: string;
  /** description officielle (registre npm, en anglais) */
  summary: string | null;
  docsUrl: string | null;
  npmUrl: string | null;
  repoUrl: string | null;
  installed: string | null;
  latest: string | null;
  license: string | null;
  /** package d'un registre privé : rien n'est demandé au registre public */
  private: boolean;
}

export interface MapEdge {
  from: string;
  to: string;
  /** nombre d'imports de `from` vers `to` */
  weight: number;
}

export interface CodeMapData {
  project: string;
  nodes: MapNode[];
  edges: MapEdge[];
  totalFiles: number;
  /** les fichiers les plus importés de tout le projet */
  topFiles: ImportantFile[];
  /** fichiers très importés ET très modifiés ces 30 derniers jours */
  hotspots: Hotspot[];
  durationMs: number;
}

export interface Hotspot {
  file: string;
  node: string;
  changes: number;
  importers: number;
  score: number;
}

export interface ImpactData {
  file: string;
  node: string | null;
  /** fichiers qui l'importent directement */
  direct: number;
  /** fichiers touchés en cascade (directs compris) */
  total: number;
  /** nombre de fichiers à chaque niveau de profondeur (1 = directs) */
  levels: number[];
  /** fichiers touchés par partie */
  byNode: Record<string, number>;
  directFiles: string[];
}

export interface BranchData {
  branch: string;
  /** branche sur laquelle est le dépôt (ses modifications non commitées sont comptées) */
  isCurrent: boolean;
  base: string;
  /** commits de la branche depuis la base */
  ahead: number;
  files: { file: string; status: string; node: string | null }[];
  /** fichiers modifiés par partie */
  nodes: Record<string, number>;
  /** tickets Jira cités dans le nom de la branche */
  jira: { key: string; url: string }[];
}

export interface SentryFrame {
  /** fichier du projet, si le chemin de la trace a pu y être rattaché */
  file: string | null;
  raw: string;
  line: number | null;
  fn: string | null;
  inApp: boolean;
}

export interface AwsSession {
  profile: string;
  /** ISO, ou null si inconnue */
  expiresAt: string | null;
  /** une commande de reconnexion est configurée (aws.reconnect) : le badge « AWS expirée » est cliquable */
  canReconnect: boolean;
}

export interface CodeExample {
  file: string;
  line: number;
  startLine: number;
  lines: string[];
  isTest: boolean;
}
