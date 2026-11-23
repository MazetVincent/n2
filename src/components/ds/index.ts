/*
 * Design system de N2 : la banque de composants stylisés (Panda CSS + Ark UI).
 *
 * - Couleurs, ombres et styles de texte : panda.config.ts (tokens clair / sombre).
 * - Composants et recettes : ce dossier. Toutes les variantes sont visibles dans l'onglet caché /design-system (⌘K « Design system »).
 *
 * Règle : un motif qui revient (bouton, pastille, menu, fenêtre…) passe par ici ; un `css()` dans un onglet
 * ne sert qu'à la mise en page propre à cet onglet.
 */
export { Badge, badge, Count, count, Dot, TONES, type Tone } from "./badge";
export { Button, button, IconButton, iconButton, ToggleButton, type ButtonVariants } from "./button";
export { Card, cardFrame, LIST_MAX_H, Section } from "./card";
export { Progress, Segmented, Switch, Tabs, Toggle } from "./controls";
export { ErrorBox, Skeleton, SourceView } from "./feedback";
export { Icon, ICON_NAMES, type IconName } from "./icon";
export { Empty, ExtLink, H3, Item, item, ItemMeta, ItemTitle, List } from "./item";
export { cols2, cols3, input, mono, muted, small } from "./layout";
export { overlay } from "./overlay";
export { FitScroll } from "./scroll";
export { selected, ToggleChip, toggleChip } from "./toggle-chip";
