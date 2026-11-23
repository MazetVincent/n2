// Zone qui défile pour que sa carte tienne dans l'écran : sa hauteur maximale va de sa position dans la page
// jusqu'au bas de la fenêtre (moins `bottom`, la marge sous la carte), sans descendre sous `min`.
// Recalculée quand la fenêtre change de taille ou quand le contenu au-dessus bouge (données qui arrivent…).
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { css, cx } from "styled-system/css";

const scrollCls = css({ overflowY: "auto", overscrollBehavior: "contain", scrollbarWidth: "thin" });

export function FitScroll({ children, bottom = 64, min = 240, className }: { children: ReactNode; bottom?: number; min?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [maxH, setMaxH] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      // position dans la page, pas dans la fenêtre : la valeur ne change pas quand on fait défiler
      const top = el.getBoundingClientRect().top + window.scrollY;
      setMaxH(Math.max(min, Math.floor(window.innerHeight - top - bottom)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(document.body);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [bottom, min]);
  return (
    <div ref={ref} className={cx(scrollCls, className)} style={maxH ? { maxHeight: maxH } : undefined}>
      {children}
    </div>
  );
}
