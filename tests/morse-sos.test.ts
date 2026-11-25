// L'enseigne N2 en morse : S.O.S lisible (3 points, 3 traits, 3 points), images clés valides, enseigne rallumée à la fin.
import { describe, expect, it } from "vitest";
import { morseSegments, sosKeyframes } from "../src/features/secret/morse-sos.ts";

describe("morse S.O.S", () => {
  it("plages : éteint, · · ·, − − −, · · ·, éteint, avec les espaces du morse", () => {
    const lit = morseSegments().filter(([on]) => on).map(([, u]) => u);
    expect(lit).toEqual([1, 1, 1, 3, 3, 3, 1, 1, 1]);
    expect(morseSegments().map(([, u]) => u).reduce((a, b) => a + b)).toBe(33);
  });

  it("images clés : décalages croissants de 0 à 1, allumée au début et à la fin, 9 impulsions de la bonne durée", () => {
    const unit = 100;
    const ramp = 10;
    const { frames, duration } = sosKeyframes(unit, ramp);
    expect(duration).toBe(33 * unit + ramp);
    const offsets = frames.map((f) => f.offset as number);
    expect(offsets[0]).toBe(0);
    expect(offsets.at(-1)).toBe(1);
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
    expect(frames[0].opacity).toBe(1);
    expect(frames.at(-1)?.opacity).toBe(1);

    // durée de chaque impulsion allumée : de la fin de sa montée au début de sa descente, plus une rampe
    const pulses: number[] = [];
    let onAt: number | null = null;
    for (let i = 1; i < frames.length; i += 2) {
      const [from, to] = [frames[i], frames[i + 1]];
      if (to.opacity === 1 && to.offset !== 1) onAt = (to.offset as number) * duration;
      if (to.opacity !== 1 && onAt !== null) {
        pulses.push(Math.round((from.offset as number) * duration - onAt + ramp));
        onAt = null;
      }
    }
    expect(pulses).toEqual([1, 1, 1, 3, 3, 3, 1, 1, 1].map((u) => u * unit));
  });
});
