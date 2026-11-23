// Racine de N2 : trouvée par son package.json, que le code tourne depuis src/server/ (développement)
// ou depuis dist/server/assets/ (production). Sinon le build chercherait config.local.json dans dist/.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "../src/server/config.ts";

describe("ROOT", () => {
  it("est le dossier du package.json de N2", () => {
    expect(JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).name).toBe("n2");
    expect(ROOT).not.toMatch(/[/\\](src|dist)([/\\]|$)/);
  });
});
