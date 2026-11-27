// Pastilles (statut coloré), compteurs et points de couleur des couches de la carte.
import type { ReactNode } from "react";
import { css, cva, cx } from "styled-system/css";

export type Tone = "ok" | "warn" | "bad" | "info" | "accent" | "neutral";
export const TONES: readonly Tone[] = ["ok", "warn", "bad", "info", "accent", "neutral"];

// Enseigne, sombre : la pastille devient un petit tube de sa couleur (cadre, lueur, fond vide) ; en clair, fond pâle.
const tube = {
  _dark: {
    bg: "transparent",
    borderColor: "currentColor",
    boxShadow: "0 0 6px color-mix(in srgb, currentColor 45%, transparent), inset 0 0 4px color-mix(in srgb, currentColor 30%, transparent)",
    textShadow: "0 0 6px color-mix(in srgb, currentColor 55%, transparent)",
  },
} as const;

export const badge = cva({
  base: {
    display: "inline-flex",
    alignItems: "center",
    gap: "1",
    borderRadius: "full",
    px: "2",
    py: "1px",
    textStyle: "label",
    whiteSpace: "nowrap",
    border: "1px solid transparent",
  },
  variants: {
    tone: {
      ok: { bg: "ok.soft", color: "ok", ...tube },
      warn: { bg: "warn.soft", color: "warn", ...tube },
      bad: { bg: "bad.soft", color: "bad", ...tube },
      info: { bg: "info.soft", color: "info", ...tube },
      accent: { bg: "accent.soft", color: "accent", ...tube },
      neutral: { bg: "transparent", color: "muted", borderColor: "border" },
    },
    // pastille cliquable (bouton ou lien) : au survol, un contour léger de la couleur du texte
    // enfoncée (aria-pressed) : contour plein et anneau ; le survol ne change pas l'état affiché
    // (la couleur du ton reste : elle dit de quoi parle la pastille)
    interactive: {
      true: {
        cursor: "pointer",
        textDecoration: "none",
        _hover: { borderColor: "color-mix(in srgb, currentColor 45%, transparent)" },
        "&[aria-pressed=true], &[aria-pressed=true]:hover": { borderColor: "currentColor", boxShadow: "0 0 0 1px currentColor" },
      },
    },
  },
  defaultVariants: { tone: "neutral" },
});

export const Badge = ({ tone = "neutral", children, title }: { tone?: Tone; children: ReactNode; title?: string }) => (
  <span className={badge({ tone })} title={title}>
    {children}
  </span>
);

export const count = css({
  bg: "surface.alt",
  border: "1px solid token(colors.border)",
  borderRadius: "full",
  px: "7px",
  fontSize: "xs",
  color: "muted",
  fontWeight: "normal",
  // dans un titre de rubrique en capitales, le nombre reste normal
  textTransform: "none",
  letterSpacing: 0,
});

export const Count = ({ children }: { children: ReactNode }) => <span className={count}>{children}</span>;

// Point coloré devant un libellé (couches de la carte, légendes de graphiques)
export const Dot = ({ color, className }: { color: string; className?: string }) => (
  <i aria-hidden className={cx(css({ display: "inline-block", w: "8px", h: "8px", borderRadius: "full", flex: "none" }), className)} style={{ background: color }} />
);
