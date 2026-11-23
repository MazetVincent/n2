// Couleurs de N2 : [clair, sombre]. Une seule source pour les jetons Panda (panda.config.ts, « semantic tokens »)
// et pour le guide de l'équipe, qui les reçoit dans sa propre page (src/features/guide/embed.ts).
export type ColorPair = readonly [light: string, dark: string];

export const COLORS = {
  bg: ["#f4f5f8", "#0f1117"],
  surface: ["#ffffff", "#171a23"],
  "surface.alt": ["#f8f9fb", "#1d212c"],
  border: ["#e3e6ec", "#2a2f3c"],
  text: ["#1c2130", "#e8eaf0"],
  muted: ["#6b7385", "#8e95a6"],
  accent: ["#e5007d", "#ff3d9e"],
  "accent.soft": ["#fde6f2", "#3a1328"],
  // un rose plus clair, pour un groupe (couche) au-dessus de ses éléments roses
  "accent.light": ["#f06bb0", "#ffa3d1"],
  ok: ["#138a4b", "#4cc786"],
  "ok.soft": ["#e3f5eb", "#12301f"],
  warn: ["#a86400", "#f0b04a"],
  "warn.soft": ["#fff1d6", "#33270f"],
  bad: ["#c62a2a", "#ff6b6b"],
  "bad.soft": ["#fde7e7", "#3a1717"],
  info: ["#2f5fd0", "#7da2ff"],
  "info.soft": ["#e6edfd", "#18223d"],
  "cat.front": ["#2f6fd6", "#6c9cff"],
  "cat.api": ["#7c4ddb", "#a78bfa"],
  "cat.back": ["#d9682b", "#f59a5b"],
  "cat.shared": ["#6b7385", "#9aa1b2"],
  "cat.infra": ["#138a4b", "#4cc786"],
  "cat.tooling": ["#a8820a", "#e0b83f"],
} as const satisfies Record<string, ColorPair>;

export type ColorName = keyof typeof COLORS;
