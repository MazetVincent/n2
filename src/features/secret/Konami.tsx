// Le secret de N2. Code Konami au clavier (↑ ↑ ↓ ↓ ← → ← →, hors des champs de saisie) :
//  - un point à peine lumineux, 100 ms, là où se cache l'onglet Statistiques (invisible, tout à droite) ;
//  - la première fois, l'option « Guide de l'équipe » apparaît dans les préférences (retenu dans config.local.json) ;
//  - un message, selon l'état du secret (konamiMessage) : « quelque chose a changé » tant que l'option du guide
//    n'a pas été cliquée, et parfois (une fois sur dix) « un secret perdure » tant que Statistiques n'a pas été trouvée.
import { Dialog } from "@ark-ui/react/dialog";
import { Portal } from "@ark-ui/react/portal";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { css } from "styled-system/css";
import { overlay } from "~/components/ds";
import { usePreferences } from "~/lib/data";
import { m } from "~/lib/i18n";
import { getPreferences, secretEvent } from "~/server/fns";
import { konamiMessage, type Preferences, type SecretEvent } from "~/features/prefs/logic";

const CODE = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight"].join(",");
type PrefsResult = Awaited<ReturnType<typeof getPreferences>>;

/** Enregistre un évènement du secret et met à jour les préférences en cache */
function useSecretEvent() {
  const qc = useQueryClient();
  return async (event: SecretEvent): Promise<PrefsResult | null> => {
    try {
      const r = await secretEvent({ data: { event } });
      if (r.ok) qc.setQueryData(["prefs"], r);
      return r;
    } catch {
      return null;
    }
  };
}

export function Konami() {
  const qc = useQueryClient();
  const record = useSecretEvent();
  const [dot, setDot] = useState<{ x: number; y: number } | null>(null);
  const [message, setMessage] = useState<"changed" | "lingers" | null>(null);
  const keys = useRef<string[]>([]);

  useEffect(() => {
    const trigger = async () => {
      // le point : au centre de l'onglet invisible
      const ghost = document.querySelector<HTMLElement>("nav a[data-ghost]")?.getBoundingClientRect();
      if (ghost) {
        setDot({ x: ghost.left + ghost.width / 2, y: ghost.top + ghost.height / 2 });
        setTimeout(() => setDot(null), 100);
      }
      // l'état d'avant ce code décide du message
      const cached = qc.getQueryData<PrefsResult>(["prefs"]) ?? (await getPreferences().catch(() => null));
      if (!cached?.ok) return;
      const before: Preferences = cached.data;
      const r = await record("konami");
      if (!r?.ok) return;
      // premier code : le guide existe désormais, toutes les sources qui en dépendent sont relues
      if (!before.secret.unlocked) void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "prefs" });
      setMessage(konamiMessage(before.secret, Math.random()));
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (/input|textarea|select/i.test(t.tagName) || t.isContentEditable) return;
      keys.current = [...keys.current, e.key].slice(-8);
      if (keys.current.join(",") === CODE) {
        keys.current = [];
        void trigger();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [qc, record]);

  return (
    <>
      {dot && (
        <span
          aria-hidden
          className={css({ position: "fixed", w: "6px", h: "6px", ml: "-3px", mt: "-3px", borderRadius: "full", bg: "accent", opacity: 0.3, boxShadow: "0 0 6px token(colors.accent)", pointerEvents: "none", zIndex: 100 })}
          style={{ left: dot.x, top: dot.y }}
        />
      )}
      <Dialog.Root open={message !== null} onOpenChange={(d) => !d.open && setMessage(null)} lazyMount unmountOnExit>
        <Portal>
          <Dialog.Backdrop className={overlay.backdrop} />
          <Dialog.Positioner className={css({ position: "fixed", inset: 0, display: "grid", placeItems: "center", px: "4", zIndex: 61 })}>
            <Dialog.Content className={css(overlay.dialog.raw({ size: "md" }), { w: "auto", px: "10", py: "8" })}>
              <Dialog.Title className={css({ fontSize: "17px", fontStyle: "italic", textAlign: "center" })}>{message === "lingers" ? m.secret_lingers() : m.secret_changed()}</Dialog.Title>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </>
  );
}

/** Page Statistiques ouverte : retenu une fois pour toutes (plus de « un secret perdure ») */
export function useStatsFound() {
  const p = usePreferences().data;
  const record = useSecretEvent();
  const found = p?.ok ? p.data.secret.statsFound : true;
  useEffect(() => {
    if (!found) void record("stats");
  }, [found, record]);
}

/** Option du guide cliquée dans les préférences (une fois débloquée) : plus de « quelque chose a changé » */
export function useGuideTouched(): () => void {
  const p = usePreferences().data;
  const record = useSecretEvent();
  return () => {
    if (p?.ok && p.data.secret.unlocked && !p.data.secret.guideTouched) void record("guide");
  };
}
