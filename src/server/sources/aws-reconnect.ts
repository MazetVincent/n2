import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { expandHome, type Config } from "../config.ts";
import { redact } from "../run.ts";
import { msg } from "../messages.ts";
import { forgetExpiredRoleCache } from "./aws-session.ts";
import type { Message } from "../types.ts";

// Reconnexion AWS au clic sur « AWS expirée » : lance le script npm du projet indiqué dans config.local.json
// (aws.reconnect, ex. `npm run aws:login` dans le projet suivi). Le script ouvre lui-même le navigateur pour se connecter.
// SÉCURITÉ : la commande vient uniquement de la configuration (le navigateur n'envoie aucun paramètre),
// une seule à la fois, sans entrée clavier, arrêtée au bout de 5 minutes ; sa sortie n'est jamais renvoyée, sauf
// la fin d'un message d'erreur, masqué (redact).

export type ReconnectResult = { ok: true } | { ok: false; error: Message };

const TIMEOUT_MS = 5 * 60_000;
const SCRIPT = /^[A-Za-z0-9:._-]{1,100}$/;

/** Dossier et script de reconnexion s'ils sont configurés et valides, sinon le message d'erreur */
export function reconnectTarget(cfg: Config): { cwd: string; script: string } | { error: Message } {
  const r = cfg.aws.reconnect;
  if (!r?.projectPath || !r.script) return { error: msg("srv_aws_reconnect_missing") };
  if (!SCRIPT.test(r.script)) return { error: msg("srv_aws_reconnect_invalid") };
  const cwd = expandHome(r.projectPath);
  if (!existsSync(join(cwd, "package.json"))) return { error: msg("srv_package_json_not_found", { path: r.projectPath }) };
  return { cwd, script: r.script };
}

let running: Promise<ReconnectResult> | null = null;

export function reconnectAws(cfg: Config): Promise<ReconnectResult> {
  // un deuxième clic pendant la connexion attend la même commande au lieu d'en relancer une
  if (running) return running;
  const target = reconnectTarget(cfg);
  if ("error" in target) return Promise.resolve({ ok: false, error: target.error });
  // session expirée : le rôle encore en cache ferait croire au script qu'il est connecté (voir aws-session.ts)
  forgetExpiredRoleCache(cfg.aws.profile);
  running = new Promise<ReconnectResult>((resolve) => {
    const child = spawn("npm", ["run", target.script], { cwd: target.cwd, stdio: ["ignore", "pipe", "pipe"] });
    let tail = "";
    const keep = (chunk: Buffer) => (tail = (tail + chunk.toString()).slice(-2000));
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    const timer = setTimeout(() => child.kill("SIGTERM"), TIMEOUT_MS);
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, error: msg("srv_raw", { text: redact(e.message) }) });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) return resolve({ ok: true });
      // les dernières lignes de la commande, pour comprendre l'échec (secrets masqués)
      const detail = redact(tail.trim().split("\n").filter(Boolean).slice(-3).join(" · ")) || "—";
      resolve({ ok: false, error: signal ? msg("srv_aws_reconnect_timeout", { detail }) : msg("srv_npm_script_failed", { script: target.script, code: String(code), detail }) });
    });
  }).finally(() => {
    running = null;
  });
  return running;
}
