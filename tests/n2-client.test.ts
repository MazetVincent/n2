// Client des scripts : le jeton de session n'est envoyé qu'à un N2 qui appartient au même compte.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchN2, listenerIsMine } from "../scripts/n2-client.ts";
import { tempDir } from "./helpers.ts";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const me = process.getuid?.() ?? 0;

describe("listenerIsMine", () => {
  it("oui seulement si lsof montre notre uid, et rien d'autre", () => {
    expect(listenerIsMine("4747", () => `p1\nu${me}\nf14\n`)).toBe(true);
    expect(listenerIsMine("4747", () => `p1\nu${me + 1}\n`)).toBe(false);
    expect(listenerIsMine("4747", () => `p1\nu${me}\np2\nu${me + 1}\n`)).toBe(false);
    expect(listenerIsMine("4747", () => "")).toBe(false);
    expect(
      listenerIsMine("4747", () => {
        throw new Error("lsof absent ou rien à l'écoute");
      }),
    ).toBe(false);
  });

  it("N2_SKIP_OWNER_CHECK=1 lève la vérification (système sans lsof)", () => {
    vi.stubEnv("N2_SKIP_OWNER_CHECK", "1");
    expect(listenerIsMine("4747", () => "")).toBe(true);
  });
});

describe("fetchN2", () => {
  const state = tempDir("n2-client-");
  mkdirSync(state, { recursive: true });
  writeFileSync(join(state, "session"), "jeton-de-test\n");

  it("serveur d'un autre compte : le jeton n'est pas envoyé", async () => {
    vi.stubEnv("N2_STATE_DIR", state);
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    const r = await fetchN2("/api/status", "4747", () => false);
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/jeton non envoyé/) });
    expect(spy).not.toHaveBeenCalled();
  });

  it("notre N2 : cookie de session envoyé à 127.0.0.1, réponse lue", async () => {
    vi.stubEnv("N2_STATE_DIR", state);
    const spy = vi.fn(async () => new Response(JSON.stringify({ schemaVersion: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", spy);
    expect(await fetchN2("/api/status", "4747", () => true)).toEqual({ ok: true, status: 200, body: { schemaVersion: 1 } });
    expect(spy).toHaveBeenCalledWith("http://127.0.0.1:4747/api/status", expect.objectContaining({ headers: { Cookie: "n2-session=jeton-de-test" } }));
  });

  it("port invalide : refusé", async () => {
    expect(await fetchN2("/api/status", "47; rm", () => true)).toMatchObject({ ok: false });
  });
});
