// Guide de l'équipe : son fichier HTML (config `guide.path`), son index (sections ↔ fichiers du projet)
// et la fraîcheur des passages de code qu'il cite.
import { readFile, stat } from "node:fs/promises";
import type { Config } from "../config.ts";
import { expandHome } from "../config.ts";
import { run, SourceFailure } from "../run.ts";
import type { DocPassage, GuideFileRef, GuideFreshness, GuideIndex, GuideStaleRef, GuideTabLinks } from "../types.ts";
import { parseGuide, type ParsedGuide } from "../../features/guide/parse.ts";
import { isGuideTarget, resolveRefs } from "../../features/guide/logic.ts";
import { projectRoot } from "./codemap.ts";
import { deployConfig } from "./deploy.ts";
import { msg } from "../messages.ts";

export function guidePath(cfg: Config): string {
  const p = cfg.guide?.path;
  // pas encore débloqué : comme un guide non configuré (rien ne dit qu'il existe)
  if (!cfg.ui?.secret?.unlocked) throw new SourceFailure({ kind: "config", message: msg("srv_guide_not_configured") });
  if (p && cfg.guide?.enabled === false) throw new SourceFailure({ kind: "config", message: msg("srv_guide_disabled"), hint: msg("srv_hint_guide_enable") });
  if (!p) throw new SourceFailure({ kind: "config", message: msg("srv_guide_not_configured"), hint: msg("srv_hint_guide_path") });
  return expandHome(p);
}

// Le fichier fait plusieurs Mo : lu et analysé une fois, relu seulement s'il a changé sur le disque.
let memo: { path: string; mtimeMs: number; html: string; parsed: ParsedGuide } | null = null;

async function load(cfg: Config) {
  const path = guidePath(cfg);
  let info;
  try {
    info = await stat(path);
  } catch {
    throw new SourceFailure({ kind: "config", message: msg("srv_guide_not_found", { path }), hint: msg("srv_hint_check_guide_path") });
  }
  if (memo && memo.path === path && memo.mtimeMs === info.mtimeMs) return memo;
  const html = await readFile(path, "utf8");
  memo = { path, mtimeMs: info.mtimeMs, html, parsed: parseGuide(html, info.mtime.toISOString()) };
  return memo;
}

/** Le HTML du guide, tel quel (servi par /guide-html dans une page isolée) */
export async function guideHtml(cfg: Config): Promise<string> {
  return (await load(cfg)).html;
}

/** Texte des sections du guide, pour la recherche de la carte et les librairies citées */
export async function guidePassages(cfg: Config): Promise<DocPassage[]> {
  return (await load(cfg)).parsed.passages;
}

/** Index du guide, chemins rattachés aux fichiers du projet */
/** Sections proposées en haut des onglets (config guide.links) : adresses valides seulement, 12 au plus par onglet */
function tabLinks(cfg: Config): GuideTabLinks {
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((t): t is string => typeof t === "string" && isGuideTarget(t)).slice(0, 12) : []);
  const l = cfg.guide?.links;
  return { deploy: list(l?.deploy), observability: list(l?.observability), prs: list(l?.prs) };
}

export async function fetchGuide(cfg: Config): Promise<GuideIndex> {
  // le texte des sections reste sur le serveur (plusieurs centaines de Ko) : la page n'en a besoin que pour chercher
  const { passages: _text, ...fromFile } = (await load(cfg)).parsed;
  const parsed: GuideIndex = { ...fromFile, name: cfg.guide?.name?.trim().slice(0, 80) || null, links: tabLinks(cfg) };
  const files = await run("git", ["-C", projectRoot(cfg), "ls-files", "-z"], 30_000)
    .then((out) => out.split("\0").filter(Boolean))
    .catch(() => null);
  // sans le projet (chemin absent), l'index reste utilisable : les chemins ne sont simplement pas vérifiés
  return files ? resolveRefs(parsed, files) : parsed;
}

// ---------- Fraîcheur : le code cité a-t-il changé depuis la révision du guide ? ----------

export interface Hunk {
  /** lignes retirées dans l'ancienne version : [début, fin] ; count 0 = insertion après `start` */
  start: number;
  count: number;
  added: number;
}

/** Sortie de `git diff -U0` → blocs modifiés par fichier (chemin de l'ancienne version) */
export function parseHunks(diff: string): Map<string, Hunk[]> {
  const out = new Map<string, Hunk[]>();
  let current: Hunk[] | null = null;
  for (const line of diff.split("\n")) {
    if (line.startsWith("--- ")) {
      const p = line.slice(4);
      current = p === "/dev/null" ? null : [];
      if (current) out.set(p.replace(/^a\//, ""), current);
      continue;
    }
    const m = /^@@ -(\d+)(?:,(\d+))? \+\d+(?:,(\d+))? @@/.exec(line);
    if (m && current) current.push({ start: Number(m[1]), count: m[2] === undefined ? 1 : Number(m[2]), added: m[3] === undefined ? 1 : Number(m[3]) });
  }
  return out;
}

/** Le passage [from, to] de l'ancienne version est-il touché par ce bloc ? */
const touches = (h: Hunk, from: number, to: number) => (h.count === 0 ? h.start >= from && h.start < to : h.start <= to && h.start + h.count - 1 >= from);

export interface TreeState {
  /** fichiers de la version de référence et de la version comparée */
  baseFiles: Set<string>;
  targetFiles: Set<string>;
  /** fichiers renommés (ancien → nouveau) et supprimés entre les deux */
  renamed: Map<string, string>;
  deleted: Set<string>;
  hunks: Map<string, Hunk[]>;
}

const dirsOf = (files: Set<string>) => {
  const out = new Set<string>();
  for (const f of files) for (let i = f.indexOf("/"); i > 0; i = f.indexOf("/", i + 1)) out.add(f.slice(0, i));
  return out;
};

/**
 * Ce qu'est devenu chaque passage cité. Seules les citations avec des lignes sont dites « modifiées » quand ces lignes
 * ont changé : un fichier cité en entier change presque toujours un peu, ce serait du bruit. Un fichier déplacé,
 * supprimé ou introuvable est signalé dans tous les cas. Les citations datées (« commit:chemin ») sont ignorées.
 */
// Dossiers produits par le build ou les outils : jamais dans git, donc jamais « introuvables »
const GENERATED = /(^|\/)(\.output|dist|build|\.nitro|\.next|\.cache|node_modules|coverage|storybook-static|analyze)(\/|$)/;

/** Chemin écrit depuis son workspace (« scripts/x.ts » pour « apps/web/scripts/x.ts ») : complété s'il est unique */
function completePath(path: string, files: Set<string>): string | null {
  let found: string | null = null;
  for (const f of files) {
    if (!f.endsWith(`/${path}`)) continue;
    if (found) return null;
    found = f;
  }
  return found;
}

export function staleRefs(refs: GuideFileRef[], t: TreeState): GuideStaleRef[] {
  const top = new Set([...t.baseFiles, ...t.targetFiles].map((f) => f.split("/")[0]));
  const baseDirs = dirsOf(t.baseFiles);
  const targetDirs = dirsOf(t.targetFiles);
  const out: GuideStaleRef[] = [];
  for (const ref of refs) {
    if (ref.commit || !top.has(ref.path.split("/")[0]) || GENERATED.test(ref.path)) continue;
    let r = ref;
    if (!t.baseFiles.has(r.path) && !t.targetFiles.has(r.path)) {
      const full = completePath(r.path, t.baseFiles) ?? completePath(r.path, t.targetFiles);
      if (full) r = { ...r, path: full };
    }
    const base = { path: r.path, ...(r.from ? { from: r.from, to: r.to } : {}) };
    if (!t.baseFiles.has(r.path)) {
      if (!t.targetFiles.has(r.path) && !baseDirs.has(r.path) && !targetDirs.has(r.path)) out.push({ ...base, state: "missing", added: 0, removed: 0 });
      continue;
    }
    const moved = t.renamed.get(r.path);
    if (moved) {
      out.push({ ...base, state: "moved", movedTo: moved, added: 0, removed: 0 });
      continue;
    }
    if (t.deleted.has(r.path)) {
      out.push({ ...base, state: "deleted", added: 0, removed: 0 });
      continue;
    }
    if (!r.from) continue;
    const hit = (t.hunks.get(r.path) ?? []).filter((h) => touches(h, r.from!, r.to ?? r.from!));
    if (hit.length) out.push({ ...base, state: "changed", added: hit.reduce((a, h) => a + h.added, 0), removed: hit.reduce((a, h) => a + h.count, 0) });
  }
  return out;
}

export async function guideFreshness(cfg: Config): Promise<GuideFreshness> {
  const { parsed } = await load(cfg);
  const root = projectRoot(cfg);
  const git = (args: string[]) => run("git", ["-C", root, ...args], 60_000);
  const ref = parsed.revisedCommit ?? parsed.writtenCommit;
  if (!ref) throw new SourceFailure({ kind: "unknown", message: msg("srv_guide_ref_missing") });
  const base = await git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]).catch(() => "");
  if (!base.trim()) throw new SourceFailure({ kind: "config", message: msg("srv_guide_commit_missing", { ref }), hint: msg("srv_hint_git_fetch") });
  const main = deployConfig(cfg).mainBranch;
  const remote = await git(["rev-parse", "--verify", "--quiet", `origin/${main}`]).catch(() => "");
  const target = remote.trim() ? `origin/${main}` : "HEAD";

  const tree = async (rev: string) => new Set((await git(["ls-tree", "-r", "-z", "--name-only", rev])).split("\0").filter(Boolean));
  const [baseFiles, targetFiles, nameStatus, count] = await Promise.all([
    tree(ref),
    tree(target),
    git(["diff", "--name-status", "-M", "--no-color", "--no-ext-diff", ref, target]),
    git(["rev-list", "--count", `${ref}..${target}`]),
  ]);
  const renamed = new Map<string, string>();
  const deleted = new Set<string>();
  for (const line of nameStatus.split("\n")) {
    const [st, a, b] = line.split("\t");
    if (st?.startsWith("R") && a && b) renamed.set(a, b);
    else if (st === "D" && a) deleted.add(a);
  }

  const refs = parsed.sections.flatMap((s) => s.files);
  const withLines = [
    ...new Set(
      refs
        .filter((r) => r.from && !r.commit)
        .map((r) => (baseFiles.has(r.path) ? r.path : completePath(r.path, baseFiles)))
        .filter((p): p is string => p !== null),
    ),
  ];
  const hunks = withLines.length ? parseHunks(await git(["diff", "-U0", "--no-color", "--no-ext-diff", "--no-renames", ref, target, "--", ...withLines])) : new Map();
  const state: TreeState = { baseFiles, targetFiles, renamed, deleted, hunks };

  const sections = parsed.sections
    .map((s) => ({ page: s.page, id: s.id, refs: staleRefs(s.files, state) }))
    .filter((s) => s.refs.length);
  return { base: ref, target, commits: Number(count.trim()) || 0, checkedRefs: refs.filter((r) => !r.commit).length, sections };
}
