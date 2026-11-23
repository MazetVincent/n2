import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Config } from "../config.ts";
import type { AwsSession } from "../types.ts";

// Date d'expiration de la session AWS, lue dans ~/.aws/credentials.
// SÉCURITÉ : le fichier contient des clés. On ne garde QUE les lignes `source_profile`, `role_arn` et `expiration` :
// aucune autre valeur n'est conservée, renvoyée ou journalisée.
function readSections(credentials: string): Map<string, Map<string, string>> {
  const sections = new Map<string, Map<string, string>>();
  let current: Map<string, string> | null = null;
  for (const line of credentials.split("\n")) {
    const header = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (header) {
      current = new Map();
      sections.set(header[1].trim(), current);
      continue;
    }
    const kv = line.match(/^\s*(source_profile|role_arn|expiration|aws_expiration|x_security_token_expires)\s*=\s*(.+?)\s*$/);
    if (kv && current) current.set(kv[1], kv[2]);
  }
  return sections;
}

export function parseExpiration(credentials: string, profile: string): string | null {
  const sections = readSections(credentials);
  // un profil qui endosse un rôle (role_arn + source_profile) dépend de la session de son profil source
  const seen = new Set<string>();
  let name: string | undefined = profile;
  while (name && !seen.has(name)) {
    seen.add(name);
    const s = sections.get(name);
    const exp = s?.get("expiration") ?? s?.get("aws_expiration") ?? s?.get("x_security_token_expires");
    if (exp) {
      // formats vus : « 2026-11-21 20:34:55 +0000 UTC », ISO 8601
      const d = new Date(exp.replace(/ UTC$/, "").replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{4})$/, "$1T$2$3"));
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    name = s?.get("source_profile");
  }
  return null;
}

/** Rôle endossé par un profil (role_arn), s'il en a un */
export function profileRoleArn(credentials: string, profile: string): string | null {
  return readSections(credentials).get(profile)?.get("role_arn") ?? null;
}

/** Ce fichier du cache de l'AWS CLI contient-il des identifiants de ce rôle (même compte, même nom) ? */
export function isRoleCacheEntry(roleArn: string, text: string): boolean {
  // arn:aws:iam::<compte>:role/<nom> ↔ arn:aws:sts::<compte>:assumed-role/<nom>/<session>
  const role = /^arn:aws[\w-]*:iam::(\d+):role\/(?:.*\/)?([^/]+)$/.exec(roleArn);
  if (!role) return false;
  try {
    const j = JSON.parse(text) as { AssumedRoleUser?: { Arn?: unknown } };
    const arn = typeof j.AssumedRoleUser?.Arn === "string" ? j.AssumedRoleUser.Arn : "";
    const assumed = /^arn:aws[\w-]*:sts::(\d+):assumed-role\/([^/]+)\//.exec(arn);
    return !!assumed && assumed[1] === role[1] && assumed[2] === role[2];
  } catch {
    return false;
  }
}

/**
 * Avant une reconnexion : retire du cache de l'AWS CLI (~/.aws/cli/cache) les identifiants du rôle endossé par le
 * profil, si sa session source a expiré. Sans cela, l'AWS CLI répond encore avec ce rôle pendant jusqu'à une heure :
 * un script de connexion qui commence par « aws sts get-caller-identity || … » croit la session valide et ne se reconnecte pas.
 * Ce cache est refait par l'AWS CLI au besoin. Renvoie le nombre de fichiers retirés.
 * SÉCURITÉ : ces fichiers contiennent des clés ; seul le rôle (AssumedRoleUser.Arn) est lu, rien n'est renvoyé.
 */
export function forgetExpiredRoleCache(profile: string, opts: { credentialsFile?: string; cacheDir?: string; now?: number } = {}): number {
  const file = opts.credentialsFile ?? credentialsFile();
  const dir = opts.cacheDir ?? join(homedir(), ".aws", "cli", "cache");
  if (!existsSync(file)) return 0;
  const credentials = readFileSync(file, "utf8");
  const role = profileRoleArn(credentials, profile);
  const source = parseExpiration(credentials, profile);
  // session source encore valide (ou date inconnue) : rien à retirer
  if (!role || !source || Date.parse(source) > (opts.now ?? Date.now())) return 0;
  let removed = 0;
  try {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".json")) continue;
      const path = join(dir, f);
      if (!isRoleCacheEntry(role, readFileSync(path, "utf8"))) continue;
      rmSync(path, { force: true });
      removed++;
    }
  } catch {
    /* pas de cache : rien à retirer */
  }
  return removed;
}

const credentialsFile = () => process.env.AWS_SHARED_CREDENTIALS_FILE ?? join(homedir(), ".aws", "credentials");

export function awsSession(cfg: Config): AwsSession {
  const file = credentialsFile();
  const expiresAt = existsSync(file) ? parseExpiration(readFileSync(file, "utf8"), cfg.aws.profile) : null;
  return { profile: cfg.aws.profile, expiresAt, canReconnect: !!cfg.aws.reconnect?.script };
}
