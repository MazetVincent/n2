// Analyse d'impact, branche courante, traces Sentry -> fichiers, expiration de la session AWS.
import { execFileSync } from "node:child_process";
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { forgetExpiredRoleCache, isRoleCacheEntry, parseExpiration, profileRoleArn } from "../src/server/sources/aws-session.ts";
import { branchChanges, fetchCodeMap, impactOf, resolveTracePath } from "../src/server/sources/codemap.ts";
import { demoMonorepo, makeConfig, remove, tempDir, writeFiles } from "./helpers.ts";

const root = demoMonorepo();
const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.test", ...args], { cwd: root, encoding: "utf8" });
// un commit sur main, vu comme origin/main, puis une branche avec une modification
git("commit", "-q", "-m", "init");
git("update-ref", "refs/remotes/origin/main", "HEAD");
git("symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
git("checkout", "-q", "-b", "feat/demo");
writeFileSync(join(root, "packages/shared/src/money.ts"), "export const formatMoney = (n: number) => `${n.toFixed(2)} €`;\n");
git("commit", "-q", "-am", "money");
writeFileSync(join(root, "apps/web/src/features/cart/f1.ts"), "export const f1 = () => 10;\n");

const cfg = makeConfig(root, { splitThreshold: 2 });
await fetchCodeMap(cfg);
afterAll(() => remove(root));

describe("impactOf", () => {
  it("compte les dépendants directs et en cascade, par partie", async () => {
    const i = await impactOf(cfg, "packages/shared/src/money.ts");
    // Cart.tsx, helper.tsx et router.ts l'importent ; Cart.tsx importe aussi helper.tsx (déjà compté)
    expect(i.direct).toBe(3);
    expect(i.total).toBe(3);
    expect(i.byNode).toEqual({ "apps/web/src/features": 2, "apps/web/(autres)": 1 });
  });

  it("suit la cascade sur plusieurs niveaux", async () => {
    const i = await impactOf(cfg, "apps/web/src/features/cart/helper.tsx");
    expect(i.levels).toEqual([1]); // Cart.tsx
  });

  it("refuse un fichier inconnu de la carte", async () => {
    await expect(impactOf(cfg, "../../etc/hosts")).rejects.toThrow();
  });
});

describe("branchChanges", () => {
  it("liste les fichiers modifiés depuis la branche principale, commités ou non", async () => {
    const b = await branchChanges(cfg);
    expect(b.branch).toBe("feat/demo");
    expect(b.ahead).toBe(1);
    expect(b.files.map((f) => f.file).sort()).toEqual(["apps/web/src/features/cart/f1.ts", "packages/shared/src/money.ts"]);
    expect(b.nodes).toEqual({ "apps/web/src/features": 1, "packages/shared": 1 });
  });
});

describe("resolveTracePath", () => {
  it.each([
    ["../../../../packages/shared/src/money.ts", "packages/shared/src/money.ts"],
    ["/srv/app/packages/shared/src/money.ts", "packages/shared/src/money.ts"],
    ["app:///apps/web/src/server/router.ts?v=1", "apps/web/src/server/router.ts"],
  ])("%s → %s", async (raw, expected) => expect(await resolveTracePath(cfg, raw)).toBe(expected));

  it.each(["/node_modules/react/index.js", "https://cdn.example/x.js", "", "inconnu.ts"])("ne rattache pas %s", async (raw) => {
    expect(await resolveTracePath(cfg, raw)).toBeNull();
  });
});

describe("parseExpiration", () => {
  // Faux fichier d'identifiants : les noms de clés sensibles sont assemblés à l'exécution.
  const secretKey = "aws_" + "secret_access_key";
  const creds = [
    "[source]",
    "aws_access_key_id = FAKE",
    `${secretKey} = FAKE`,
    "expiration =  2026-11-21 20:34:55 +0000 UTC",
    "",
    "[admin]",
    "role_arn = arn:aws:iam::000000000000:role/demo",
    "source_profile = source",
    "",
    "[iso]",
    "aws_expiration = 2026-01-02T03:04:05Z",
    "",
    "[boucle]",
    "source_profile = boucle",
  ].join("\n");

  it("lit l'expiration du profil source d'un rôle", () => {
    expect(parseExpiration(creds, "admin")).toBe("2026-11-21T20:34:55.000Z");
  });

  it("accepte le format ISO", () => {
    expect(parseExpiration(creds, "iso")).toBe("2026-01-02T03:04:05.000Z");
  });

  it("renvoie null pour un profil inconnu ou une boucle de profils", () => {
    expect(parseExpiration(creds, "absent")).toBeNull();
    expect(parseExpiration(creds, "boucle")).toBeNull();
  });
  it("lit le rôle endossé par un profil", () => {
    expect(profileRoleArn(creds, "admin")).toBe("arn:aws:iam::000000000000:role/demo");
    expect(profileRoleArn(creds, "source")).toBeNull();
  });
});

describe("cache des rôles de l'AWS CLI", () => {
  // Faux fichiers du cache : seul le rôle compte
  const entry = (arn: string) => JSON.stringify({ Credentials: { Expiration: "2026-11-22T19:18:33+00:00" }, AssumedRoleUser: { Arn: arn } });
  const role = "arn:aws:iam::000000000000:role/demo@admin";

  it("reconnaît les identifiants du même rôle, dans le même compte", () => {
    expect(isRoleCacheEntry(role, entry("arn:aws:sts::000000000000:assumed-role/demo@admin/botocore-session-1"))).toBe(true);
    expect(isRoleCacheEntry(role, entry("arn:aws:sts::111111111111:assumed-role/demo@admin/x"))).toBe(false);
    expect(isRoleCacheEntry(role, entry("arn:aws:sts::000000000000:assumed-role/demo/x"))).toBe(false);
    expect(isRoleCacheEntry(role, "pas du JSON")).toBe(false);
    expect(isRoleCacheEntry("pas-un-arn", entry("arn:aws:sts::000000000000:assumed-role/demo@admin/x"))).toBe(false);
  });

  it("retire le rôle du cache seulement quand la session source a expiré", () => {
    const dir = tempDir();
    try {
      const credentialsFile = join(dir, "credentials");
      writeFileSync(credentialsFile, ["[src]", "expiration = 2026-11-22 18:44:22 +0000 UTC", "", "[adm]", `role_arn = ${role}`, "source_profile = src"].join("\n"));
      const cacheDir = join(dir, "cache");
      writeFiles(cacheDir, {
        "a.json": entry("arn:aws:sts::000000000000:assumed-role/demo@admin/s1"),
        "b.json": entry("arn:aws:sts::000000000000:assumed-role/autre/s2"),
      });
      const before = Date.parse("2026-11-22T18:00:00Z");
      const after = Date.parse("2026-11-22T19:00:00Z");
      expect(forgetExpiredRoleCache("adm", { credentialsFile, cacheDir, now: before })).toBe(0);
      expect(forgetExpiredRoleCache("src", { credentialsFile, cacheDir, now: after })).toBe(0); // pas de rôle
      expect(forgetExpiredRoleCache("adm", { credentialsFile, cacheDir, now: after })).toBe(1);
      expect(readdirSync(cacheDir)).toEqual(["b.json"]);
    } finally {
      remove(dir);
    }
  });
});
