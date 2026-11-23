// Fiche d'une librairie pour la carte et l'onglet Librairies : registre npm (public seulement), versions, liens de doc.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../config.ts";
import { httpFetch, SourceFailure } from "../run.ts";
import type { LibDetails } from "../types.ts";
import { registerDocUrl } from "../open.ts";
import { msg } from "../messages.ts";
import { projectRoot, readJson } from "./codemap.ts";

// ---------- Fiche d'une librairie (doc officielle, résumé) ----------
const libCache = new Map<string, { at: number; value: LibDetails }>();

// Scopes servis par un registre privé (.npmrc du projet) : on ne révèle pas leurs noms au registre public.
export function privateScopes(root: string): Set<string> {
  const scopes = new Set<string>();
  for (const file of [join(root, ".npmrc"), join(root, ".yarnrc.yml")]) {
    if (!existsSync(file)) continue;
    for (const m of readFileSync(file, "utf8").matchAll(/^\s*["']?(@[\w.-]+)["']?\s*[:=]?\s*(?:registry|npmRegistryServer|:registry)/gm)) scopes.add(m[1]);
    for (const m of readFileSync(file, "utf8").matchAll(/^\s*(@[\w.-]+):registry\s*=/gm)) scopes.add(m[1]);
  }
  return scopes;
}

const httpsOrNull = (u: unknown): string | null => {
  if (typeof u !== "string") return null;
  const url = u.replace(/^git\+/, "").replace(/^git:\/\//, "https://").replace(/\.git(#.*)?$/, "").replace(/^ssh:\/\/git@/, "https://");
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
};

export async function libDetails(cfg: Config, name: string): Promise<LibDetails> {
  if (typeof name !== "string" || name.length > 214 || !/^(@[\w.-]+\/)?[\w.-]+$|^node:\*$/.test(name)) {
    throw new SourceFailure({ kind: "config", message: msg("srv_invalid_lib_name") });
  }
  const hit = libCache.get(name);
  if (hit && Date.now() - hit.at < 24 * 3_600_000) return hit.value;

  const root = projectRoot(cfg);
  if (name === "node:*") {
    const value: LibDetails = {
      name,
      summary: "Modules intégrés de Node.js (fs, path, crypto, http…) : aucun paquet à installer.",
      docsUrl: "https://nodejs.org/api/",
      npmUrl: null,
      repoUrl: null,
      installed: null,
      latest: null,
      license: null,
      private: false,
    };
    registerDocUrl(value.docsUrl!);
    return value;
  }

  const lock = readJson(join(root, "package-lock.json"));
  const installed = lock?.packages?.[`node_modules/${name}`]?.version ?? null;
  const scope = name.startsWith("@") ? name.split("/")[0] : null;
  if (scope && privateScopes(root).has(scope)) {
    const value: LibDetails = { name, summary: null, docsUrl: null, npmUrl: null, repoUrl: null, installed, latest: null, license: null, private: true };
    libCache.set(name, { at: Date.now(), value });
    return value;
  }

  const meta = await httpFetch(`https://registry.npmjs.org/${name.replace("/", "%2F")}/latest`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  const repoUrl = httpsOrNull(typeof meta?.repository === "string" ? meta.repository : meta?.repository?.url);
  const homepage = httpsOrNull(meta?.homepage);
  const value: LibDetails = {
    name,
    summary: typeof meta?.description === "string" ? meta.description.slice(0, 400) : null,
    docsUrl: homepage,
    npmUrl: meta ? `https://www.npmjs.com/package/${name}` : null,
    repoUrl: repoUrl && repoUrl !== homepage ? repoUrl : null,
    installed,
    latest: typeof meta?.version === "string" ? meta.version : null,
    license: typeof meta?.license === "string" ? meta.license : null,
    private: false,
  };
  for (const u of [value.docsUrl, value.repoUrl]) if (u) registerDocUrl(u);
  libCache.set(name, { at: Date.now(), value });
  return value;
}
