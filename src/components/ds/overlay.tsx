// Fenêtres (Dialog) et menus (Popover) : styles partagés, à poser sur les pièces Ark UI.
//   <Dialog.Backdrop className={overlay.backdrop} />
//   <Dialog.Positioner className={overlay.positioner({ align: "top" })}>
//     <Dialog.Content className={overlay.dialog({ size: "lg" })}>…
//   <Popover.Positioner className={overlay.popoverPositioner}>
//     <Popover.Content className={overlay.popover()}>
//       <Popover.Title className={overlay.menuTitle}>…</Popover.Title>
//       <button className={overlay.menuItem}>…</button>
import { css, cva } from "styled-system/css";

const backdrop = css({ position: "fixed", inset: 0, bg: "rgb(0 0 0 / 40%)", zIndex: 60 });

const positioner = cva({
  base: { position: "fixed", inset: 0, display: "flex", justifyContent: "center", px: "4", overflowY: "auto", zIndex: 61 },
  variants: {
    // top : sous la barre (recherche ⌘K) ; scroll : grande fenêtre qui défile avec la page
    align: { top: { alignItems: "flex-start", pt: "12vh" }, scroll: { alignItems: "flex-start", py: "5vh" } },
  },
  defaultVariants: { align: "top" },
});

const dialog = cva({
  base: { bg: "surface", border: "1px solid token(colors.border)", borderRadius: "xl", boxShadow: "dialog", outline: "none" },
  variants: {
    size: { md: { w: "min(640px, 100%)", overflow: "hidden" }, lg: { w: "min(1080px, 100%)", borderRadius: "xl" } },
  },
  defaultVariants: { size: "md" },
});

const popoverPositioner = css({ zIndex: 50 });

const popover = cva({
  base: { bg: "surface", border: "1px solid token(colors.border)", borderRadius: "lg", boxShadow: "popover", outline: "none" },
  variants: {
    // menu : quelques choix (marge intérieure) ; panel : liste filtrable collée aux bords
    kind: { menu: { p: "1" }, panel: { overflow: "hidden" } },
  },
  defaultVariants: { kind: "menu" },
});

const menuTitle = css({ px: "2.5", pt: "1", pb: "1.5", fontSize: "xs", textTransform: "uppercase", letterSpacing: "0.04em", color: "muted" });

const menuItem = css({
  display: "block",
  w: "full",
  textAlign: "left",
  px: "2.5",
  py: "1.5",
  borderRadius: "md",
  border: "none",
  bg: "transparent",
  textStyle: "body",
  cursor: "pointer",
  _hover: { bg: "surface.alt" },
  _highlighted: { bg: "surface.alt" },
  _focusVisible: { bg: "surface.alt", outline: "none" },
});

export const overlay = { backdrop, positioner, dialog, popoverPositioner, popover, menuTitle, menuItem };
