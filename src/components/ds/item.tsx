// Éléments de liste cliquables (carte de PR, ticket, erreur…), titres de rubrique, liens externes.
import { useId, type MouseEvent, type ReactNode } from "react";
import { css, cva, cx } from "styled-system/css";
import { opensInChrome } from "~/features/prefs/logic";
import { openInChrome, useLinkTarget } from "~/lib/actions";
import { badge, type Tone } from "./badge";

// `tone` : bande colorée à gauche, pour repérer l'urgence d'un coup d'œil (vue « À faire »).
// `flush` : sans bordure ni fond, quand l'élément est déjà dans un bloc encadré (erreur Sentry + sa trace).
export const item = cva({
  base: {
    position: "relative",
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
    // le focus est sur la zone cliquable (lien ou bouton), pas sur la ligne
    "&:has(> [data-item-hit]:focus-visible)": { borderColor: "accent", boxShadow: "ring" },
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
    flush: { true: { border: "none", bg: "transparent", boxShadow: "none", borderRadius: "lg", _hover: { bg: "surface" } } },
  },
  defaultVariants: { tone: "none" },
});

// La ligne entière est cliquable grâce à un vrai lien (ou bouton) étendu sous le contenu : adresse au survol, ⌘-clic,
// clic molette et menu contextuel marchent, et les liens ou boutons du contenu restent des éléments à part (pas imbriqués).
const hit = css({ position: "absolute", inset: 0, zIndex: 0, borderRadius: "inherit", bg: "transparent", border: "none", p: 0, cursor: "pointer", outline: "none" });
// le contenu laisse passer les clics vers la zone cliquable, sauf sur ses propres éléments interactifs
const content = css({
  position: "relative",
  zIndex: 1,
  pointerEvents: "none",
  "& :is(a, button, input, select, textarea, label, summary, [role=button], [tabindex])": { pointerEvents: "auto" },
});

/** `href` : lien externe ; `onSelect` : action dans N2 (navigation), prioritaire */
export function Item({ href, onSelect, children, tone, flush }: { href?: string; onSelect?: () => void; children: ReactNode; tone?: Tone; flush?: boolean }) {
  const labelId = useId();
  const target = useLinkTarget();
  const hitProps = { className: hit, "aria-labelledby": labelId, "data-item-hit": "" };
  return (
    <div className={item({ tone, flush })}>
      {onSelect ? (
        <button type="button" {...hitProps} onClick={onSelect} />
      ) : href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" {...hitProps} onClick={(e) => chromeClick(e, href, target)} />
      ) : null}
      <div id={labelId} className={content}>
        {children}
      </div>
    </div>
  );
}

/** Clic gauche simple en mode « chrome » : le serveur ouvre le lien dans Chrome à la place du navigateur */
function chromeClick(e: MouseEvent, href: string, target: ReturnType<typeof useLinkTarget>) {
  if (!opensInChrome(target, e)) return;
  e.preventDefault();
  void openInChrome(href);
}

export const ItemTitle = ({ children }: { children: ReactNode }) => (
  <div className={css({ fontWeight: "semibold", overflow: "hidden", textOverflow: "ellipsis", lineClamp: 2 })}>{children}</div>
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

// ---------- Liens externes (navigateur courant, ou onglet Chrome selon ui.links) ----------
export function ExtLink({ href, children, tone, className, title }: { href: string; children: ReactNode; tone?: Tone; className?: string; title?: string }) {
  const target = useLinkTarget();
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className={cx(tone ? badge({ tone, interactive: true }) : css({ color: "inherit" }), className)}
      onClick={(e) => {
        // un lien dans un élément cliquable (carte, ligne de tableau) ne déclenche que lui
        e.stopPropagation();
        chromeClick(e, href, target);
      }}
    >
      {children}
    </a>
  );
}
