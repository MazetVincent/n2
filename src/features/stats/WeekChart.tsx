// Colonnes semaine par semaine pour une seule mesure (pas de légende : le titre de la carte la nomme).
// La semaine en cours est la seule en couleur et la seule étiquetée ; les autres, en gris, donnent le contexte.
// Survol ou focus clavier d'une colonne : bulle avec la semaine, la valeur et son détail.
import { useState } from "react";
import { css, cx } from "styled-system/css";

export interface WeekPoint {
  /** « 16 nov. » */
  label: string;
  value: number | null;
  /** texte de la bulle sous la valeur (« 14 PR fusionnées ») */
  detail?: string;
}

const PLOT_H = 132;

/** Graduation « ronde » au-dessus du maximum (sa moitié aussi) : 1, 2, 3, 4, 5, 6, 8 × 10ⁿ pour un nombre ; heures ou jours pour une durée */
export function niceMax(max: number, kind: "count" | "duration"): number {
  if (max <= 0) return kind === "duration" ? 3_600_000 : 1;
  if (kind === "duration") {
    const H = 3_600_000;
    const steps = [1, 2, 4, 6, 8, 12, 24, 48, 72, 96, 120, 168, 240, 336, 480, 720].map((h) => h * H);
    return steps.find((s) => s >= max) ?? Math.ceil(max / (720 * H)) * 720 * H;
  }
  const p = 10 ** Math.floor(Math.log10(max));
  return [1, 2, 3, 4, 5, 6, 8, 10].map((m) => m * p).find((s) => s >= max) ?? 10 * p;
}

export function WeekChart({ points, kind, format, label }: { points: WeekPoint[]; kind: "count" | "duration"; format: (v: number) => string; label: string }) {
  const [active, setActive] = useState<number | null>(null);
  // 15 % de marge : l'étiquette de la semaine en cours tient au-dessus de sa colonne, dans le graphique
  const max = niceMax(Math.max(0, ...points.map((p) => p.value ?? 0)) * 1.15, kind);
  const last = points.length - 1;
  return (
    <figure aria-label={label} className={css({ m: 0, display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", columnGap: "2", mt: "3" })}>
      {/* graduations : le haut et le milieu ; le zéro est la ligne de base */}
      <div aria-hidden className={cx(css({ position: "relative", h: `${PLOT_H}px`, fontSize: "xs", color: "muted", textAlign: "right", minW: "28px" }), "tabular")}>
        <span className={css({ position: "absolute", right: 0, top: "-7px" })}>{format(max)}</span>
        <span className={css({ position: "absolute", right: 0, top: `${PLOT_H / 2 - 7}px` })}>{format(max / 2)}</span>
        <span className={css({ position: "absolute", right: 0, bottom: "-7px" })}>0</span>
      </div>
      <div className={css({ position: "relative", h: `${PLOT_H}px`, borderBottom: "1px solid token(colors.border)" })} onPointerLeave={() => setActive(null)}>
        {[0, 0.5].map((f) => (
          <div key={f} aria-hidden className={css({ position: "absolute", left: 0, right: 0, h: "1px", bg: "border", opacity: 0.6 })} style={{ top: `${f * 100}%` }} />
        ))}
        <div className={css({ position: "absolute", inset: 0, display: "flex" })}>
          {points.map((p, i) => {
            const current = i === last;
            const h = p.value === null ? 0 : Math.max(p.value > 0 ? 2 : 0, (p.value / max) * PLOT_H);
            const text = p.value === null ? "—" : format(p.value);
            return (
              // la colonne entière (pas seulement la barre) reçoit le survol et le focus
              <div
                key={i}
                tabIndex={0}
                role="img"
                aria-label={`${p.label} : ${text}${p.detail ? `, ${p.detail}` : ""}`}
                onPointerEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className={css({ position: "relative", flex: 1, display: "flex", alignItems: "flex-end", justifyContent: "center", outline: "none", borderRadius: "md", _focusVisible: { boxShadow: "inset 0 0 0 2px token(colors.accent)" } })}
              >
                {current && p.value !== null && (
                  <span aria-hidden className={css({ position: "absolute", fontSize: "xs", fontWeight: "semibold", whiteSpace: "nowrap" })} style={{ bottom: h + 4 }}>
                    {text}
                  </span>
                )}
                <div
                  aria-hidden
                  className={css({ w: "60%", maxW: "24px", borderTopRadius: "sm", transition: "opacity 0.12s" })}
                  style={{
                    height: h,
                    background: current ? "var(--colors-accent)" : "color-mix(in srgb, var(--colors-muted) 45%, var(--colors-surface))",
                    opacity: active !== null && active !== i ? 0.55 : 1,
                  }}
                />
                {active === i && (
                  <div
                    role="tooltip"
                    className={css({
                      position: "absolute",
                      zIndex: 2,
                      bottom: "calc(100% + 6px)",
                      left: "50%",
                      transform: "translateX(-50%)",
                      bg: "surface",
                      border: "1px solid token(colors.border)",
                      borderRadius: "lg",
                      boxShadow: "0 6px 20px rgb(0 0 0 / 18%)",
                      px: "2.5",
                      py: "1.5",
                      whiteSpace: "nowrap",
                      pointerEvents: "none",
                    })}
                    style={i === 0 ? { left: 0, transform: "none" } : i === last ? { left: "auto", right: 0, transform: "none" } : undefined}
                  >
                    <div className={cx(css({ fontSize: "md", fontWeight: "bold" }), "tabular")}>{text}</div>
                    <div className={css({ fontSize: "xs", color: "muted" })}>
                      {p.label}
                      {p.detail && ` · ${p.detail}`}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div />
      {/* semaines : une sur deux sur les petites largeurs (la dernière toujours) */}
      <div aria-hidden className={css({ display: "flex", mt: "1.5" })}>
        {points.map((p, i) => (
          <span
            key={i}
            data-alt={(last - i) % 2 === 1 || undefined}
            className={css({ flex: 1, textAlign: "center", fontSize: "xs", color: i === last ? "text" : "muted", fontWeight: i === last ? "semibold" : "normal", whiteSpace: "nowrap", smDown: { "&[data-alt]": { visibility: "hidden" } } })}
          >
            {p.label}
          </span>
        ))}
      </div>
    </figure>
  );
}
