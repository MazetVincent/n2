// Librairies : versions, failles, notes de version.
import type { LibDetails } from "./codemap.ts";

// ---------- Librairies ----------
export type UpdateKind = "major" | "minor" | "patch" | "none" | "unknown";

export interface LibRelease {
  name: string;
  url: string;
  publishedAt: string;
}

export interface LibAdvisory {
  id: string;
  severity: string;
  summary: string;
  url: string;
}

export interface LibInfo {
  name: string;
  installed: string | null;
  latest: string | null;
  update: UpdateKind;
  npmUrl: string;
  repoUrl: string | null;
  releases: LibRelease[];
  advisories: LibAdvisory[];
}

/** Une dépendance déclarée dans le package.json d'une partie du monorepo */
export interface WorkspaceDep {
  name: string;
  /** version demandée dans le package.json (ex. ^19.0.0) */
  range: string;
  /** devDependencies (outillage, tests) */
  dev: boolean;
  /** version installée pour cette partie (node_modules imbriqué d'abord, sinon celui de la racine) */
  installed: string | null;
  latest: string | null;
  update: UpdateKind;
  /** package d'un registre privé : rien n'est demandé au registre public */
  private: boolean;
}

/** Une partie (workspace) du monorepo et ses dépendances externes */
export interface WorkspaceLibs {
  /** dossier relatif au projet ("" pour la racine) */
  path: string;
  name: string;
  /** nom court affiché (sans le scope) */
  label: string;
  description: string | null;
  deps: WorkspaceDep[];
}

export interface LibNews {
  name: string;
  url: string;
  publishedAt: string;
  /** début des notes de version, en texte brut */
  excerpt: string;
  /** version plus récente que celle installée */
  newer: boolean;
}

/** Fiche complète d'une librairie (vue agrandie de l'onglet Librairies) */
export interface LibOverview {
  details: LibDetails;
  /** premier paragraphe du README (en anglais) */
  about: string | null;
  news: LibNews[];
  /** page des releases ou des versions, quand il n'y a pas de notes de version lisibles */
  newsUrl: string | null;
  advisories: LibAdvisory[];
}
