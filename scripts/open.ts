// Ouvre N2 dans Chrome, déverrouillé pour ce navigateur (voir src/server/session.ts).
//   bun run open            (port 4747, ou N2_PORT)
//   bun run open --reset    nouveau jeton : tous les navigateurs déjà déverrouillés sont déconnectés
//   bun run open --print    affiche seulement l'adresse, à coller dans un autre navigateur (Firefox, Safari…)
//
// Écrit un code à usage unique dans ~/.config/n2/login (600, valable 2 minutes), puis ouvre
// http://n2.localhost:<port>/?login=<code> (N2_HOST pour un autre nom). N2 vérifie le code, le supprime et pose le cookie de session.
// macOS : l'adresse est passée à Chrome par AppleScript sur l'entrée standard : elle n'apparaît pas dans `ps`.
// Linux, WSL : même commande que les liens de N2 (Google Chrome, sinon le navigateur par défaut ; voir src/server/platform.ts).
// L'adresse passe alors en argument, visible un court instant dans `ps` (code à usage unique, 2 minutes).
// Si rien ne s'ouvre, l'adresse est affichée pour la coller dans le navigateur.
import { spawn, spawnSync } from "node:child_process";
import { browserCommand, currentPlatform } from "../src/server/platform.ts";
import { createLoginCode, publicHost, rotateSessionToken } from "../src/server/session.ts";

const port = process.env.N2_PORT ?? "4747";
if (!/^\d{2,5}$/.test(port)) {
  console.error(`N2_PORT invalide : ${port}`);
  process.exit(1);
}
if (process.argv.includes("--reset")) {
  rotateSessionToken();
  console.log("✓ Nouveau jeton de session : les autres navigateurs devront repasser par bun run open.");
}
const base = `http://${publicHost()}:${port}`;
const url = `${base}/?login=${createLoginCode()}`;

const done = (browser: string) => console.log(`✓ N2 s'ouvre dans ${browser} (${base}). Si la page ne répond pas, lance d'abord bun run dev.`);
const printUrl = (why: string, code: number) => {
  console.error(`${code ? "✗" : "→"} ${why ? `${why} ` : ""}Ouvre cette adresse dans ton navigateur (valable 2 minutes, une seule fois) :`);
  console.log(url);
  process.exit(code);
};

const platform = currentPlatform();
if (process.argv.includes("--print")) {
  printUrl("", 0);
} else if (platform === "linux" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
  // Linux sans écran (serveur, SSH) : rien à ouvrir ici
  printUrl("Pas d'écran graphique.", 0);
} else if (platform === "mac") {
  const r = spawnSync("osascript", ["-"], { input: `tell application "Google Chrome"\n  activate\n  open location "${url}"\nend tell\n`, encoding: "utf8" });
  if (r.status !== 0) {
    console.error("✗ Impossible d'ouvrir Google Chrome.", (r.stderr ?? "").trim());
    process.exit(1);
  }
  done("Chrome");
} else {
  // processus détaché : google-chrome lancé pour la première fois reste en vie, le script n'attend que son démarrage
  const { cmd, args } = browserCommand(platform, url);
  const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
  child.once("error", () => printUrl(`Impossible de lancer ${cmd}.`, 1));
  child.once("spawn", () => {
    child.unref();
    done(cmd.includes("chrome") ? "Chrome" : "le navigateur");
    // la commande ne dit pas si un navigateur s'est vraiment ouvert : l'adresse reste à portée de main
    console.log(`  Rien ne s'ouvre ? Colle cette adresse dans ton navigateur (valable 2 minutes, une seule fois) :\n  ${url}`);
  });
}
