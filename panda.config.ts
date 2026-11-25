import { defineConfig } from "@pandacss/dev";
import presetBase from "@pandacss/preset-base";
import presetPanda from "@pandacss/preset-panda";
import { COLORS, type ColorName } from "./src/styles/colors";

/*
 * Panda CSS : styles générés dans `styled-system/` (non versionné, `bun run codegen`).
 * Les couleurs sont des « semantic tokens » clair / sombre (préférence du système).
 * Ils sont aussi exposés en variables CSS (--colors-…), utilisées par src/styles/map.css.
 */
const pair = (base: string, dark: string) => ({ value: { base, _osDark: dark } });
const c = (name: ColorName) => {
  const [base, dark] = COLORS[name];
  return pair(base, dark);
};

export default defineConfig({
  presets: [presetBase, presetPanda],
  preflight: true,
  include: ["./src/**/*.{ts,tsx}"],
  exclude: ["./src/server/**"],
  outdir: "styled-system",
  importMap: "styled-system",
  jsxFramework: "react",
  theme: {
    extend: {
      tokens: {
        radii: { sm: { value: "4px" }, md: { value: "6px" }, lg: { value: "8px" }, xl: { value: "12px" } },
        // échelle de texte en px (la page est à 14px) : pas de taille intermédiaire (12.5px, 11.5px…)
        fontSizes: { xs: { value: "11px" }, sm: { value: "12px" }, md: { value: "13px" }, base: { value: "14px" }, lg: { value: "15px" }, xl: { value: "20px" } },
      },
      semanticTokens: {
        // valeurs dans src/styles/colors.ts (partagées avec le guide de l'équipe)
        colors: {
          bg: c("bg"),
          surface: { DEFAULT: c("surface"), alt: c("surface.alt") },
          border: c("border"),
          text: c("text"),
          neon: c("neon"),
          contrast: c("contrast"),
          heat: c("heat"),
          muted: c("muted"),
          accent: { DEFAULT: c("accent"), soft: c("accent.soft"), light: c("accent.light") },
          ok: { DEFAULT: c("ok"), soft: c("ok.soft") },
          warn: { DEFAULT: c("warn"), soft: c("warn.soft") },
          bad: { DEFAULT: c("bad"), soft: c("bad.soft") },
          info: { DEFAULT: c("info"), soft: c("info.soft") },
          cat: {
            front: c("cat.front"),
            api: c("cat.api"),
            back: c("cat.back"),
            shared: c("cat.shared"),
            infra: c("cat.infra"),
            tooling: c("cat.tooling"),
          },
        },
        shadows: {
          card: pair("0 1px 2px rgb(20 24 40 / 6%), 0 4px 16px rgb(20 24 40 / 4%)", "none"),
          // menus et listes déroulantes (Popover)
          popover: { value: "0 12px 32px rgb(0 0 0 / 22%)" },
          // fenêtres (Dialog)
          dialog: { value: "0 24px 70px rgb(0 0 0 / 35%)" },
          // Néon (thème sombre seulement, rien en clair) : en `textShadow` pour le texte, en `boxShadow` pour les traits.
          //   neonSign : enseigne (logo) · neonText : titre de carte, onglet actif · neonTube : trait lumineux (onglet actif)
          //   neonButton : halo du bouton principal
          neonSign: pair("none", "0 0 2px #fff, 0 0 7px #ff3d77, 0 0 16px #ff3d77, 0 0 34px rgb(255 61 119 / 70%)"),
          neonText: pair("none", "0 0 1px rgb(255 255 255 / 60%), 0 0 6px rgb(255 61 119 / 80%), 0 0 16px rgb(255 61 119 / 40%)"),
          neonTube: pair("none", "0 0 6px #ff3d77, 0 0 16px rgb(255 61 119 / 60%)"),
          neonButton: pair("none", "0 0 14px rgb(255 61 119 / 45%)"),
          // anneau de focus doux (éléments cliquables encadrés)
          ring: { value: "0 0 0 2px token(colors.accent.soft)" },
        },
      },
      /*
       * Styles de texte du design system (src/components/ds). Les tailles sont en px : la page est à 14px.
       * Les rayons aussi sont en px (ceux du preset Panda sont en rem, donc trop petits à 14px) : sm 4 · md 6 · lg 8 · xl 12 · full.
       * Police à chasse fixe : le jeton `mono` du preset (fontFamily: "mono", ou var(--fonts-mono) dans map.css).
       */
      textStyles: {
        label: { value: { fontSize: "xs", fontWeight: "semibold" } }, // pastilles, compteurs
        caption: { value: { fontSize: "sm" } }, // métadonnées, boutons compacts
        body: { value: { fontSize: "md" } }, // listes, menus, champs
        heading: { value: { fontSize: "lg", fontWeight: "bold" } }, // titre de carte
        title: { value: { fontSize: "xl", fontWeight: "bold", lineHeight: "1.25" } }, // titre de page
        overline: { value: { fontSize: "sm", textTransform: "uppercase", letterSpacing: "0.04em" } }, // rubriques
      },
    },
  },
  globalCss: {
    ":root": { colorScheme: "light dark" },
    "html, body": { bg: "bg", color: "text", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", fontSize: "base", lineHeight: "1.45" },
    "code, .mono": { fontFamily: "mono" },
    code: { fontSize: "sm", bg: "surface.alt", px: "5px", py: "1px", borderRadius: "sm" },
    "button, input": { font: "inherit", color: "inherit" },
    // Focus clavier visible partout (les composants qui ont leur propre indicateur le remplacent)
    ":focus-visible": { outline: "2px solid token(colors.accent)", outlineOffset: "2px" },
    // Chiffres alignés dans les compteurs, versions et heures
    ".tabular": { fontVariantNumeric: "tabular-nums" },
    "@media (prefers-reduced-motion: reduce)": {
      "*, *::before, *::after": { animationDuration: "0.01ms !important", animationIterationCount: "1 !important", transitionDuration: "0.01ms !important", scrollBehavior: "auto !important" },
    },
  },
});
