// Guide de l'équipe (fichier HTML).


// ---------- Guide de l'équipe (fichier HTML) ----------
/** Un texte du guide dans ses deux langues */
export interface GuideText {
  fr: string;
  en: string;
}

/** Un fichier du projet cité par le guide (« apps/web/src/router.tsx:80-92 ») */
export interface GuideFileRef {
  path: string;
  /** lignes citées, si le guide les donne */
  from?: number;
  to?: number;
  /** commit écrit devant le chemin (« 1a2b3c4d5:apps/… ») : un état passé du code, cité comme tel */
  commit?: string;
}

export interface GuidePage {
  /** adresse de la page dans le guide (« guide/observability ») */
  key: string;
  title: GuideText;
  /** commit sur lequel la page a été vérifiée, si le guide l'indique */
  verifiedAgainst?: string;
}

export interface GuideSection {
  page: string;
  /** ancre de la section ; null = la page elle-même (fichiers cités hors de toute section) */
  id: string | null;
  title: GuideText;
  files: GuideFileRef[];
}

export interface GuideTerm {
  id: string;
  term: GuideText;
  short: GuideText;
}

/** Sections proposées en haut des onglets Déploiements, Observabilité et Pull requests (config guide.links) */
export interface GuideTabLinks {
  deploy: string[];
  observability: string[];
  prs: string[];
}

/** Index du guide tel que lu dans son fichier HTML (sans les réglages de la config) */
export type GuideContent = Omit<GuideIndex, "name" | "links">;

export interface GuideIndex {
  /** nom affiché du guide (config guide.name) ; null : « Guide de l'équipe » */
  name: string | null;
  /** sections proposées en haut des onglets (config guide.links) */
  links: GuideTabLinks;
  /** date de modification du fichier HTML */
  modifiedAt: string;
  /** commits cités en pied du guide : rédaction, puis révision (les faits cités datent de la révision) */
  writtenAt: string | null;
  revisedAt: string | null;
  writtenCommit: string | null;
  revisedCommit: string | null;
  pages: GuidePage[];
  sections: GuideSection[];
  terms: GuideTerm[];
  /** ce que l'analyse n'a pas pu lire (format du guide changé) */
  warnings: string[];
}

/** Ce qu'est devenu, dans le code actuel, un passage cité par le guide */
export type GuideRefState = "changed" | "moved" | "deleted" | "missing";

export interface GuideStaleRef {
  path: string;
  from?: number;
  to?: number;
  state: GuideRefState;
  /** nouveau chemin (fichier déplacé) */
  movedTo?: string;
  /** lignes ajoutées et retirées depuis le commit de référence, dans le passage cité (ou dans tout le fichier sans lignes) */
  added: number;
  removed: number;
}

export interface GuideFreshness {
  /** commit de référence (révision du guide) et version comparée */
  base: string;
  target: string;
  /** nombre de commits entre les deux */
  commits: number;
  checkedRefs: number;
  sections: { page: string; id: string | null; refs: GuideStaleRef[] }[];
}

/** Passage de la documentation du projet : une section d'un README ou du guide de l'équipe (côté serveur) */
export interface DocPassage {
  kind: "readme" | "guide";
  key: string;
  title: GuideText;
  /** chemin du README, ou titre de la page du guide */
  where: GuideText;
  text: GuideText;
  /** README : fichier et ligne du titre */
  file?: string;
  line?: number;
  /** guide : adresse de la section (?p=) */
  target?: string;
}

/** Passage trouvé, dans la langue de la page, avec un extrait autour du mot cherché */
export interface DocHit {
  kind: "readme" | "guide";
  key: string;
  title: string;
  where: string;
  snippet: string;
  file?: string;
  line?: number;
  target?: string;
}
