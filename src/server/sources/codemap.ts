// Carte du code d'un projet (monorepo npm / pnpm / bun).
//
// Tout est calculé à la volée depuis le dossier local du projet et gardé en mémoire :
// aucun fichier, aucun extrait de code n'est écrit sur disque ni ajouté au dépôt N2.
// Détection des couches et lecture des README : codemap-detect.ts ; fiche d'une librairie : lib-details.ts.

import { readFileSync, existsSync, realpathSync } from "node:fs";
import { join, dirname, resolve, relative, sep } from "node:path";
import type { Config } from "../config.ts";
import { run, SourceFailure } from "../run.ts";
import type { BranchData, Category, CodeExample, CodeMapData, Hotspot, ImpactData, ImportantFile, MapEdge, MapNode } from "../types.ts";
import { githubBranch, jiraKeysOf } from "../../features/branches/logic.ts";
import { branchTarget } from "./branches.ts";
import { msg } from "../messages.ts";
import { BUILTINS, CODE, GENERATED, IGNORED, IMPORT_RE, ORDER, TEST, fileCategory, parseReadme } from "./codemap-detect.ts";

// ---------- Analyse ----------
interface Occurrence {
  file: string;
  line: number;
  size: number;
  isTest: boolean;
  generated: boolean;
}

interface Analysis {
  root: string;
  data: CodeMapData;
  /** node.id -> lib -> occurrences (pour les exemples) */
  occurrences: Map<string, Map<string, Occurrence[]>>;
  /** fichier -> fichiers (hors tests) qui l'importent (analyse d'impact) */
  importers: Map<string, Set<string>>;
  /** fichier -> partie */
  nodeOfFile: Map<string, string>;
  /** tous les fichiers de code suivis par git */
  files: Set<string>;
}

let last: Analysis | null = null;

export const projectRoot = (cfg: Config) => cfg.codemap?.projectPath ?? cfg.libs.projectPath;

export function readJson(path: string): any {
  try {
    // tolère les commentaires des tsconfig.json
    return JSON.parse(readFileSync(path, "utf8").replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, ""));
  } catch {
    return null;
  }
}

const libName = (spec: string) => {
  if (spec.startsWith("node:") || BUILTINS.has(spec.split("/")[0])) return "node:*";
  const parts = spec.split("/");
  return spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
};

export async function fetchCodeMap(cfg: Config): Promise<CodeMapData> {
  const started = Date.now();
  const root = projectRoot(cfg);
  if (!existsSync(join(root, "package.json"))) {
    throw new SourceFailure({ kind: "config", message: msg("srv_project_not_found", { path: root }), hint: msg("srv_hint_check_project_path") });
  }

  const tracked = (await run("git", ["-C", root, "ls-files", "-z"], 30_000)).split("\0").filter(Boolean).filter((f) => !IGNORED.test(f));
  const codeFiles = tracked.filter((f) => CODE.test(f) && !f.endsWith(".d.ts"));

  // 1. Les parties (workspaces) : chaque dossier qui a son propre package.json
  const workspaces = tracked
    .filter((f) => f.endsWith("/package.json") && f.split("/").length <= 4)
    .map((f) => dirname(f))
    .sort((a, b) => b.length - a.length);
  const pkgToWorkspace = new Map<string, string>();
  const pkgExports = new Map<string, Record<string, unknown>>();
  for (const ws of workspaces) {
    const pkg = readJson(join(root, ws, "package.json"));
    if (pkg?.name) {
      pkgToWorkspace.set(pkg.name, ws);
      if (pkg.exports && typeof pkg.exports === "object") pkgExports.set(pkg.name, pkg.exports);
    }
  }

  // "@scope/pkg/sous-chemin" -> fichier, d'après le champ "exports" du package.json (ex. "./*": "./src/public/*.ts")
  const firstString = (v: unknown): string | null =>
    typeof v === "string" ? v : v && typeof v === "object" ? (Object.values(v).map(firstString).find(Boolean) ?? null) : null;
  const resolveExport = (pkg: string, sub: string): string => {
    const ws = pkgToWorkspace.get(pkg)!;
    const key = sub ? `./${sub}` : ".";
    const exp = pkgExports.get(pkg);
    if (exp) {
      for (const [k, v] of Object.entries(exp)) {
        const target = firstString(v);
        if (!target) continue;
        if (k === key) return `${ws}/${target.replace(/^\.\//, "")}`;
        if (k.endsWith("*") && key.startsWith(k.slice(0, -1))) return `${ws}/${target.replace(/^\.\//, "").replace("*", key.slice(k.length - 1))}`;
      }
    }
    if (sub) return existsSync(join(root, ws, "src")) ? `${ws}/src/${sub}` : `${ws}/${sub}`;
    return existsSync(join(root, ws, "src")) ? `${ws}/src/index.ts` : ws;
  };
  const workspaceOf = (f: string) => workspaces.find((ws) => f.startsWith(`${ws}/`)) ?? `(racine)/${f.includes("/") ? f.split("/")[0] : "."}`;

  // 2. Découpage des grosses parties en sous-dossiers
  const threshold = cfg.codemap?.splitThreshold ?? 400;
  const filesPerWs = new Map<string, string[]>();
  for (const f of codeFiles) {
    const ws = workspaceOf(f);
    filesPerWs.set(ws, [...(filesPerWs.get(ws) ?? []), f]);
  }
  const nodeOfFile = new Map<string, string>();
  const nodeMeta = new Map<string, { label: string; workspace: string; path: string }>();
  const wsLabel = (ws: string) => {
    const name = [...pkgToWorkspace].find(([, w]) => w === ws)?.[0];
    return (name ?? ws).replace(/^@[^/]+\//, "").replace(/^\(racine\)\//, "racine · ");
  };
  for (const [ws, files] of filesPerWs) {
    const prod = files.filter((f) => !TEST.test(f));
    if (prod.length <= threshold || ws.startsWith("(racine)")) {
      for (const f of files) nodeOfFile.set(f, ws);
      nodeMeta.set(ws, { label: wsLabel(ws), workspace: ws, path: ws.startsWith("(racine)") ? ws.slice(9) : ws });
      continue;
    }
    const base = existsSync(join(root, ws, "src")) ? `${ws}/src` : ws;
    const bucket = (f: string) => {
      const rest = f.slice(base.length + 1);
      return rest.includes("/") ? `${base}/${rest.split("/")[0]}` : `${base}/(racine)`;
    };
    const counts = new Map<string, number>();
    for (const f of prod) counts.set(bucket(f), (counts.get(bucket(f)) ?? 0) + 1);
    for (const f of files) {
      let id = f.startsWith(`${base}/`) ? bucket(f) : `${ws}/(autres)`;
      if ((counts.get(id) ?? 0) < 5) id = `${ws}/(autres)`;
      nodeOfFile.set(f, id);
      if (!nodeMeta.has(id)) {
        const sub = id.split("/").at(-1)!.replace("(racine)", "racine src").replace("(autres)", "autres");
        nodeMeta.set(id, { label: `${wsLabel(ws)} · ${sub}`, workspace: ws, path: id.includes("(") ? ws : id });
      }
    }
  }

  // 3. Résolution des imports internes (relatifs, alias tsconfig, packages du monorepo)
  const tsPaths: [string, string][] = [];
  for (const ts of ["tsconfig.json", "tsconfig.base.json"]) {
    const paths = readJson(join(root, ts))?.compilerOptions?.paths ?? {};
    for (const [alias, targets] of Object.entries<string[]>(paths)) tsPaths.push([alias, targets[0].replace(/^\.\//, "")]);
  }
  tsPaths.sort((a, b) => b[0].length - a[0].length);

  const nodeIds = [...nodeMeta.keys()].sort((a, b) => b.length - a.length);
  const nodeOfPath = (p: string): string | null => {
    if (nodeOfFile.has(p)) return nodeOfFile.get(p)!;
    const id = nodeIds.find((n) => p === n || p.startsWith(`${n}/`));
    if (id) return id;
    const ws = workspaces.find((w) => p === w || p.startsWith(`${w}/`));
    if (!ws) return null;
    // partie découpée : on vise le sous-dossier qui contient le chemin, sinon le plus gros
    return nodeIds.filter((n) => nodeMeta.get(n)!.workspace === ws).sort((a, b) => (p.startsWith(b) ? 1 : 0) - (p.startsWith(a) ? 1 : 0))[0] ?? null;
  };

  // Chemin importé -> fichier réel (extensions implicites, index, imports ESM en .js qui visent un .ts)
  const codeSet = new Set(codeFiles);
  const fileOfPath = (p: string): string | null => {
    const base = p.replace(/\.(js|mjs|cjs|jsx)$/, "");
    for (const cand of [p, base, ...[".ts", ".tsx", ".mts", ".js", ".jsx", ".mjs", "/index.ts", "/index.tsx", "/index.js"].map((e) => base + e)]) {
      if (codeSet.has(cand)) return cand;
    }
    return null;
  };
  const target = (p: string) => {
    const node = nodeOfPath(p);
    return node ? { node, file: fileOfPath(p) } : null;
  };

  const resolveInternal = (fromFile: string, spec: string): { node: string; file: string | null } | null => {
    if (spec.startsWith(".")) return target(relative(root, resolve(root, dirname(fromFile), spec)).split(sep).join("/"));
    for (const [alias, aliasTarget] of tsPaths) {
      if (alias.endsWith("/*") && spec.startsWith(alias.slice(0, -1))) return target(aliasTarget.replace("*", spec.slice(alias.length - 1)));
      if (alias === spec) return target(aliasTarget);
    }
    const pkg = libName(spec);
    if (pkgToWorkspace.has(pkg)) return target(resolveExport(pkg, spec.slice(pkg.length + 1)));
    return null;
  };

  // 4. Lecture des fichiers
  type Acc = { files: number; testFiles: number; mix: Partial<Record<Category, number>>; libs: Map<string, { files: number; testFiles: number }> };
  const acc = new Map<string, Acc>();
  const occurrences = new Map<string, Map<string, Occurrence[]>>();
  const edgeCount = new Map<string, number>();
  /** fichier -> fichiers (hors tests) qui l'importent */
  const importers = new Map<string, Set<string>>();
  /** fichier (hors tests) -> librairies externes qu'il importe */
  const libsOfFile = new Map<string, string[]>();

  for (const file of codeFiles) {
    const nodeId = nodeOfFile.get(file)!;
    const isTest = TEST.test(file);
    let content: string;
    try {
      content = readFileSync(join(root, file), "utf8");
    } catch {
      continue;
    }
    const a: Acc = acc.get(nodeId) ?? { files: 0, testFiles: 0, mix: {}, libs: new Map() };
    acc.set(nodeId, a);
    isTest ? a.testFiles++ : a.files++;

    const seen = new Set<string>();
    const fileLibs: string[] = [];
    const size = content.length;
    for (const m of content.matchAll(IMPORT_RE)) {
      const spec = m[1] ?? m[2] ?? m[3];
      if (!spec) continue;
      const internal = resolveInternal(file, spec);
      if (internal) {
        if (internal.node !== nodeId && !isTest) edgeCount.set(`${nodeId}\u0000${internal.node}`, (edgeCount.get(`${nodeId}\u0000${internal.node}`) ?? 0) + 1);
        if (internal.file && internal.file !== file && !isTest) {
          const set = importers.get(internal.file) ?? new Set<string>();
          set.add(file);
          importers.set(internal.file, set);
        }
        continue;
      }
      if (spec.startsWith(".") || spec.startsWith("~") || spec.startsWith("#") || spec.startsWith("/")) continue;
      const lib = libName(spec);
      fileLibs.push(lib === "node:*" ? "node:" : lib);
      if (seen.has(lib)) continue;
      seen.add(lib);

      const l = a.libs.get(lib) ?? { files: 0, testFiles: 0 };
      isTest ? l.testFiles++ : l.files++;
      a.libs.set(lib, l);

      const line = content.slice(0, m.index).split("\n").length + (m[0].match(/^\s*/)?.[0].split("\n").length ?? 1) - 1;
      const byLib = occurrences.get(nodeId) ?? new Map<string, Occurrence[]>();
      occurrences.set(nodeId, byLib);
      const list = byLib.get(lib) ?? [];
      if (list.length < 40) list.push({ file, line, size, isTest, generated: GENERATED.test(file) });
      byLib.set(lib, list);
    }
    if (!isTest) {
      const c = fileCategory(file, fileLibs, content);
      a.mix[c] = (a.mix[c] ?? 0) + 1;
      libsOfFile.set(file, [...seen]);
    }
  }

  // 5. Catégorie de chaque partie = catégorie majoritaire de ses fichiers (corrigeable dans la config)
  const overrides = cfg.codemap?.categories ?? {};
  const nodes: MapNode[] = [...nodeMeta.entries()]
    .filter(([id]) => acc.has(id))
    .map(([id, meta]) => {
      const a = acc.get(id)!;
      const override = Object.entries(overrides).find(([p]) => id === p || id.startsWith(`${p}/`))?.[1] as Category | undefined;
      // « partagé » = fichiers sans import marquant (helpers, types) : ils suivent la catégorie dominante
      // de la partie, sauf si presque tout le code est neutre (vrais contrats partagés).
      const entries = (Object.entries(a.mix) as [Category, number][]).sort((x, y) => y[1] - x[1] || ORDER.indexOf(x[0]) - ORDER.indexOf(y[0]));
      const marked = entries.filter(([c]) => c !== "shared");
      const markedTotal = marked.reduce((s, [, n]) => s + n, 0);
      const major = markedTotal >= 0.3 * a.files ? marked[0]?.[0] : entries[0]?.[0];
      return {
        id,
        ...meta,
        category: override && ORDER.includes(override) ? override : (major ?? (a.testFiles ? "tooling" : "shared")),
        mix: a.mix,
        files: a.files,
        testFiles: a.testFiles,
        libs: [...a.libs.entries()]
          .map(([name, l]) => ({ name, ...l }))
          .sort((x, y) => y.files - x.files || y.testFiles - x.testFiles || x.name.localeCompare(y.name)),
        contains: [],
        topFiles: [],
      };
    });

  // 6. À quoi sert chaque partie : config > description du package.json > 1er paragraphe du README.
  //    Pour un sous-dossier : son propre README s'il existe, et la description de la partie parente.
  const prodFiles = codeFiles.filter((f) => !TEST.test(f));
  const wsInfo = new Map<string, { title?: string; description?: string; readme?: string }>();
  const describe = (dir: string) => {
    if (wsInfo.has(dir)) return wsInfo.get(dir)!;
    const info: { title?: string; description?: string; readme?: string } = {};
    const pkgDesc = readJson(join(root, dir, "package.json"))?.description;
    const readmeName = ["README.md", "readme.md", "Readme.md"].find((r) => existsSync(join(root, dir, r)));
    if (readmeName) {
      info.readme = `${dir}/${readmeName}`;
      const md = parseReadme(readFileSync(join(root, dir, readmeName), "utf8"));
      info.title = md.title;
      info.description = md.paragraph;
    }
    if (pkgDesc) info.description = pkgDesc;
    wsInfo.set(dir, info);
    return info;
  };
  // Fichiers les plus importants = les plus importés (nombre de fichiers distincts qui en dépendent)
  const ranked: ImportantFile[] = [...importers.entries()]
    .filter(([f]) => nodeOfFile.has(f) && !TEST.test(f))
    .map(([f, set]) => {
      const node = nodeOfFile.get(f)!;
      const parts = new Set([...set].map((s) => nodeOfFile.get(s)).filter((p) => p && p !== node));
      return { file: f, node, importers: set.size, fromParts: parts.size, generated: GENERATED.test(f) };
    })
    .sort((a, b) => b.importers - a.importers || b.fromParts - a.fromParts || a.file.localeCompare(b.file));

  const manual = cfg.codemap?.descriptions ?? {};
  for (const n of nodes) {
    const pseudo = n.id.startsWith("(racine)") || n.id.includes("(");
    const dir = pseudo ? null : n.id;
    const own = dir ? describe(dir) : {};
    const isSub = n.workspace !== n.id;
    Object.assign(n, {
      title: own.title,
      description: manual[n.id] ?? own.description,
      readme: own.readme ?? (isSub ? describe(n.workspace).readme : undefined),
      parentDescription: isSub ? describe(n.workspace).description : undefined,
    });
    // Sous-dossiers principaux (ex. web · features → account, basket, order…)
    const base = dir && !isSub && existsSync(join(root, dir, "src")) ? `${dir}/src` : dir;
    // Sous-dossiers principaux (ex. web · features → product, checkout…), avec leurs librairies et fichiers clés
    const bySub = new Map<string, string[]>();
    if (base) {
      for (const f of prodFiles) {
        if (!f.startsWith(`${base}/`)) continue;
        const rest = f.slice(base.length + 1);
        if (rest.includes("/")) {
          const name = rest.split("/")[0];
          bySub.set(name, [...(bySub.get(name) ?? []), f]);
        }
      }
    }
    n.contains = [...bySub.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 12)
      .map(([name, files]) => {
        const path = `${base}/${name}`;
        const libCounts = new Map<string, number>();
        for (const f of files) for (const l of libsOfFile.get(f) ?? []) libCounts.set(l, (libCounts.get(l) ?? 0) + 1);
        return {
          name,
          path,
          files: files.length,
          libs: [...libCounts.entries()].map(([lib, c]) => ({ name: lib, files: c })).sort((a, b) => b.files - a.files).slice(0, 8),
          topFiles: ranked.filter((r) => r.file.startsWith(`${path}/`)).slice(0, 5),
        };
      });
    n.topFiles = ranked.filter((r) => r.node === n.id).slice(0, 8);
  }

  const edges: MapEdge[] = [...edgeCount.entries()]
    .map(([k, weight]) => {
      const [from, to] = k.split("\u0000");
      return { from, to, weight };
    })
    .filter((e) => nodeMeta.has(e.from) && nodeMeta.has(e.to) && acc.has(e.to));

  // 8. Points chauds : fichiers à la fois très modifiés (30 derniers jours) et très importés.
  //    Un fichier dont tout dépend et qui change souvent est là où une régression coûte le plus cher.
  const changes = new Map<string, number>();
  const log = await run("git", ["-C", root, "log", "--since=30.days", "--no-merges", "--name-only", "--format="], 30_000).catch(() => "");
  for (const f of log.split("\n")) if (codeSet.has(f) && !TEST.test(f)) changes.set(f, (changes.get(f) ?? 0) + 1);
  for (const n of nodes) n.changes30d = 0;
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  for (const [f, c] of changes) {
    const n = nodeById.get(nodeOfFile.get(f) ?? "");
    if (n) n.changes30d = (n.changes30d ?? 0) + c;
  }
  const hotspots: Hotspot[] = [...changes.entries()]
    .map(([file, c]) => {
      const imp = importers.get(file)?.size ?? 0;
      return { file, node: nodeOfFile.get(file)!, changes: c, importers: imp, score: c * (imp + 1) };
    })
    .filter((h) => h.node && h.importers > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);

  const data: CodeMapData = {
    project: readJson(join(root, "package.json"))?.name ?? root.split("/").at(-1)!,
    nodes,
    edges,
    totalFiles: codeFiles.length,
    topFiles: ranked.slice(0, 25),
    hotspots,
    durationMs: Date.now() - started,
  };
  last = { root, data, occurrences, importers, nodeOfFile, files: codeSet };
  return data;
}

async function analysis(cfg: Config): Promise<Analysis> {
  if (!last || last.root !== projectRoot(cfg)) await fetchCodeMap(cfg);
  return last!;
}

// ---------- Analyse d'impact : qui dépend (directement ou en cascade) d'un fichier ----------
export async function impactOf(cfg: Config, file: string): Promise<ImpactData> {
  const a = await analysis(cfg);
  if (typeof file !== "string" || !a.files.has(file)) throw new SourceFailure({ kind: "config", message: msg("srv_map_unknown_file") });
  const depth = new Map<string, number>([[file, 0]]);
  const queue = [file];
  while (queue.length) {
    const f = queue.shift()!;
    for (const imp of a.importers.get(f) ?? []) {
      if (depth.has(imp)) continue;
      depth.set(imp, depth.get(f)! + 1);
      queue.push(imp);
    }
  }
  depth.delete(file);
  const byNode: Record<string, number> = {};
  const levels: number[] = [];
  for (const [f, d] of depth) {
    const node = a.nodeOfFile.get(f);
    if (node) byNode[node] = (byNode[node] ?? 0) + 1;
    levels[d - 1] = (levels[d - 1] ?? 0) + 1;
  }
  const direct = [...(a.importers.get(file) ?? [])].sort();
  return { file, node: a.nodeOfFile.get(file) ?? null, direct: direct.length, total: depth.size, levels, byNode, directFiles: direct.slice(0, 30) };
}

// ---------- Ma branche : fichiers modifiés par rapport à la branche principale ----------
// `name` : branche choisie dans le sélecteur (défaut : la branche actuelle). Aucun checkout : on compare des refs ;
// les modifications non commitées ne comptent que pour la branche actuelle, la seule dont on a les fichiers.
// La carte et l'impact restent ceux des fichiers de la branche actuelle.
export async function branchChanges(cfg: Config, name?: string): Promise<BranchData> {
  const a = await analysis(cfg);
  const target = await branchTarget(cfg, name);
  const git = (args: string[]) => run("git", ["-C", a.root, ...args], 20_000).then((s) => s.trim());
  const branch = target.isCurrent ? await git(["rev-parse", "--abbrev-ref", "HEAD"]) : target.label;
  const base = (await git(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]).catch(() => "")) || "origin/main";
  const mergeBase = await git(["merge-base", base, target.ref]).catch(() => "");
  const committed = mergeBase ? (await git(["diff", "--name-status", mergeBase, target.ref]).catch(() => "")).split("\n") : [];
  // pas de trim ici : la colonne de statut de `git status --porcelain` commence souvent par une espace (« M fichier »)
  const working = target.isCurrent ? (await run("git", ["-C", a.root, "status", "--porcelain"], 20_000).catch(() => "")).split("\n") : [];
  const files = new Map<string, string>();
  for (const l of committed) {
    const [status, ...paths] = l.split("\t");
    if (status && paths.length) files.set(paths.at(-1)!, status[0]);
  }
  for (const l of working) if (l.trim()) files.set(l.slice(3).split(" -> ").at(-1)!, l.slice(0, 2).trim()[0] ?? "M");
  const list = [...files.entries()].map(([file, status]) => ({ file, status, node: a.nodeOfFile.get(file) ?? null }));
  const nodes: Record<string, number> = {};
  for (const f of list) if (f.node) nodes[f.node] = (nodes[f.node] ?? 0) + 1;
  const ahead = mergeBase ? Number(await git(["rev-list", "--count", `${mergeBase}..${target.ref}`]).catch(() => "0")) : 0;
  const jira = jiraKeysOf(githubBranch(branch), cfg.jira.projectKey).map((key) => ({ key, url: `https://${cfg.jira.site}/browse/${key}` }));
  return { branch, isCurrent: target.isCurrent, base, ahead, files: list.slice(0, 300), nodes, jira };
}

// ---------- Chemins vus dans une trace (Sentry…) -> fichier du projet ----------
// ex. "../../../../packages/api/src/server/trpc.ts" ou "/srv/apps/packages/api/src/server/trpc.ts"
export async function resolveTracePath(cfg: Config, raw: string): Promise<string | null> {
  if (typeof raw !== "string" || !raw || raw.includes("node_modules")) return null;
  const a = await analysis(cfg);
  const clean = raw.replace(/^[a-z]+:\/\/\/?/i, "").replace(/[?#].*$/, "").replace(/^(\.\.?\/)+/, "").replace(/^~\//, "");
  if (a.files.has(clean)) return clean;
  let best: string | null = null;
  for (const f of a.files) if ((clean.endsWith(`/${f}`) || f.endsWith(`/${clean}`)) && (!best || f.length > best.length)) best = f;
  return best;
}

// ---------- Exemples d'utilisation ----------
function importedNames(statement: string): string[] {
  const head = statement.split(/\bfrom\b/)[0].replace(/^\s*(import|export)\s+(type\s+)?/, "");
  return head
    .replace(/[{}]/g, ",")
    .split(",")
    .map((s) => s.trim().replace(/^type\s+/, "").split(/\s+as\s+/).at(-1)!.replace(/^\*\s*/, "").trim())
    .filter((s) => /^[A-Za-z_$][\w$]*$/.test(s));
}

export function codeExamples(cfg: Config, nodeId: string, lib: string, includeTests: boolean, max = 3): CodeExample[] {
  if (!last || last.root !== projectRoot(cfg)) throw new SourceFailure({ kind: "unavailable", message: msg("srv_map_not_loaded") });
  const list = (last.occurrences.get(nodeId)?.get(lib) ?? []).filter((o) => includeTests || !o.isTest);

  // Préférence : code écrit à la main, petits fichiers (exemples plus lisibles), un exemple par fichier
  const picked = [...list].sort((a, b) => Number(a.generated) - Number(b.generated) || Number(a.isTest) - Number(b.isTest) || a.size - b.size).slice(0, max);

  return picked.map((o) => {
    const lines = readFileSync(join(last!.root, o.file), "utf8").split("\n");
    // Fin de l'instruction d'import (elle peut tenir sur plusieurs lignes)
    let end = o.line - 1;
    while (end < lines.length - 1 && !/["'][^"']+["']\s*\)?\s*;?\s*$/.test(lines[end])) end++;
    const statement = lines.slice(o.line - 1, end + 1).join(" ");
    const names = importedNames(statement);

    // Première ligne, après les imports, qui utilise un des noms importés
    let usage = -1;
    if (names.length) {
      const re = new RegExp(`(?<![\\w$.])(${names.map((n) => n.replace(/\$/g, "\\$")).join("|")})(?![\\w$])`);
      for (let i = end + 1; i < lines.length; i++) {
        if (/^\s*(import|export\s+(type\s+)?\{[^}]*\}\s+from)\b/.test(lines[i])) continue;
        if (re.test(lines[i])) {
          usage = i;
          break;
        }
      }
    }
    const focus = usage >= 0 ? usage : o.line - 1;
    const start = Math.max(0, focus - 2);
    return {
      file: o.file,
      line: focus + 1,
      startLine: start + 1,
      lines: lines.slice(start, start + 9).map((l) => l.slice(0, 220)),
      isTest: o.isTest,
    };
  });
}

// ---------- Ouverture dans l'IDE ----------
// Le chemin doit rester DANS le projet (pas de ../), et le fichier doit exister.
export function resolveProjectFile(cfg: Config, file: unknown, line: unknown): { path: string; line: number } | null {
  if (typeof file !== "string" || file.length > 1024 || file.includes("\0")) return null;
  const n = Number(line);
  if (!Number.isInteger(n) || n < 1 || n > 1_000_000) return null;
  const root = realpathSync(projectRoot(cfg));
  const abs = resolve(root, file);
  if (!existsSync(abs)) return null;
  const real = realpathSync(abs);
  return real.startsWith(root + sep) ? { path: real, line: n } : null;
}
