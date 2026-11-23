// Champs de saisie, grilles et petites classes utilitaires partagées.
import { css, cva } from "styled-system/css";

// `bare` : sans cadre, dans un bloc qui a déjà le sien (recherche ⌘K, filtre d'une liste déroulante)
export const input = cva({
  base: { w: "full", textStyle: "body", bg: "surface", color: "text", border: "1px solid token(colors.border)", borderRadius: "lg", px: "3", h: "32px", _placeholder: { color: "muted" }, _focusVisible: { outline: "2px solid token(colors.accent)", outlineOffset: "-1px" } },
  variants: {
    bare: { true: { border: "none", borderRadius: 0, bg: "transparent", h: "auto", py: "2.5", _focusVisible: { outline: "none" } } },
  },
});

export const cols2 = css({ display: "grid", gridTemplateColumns: { base: "1fr", lg: "repeat(2, minmax(0, 1fr))" }, gap: "4" });
export const cols3 = css({ display: "grid", gridTemplateColumns: { base: "1fr", lg: "repeat(3, minmax(0, 1fr))" }, gap: "4" });
export const muted = css({ color: "muted" });
export const small = css({ textStyle: "caption" });
export const mono = css({ fontFamily: "mono" });
