// Carte (bloc d'un onglet) et section repliable.
// `controls` : choix de vue (contrôle segmenté…) affiché juste à droite du titre
// `collapse` : clé sous laquelle le navigateur retient si la carte est repliée (bouton à droite de l'en-tête) ;
//   repliée, il ne reste que la barre de titre.
// `scroll` : hauteur maximale du contenu (px), au-delà il défile dans la carte (pour les listes)
import { Collapsible } from "@ark-ui/react/collapsible";
import { useEffect, useId, useState, type ReactNode } from "react";
import { css } from "styled-system/css";
import { m } from "~/lib/i18n";
import { IconButton } from "./button";
import { Icon } from "./icon";

/** Hauteur maximale des cartes qui listent (À faire, Slack, GitHub · Jira…) avant de défiler */
export const LIST_MAX_H = 460;

// Sombre (Relief) : carte en volume (dégradé, reflet, ombre portée), arête claire en haut à gauche qui vire au rose en bas
// à droite (::before, cadre en dégradé découpé par un masque), halo rose au survol. Les jetons valent « none » en clair.
export const cardFrame = css({
  position: "relative",
  bg: "surface",
  bgGradient: "card",
  border: "1px solid token(colors.border)",
  borderRadius: "xl",
  boxShadow: "card",
  minW: 0,
  transition: "box-shadow 0.2s, border-color 0.2s",
  _hover: { boxShadow: "cardHover", borderColor: { _osDark: "rgb(255 61 119 / 45%)" } },
  _before: {
    content: '""',
    position: "absolute",
    inset: "-1px",
    borderRadius: "inherit",
    p: "1px",
    pointerEvents: "none",
    bgGradient: "rim",
    WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
    WebkitMaskComposite: "xor",
    mask: "linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)",
  },
});

export function Card({
  title,
  meta,
  controls,
  children,
  id,
  collapse,
  scroll,
}: {
  title: ReactNode;
  meta?: ReactNode;
  controls?: ReactNode;
  children: ReactNode;
  id?: string;
  collapse?: string;
  scroll?: number;
}) {
  const [open, setOpen] = useRemembered(collapse ? `n2.card.${collapse}` : undefined);
  const bodyId = useId();
  const label = open ? m.ds_collapse() : m.ds_expand();
  return (
    <section id={id} data-open={open} className={cardFrame}>
      <header
        className={css({
          display: "flex",
          alignItems: controls ? "center" : "baseline",
          justifyContent: "space-between",
          // fenêtre étroite : la ligne d'infos passe sous le titre au lieu de pousser la carte hors de l'écran
          flexWrap: "wrap",
          columnGap: "3",
          rowGap: "1.5",
          px: "4",
          py: controls ? "2.5" : "3.5",
          borderBottom: "1px solid token(colors.border)",
          borderTopRadius: "xl",
          bgGradient: "cardHead",
          "[data-open=false] > &": { borderBottom: "none", alignItems: "center", py: "2.5" },
        })}
      >
        <div className={css({ display: "flex", alignItems: "center", gap: "4", flexWrap: "wrap", minW: 0 })}>
          {/* sombre : titre en tube de néon rose (pas les pastilles ni les liens qu'il contient) */}
          <h2
            className={css({
              textStyle: "heading",
              display: "flex",
              alignItems: "center",
              gap: "3",
              flexWrap: "wrap",
              color: "neon",
              textShadow: "neonText",
              fontStyle: { _osDark: "italic" },
              "& *": { textShadow: "none", fontStyle: "normal" },
            })}
          >
            {title}
          </h2>
          {open && controls}
        </div>
        {(meta || collapse) && (
          <div className={css({ display: "flex", alignItems: "center", gap: "2", flex: "0 1 auto", minW: 0, ml: "auto" })}>
            {open && meta && <span className={css({ textStyle: "caption", color: "muted", textAlign: "right" })}>{meta}</span>}
            {collapse && (
              <IconButton
                label={label}
                onClick={() => setOpen(!open)}
                aria-expanded={open}
                aria-controls={bodyId}
                className={css({ mr: "-1.5", "& svg": { transition: "transform 0.15s" }, "&[aria-expanded=false] svg": { transform: "rotate(-90deg)" } })}
              >
                <Icon name="chevron" size={16} />
              </IconButton>
            )}
          </div>
        )}
      </header>
      <div
        id={bodyId}
        hidden={!open}
        className={css({ px: "4", pt: "1", pb: "4", "&[data-scroll]": { overflowY: "auto", overscrollBehavior: "contain", scrollbarWidth: "thin" } })}
        data-scroll={scroll ? "" : undefined}
        style={scroll ? { maxHeight: scroll } : undefined}
      >
        {children}
      </div>
    </section>
  );
}

// Booléen retenu dans le navigateur (ouvert par défaut) ; sans clé, simple état local.
// Lu après le premier rendu : le serveur ne connaît pas le localStorage.
function useRemembered(key: string | undefined): [boolean, (v: boolean) => void] {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (!key) return;
    try {
      setOpen(localStorage.getItem(key) !== "closed");
    } catch {
      /* préférence non lue */
    }
  }, [key]);
  const set = (v: boolean) => {
    setOpen(v);
    if (!key) return;
    try {
      localStorage.setItem(key, v ? "open" : "closed");
    } catch {
      /* préférence non retenue */
    }
  };
  return [open, set];
}

// ---------- Section repliable (état retenu dans le navigateur) ----------
const readOpen = (key: string) => {
  try {
    return localStorage.getItem(`n2.section.${key}`) !== "closed";
  } catch {
    return true;
  }
};

// `remember={false}` : l'état n'est pas retenu, la section s'ouvre toujours selon `defaultOpen`
export function Section({ id, title, children, defaultOpen = true, remember = true }: { id: string; title: ReactNode; children: ReactNode; defaultOpen?: boolean; remember?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  // l'état mémorisé n'est lu qu'après le premier rendu (le serveur ne connaît pas le localStorage)
  useEffect(() => {
    if (remember) setOpen(readOpen(id));
  }, [id, remember]);
  return (
    <Collapsible.Root
      open={open}
      onOpenChange={(d) => {
        setOpen(d.open);
        if (!remember) return;
        try {
          localStorage.setItem(`n2.section.${id}`, d.open ? "open" : "closed");
        } catch {
          /* préférence non retenue */
        }
      }}
    >
      <Collapsible.Trigger
        className={css({
          display: "flex",
          alignItems: "center",
          gap: "1.5",
          w: "full",
          mt: "3.5",
          mb: "1.5",
          bg: "transparent",
          border: "none",
          p: 0,
          cursor: "pointer",
          textStyle: "overline",
          color: "muted",
          fontWeight: "bold",
          _hover: { color: "text" },
        })}
      >
        <Collapsible.Indicator className={css({ transition: "transform 0.15s", _open: { transform: "rotate(90deg)" } })}>▸</Collapsible.Indicator>
        {title}
      </Collapsible.Trigger>
      <Collapsible.Content>{children}</Collapsible.Content>
    </Collapsible.Root>
  );
}
