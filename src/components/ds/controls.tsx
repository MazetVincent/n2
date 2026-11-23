// Contrôles : interrupteur (texte puis interrupteur, à la place des cases à cocher), contrôle segmenté, onglets, barre de progression.
import { SegmentGroup } from "@ark-ui/react/segment-group";
import { Tabs as ArkTabs } from "@ark-ui/react/tabs";
import type { ReactNode } from "react";
import { css, cx } from "styled-system/css";
import { Count } from "./badge";

// ---------- Interrupteur (texte, puis l'interrupteur) ----------
// Réservé à un réglage appliqué tout de suite, hors formulaire. Pour une option de vue (filtre, calque), préférer
// ToggleButton (ds/button.tsx) ; pour un réglage dans un formulaire, un Segmented à deux états nommés.
// `checked="indeterminate"` : groupe dont une partie seulement est activée (l'interrupteur à mi-course ; un clic active tout).
// `disabled` : figé (ex. un onglet toujours affiché).
export function Switch({
  label,
  checked,
  onChange,
  title,
  disabled,
  className,
  describedBy,
}: {
  label: ReactNode;
  checked: boolean | "indeterminate";
  onChange: (v: boolean) => void;
  title?: string;
  disabled?: boolean;
  className?: string;
  /** id d'un texte qui explique le réglage (aria-describedby) */
  describedBy?: string;
}) {
  const state = checked === "indeterminate" ? "mixed" : checked ? "on" : "off";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked === true}
      aria-describedby={describedBy}
      data-state={state}
      title={title}
      disabled={disabled}
      onClick={() => onChange(checked !== true)}
      className={cx(
        css({
          display: "inline-flex",
          alignItems: "center",
          gap: "2",
          bg: "transparent",
          border: "none",
          p: 0,
          cursor: "pointer",
          textStyle: "caption",
          color: "muted",
          textAlign: "left",
          _hover: { color: "text" },
          _focusVisible: { outline: "2px solid token(colors.accent)", outlineOffset: "2px", borderRadius: "sm" },
          _disabled: { cursor: "default", opacity: 0.6, _hover: { color: "muted" } },
        }),
        className,
      )}
    >
      <span className={css({ minW: 0 })}>{label}</span>
      <span
        aria-hidden
        className={css({
          position: "relative",
          flex: "none",
          w: "26px",
          h: "14px",
          borderRadius: "full",
          border: "1px solid token(colors.border)",
          bg: "surface",
          transition: "background 0.15s",
          "[data-state=on] > &": { bg: "accent", borderColor: "accent" },
          "[data-state=mixed] > &": { bg: "accent.soft", borderColor: "accent" },
        })}
      >
        <span
          className={css({
            position: "absolute",
            top: "1px",
            left: "1px",
            w: "10px",
            h: "10px",
            borderRadius: "full",
            bg: "muted",
            transition: "transform 0.15s",
            "[data-state=on] > * > &": { transform: "translateX(12px)", bg: "white" },
            "[data-state=mixed] > * > &": { transform: "translateX(6px)", bg: "accent" },
          })}
        />
      </span>
    </button>
  );
}

/** Ancien nom de l'interrupteur (c'était une case à cocher) : même composant */
export const Toggle = Switch;

// ---------- Contrôle segmenté (choix exclusif : vue Sentry, calque de la carte…) ----------
export function Segmented<V extends string>({
  value,
  onChange,
  items,
  label,
  className,
}: {
  value: V;
  onChange: (v: V) => void;
  items: readonly { value: V; label: ReactNode; count?: ReactNode }[];
  label: string;
  className?: string;
}) {
  return (
    <SegmentGroup.Root
      value={value}
      onValueChange={(e) => e.value && onChange(e.value as V)}
      aria-label={label}
      className={cx(
        css({ display: "inline-flex", gap: "2px", p: "3px", bg: "surface.alt", border: "1px solid token(colors.border)", borderRadius: "lg", position: "relative", flexWrap: "wrap" }),
        className,
      )}
    >
      <SegmentGroup.Indicator
        className={css({ bg: "accent.soft", borderRadius: "md", boxShadow: "0 0 0 1px token(colors.accent)", w: "var(--width)", h: "var(--height)", top: "var(--top)", left: "var(--left)", transition: "all 0.15s" })}
      />
      {items.map((it) => (
        <SegmentGroup.Item
          key={it.value}
          value={it.value}
          className={css({
            position: "relative",
            zIndex: 1,
            display: "inline-flex",
            alignItems: "center",
            gap: "1.5",
            px: "3",
            py: "1",
            borderRadius: "md",
            textStyle: "body",
            fontWeight: "semibold",
            color: "muted",
            cursor: "pointer",
            whiteSpace: "nowrap",
            _hover: { color: "text" },
            _checked: { color: "text" },
            _focusVisible: { outline: "2px solid token(colors.accent)", outlineOffset: "1px" },
          })}
        >
          <SegmentGroup.ItemText>{it.label}</SegmentGroup.ItemText>
          {it.count !== undefined && <Count>{it.count}</Count>}
          <SegmentGroup.ItemControl />
          <SegmentGroup.ItemHiddenInput />
        </SegmentGroup.Item>
      ))}
    </SegmentGroup.Root>
  );
}

// ---------- Onglets (Sentry / CloudWatch, calques de la carte…) ----------
// Même rendu que les onglets de page (souligné rose) ; le contenu de l'onglet actif est passé en enfant.
export function Tabs<V extends string>({
  value,
  onChange,
  items,
  label,
  aside,
  children,
  className,
}: {
  value: V;
  onChange: (v: V) => void;
  items: readonly { value: V; label: ReactNode; count?: ReactNode }[];
  label: string;
  /** posé à droite, sur la ligne des onglets (ex. des infos et un lien) */
  aside?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <ArkTabs.Root value={value} onValueChange={(e) => onChange(e.value as V)} className={className}>
      <div className={css({ display: "flex", alignItems: "flex-end", gap: "3", flexWrap: "wrap", borderBottom: "1px solid token(colors.border)" })}>
        <ArkTabs.List aria-label={label} className={css({ display: "flex", gap: "1", flexWrap: "wrap" })}>
          {items.map((it) => (
            <ArkTabs.Trigger
              key={it.value}
              value={it.value}
              className={css({
                display: "inline-flex",
                alignItems: "center",
                gap: "2",
                px: "3",
                py: "2",
                mb: "-1px",
                bg: "transparent",
                border: "none",
                borderBottom: "2px solid transparent",
                fontWeight: "semibold",
                color: "muted",
                cursor: "pointer",
                _hover: { color: "text" },
                _selected: { color: "text", borderBottomColor: "accent" },
                _focusVisible: { outline: "2px solid token(colors.accent)", outlineOffset: "-2px", borderTopRadius: "md" },
              })}
            >
              {it.label}
              {it.count !== undefined && <Count>{it.count}</Count>}
            </ArkTabs.Trigger>
          ))}
        </ArkTabs.List>
        {aside && <div className={css({ ml: "auto", alignSelf: "center", display: "flex", alignItems: "center", gap: "3", minW: 0 })}>{aside}</div>}
      </div>
      {children !== undefined && (
        <ArkTabs.Content value={value} className={css({ _focusVisible: { outline: "none" } })}>
          {children}
        </ArkTabs.Content>
      )}
    </ArkTabs.Root>
  );
}

// ---------- Barre de progression ----------
export function Progress({ value, max, tone = "ok", label }: { value: number; max: number; tone?: "ok" | "accent" | "info" | "warn"; label: string }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={css({ h: "6px", borderRadius: "full", bg: "surface.alt", border: "1px solid token(colors.border)", overflow: "hidden", flex: 1, minW: "80px" })}
    >
      <div className={css({ h: "full", borderRadius: "full", transition: "width 0.3s" })} style={{ width: `${pct}%`, background: `var(--colors-${tone})` }} />
    </div>
  );
}
