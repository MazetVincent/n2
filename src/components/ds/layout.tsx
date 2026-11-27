// Champs de saisie, grilles et petites classes utilitaires partagées.
import { css, cva } from "styled-system/css";

// `bare` : sans cadre, dans un bloc qui a déjà le sien (recherche ⌘K, filtre d'une liste déroulante)
export const input = cva({
  // sombre : le champ actif s'allume comme un tube (cadre clair, lueur rose) au lieu du contour de focus
  base: {
    w: "full",
    textStyle: "body",
    bg: "surface",
    color: "text",
    border: "1px solid token(colors.border)",
    borderRadius: "lg",
    px: "3",
    h: "32px",
    transition: "border-color 0.15s, box-shadow 0.15s",
    _placeholder: { color: "muted" },
    _focusVisible: { outline: { base: "2px solid token(colors.accent)", _dark: "none" }, outlineOffset: "-1px", borderColor: { _dark: "tube" }, boxShadow: "neonField" },
  },
  variants: {
    bare: { true: { border: "none", borderRadius: 0, bg: "transparent", h: "auto", py: "2.5", _focusVisible: { outline: "none", boxShadow: "none" } } },
  },
});

export const cols2 = css({ display: "grid", gridTemplateColumns: { base: "1fr", lg: "repeat(2, minmax(0, 1fr))" }, gap: "4" });
export const cols3 = css({ display: "grid", gridTemplateColumns: { base: "1fr", lg: "repeat(3, minmax(0, 1fr))" }, gap: "4" });
export const muted = css({ color: "muted" });
export const small = css({ textStyle: "caption" });
export const mono = css({ fontFamily: "mono" });
