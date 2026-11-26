// Couleurs de N2 : [clair, sombre]. Une seule source pour les jetons Panda (panda.config.ts, « semantic tokens »)
// et pour le guide de l'équipe, qui les reçoit dans sa propre page (src/features/guide/embed.ts).
// Thème sombre « Néon Magenta », sur la charte graphique de l'entreprise : magenta #FF3D77, noir teinté de rose, et les couleurs
// d'extension pour les états. Le rose ne signale jamais une erreur : échec et alarme sont en orange (#FF8241),
// l'attente en jaune (#FFC846), le succès en vert (#00C882), l'info en cyan (#33D1FF).
// Relief (sombre) : « surface.alt » est plus sombre que les cartes, pour que les lignes et les champs soient en creux.
// Le clair garde un magenta plus foncé : #FF3D77 sur fond blanc n'est pas assez contrasté pour du texte.
export type ColorPair = readonly [light: string, dark: string];

export const COLORS = {
  bg: ["#f4f5f8", "#0d0a10"],
  surface: ["#ffffff", "#16111a"],
  "surface.alt": ["#f8f9fb", "#110d14"],
  // fond un peu au-dessus des cartes (les anciennes valeurs de surface.alt) : blocs et code du guide de l'équipe
  "surface.lift": ["#f8f9fb", "#1c1621"],
  border: ["#e3e6ec", "#2b2231"],
  text: ["#1c2130", "#f2edf4"],
  muted: ["#6b7385", "#9a8fa3"],
  accent: ["#e5007d", "#ff3d77"],
  // cœur d'un tube de néon (logo, titres de cartes en sombre) ; en clair, simple couleur du texte
  neon: ["#1c2130", "#ffe3ec"],
  // Enseigne : verre d'un tube allumé (cadre du bouton principal, gaz de l'interrupteur) et d'un tube éteint ;
  // en clair, l'enseigne est éteinte de jour : le tube allumé est simplement magenta, sans lueur
  tube: ["#e5007d", "#ffd3df"],
  "tube.off": ["#ead9e1", "#4e2c3a"],
  // tête des vis aux coins des cartes (caisson d'enseigne) et électrodes des interrupteurs
  screw: ["#c3c7d0", "#8a7f8f"],
  // texte posé sur une couleur vive (pastilles pleines : warn, info, ok, accent) : blanc en clair, noir en sombre,
  // où ces couleurs sont trop claires pour du blanc
  contrast: ["#ffffff", "#0d0a10"],
  "accent.soft": ["#fde6f2", "#40192b"],
  // un rose plus clair, pour un groupe (couche) au-dessus de ses éléments roses
  "accent.light": ["#f06bb0", "#ff9dbb"],
  ok: ["#138a4b", "#00c882"],
  "ok.soft": ["#e3f5eb", "#132d2a"],
  warn: ["#a86400", "#ffc846"],
  "warn.soft": ["#fff1d6", "#392d21"],
  bad: ["#c62a2a", "#ff8241"],
  "bad.soft": ["#fde7e7", "#392220"],
  // calque « points chauds » de la carte : en sombre, le rose (l'orange de bad s'y confondrait avec la couche Back)
  heat: ["#c62a2a", "#ff3d77"],
  info: ["#2f5fd0", "#33d1ff"],
  "info.soft": ["#e6edfd", "#1a2e3c"],
  "cat.front": ["#2f6fd6", "#6c9cff"],
  "cat.api": ["#7c4ddb", "#a78bfa"],
  "cat.back": ["#d9682b", "#f59a5b"],
  "cat.shared": ["#6b7385", "#9aa1b2"],
  "cat.infra": ["#138a4b", "#4cc786"],
  "cat.tooling": ["#a8820a", "#e0b83f"],
} as const satisfies Record<string, ColorPair>;

export type ColorName = keyof typeof COLORS;
