import { defineConfig } from "@pandacss/dev";
import presetBase from "@pandacss/preset-base";
import presetPanda from "@pandacss/preset-panda";
import { COLORS, type ColorName } from "./src/styles/colors";

/*
 * Panda CSS : styles générés dans `styled-system/` (non versionné, `bun run codegen`).
 * Les couleurs sont des « semantic tokens » clair / sombre : le schéma du thème affiché (condition `_dark`, attribut
 * data-scheme de <html>, posé avant l'affichage par src/features/theme selon le thème choisi et le réglage de macOS).
 * Ils sont aussi exposés en variables CSS (--colors-…), utilisées par src/styles/map.css.
 */
const pair = (base: string, dark: string) => ({ value: { base, _dark: dark } });
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
  // `_dark` : thème affiché en sombre (et non plus « macOS en sombre ») : le choix des Préférences peut le contredire
  conditions: { extend: { dark: "[data-scheme=dark] &" } },
  theme: {
    extend: {
      tokens: {
        radii: { sm: { value: "4px" }, md: { value: "6px" }, lg: { value: "8px" }, xl: { value: "12px" } },
        // échelle de texte en px (la page est à 14px) : pas de taille intermédiaire (12.5px, 11.5px…)
        fontSizes: { xs: { value: "11px" }, sm: { value: "12px" }, md: { value: "13px" }, base: { value: "14px" }, lg: { value: "15px" }, xl: { value: "20px" } },
        // polices servies en local (src/styles/fonts.css) ; le texte courant reste en police système
        fonts: {
          body: { value: "system-ui, -apple-system, 'Segoe UI', sans-serif" }, // texte courant
          sign: { value: "'Tilt Neon', system-ui, sans-serif" }, // enseigne : logo, titres de cartes et de page
          display: { value: "'Chakra Petch', system-ui, sans-serif" }, // onglets, rubriques
          mono: { value: "'Kode Mono', ui-monospace, SFMono-Regular, Menlo, monospace" }, // chiffres, versions, code
        },
      },
      semanticTokens: {
        // valeurs dans src/styles/colors.ts (partagées avec le guide de l'équipe)
        colors: {
          bg: c("bg"),
          surface: { DEFAULT: c("surface"), alt: c("surface.alt"), lift: c("surface.lift") },
          border: c("border"),
          text: c("text"),
          neon: c("neon"),
          sign: c("sign"),
          tube: { DEFAULT: c("tube"), off: c("tube.off") },
          screw: c("screw"),
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
          // Relief (sombre) : carte posée sur la trame (reflet sur le bord haut, ombre portée profonde) ;
          // au survol, un halo rose. En clair, l'ombre douce d'avant, sans changement au survol.
          card: pair("0 1px 2px rgb(20 24 40 / 6%), 0 4px 16px rgb(20 24 40 / 4%)", "inset 0 1px 0 rgb(255 255 255 / 7%), 0 1px 0 rgb(0 0 0 / 60%), 0 20px 40px -20px rgb(0 0 0 / 95%)"),
          cardHover: pair("0 1px 2px rgb(20 24 40 / 6%), 0 4px 16px rgb(20 24 40 / 4%)", "inset 0 1px 0 rgb(255 255 255 / 9%), 0 1px 0 rgb(0 0 0 / 60%), 0 20px 40px -20px rgb(0 0 0 / 95%), 0 0 26px -6px rgb(255 61 119 / 40%)"),
          // élément en creux dans une carte (ligne de liste, champ, contrôle de la barre)
          inset: pair("none", "inset 0 1px 3px rgb(0 0 0 / 65%)"),
          // barre du haut détachée du contenu qui défile dessous
          bar: pair("none", "0 12px 30px -12px rgb(0 0 0 / 90%)"),
          // menus et listes déroulantes (Popover)
          popover: { value: "0 12px 32px rgb(0 0 0 / 22%)" },
          // fenêtres (Dialog)
          dialog: { value: "0 24px 70px rgb(0 0 0 / 35%)" },
          // Néon (thème sombre seulement, rien en clair) : en `textShadow` pour le texte, en `boxShadow` pour les traits.
          //   neonSign : enseigne (logo) · neonText : titre de carte, onglet actif · neonTube : trait lumineux (onglet actif)
          //   neonButton / neonButtonHover : tube du bouton principal (et d'un bouton encadré qui s'allume au survol)
          //   neonGas : gaz allumé de l'interrupteur · neonFrame : tube autour du segment choisi · neonField : champ actif
          // le logo est une enseigne allumée dans tous les thèmes : en clair, un tube magenta à la lueur plus courte
          neonSign: pair("0 0 1px rgb(255 255 255 / 90%), 0 0 6px rgb(255 61 119 / 55%), 0 0 16px rgb(255 61 119 / 30%)", "0 0 2px #fff, 0 0 7px #ff3d77, 0 0 16px #ff3d77, 0 0 34px rgb(255 61 119 / 70%)"),
          neonText: pair("none", "0 0 1px rgb(255 255 255 / 60%), 0 0 6px rgb(255 61 119 / 80%), 0 0 16px rgb(255 61 119 / 40%)"),
          neonTube: pair("none", "0 0 6px #ff3d77, 0 0 16px rgb(255 61 119 / 60%)"),
          neonButton: pair("none", "0 0 4px #ff3d77, 0 0 12px rgb(255 61 119 / 65%), inset 0 0 6px rgb(255 61 119 / 55%)"),
          neonButtonHover: pair("0 0 0 3px {colors.accent.soft}", "0 0 6px #ff3d77, 0 0 20px rgb(255 61 119 / 75%), 0 0 40px rgb(255 61 119 / 30%), inset 0 0 10px rgb(255 61 119 / 60%)"),
          neonGas: pair("none", "0 0 4px #ff3d77, 0 0 10px #ff3d77, 0 0 22px rgb(255 61 119 / 55%)"),
          neonFrame: pair("0 0 0 1px {colors.accent}", "0 0 0 1.5px #ffd3df, 0 0 6px #ff3d77, 0 0 14px rgb(255 61 119 / 50%), inset 0 0 6px rgb(255 61 119 / 35%)"),
          neonField: pair("none", "inset 0 2px 6px rgb(0 0 0 / 70%), 0 0 4px #ff3d77, 0 0 14px rgb(255 61 119 / 50%)"),
          // anneau de focus doux (éléments cliquables encadrés)
          ring: { value: "0 0 0 2px {colors.accent.soft}" },
        },
        // Dégradés (thème sombre seulement, « none » en clair), utilisés avec bgGradient :
        //   card : lumière du logo + volume de la carte · cardHead : reflet de l'en-tête · rim : arête claire en haut à gauche qui vire
        //   au rose en bas à droite · tabGlow : la lumière du logo diffusée dans l'onglet actif
        gradients: {
          // 1re couche : la lumière du logo, fixée sur la fenêtre (background-attachment: fixed dans cardFrame), donc chaque
          // carte en reçoit selon sa distance au logo ; 2e couche : le volume de la carte
          card: pair("none", "radial-gradient(1100px 680px at calc(max(24px, (100% - 1392px) / 2) + 18px) 0, rgb(255 61 119 / 13%), rgb(255 61 119 / 4%) 45%, transparent 75%), linear-gradient(180deg, #1e1823 0%, #151019 100%)"),
          cardHead: pair("none", "linear-gradient(180deg, rgb(255 255 255 / 3%), transparent)"),
          rim: pair("none", "linear-gradient(135deg, rgb(255 255 255 / 26%), rgb(255 255 255 / 0) 32%, rgb(255 61 119 / 0) 62%, rgb(255 61 119 / 50%))"),
          tabGlow: pair("none", "linear-gradient(to top, rgb(255 61 119 / 24%), rgb(255 61 119 / 6%) 65%, transparent)"),
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
        // titres en police d'enseigne (Tilt Neon n'a qu'une graisse : pas de gras, il serait simulé)
        heading: { value: { fontFamily: "sign", fontSize: "lg", fontWeight: "normal" } }, // titre de carte
        title: { value: { fontFamily: "sign", fontSize: "xl", fontWeight: "normal", lineHeight: "1.25" } }, // titre de page
        overline: { value: { fontFamily: "display", fontSize: "sm", textTransform: "uppercase", letterSpacing: "0.06em" } }, // rubriques
      },
    },
  },
  globalCss: {
    // contrôles natifs, barres de défilement (et guide, dans son cadre) dans le schéma du thème affiché
    ":root": { colorScheme: "light" },
    ":root[data-scheme=dark]": { colorScheme: "dark" },
    "html, body": { bg: "bg", color: "text", fontFamily: "body", fontSize: "base", lineHeight: "1.45" },
    // Relief (sombre) : une trame fine et une lueur en haut de page, sous les cartes. Sur html (toute la fenêtre,
    // même quand la page est plus courte), body transparent par-dessus.
    "[data-scheme=dark]": {
      "& body": { background: "transparent" },
      "&": {
        background:
          "linear-gradient(rgb(255 255 255 / 2.2%) 1px, transparent 1px) 0 0 / 32px 32px, linear-gradient(90deg, rgb(255 255 255 / 2.2%) 1px, transparent 1px) 0 0 / 32px 32px, radial-gradient(120% 60% at 50% -10%, #1e1424, transparent 60%), token(colors.bg)",
        backgroundAttachment: "fixed",
      },
      // La lumière du logo (enseigne) descend dans la page, derrière les cartes : on la voit autour d'elles, sur tous
      // les onglets. Fixe (la barre du haut, et donc le logo, reste en place au défilement), au rythme des battements du
      // logo (même animation, src/styles/app.css). Centre : celui du logo (marge de la barre + 18px). Même géométrie
      // que la couche de lumière du jeton « card », pour que la lumière se raccorde au bord des cartes.
      "& body::before": {
        content: '""',
        position: "fixed",
        inset: 0,
        zIndex: -1,
        pointerEvents: "none",
        background: "radial-gradient(1100px 680px at calc(max(24px, (100% - 1392px) / 2) + 18px) 0, rgb(255 61 119 / 16%), rgb(255 61 119 / 6%) 45%, transparent 75%)",
        animation: "neon-flicker 9s linear infinite",
      },
    },
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
