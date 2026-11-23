// Icônes (SVG en ligne : rendu identique partout, contrairement aux emojis).
import { css, cx } from "styled-system/css";

const ICONS = {
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4.35-4.35",
  refresh: "M20 11a8 8 0 1 0-2.34 5.66M20 4v7h-7",
  external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  check: "M5 12.5 10 17 19 7",
  target: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 3.5a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1Z",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3 2",
  branch: "M6 3v12M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 9a9 9 0 0 1-9 9",
  chevron: "m6 9 6 6 6-6",
  // flèche vers la gauche : page précédente
  back: "M19 12H5M12 19l-7-7 7-7",
  bell: "M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0",
  // boulon (écrou) : préférences
  nut: "M12 2.5 20.25 7.25v9.5L12 21.5l-8.25-4.75v-9.5ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  // cadenas : réglage figé (ex. un onglet toujours affiché)
  lock: "M7 11V8a5 5 0 0 1 10 0v3M6 11h12v10H6Z",
  close: "M6 6l12 12M18 6 6 18",
  bellOff: "M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7M10.3 21a1.94 1.94 0 0 0 3.4 0M2 2l20 20",
} as const;
export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 16, className, spin = false }: { name: IconName; size?: number; className?: string; spin?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx(css({ flex: "none" }), spin && css({ animation: "spin 0.9s linear infinite" }), className)}
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

/** Toutes les icônes disponibles (galerie du design system) */
export const ICON_NAMES = Object.keys(ICONS) as IconName[];
