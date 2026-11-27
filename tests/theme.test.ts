// Thème de N2 : cookie lu et écrit, thème affiché selon le choix et macOS, script de <head> fidèle à cette règle.
import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, formatTheme, parseTheme, resolveTheme, THEME_MODES, THEME_SCRIPT, themeAttributes, type ThemeChoice } from "../src/features/theme/logic.ts";

/** Lance THEME_SCRIPT sur un faux <html> ; `systemDark` : réglage de macOS. Renvoie le <html> et de quoi changer macOS. */
function runScript(attrs: Record<string, string>, systemDark: boolean) {
  const dataset: Record<string, string> = {};
  for (const [k, v] of Object.entries(attrs)) dataset[k.replace(/^data-/, "")] = v;
  const listeners: (() => void)[] = [];
  const query = { matches: systemDark, addEventListener: (_: string, f: () => void) => listeners.push(f) };
  new Function("document", "matchMedia", THEME_SCRIPT)({ documentElement: { dataset } }, () => query);
  return {
    dataset,
    setSystemDark(dark: boolean) {
      query.matches = dark;
      for (const f of listeners) f();
    },
  };
}

describe("thème", () => {
  it("par défaut (pas de cookie, cookie inconnu) : automatique, Enseigne de jour comme de nuit", () => {
    expect(parseTheme(undefined)).toEqual({ mode: "auto", day: "enseigne", night: "enseigne" });
    expect(parseTheme("n'importe.quoi")).toEqual(DEFAULT_THEME);
    // un thème retiré (ou d'une autre version) reprend sa valeur par défaut, le reste est gardé
    expect(parseTheme("night.disparu.enseigne")).toEqual({ mode: "night", day: "enseigne", night: "enseigne" });
  });

  it("cookie écrit puis relu à l'identique", () => {
    for (const mode of THEME_MODES) {
      const c: ThemeChoice = { mode, day: "enseigne", night: "enseigne" };
      expect(formatTheme(c)).toMatch(/^[\w.-]+$/);
      expect(parseTheme(formatTheme(c))).toEqual(c);
    }
  });

  it("automatique suit macOS ; « jour » et « nuit » l'ignorent", () => {
    const c = (mode: ThemeChoice["mode"]): ThemeChoice => ({ mode, day: "enseigne", night: "enseigne" });
    expect(resolveTheme(c("auto"), true).scheme).toBe("dark");
    expect(resolveTheme(c("auto"), false).scheme).toBe("light");
    expect(resolveTheme(c("day"), true).scheme).toBe("light");
    expect(resolveTheme(c("night"), false).scheme).toBe("dark");
  });

  it("le script de <head> applique la même règle, puis suit macOS quand il change", () => {
    for (const mode of THEME_MODES) {
      for (const systemDark of [false, true]) {
        const c: ThemeChoice = { mode, day: "enseigne", night: "enseigne" };
        const { dataset } = runScript(themeAttributes(c), systemDark);
        expect({ theme: dataset.theme, scheme: dataset.scheme }).toEqual(resolveTheme(c, systemDark));
      }
    }
    const auto = runScript(themeAttributes(DEFAULT_THEME), false);
    auto.setSystemDark(true);
    expect(auto.dataset.scheme).toBe("dark");
    // la page a changé le choix (Préférences) : le script relit les attributs
    auto.dataset.mode = "day";
    auto.setSystemDark(true);
    expect(auto.dataset.scheme).toBe("light");
  });
});
