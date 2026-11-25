// Éléments de liste cliquables (carte de PR, ticket, erreur…), titres de rubrique, liens externes.
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { css, cva, cx } from "styled-system/css";
import { openInChrome } from "~/lib/actions";
import { badge, type Tone } from "./badge";

// `tone` : bande colorée à gauche, pour repérer l'urgence d'un coup d'œil (vue « À faire »).
// `flush` : sans bordure ni fond, quand l'élément est déjà dans un bloc encadré (erreur Sentry + sa trace).
export const item = cva({
  base: {
    display: "block",
    px: "2.5",
    py: "2",
    border: "1px solid token(colors.border)",
    borderRadius: "lg",
    bg: "surface.alt",
    // sombre : en creux dans la carte
    boxShadow: "inset",
    cursor: "pointer",
    transition: "border-color 0.12s, background 0.12s",
    _hover: { borderColor: "accent" },
    _focusVisible: { borderColor: "accent", outline: "none", boxShadow: "ring" },
  },
  variants: {
    tone: {
      none: {},
      bad: { borderLeft: "3px solid token(colors.bad)", pl: "8px" },
      warn: { borderLeft: "3px solid token(colors.warn)", pl: "8px" },
      info: { borderLeft: "3px solid token(colors.info)", pl: "8px" },
      ok: { borderLeft: "3px solid token(colors.ok)", pl: "8px" },
      accent: { borderLeft: "3px solid token(colors.accent)", pl: "8px" },
      neutral: {},
    },
    flush: { true: { border: "none", bg: "transparent", borderRadius: "lg", _hover: { bg: "surface" } } },
  },
  defaultVariants: { tone: "none" },
});

export function Item({ href, onSelect, children, tone, flush }: { href?: string; onSelect?: () => void; children: ReactNode; tone?: Tone; flush?: boolean }) {
  const go = () => (onSelect ? onSelect() : href && openInChrome(href));
  return (
    <div
      role="link"
      tabIndex={0}
      className={item({ tone, flush })}
      onClick={go}
      onKeyDown={(e) => {
        if (e.key === "Enter") go();
      }}
    >
      {children}
    </div>
  );
}

export const ItemTitle = ({ children }: { children: ReactNode }) => (
  <div className={css({ fontWeight: "550", overflow: "hidden", textOverflow: "ellipsis", lineClamp: 2 })}>{children}</div>
);
export const ItemMeta = ({ children }: { children: ReactNode }) => (
  <div className={css({ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "1.5", mt: "1", textStyle: "caption", color: "muted" })}>{children}</div>
);
export const List = ({ children }: { children: ReactNode }) => (
  <ul className={css({ listStyle: "none", m: 0, p: 0, display: "flex", flexDirection: "column", gap: "1.5" })}>{children}</ul>
);
export const Empty = ({ children }: { children: ReactNode }) => <p className={css({ color: "muted", textStyle: "body", py: "2" })}>{children}</p>;

// Titre de rubrique : même apparence partout (capitales grises) ; le rose est réservé à ce qui est sélectionné
export const H3 = ({ children }: { children: ReactNode }) => (
  <h3 className={css({ textStyle: "overline", color: "muted", mt: "3.5", mb: "1.5", display: "flex", alignItems: "center", gap: "1.5" })}>
    {children}
  </h3>
);

// ---------- Liens externes (nouvel onglet Chrome) ----------
const stop = (e: MouseEvent | KeyboardEvent) => {
  e.preventDefault();
  e.stopPropagation();
};

export function ExtLink({ href, children, tone, className, title }: { href: string; children: ReactNode; tone?: Tone; className?: string; title?: string }) {
  return (
    <a
      href={href}
      title={title}
      className={cx(tone ? badge({ tone, interactive: true }) : css({ color: "inherit" }), className)}
      onClick={(e) => {
        stop(e);
        openInChrome(href);
      }}
    >
      {children}
    </a>
  );
}
