// Boutons du design system.
//   variant : solid (action principale, rose) · outline (action secondaire, encadrée) · ghost (discret, sans cadre)
//             · link (texte cliquable) · control (contrôle de barre d'outils, 34px de haut)
//   à bascule : aria-pressed sur `outline` ou `control` (apparence « sélectionné » de ds/toggle-chip.tsx), ou ToggleButton
//   size    : xs (dans une ligne de liste) · sm (par défaut) · md · bar (barre du haut)
//
// `className` sert aux ajouts (marges, taille de texte). Pour REMPLACER une propriété de la recette, fusionner les styles :
//   className={css(button.raw({ variant: "link" }), { textDecoration: "underline" })}
// (avec cx, deux classes Panda sur la même propriété : l'ordre de la feuille décide, pas l'ordre des classes)
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { css, cva, cx, type RecipeVariantProps } from "styled-system/css";
import { Icon } from "./icon";
import { selected } from "./toggle-chip";

export const button = cva({
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "1.5",
    border: "1px solid transparent",
    borderRadius: "md",
    bg: "transparent",
    color: "text",
    cursor: "pointer",
    whiteSpace: "nowrap",
    textDecoration: "none",
    transition: "border-color 0.12s, color 0.12s, background 0.12s",
    _disabled: { opacity: 0.55, cursor: "default" },
  },
  variants: {
    variant: {
      solid: { bg: "accent", borderColor: "accent", color: "white", fontWeight: "semibold", boxShadow: "neonButton", _hover: { _enabled: { filter: "brightness(1.08)" } } },
      outline: {
        bg: "surface",
        borderColor: "border",
        _hover: { _enabled: { bg: "surface.alt" } },
        // bouton à bascule (aria-pressed) : même apparence « sélectionné » que les pastilles activables (ds/toggle-chip.tsx) ;
        // le survol ne change pas l'état affiché
        "&[aria-pressed=true]": selected,
        "&[aria-pressed=true]:hover:enabled": { ...selected, boxShadow: "ring" },
      },
      ghost: { color: "muted", _hover: { _enabled: { color: "text", bg: "surface.alt" } }, _pressed: { color: "accent" } },
      link: { color: "muted", p: "0 !important", h: "auto !important", borderRadius: "sm", _hover: { _enabled: { color: "text" } } },
      accentLink: { color: "accent", p: "0 !important", h: "auto !important", borderRadius: "sm", _hover: { _enabled: { textDecoration: "underline" } } },
      control: {
        bg: "surface",
        borderColor: "border",
        color: "muted",
        borderRadius: "lg",
        _hover: { _enabled: { bg: "surface.alt", color: "text" } },
        "&[aria-pressed=true]": selected,
        "&[aria-pressed=true]:hover:enabled": { ...selected, boxShadow: "ring" },
      },
    },
    size: {
      xs: { textStyle: "caption", px: "2", py: "1px" },
      sm: { textStyle: "caption", px: "2.5", h: "26px" },
      md: { textStyle: "body", px: "3", h: "32px", borderRadius: "lg" },
      bar: { px: "3", h: "34px", gap: "2" },
    },
  },
  defaultVariants: { variant: "outline", size: "sm" },
});

export type ButtonVariants = NonNullable<RecipeVariantProps<typeof button>>;

type Props = ButtonVariants & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & { type?: "button" | "submit"; children: ReactNode };

export function Button({ variant, size, className, type = "button", ...rest }: Props) {
  return <button type={type} className={cx(button({ variant, size }), className)} {...rest} />;
}

// Bouton qui ne contient qu'une icône : `label` est obligatoire (lu par les lecteurs d'écran et affiché au survol).
export const iconButton = cva({
  base: {
    display: "inline-grid",
    placeItems: "center",
    flex: "none",
    borderRadius: "md",
    border: "1px solid transparent",
    bg: "transparent",
    color: "muted",
    cursor: "pointer",
    transition: "border-color 0.12s, color 0.12s, background 0.12s",
    _hover: { color: "text", bg: "surface.alt" },
    _pressed: { color: "accent" },
    _disabled: { opacity: 0.55, cursor: "default" },
  },
  variants: {
    size: { sm: { w: "22px", h: "22px" }, md: { w: "26px", h: "26px" }, bar: { w: "34px", h: "34px", borderRadius: "lg" } },
    framed: {
      true: {
        bg: "surface",
        borderColor: "border",
        _hover: { bg: "surface.alt" },
        // même clé que _pressed de la base : cva fusionne, la couleur « sélectionné » remplace le rose de l'icône
        _pressed: { ...selected, _hover: { ...selected, boxShadow: "ring" } },
      },
    },
  },
  defaultVariants: { size: "md" },
});

type IconProps = NonNullable<RecipeVariantProps<typeof iconButton>> &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "aria-label"> & { label: string; children: ReactNode };

export function IconButton({ label, size, framed, className, title, ...rest }: IconProps) {
  return <button type="button" aria-label={label} title={title ?? label} className={cx(iconButton({ size, framed }), className)} {...rest} />;
}

/**
 * Bouton à bascule (une option de vue : « Tests et stories », « Tous les liens »…) : un bouton encadré avec aria-pressed,
 * une coche quand il est allumé. À la place d'un texte suivi d'un interrupteur.
 */
export function ToggleButton({ pressed, onChange, title, size = "sm", children }: { pressed: boolean; onChange: (pressed: boolean) => void; title?: string; size?: "sm" | "md" | "bar"; children: ReactNode }) {
  return (
    <Button variant="outline" size={size} aria-pressed={pressed} title={title} onClick={() => onChange(!pressed)}>
      {/* place de la coche toujours réservée : le bouton ne change pas de largeur au clic */}
      <Icon name="check" size={13} className={css({ opacity: pressed ? 1 : 0, transition: "opacity 0.12s" })} />
      {children}
    </Button>
  );
}
