// Sélecteur « Ma branche » : validation des noms reçus de la page, lecture et classement des branches,
// comparaison d'une autre branche sans checkout.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { classifyBranches, isValidBranchName, jiraKeysOf, parseRefs, prsOfBranch, resolveBranch, type ParsedRefs } from "../src/features/branches/logic.ts";
import type { PullRequest } from "../src/server/types.ts";
import { branchTarget, fetchRemoteBranches, listBranches } from "../src/server/sources/branches.ts";
import { branchChanges, fetchCodeMap } from "../src/server/sources/codemap.ts";
import { demoMonorepo, makeConfig, remove, tempDir } from "./helpers.ts";

describe("isValidBranchName", () => {
  it.each(["main", "feat/DEMO-123", "bug/DEMO-456", "origin/feat/demo", "release/1.2.3", "fix_typo", "deps+react"])("accepte %s", (name) => {
    expect(isValidBranchName(name)).toBe(true);
  });

  it.each([
    "",
    "-c",
    "--upload-pack=touch /tmp/x",
    "main..evil",
    "a//b",
    "/main",
    "main/",
    "main.",
    "feat/.hidden",
    "feat/x.lock",
    "HEAD",
    "origin/HEAD",
    "main@{1}",
    "feat x",
    "feat;rm -rf",
    "$(whoami)",
    "feat\nmain",
    "é",
    "a".repeat(201),
  ])("refuse %j", (name) => {
    expect(isValidBranchName(name)).toBe(false);
  });

  it("refuse ce qui n'est pas une chaîne", () => {
    expect(isValidBranchName(undefined)).toBe(false);
    expect(isValidBranchName(["main"])).toBe(false);
  });
});

const refsOutput = [
  "refs/heads/main\t2026-11-01T10:00:00+01:00",
  "refs/heads/feat/a\t2026-11-20T10:00:00+01:00",
  "refs/heads/feat/b\t2026-11-10T10:00:00+01:00",
  "refs/heads/feat/étrange\t2026-11-10T10:00:00+01:00",
  "refs/remotes/origin/HEAD\t2026-11-01T10:00:00+01:00",
  "refs/remotes/origin/main\t2026-11-01T10:00:00+01:00",
  "refs/remotes/origin/feat/a\t2026-11-19T10:00:00+01:00",
  "refs/remotes/origin/feat/c\t2026-11-05T10:00:00+01:00",
  "refs/remotes/origin/feat/d\t2026-11-15T10:00:00+01:00",
  "refs/remotes/upstream/feat/e\t2026-11-15T10:00:00+01:00",
  "",
].join("\n");

describe("parseRefs", () => {
  it("sépare branches locales et distantes d'origin, sans origin/HEAD ni noms inhabituels", () => {
    const refs = parseRefs(refsOutput);
    expect(refs.local.map((b) => b.name)).toEqual(["main", "feat/a", "feat/b"]);
    expect(refs.remote.map((b) => b.name)).toEqual(["origin/main", "origin/feat/a", "origin/feat/c", "origin/feat/d"]);
    expect(refs.local[1].date).toBe("2026-11-20T10:00:00+01:00");
  });
});

describe("classifyBranches", () => {
  const refs = parseRefs(refsOutput);

  it("met à part la branche actuelle, puis les autres locales et les distantes sans équivalent local, les plus récentes d'abord", () => {
    const list = classifyBranches(refs, "feat/b");
    expect(list.current).toBe("feat/b");
    expect(list.local.map((b) => b.name)).toEqual(["feat/a", "main"]);
    expect(list.remote.map((b) => b.name)).toEqual(["origin/feat/d", "origin/feat/c"]);
  });

  it("gère une HEAD détachée", () => {
    const list = classifyBranches(refs, null);
    expect(list.current).toBeNull();
    expect(list.local.map((b) => b.name)).toEqual(["feat/a", "feat/b", "main"]);
  });

  it("ne compte pas comme distante une branche qui n'existe que comme branche actuelle", () => {
    const only: ParsedRefs = { local: [], remote: [{ name: "origin/feat/new", date: null }] };
    expect(classifyBranches(only, "feat/new").remote).toEqual([]);
  });
});

describe("resolveBranch", () => {
  const refs = parseRefs(refsOutput);

  it("donne la ref complète, jamais le nom brut", () => {
    expect(resolveBranch(refs, "feat/b", "feat/b")).toEqual({ ref: "HEAD", isCurrent: true });
    expect(resolveBranch(refs, "feat/b", "feat/a")).toEqual({ ref: "refs/heads/feat/a", isCurrent: false });
    expect(resolveBranch(refs, "feat/b", "origin/feat/c")).toEqual({ ref: "refs/remotes/origin/feat/c", isCurrent: false });
  });

  it("refuse une branche inconnue ou un nom invalide", () => {
    expect(resolveBranch(refs, "feat/b", "feat/zzz")).toBeNull();
    expect(resolveBranch(refs, "feat/b", "--all")).toBeNull();
    expect(resolveBranch(refs, "feat/b", "upstream/feat/e")).toBeNull();
  });
});

const pr = (over: Partial<PullRequest>): PullRequest => ({
  number: 1,
  title: "t",
  url: "https://github.com/x/y/pull/1",
  repo: "x/y",
  author: "a",
  state: "OPEN",
  isDraft: false,
  reviewDecision: null,
  mergeable: "MERGEABLE",
  ci: null,
  updatedAt: "2026-11-01T10:00:00Z",
  myReview: null,
  jira: [],
  branch: "feat/a",
  ...over,
});

describe("prsOfBranch", () => {
  const merged = pr({ number: 1, url: "u1", state: "MERGED", updatedAt: "2026-11-20T10:00:00Z" });
  const open = pr({ number: 2, url: "u2", state: "OPEN", updatedAt: "2026-11-02T10:00:00Z" });
  const other = pr({ number: 3, url: "u3", branch: "feat/b" });

  it("trouve les PR de la branche, ouvertes d'abord, sans doublon entre listes", () => {
    const found = prsOfBranch("feat/a", [[merged, other], [open], [{ ...open, myReview: "APPROVED" }], undefined]);
    expect(found.map((p) => p.number)).toEqual([2, 1]);
    // la première liste qui la contient l'emporte
    expect(found[0].myReview).toBeNull();
  });

  it("reconnaît la branche distante sous son nom GitHub", () => {
    expect(prsOfBranch("origin/feat/b", [[merged, other]]).map((p) => p.number)).toEqual([3]);
  });

  it("ne confond pas une branche dont le nom n'est qu'un préfixe", () => {
    expect(prsOfBranch("feat", [[merged, open, other]])).toEqual([]);
  });
});

describe("jiraKeysOf", () => {
  it.each([
    ["feat/DEMO-123", ["DEMO-123"]],
    ["bug/DEMO-456-fix-cart", ["DEMO-456"]],
    ["fix/demo-42-typo", ["DEMO-42"]],
    ["feat/DEMO-1-and-DEMO-2", ["DEMO-1", "DEMO-2"]],
    ["feat/OPS-7", ["OPS-7"]],
    ["master", []],
    ["renovate/node-22.x", []],
    ["feat/ademo-12", []],
  ])("%s → %j", (branch, keys) => {
    expect(jiraKeysOf(branch, "DEMO")).toEqual(keys);
  });

  it("ignore une clé de projet inattendue dans la configuration", () => {
    expect(jiraKeysOf("feat/x-1", "x.*")).toEqual([]);
  });
});

// ---------- Avec un vrai dépôt git ----------
const root = demoMonorepo();
const remoteDir = tempDir("n2-remote-");
const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.test", ...args], { cwd, encoding: "utf8" });
// main poussé sur un dépôt distant local, puis : feat/other (locale), origin/feat/DEMO-7-remote (distante seulement), feat/demo (actuelle)
git(root, "commit", "-q", "-m", "init");
git(remoteDir, "init", "-q", "--bare", "-b", "main");
git(root, "remote", "add", "origin", remoteDir);
git(root, "push", "-q", "origin", "main");
git(root, "remote", "set-head", "origin", "main");
git(root, "checkout", "-q", "-b", "feat/DEMO-7-remote");
writeFileSync(join(root, "infrastructure/app.ts"), 'import * as cdk from "aws-cdk-lib";\nexport const app = new cdk.App({});\n');
git(root, "commit", "-q", "-am", "infra");
git(root, "push", "-q", "origin", "feat/DEMO-7-remote");
git(root, "checkout", "-q", "main");
git(root, "branch", "-q", "-D", "feat/DEMO-7-remote");
git(root, "checkout", "-q", "-b", "feat/other");
writeFileSync(join(root, "apps/web/src/features/cart/f2.ts"), "export const f2 = () => 20;\n");
writeFileSync(join(root, "apps/web/src/features/cart/f3.ts"), "export const f3 = () => 30;\n");
git(root, "commit", "-q", "-am", "other");
git(root, "checkout", "-q", "main");
git(root, "checkout", "-q", "-b", "feat/demo");
writeFileSync(join(root, "packages/shared/src/money.ts"), "export const formatMoney = (n: number) => `${n.toFixed(2)} €`;\n");
git(root, "commit", "-q", "-am", "money");
// modification non commitée : ne compte que pour la branche actuelle
writeFileSync(join(root, "apps/web/src/features/cart/f1.ts"), "export const f1 = () => 10;\n");

const cfg = makeConfig(root, { splitThreshold: 2 });
await fetchCodeMap(cfg);
afterAll(() => {
  remove(root);
  remove(remoteDir);
});

describe("listBranches", () => {
  it("classe les branches du dépôt en trois sections", async () => {
    const list = await listBranches(cfg);
    expect(list.current).toBe("feat/demo");
    expect(list.local.map((b) => b.name).sort()).toEqual(["feat/other", "main"]);
    expect(list.remote.map((b) => b.name)).toEqual(["origin/feat/DEMO-7-remote"]);
  });

  it("voit une branche poussée par quelqu'un d'autre après un git fetch", async () => {
    const other = tempDir("n2-clone-");
    git(other, "clone", "-q", remoteDir, ".");
    git(other, "checkout", "-q", "-b", "feat/colleague");
    git(other, "commit", "-q", "--allow-empty", "-m", "wip");
    git(other, "push", "-q", "origin", "feat/colleague");
    remove(other);
    expect((await listBranches(cfg)).remote.map((b) => b.name)).not.toContain("origin/feat/colleague");
    const list = await fetchRemoteBranches(cfg);
    expect(list.remote.map((b) => b.name)).toContain("origin/feat/colleague");
    // le fetch ne change ni la branche ni les fichiers de l'utilisateur
    expect(git(root, "branch", "--show-current").trim()).toBe("feat/demo");
    expect(git(root, "status", "--porcelain")).toContain("f1.ts");
  });
});

describe("branchTarget", () => {
  it("refuse une branche qui n'existe pas dans le dépôt", async () => {
    await expect(branchTarget(cfg, "feat/inconnue")).rejects.toMatchObject({ detail: { message: { key: "srv_branch_not_found", params: { name: "feat/inconnue" } } } });
  });
});

describe("branchChanges pour une branche choisie", () => {
  it("par défaut : la branche actuelle, avec ses modifications non commitées", async () => {
    const b = await branchChanges(cfg);
    expect(b).toMatchObject({ branch: "feat/demo", isCurrent: true, base: "origin/main", ahead: 1 });
    expect(b.files.map((f) => f.file).sort()).toEqual(["apps/web/src/features/cart/f1.ts", "packages/shared/src/money.ts"]);
  });

  it("une autre branche locale, sans checkout ni modifications non commitées", async () => {
    const b = await branchChanges(cfg, "feat/other");
    expect(b).toMatchObject({ branch: "feat/other", isCurrent: false, ahead: 1 });
    expect(b.files.map((f) => f.file).sort()).toEqual(["apps/web/src/features/cart/f2.ts", "apps/web/src/features/cart/f3.ts"]);
    expect(b.nodes).toEqual({ "apps/web/src/features": 2 });
    expect(git(root, "branch", "--show-current").trim()).toBe("feat/demo");
  });

  it("une branche distante sans équivalent local, avec le ticket Jira de son nom", async () => {
    const b = await branchChanges(cfg, "origin/feat/DEMO-7-remote");
    expect(b).toMatchObject({ branch: "origin/feat/DEMO-7-remote", isCurrent: false, ahead: 1 });
    expect(b.jira).toEqual([{ key: "DEMO-7", url: "https://demo.atlassian.net/browse/DEMO-7" }]);
    expect(b.files.map((f) => f.file)).toEqual(["infrastructure/app.ts"]);
    expect(b.nodes).toEqual({ infrastructure: 1 });
  });

  it("la branche actuelle demandée par son nom revient au comportement par défaut", async () => {
    const b = await branchChanges(cfg, "feat/demo");
    expect(b.isCurrent).toBe(true);
    expect(b.files).toHaveLength(2);
  });
});
