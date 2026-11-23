import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Config } from "../config.ts";
import { httpFetch, run, SourceFailure } from "../run.ts";
import { updateKind } from "../../lib/semver.ts";
import type { LibAdvisory, LibInfo, LibNews, LibOverview, LibRelease, WorkspaceDep, WorkspaceLibs } from "../types.ts";
import { parseReadme } from "./codemap-detect.ts";
import { libDetails, privateScopes } from "./lib-details.ts";
import { msg } from "../messages.ts";

export { updateKind };

type Lock = { packages?: Record<string, { name?: string; version?: string }> };

function readLock(projectPath: string): Lock {
  const lockPath = join(projectPath, "package-lock.json");
  if (!existsSync(lockPath)) {
    throw new SourceFailure({ kind: "config", message: msg("srv_package_lock_not_found", { path: projectPath }), hint: msg("srv_hint_check_libs_path") });
  }
  return JSON.parse(readFileSync(lockPath, "utf8"));
}

function installedVersions(lock: Lock): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, info] of Object.entries(lock.packages ?? {})) {
    // Seules les dépendances installées à la racine (celles réellement utilisées par l'app)
    if (path.startsWith("node_modules/") && !path.slice(13).includes("node_modules/") && info.version) {
      out[path.slice(13)] = info.version;
    }
  }
  return out;
}

function githubRepo(repository: unknown): string | null {
  const url = typeof repository === "string" ? repository : (repository as { url?: string })?.url;
  const m = url?.match(/github\.com[/:]([^/]+)\/([^/#.]+)/);
  return m ? `${m[1]}/${m[2]}` : null;
}

// Dernière version publiée d'un paquet public (registre npm), gardée 6 h en mémoire.
const latestCache = new Map<string, { at: number; meta: { version?: string; repository?: unknown } | null }>();
async function npmLatest(name: string): Promise<{ version?: string; repository?: unknown } | null> {
  const hit = latestCache.get(name);
  if (hit && Date.now() - hit.at < 6 * 3_600_000) return hit.meta;
  const meta = await httpFetch(`https://registry.npmjs.org/${name.replace("/", "%2F")}/latest`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  latestCache.set(name, { at: Date.now(), meta });
  return meta;
}

/** Applique `fn` à chaque élément, `limit` à la fois (pour ne pas lancer 200 requêtes d'un coup). */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

type GhRelease = { tag_name: string; name: string; html_url: string; published_at: string; draft: boolean; prerelease: boolean; body?: string | null };

async function ghReleases(repo: string, name: string): Promise<GhRelease[]> {
  const out = await run("gh", ["api", `repos/${repo}/releases?per_page=100`]).catch(() => "[]");
  const all = JSON.parse(out) as GhRelease[];
  // Monorepos (TanStack, MUI, Sentry…) : on garde les tags du paquet, ou les tags génériques vX.Y.Z
  return all.filter((r) => !r.draft && !r.prerelease && (r.tag_name.startsWith(`${name}@`) || /^v?\d+\.\d+\.\d+$/.test(r.tag_name)));
}

async function releasesFor(repo: string, name: string, installed: string | null): Promise<LibRelease[]> {
  return (await ghReleases(repo, name))
    .filter((r) => updateKind(installed, r.tag_name.split("@").at(-1)!) !== "none")
    .slice(0, 5)
    .map((r) => ({ name: r.tag_name, url: r.html_url, publishedAt: r.published_at }));
}

async function advisoriesFor(name: string, version: string | null): Promise<LibAdvisory[]> {
  if (!version) return [];
  const out = await run("gh", ["api", `/advisories?ecosystem=npm&affects=${encodeURIComponent(`${name}@${version}`)}&per_page=10`]).catch(() => "[]");
  return (JSON.parse(out) as { ghsa_id: string; severity: string; summary: string; html_url: string; withdrawn_at: string | null }[])
    .filter((a) => !a.withdrawn_at)
    .map((a) => ({ id: a.ghsa_id, severity: a.severity, summary: a.summary, url: a.html_url }));
}

export async function fetchLibs(cfg: Config): Promise<LibInfo[]> {
  const installed = installedVersions(readLock(cfg.libs.projectPath));

  return Promise.all(
    cfg.libs.packages.map(async (name): Promise<LibInfo> => {
      const meta = await npmLatest(name);
      const version = installed[name] ?? null;
      const latest = meta?.version ?? null;
      const repo = githubRepo(meta?.repository);
      const [releases, advisories] = await Promise.all([
        repo ? releasesFor(repo, name, version) : Promise.resolve([]),
        advisoriesFor(name, version),
      ]);
      return {
        name,
        installed: version,
        latest,
        update: updateKind(version, latest),
        npmUrl: `https://www.npmjs.com/package/${name}`,
        repoUrl: repo ? `https://github.com/${repo}/releases` : null,
        releases,
        advisories,
      };
    }),
  );
}

// ---------- Dépendances par partie du monorepo ----------
const readJson = (path: string): Record<string, any> | null => {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
};

// Dossiers à ignorer : dépendances installées, jeux de données de test
const NOT_A_PART = /(^|\/)(node_modules|fixtures?|__fixtures__|__mocks__)\//;

/** Dossiers du projet qui ont un package.json ("" = la racine) : fichiers suivis par git, sinon parties du lockfile */
async function manifestDirs(root: string): Promise<string[]> {
  const tracked = await run("git", ["-C", root, "ls-files", "-z"], 30_000).catch(() => null);
  const files = tracked
    ? tracked.split("\0").filter((f) => f === "package.json" || f.endsWith("/package.json"))
    : Object.keys(readLock(root).packages ?? {})
        .filter((p) => !p.includes("node_modules/"))
        .map((p) => (p ? `${p}/package.json` : "package.json"));
  return files
    .filter((f) => !NOT_A_PART.test(f) && existsSync(join(root, f)))
    .map((f) => (f === "package.json" ? "" : dirname(f)))
    .sort((a, b) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)));
}

export async function fetchWorkspaceLibs(cfg: Config): Promise<WorkspaceLibs[]> {
  const root = cfg.libs.projectPath;
  if (!existsSync(join(root, "package.json"))) {
    throw new SourceFailure({ kind: "config", message: msg("srv_package_json_not_found", { path: root }), hint: msg("srv_hint_check_libs_path") });
  }
  const dirs = await manifestDirs(root);
  const manifests = dirs.map((path) => ({ path, pkg: readJson(join(root, path, "package.json")) ?? {} }));
  const internal = new Set(manifests.map((m) => m.pkg.name).filter(Boolean));

  // Scopes privés : .npmrc de la racine et de chaque dossier
  const scopes = new Set(dirs.flatMap((d) => [...privateScopes(join(root, d))]));
  const isPrivate = (name: string) => name.startsWith("@") && scopes.has(name.split("/")[0]);

  // Version installée : lockfile le plus proche (celui du dossier, ex. une infra à part, sinon un parent),
  // node_modules du dossier d'abord, puis celui du lockfile
  const locks = new Map<string, Lock | null>();
  const lockAt = (dir: string) => {
    if (!locks.has(dir)) locks.set(dir, readJson(join(root, dir, "package-lock.json")) as Lock | null);
    return locks.get(dir)!;
  };
  const installedIn = (path: string, name: string): string | null => {
    const parts = path ? path.split("/") : [];
    for (let i = parts.length; i >= 0; i--) {
      const lockDir = parts.slice(0, i).join("/");
      const pkgs = lockAt(lockDir)?.packages;
      if (!pkgs) continue;
      const rel = parts.slice(i).join("/");
      return pkgs[rel ? `${rel}/node_modules/${name}` : `node_modules/${name}`]?.version ?? pkgs[`node_modules/${name}`]?.version ?? null;
    }
    return null;
  };

  // Nom affiché : le dossier (son chemin complet si deux dossiers portent le même nom) ; la racine : nom du projet
  const base = (path: string) => path.split("/").at(-1)!;
  const dup = new Set(dirs.filter((d, i) => d && dirs.findIndex((o) => o && base(o) === base(d)) !== i).map(base));

  const parts = manifests.map(({ path, pkg }) => {
    const deps: Omit<WorkspaceDep, "latest" | "update">[] = [];
    for (const [field, dev] of [["dependencies", false], ["devDependencies", true]] as const) {
      for (const [name, range] of Object.entries<unknown>(pkg[field] ?? {})) {
        if (internal.has(name)) continue; // une autre partie du monorepo, pas une librairie
        deps.push({ name, range: typeof range === "string" ? range : "?", dev, installed: installedIn(path, name), private: isPrivate(name) });
      }
    }
    const name: string = typeof pkg.name === "string" ? pkg.name : path || "racine";
    return {
      path,
      name,
      label: !path ? name.replace(/^@[^/]+\//, "") : dup.has(base(path)) ? path : base(path),
      description: typeof pkg.description === "string" ? pkg.description.slice(0, 300) : null,
      deps,
    };
  });

  // Dernière version de chaque librairie publique (une seule requête par nom, 8 à la fois)
  const publicNames = [...new Set(parts.flatMap((p) => p.deps.filter((d) => !d.private).map((d) => d.name)))];
  const latest = new Map(await mapLimit(publicNames, 8, async (n) => [n, (await npmLatest(n))?.version ?? null] as const));

  return parts
    .map((p) => ({
      ...p,
      deps: p.deps
        .map((d) => {
          const l = latest.get(d.name) ?? null;
          return { ...d, latest: l, update: updateKind(d.installed, l) };
        })
        .sort((a, b) => Number(a.dev) - Number(b.dev) || a.name.localeCompare(b.name)),
    }));
}

// ---------- Fiche complète d'une librairie ----------
/** Markdown des notes de version -> début en texte brut */
export function releaseExcerpt(md: string | null | undefined, max = 280): string {
  const text = (md ?? "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^.*\bthanks to (the |all )?\d* ?contributors\b.*$/gim, "") // formule de remerciement en tête des notes
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/(\*\*|__|`)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).replace(/\s+\S*$/, "")}…` : text;
}

export async function libOverview(cfg: Config, name: string): Promise<LibOverview> {
  const details = await libDetails(cfg, name); // valide le nom ; ne contacte rien pour un package privé
  if (details.private || name === "node:*") return { details, about: null, news: [], newsUrl: null, advisories: [] };

  const repo = githubRepo(details.repoUrl) ?? githubRepo(details.docsUrl);
  const [readme, releases, advisories] = await Promise.all([
    repo ? run("gh", ["api", `repos/${repo}/readme`, "-H", "Accept: application/vnd.github.raw"]).catch(() => "") : Promise.resolve(""),
    repo ? ghReleases(repo, name) : Promise.resolve([]),
    advisoriesFor(name, details.installed),
  ]);
  const news: LibNews[] = releases.slice(0, 6).map((r) => ({
    name: r.tag_name,
    url: r.html_url,
    publishedAt: r.published_at,
    excerpt: releaseExcerpt(r.body),
    newer: updateKind(details.installed, r.tag_name.split("@").at(-1)!) !== "none",
  }));
  return {
    details,
    about: readme ? (parseReadme(readme).paragraph ?? null) : null,
    news,
    newsUrl: repo ? `https://github.com/${repo}/releases` : details.npmUrl ? `${details.npmUrl}?activeTab=versions` : null,
    advisories,
  };
}
