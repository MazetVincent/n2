// L'enseigne N2 appelle à l'aide : de temps en temps (délai tiré au hasard), le logo s'éteint et clignote S.O.S en
// morse (· · ·  − − −  · · ·), puis se rallume. Tout ce que le logo éclaire suit le même signal : son halo sur la
// barre du haut (::before, ::after du header) et la lumière qu'il projette dans la page (body::before, voir
// panda.config.ts). En clair, seules les lettres du logo clignotent (les lumières n'existent qu'en sombre).
// Animation par script (Web Animations) : elle passe devant les battements CSS (neon-flicker) le temps du message,
// puis les laisse reprendre. Rien si le système demande moins de mouvement, ni quand l'onglet est caché.
import { useEffect, type RefObject } from "react";

/** Durée d'un point (ms) ; un trait vaut 3 points, l'espace entre deux signes 1, entre deux lettres 3 */
export const SOS_UNIT_MS = 180;
/** Montée et descente de la lumière à chaque changement (ms) : un tube de néon ne s'allume pas d'un coup */
export const SOS_RAMP_MS = 30;
/** Délai entre deux appels, tiré au hasard entre ces bornes (ms) */
export const SOS_DELAY_MS = { min: 45_000, max: 180_000 };
/** Opacité de l'enseigne allumée (normale) et éteinte (entre les signes : un reste de lueur) */
const LIT = 1;
const DIM = 0.12;

const MORSE: Record<string, string> = { S: "...", O: "---" };

/** Le message en plages [allumé ?, durée en points] : éteint d'abord, puis S O S, puis éteint avant de se rallumer */
export function morseSegments(word = "SOS"): [boolean, number][] {
  const segs: [boolean, number][] = [[false, 3]];
  [...word].forEach((letter, i) => {
    if (i > 0) segs.push([false, 3]);
    [...MORSE[letter]].forEach((sign, j) => {
      if (j > 0) segs.push([false, 1]);
      segs.push([true, sign === "." ? 1 : 3]);
    });
  });
  segs.push([false, 3]);
  return segs;
}

/** Images clés (opacité) et durée totale du message, de l'enseigne allumée à l'enseigne rallumée */
export function sosKeyframes(unit = SOS_UNIT_MS, ramp = SOS_RAMP_MS): { frames: Keyframe[]; duration: number } {
  const segs = morseSegments();
  const duration = segs.reduce((t, [, u]) => t + u * unit, 0) + ramp;
  const frames: Keyframe[] = [{ offset: 0, opacity: LIT }];
  let t = 0;
  let prev = LIT;
  // la dernière plage (allumée, durée nulle) rallume l'enseigne à la fin
  for (const [lit, units] of [...segs, [true, 0] as [boolean, number]]) {
    const level = lit ? LIT : DIM;
    if (level !== prev) frames.push({ offset: t / duration, opacity: prev }, { offset: (t + ramp) / duration, opacity: level });
    prev = level;
    t += units * unit;
  }
  return { frames, duration };
}

/** Joue S.O.S sur le logo et ses lumières (header : la barre du haut, logo : les lettres) */
function playSos(header: HTMLElement | null, logo: HTMLElement | null) {
  const { frames, duration } = sosKeyframes();
  const targets: [Element | null, string | undefined][] = [
    [logo, undefined],
    [header, "::before"],
    [header, "::after"],
    [document.body, "::before"],
  ];
  for (const [el, pseudoElement] of targets) el?.animate(frames, { duration, pseudoElement, id: "n2-sos" });
}

/** Lance les appels à l'aide de l'enseigne, à intervalles aléatoires, tant que la barre du haut est affichée */
export function useMorseSos(header: RefObject<HTMLElement | null>, logo: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const delay = SOS_DELAY_MS.min + Math.random() * (SOS_DELAY_MS.max - SOS_DELAY_MS.min);
      timer = setTimeout(() => {
        if (!calm.matches && !document.hidden) playSos(header.current, logo.current);
        schedule();
      }, delay);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [header, logo]);
}
