// Pastille activable (un élément d'une liste qu'on active ou coupe d'un clic, ex. un package.json dans Librairies),
// et son groupe (ex. une couche, qui active ou coupe tous ses éléments). Même apparence « sélectionné » pour les pastilles,
// les boutons à bascule (outline, control, IconButton encadré) ; les badges à bascule gardent la couleur de leur ton.
// Enseigne :
//  - éteinte : un tube éteint (cadre `tube.off`, fond de carte, texte gris, sans coche) ;
//  - allumée (sombre) : un tube allumé (cadre `tube`, lueur `neonButton`, texte en néon, coche lumineuse) ;
//  - en clair (l'enseigne éteinte de jour) : mêmes formes sans lueur, fond rose clair et cadre magenta ;
//  - le survol ne change jamais l'état affiché : éteinte, le fond s'éclaircit et le texte s'éclaire ; allumée, la lueur forcit ;
//  - figée (`disabled`, ex. un onglet toujours affiché, avec un cadenas) : allumée, sans réaction au survol.
// Le groupe (`level: "group"`) est un tube plus épais (2px) en capitales ; ses éléments, un tube fin.
import type { ReactNode } from "react";
import { css, cva, cx } from "styled-system/css";
import { Icon } from "./icon";

/** Apparence « sélectionné » (tube allumé), commune aux pastilles et aux boutons à bascule */
export const selected = {
  bg: { base: "accent.soft", _dark: "transparent" },
  borderColor: "tube",
  color: { base: "text", _dark: "neon" },
  textShadow: "neonText",
  boxShadow: "neonButton",
} as const;

/** Survol d'un élément « sélectionné » : l'état ne change pas, la lueur forcit (en clair, un anneau doux) */
export const selectedHover = { ...selected, boxShadow: "neonButtonHover" } as const;

export const toggleChip = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: "1.5",
    w: "full",
    minW: 0,
    textAlign: "left",
    px: "3",
    py: "1.5",
    border: "1px solid",
    borderColor: { base: "border", _dark: "tube.off" },
    color: "muted",
    borderRadius: "full",
    bg: "surface",
    textStyle: "body",
    cursor: "pointer",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    transition: "border-color 0.12s, color 0.12s, background 0.12s, box-shadow 0.15s",
    _focusVisible: { outline: "2px solid token(colors.accent)", outlineOffset: "1px" },
    "&:hover:enabled": { bg: "surface.alt", color: "text" },
    "&[aria-pressed=true]": selected,
    "&[aria-pressed=true]:hover:enabled": selectedHover,
    "& > [data-check]": { flex: "none", opacity: 0, transition: "opacity 0.12s" },
    // coche (ou cadenas) lumineuse : en sombre, le verre du tube et un halo de l'accent du thème (aucun en Aubergine douce)
    "&[aria-pressed=true] > [data-check]": { opacity: 1, color: { base: "accent", _dark: "tube" }, filter: { _dark: "drop-shadow(0 0 3px token(colors.accent))", _aubergine: "none" } },
    _disabled: { cursor: "default" },
  },
  variants: {
    level: {
      item: {},
      // tube épais (2px de cadre) : 1px de marge en moins en haut et en bas, pour la même hauteur qu'un élément
      group: {
        textStyle: "overline",
        fontWeight: "semibold",
        borderWidth: "2px",
        py: "calc(0.375rem - 1px)",
      },
    },
  },
  defaultVariants: { level: "item" },
});

export function ToggleChip({
  pressed,
  onClick,
  level,
  title,
  className,
  disabled,
  icon,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  level?: "item" | "group";
  title?: string;
  className?: string;
  /** figée (ex. un onglet toujours affiché) */
  disabled?: boolean;
  /** remplace la coche (ex. un cadenas pour une pastille figée) */
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <button type="button" aria-pressed={pressed} data-chip={level ?? "item"} onClick={onClick} title={title} disabled={disabled} className={cx(toggleChip({ level }), className)}>
      <span data-check className={css({ display: "inline-flex" })}>
        {icon ?? <Icon name="check" size={13} />}
      </span>
      {children}
    </button>
  );
}
