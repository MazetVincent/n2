// Pastille activable (un élément d'une liste qu'on active ou coupe d'un clic, ex. un package.json dans Librairies),
// et son groupe (ex. une couche, qui active ou coupe tous ses éléments). Même apparence « sélectionné » pour les pastilles,
// les boutons à bascule et le segment choisi (les badges à bascule gardent la couleur de leur ton) :
//  - éteint : texte gris, cadre neutre, sans coche ; allumé : coche, fond rose clair (`accent.soft`), cadre rose, texte clair ;
//  - le survol ne change jamais l'état affiché : éteint, le fond s'éclaircit et le texte s'éclaire ; allumé, un anneau doux.
// Le groupe (`level: "group"`) a un cadre rose principal, ses éléments un rose plus clair.
import type { ReactNode } from "react";
import { css, cva, cx } from "styled-system/css";
import { Icon } from "./icon";

/** Apparence « sélectionné », commune aux pastilles, boutons à bascule et contrôles segmentés */
export const selected = { bg: "accent.soft", borderColor: "accent", color: "text" } as const;

export const toggleChip = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: "1.5",
    w: "full",
    minW: 0,
    textAlign: "left",
    px: "2.5",
    py: "1.5",
    border: "1px solid",
    borderColor: "border",
    color: "muted",
    borderRadius: "lg",
    bg: "surface",
    textStyle: "body",
    cursor: "pointer",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    transition: "border-color 0.12s, color 0.12s, background 0.12s, box-shadow 0.12s",
    _focusVisible: { outline: "2px solid token(colors.accent)", outlineOffset: "1px" },
    "&:hover:enabled": { bg: "surface.alt", color: "text" },
    "&[aria-pressed=true]": { bg: "accent.soft", borderColor: "var(--chip-on)", color: "text" },
    "&[aria-pressed=true]:hover:enabled": { bg: "accent.soft", boxShadow: "ring" },
    "& > [data-check]": { flex: "none", color: "var(--chip-on)", opacity: 0, transition: "opacity 0.12s" },
    "&[aria-pressed=true] > [data-check]": { opacity: 1 },
    _disabled: { cursor: "default" },
  },
  variants: {
    level: {
      item: { "--chip-on": "token(colors.accent.light)" },
      group: { "--chip-on": "token(colors.accent)", textStyle: "overline", fontWeight: "semibold" },
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
