// PR ouvertes qui mettent à jour une librairie : PR de Renovate, de Dependabot, ou PR faite à la main
// dont le titre ou la branche parle de monter la librairie de version.
// Fonctions pures (sans accès réseau) : utilisées par le serveur (lecture des descriptions) ET par la page.
import type { OpenPr, PrBodyUpdate } from "../server/types.ts";

export interface UpdatePr {
  number: number;
  title: string;
  url: string;
  repo: string;
  author: string;
  isDraft: boolean;
  reviewDecision: OpenPr["reviewDecision"];
  mergeable: OpenPr["mergeable"];
  ci: OpenPr["ci"];
  /** PR ouverte par Renovate ou Dependabot */
  bot: boolean;
  /** version visée, quand la PR la donne (ex. « 19.1.0 », « 19.x ») */
  to: string | null;
}

// renovate[bot], dependabot[bot], un robot maison (monentreprise-deps-bot), ou leurs branches (deps/auto-update)
const BOT = /\[bot\]$|[-_]bot$|^(renovate|dependabot|renovate-bot|dependabot-preview)$/i;
const BOT_BRANCH = /^(renovate|dependabot|deps)\//;
export const isBotPr = (pr: Pick<OpenPr, "author" | "branch">) => BOT.test(pr.author) || BOT_BRANCH.test(pr.branch);

// Caractères d'un nom de package npm : une occurrence de « react » dans « @sentry/react » ou « react-hook-form » n'en est pas une.
const NAME_CHAR = /[a-z0-9._@/-]/i;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Une version : 19, v19, ^7.0.0, 19.x, 5.0.0-beta.1
const VERSION = String.raw`[v^~]?(\d+(?:\.(?:\d+|x))*(?:-[0-9a-z.]+)?)`;
const cleanVersion = (v: string | undefined | null) => (v ? v.replace(/^[v^~=]+/, "").replace(/\.$/, "") || null : null);

/** Le titre parle-t-il de monter une version ? (évite « Corrige le schéma zod du panier ») */
const UPDATE_WORDS = /(?:^|[^\p{L}])(?:update|upgrade|bumps?|migrat\p{L}*|maj|mise à jour|mettre à jour|monter|montée|passage|passer)(?!\p{L})|→|->/iu;

/** « Move to iron-session 9 », « Switch to zod 4 » : juste avant le nom */
const MOVE_TO = /\b(?:move|moving|moved|switch|switching|go|going)\s+to\s+$/i;

/** Noms sous lesquels on parle d'un package : « @tanstack/react-start » → « TanStack Start », « @biomejs/biome » → « Biome » */
export function namesOf(name: string): string[] {
  const m = name.match(/^@([^/]+)\/(.+)$/);
  if (!m) return [name];
  const [, scope, local] = m;
  const short = local.replace(/^react-(?=.)/, "");
  const out = new Set([name, `${scope} ${short}`, `${scope}-${short}`]);
  if (scope.startsWith(local) && local.length >= 4) out.add(local);
  return [...out];
}

/** Position de `name` dans `text` comme mot entier (pas à l'intérieur d'un autre nom de package), sinon -1 */
export function findName(text: string, name: string): number {
  const lower = text.toLowerCase();
  const target = name.toLowerCase();
  for (let i = lower.indexOf(target); i >= 0; i = lower.indexOf(target, i + 1)) {
    const before = lower[i - 1];
    const after = lower[i + target.length];
    const next = lower[i + target.length + 1];
    const okBefore = before === undefined || !NAME_CHAR.test(before);
    // après le nom : fin, espace, ponctuation, « @19 » ou « . » de fin de phrase (pas « react.js »)
    const okAfter = after === undefined || !NAME_CHAR.test(after) || (after === "@" && /[\dv^~]/i.test(next ?? "")) || (after === "." && !/[a-z0-9]/i.test(next ?? ""));
    if (okBefore && okAfter) return i;
  }
  return -1;
}

/** Version visée d'après le titre, cherchée juste après le nom de la librairie */
function titleVersion(title: string, at: number, name: string): string | null {
  const rest = title.slice(at + name.length);
  // « react 19 », « react v19 », « react@19.1.0 »
  const direct = rest.match(new RegExp(String.raw`^\s*@?\s*${VERSION}(?![\w/])`, "i"));
  if (direct) return cleanVersion(direct[1]);
  // « … from 18.2.0 to 19.0.0 », « … to v19 », « … vers 19 », « … → 19 »
  const to = rest.match(new RegExp(String.raw`(?:\bto\b|\bvers\b|\ben\b|→|->)\s*${VERSION}`, "i"));
  return to ? cleanVersion(to[1]) : null;
}

/** Ce que la branche dit de `name` : null si elle n'en parle pas, sinon la version visée (ou "" si inconnue) */
function branchVersion(branch: string, name: string): string | null | undefined {
  const b = branch.toLowerCase();
  const n = name.toLowerCase();
  // Dependabot : dependabot/npm_and_yarn/[dossier/]zod-3.23.8, le @ du scope est retiré (tanstack/react-query-5.1.0)
  if (b.startsWith("dependabot/")) {
    const m = b.match(new RegExp(String.raw`(?:^|/)${escapeRe(n.replace(/^@/, ""))}-${VERSION}$`));
    return m ? cleanVersion(m[1]) : undefined;
  }
  // Renovate : renovate/react-19.x, renovate/major-react-monorepo, renovate/tanstack-react-query-5.x
  if (b.startsWith("renovate/")) {
    const slug = n.replace(/^@/, "").replace(/\//g, "-");
    const m = b.slice(9).match(new RegExp(String.raw`^(?:(?:major|minor|patch)-)?${escapeRe(slug)}(?:-monorepo)?(?:-${VERSION})?$`));
    return m ? (cleanVersion(m[1]) ?? "") : undefined;
  }
  // PR faite à la main : feat/maj-react-19, chore/upgrade-zod-v4, fix/bump-react-hook-form
  if (!/(^|[/_-])(maj|update|upgrade|bump|migrat\w*|montee|mise-a-jour)([/_-]|$)/.test(b)) return undefined;
  const local = n.replace(/^@/, "").replace(/\//g, "-");
  const m = b.match(new RegExp(String.raw`(?:^|[/_-])${escapeRe(local)}(?:-${VERSION})?(?:$|/)`));
  return m ? (cleanVersion(m[1]) ?? "") : undefined;
}

/** La PR met-elle à jour `name` ? Renvoie la version visée (null si inconnue), ou undefined si elle n'en parle pas. */
export function prUpdates(pr: OpenPr, name: string): string | null | undefined {
  // 1. La description (Renovate, Dependabot) : la source la plus sûre, et la seule pour les PR groupées
  const listed = pr.updates.find((u) => u.name.toLowerCase() === name.toLowerCase());
  if (listed) return listed.to;
  // 2. Le titre : nom de la librairie (ou son nom usuel) + un mot qui parle de mise à jour
  let fromTitle: string | null | undefined;
  for (const alias of namesOf(name)) {
    const at = findName(pr.title, alias);
    if (at < 0) continue;
    if (isBotPr(pr) || UPDATE_WORDS.test(pr.title) || MOVE_TO.test(pr.title.slice(0, at))) {
      fromTitle = titleVersion(pr.title, at, alias);
      break;
    }
  }
  // 3. La branche
  const fromBranch = branchVersion(pr.branch, name);
  if (fromTitle === undefined && fromBranch === undefined) return undefined;
  return fromTitle || fromBranch || null;
}

/** PR ouvertes qui mettent à jour `name`, les plus récentes d'abord */
export function updatePrsFor(name: string, prs: OpenPr[]): UpdatePr[] {
  const out: UpdatePr[] = [];
  for (const pr of [...prs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
    const to = prUpdates(pr, name);
    if (to === undefined) continue;
    out.push({ number: pr.number, title: pr.title, url: pr.url, repo: pr.repo, author: pr.author, isDraft: pr.isDraft, reviewDecision: pr.reviewDecision, mergeable: pr.mergeable, ci: pr.ci, bot: isBotPr(pr), to });
  }
  return out;
}

// ---------- Lecture de la description d'une PR ----------
const RENOVATE_DIFF = /renovatebot\.com\/diffs\/npm\/((?:@|%40)?[^/\s)]+(?:(?:\/|%2f)[^/\s)]+)?)\/([^/\s)]+)\/([^/\s)]+)/gi;
// | [react](https://react.dev) ([source](…)) | [`18.2.0` -> `19.0.0`](…) |   (ancien « -> », récent « → »)
const RENOVATE_ROW = /^\|\s*\[([@a-z0-9._/-]+)\]\([^)]*\)[^|]*\|[^\n]*?`([^`]+)`\s*(?:->|→)\s*`([^`]+)`/gim;
// Bumps [zod](https://…) from 3.22.4 to 3.23.8.   Updates `@types/node` from 20.1.0 to 22.0.0
const DEPENDABOT = /\b(?:Bumps|Updates)\s+(?:\[([@a-z0-9._/-]+)\]\([^)]*\)|`([@a-z0-9._/-]+)`)\s+from\s+`?(\d[\w.+-]*?)`?\s+to\s+`?(\d[\w.+-]*?)`?(?=\.?(?:\s|$)|,)/gi;

/** Librairies mises à jour d'après la description d'une PR de Renovate ou Dependabot */
export function parsePrBody(body: string | null | undefined): PrBodyUpdate[] {
  if (!body) return [];
  const found = new Map<string, PrBodyUpdate>();
  const add = (name: string, from: string | null, to: string | null) => {
    const key = name.toLowerCase();
    if (!found.has(key)) found.set(key, { name, from: cleanVersion(from), to: cleanVersion(to) });
  };
  for (const m of body.matchAll(RENOVATE_DIFF)) add(decodeURIComponent(m[1]), m[2], m[3]);
  for (const m of body.matchAll(RENOVATE_ROW)) add(m[1], m[2], m[3]);
  for (const m of body.matchAll(DEPENDABOT)) add(m[1] ?? m[2], m[3], m[4]);
  return [...found.values()];
}

/** Librairies dont la version change dans le diff d'un package.json (PR d'un robot qui ne les liste pas) */
export function parseManifestPatch(patch: string | null | undefined): PrBodyUpdate[] {
  if (!patch) return [];
  const removed = new Map<string, string>();
  const added = new Map<string, string>();
  for (const line of patch.split("\n")) {
    const m = line.match(/^([+-])\s*"([^"]+)"\s*:\s*"([^"]*)"\s*,?\s*$/);
    if (m) (m[1] === "-" ? removed : added).set(m[2], m[3]);
  }
  const out: PrBodyUpdate[] = [];
  for (const [name, to] of added) {
    const from = removed.get(name);
    // une version qui change (pas un script ou un champ ajouté)
    if (from !== undefined && from !== to && /\d/.test(to)) out.push({ name, from: cleanVersion(from), to: cleanVersion(to) });
  }
  return out;
}
