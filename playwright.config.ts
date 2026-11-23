// Tests de navigateur (bun run test:e2e) : N2 en production et en mode démo (données inventées), sur un port à part
// et avec un dossier d'état temporaire (jeton de session des tests, jamais le tien).
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = "4850";
// Dossier d'état propre à ce lancement (créé une fois par le lanceur, hérité par les workers) : le jeton des tests
// n'est ni le tien, ni lisible par un autre compte (mkdtemp : 700).
process.env.N2_E2E_STATE_DIR ??= mkdtempSync(join(tmpdir(), "n2-e2e-"));
const STATE_DIR = process.env.N2_E2E_STATE_DIR;
// lus aussi par les tests (createLoginCode, adresse) : mêmes valeurs que le serveur
process.env.N2_STATE_DIR = STATE_DIR;
process.env.N2_PORT = PORT;

// Le build des tests remplace dist/ : dans la copie que sert ton N2 (démarrage automatique), ses onglets ouverts
// casseraient jusqu'au redémarrage. Lance les tests depuis une autre copie (worktree) ou en CI.
const services = [join(homedir(), "Library/LaunchAgents/local.n2.dashboard.plist"), join(homedir(), ".config/systemd/user/n2-dashboard.service")];
const served = services.filter(existsSync).some((f) => readFileSync(f, "utf8").includes(`${process.cwd()}<`) || readFileSync(f, "utf8").includes(`WorkingDirectory=${process.cwd()}\n`));
if (served && !process.env.CI) throw new Error(`Cette copie (${process.cwd()}) est servie par le démarrage automatique de N2 : lance les tests de navigateur depuis une autre copie.`);

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://n2.localhost:${PORT}`, trace: "retain-on-failure" },
  // en local, le Google Chrome installé (rien à télécharger) ; en CI, le Chromium de Playwright (playwright install)
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], ...(process.env.CI ? {} : { channel: "chrome" }) } }],
  webServer: {
    command: "bun run build && bunx vite preview",
    url: `http://127.0.0.1:${PORT}/dashboard`,
    // N2 répond 401 sans cookie : Playwright accepte ce code comme « serveur prêt »
    reuseExistingServer: false,
    timeout: 120_000,
    env: { N2_DEMO: "1", N2_PORT: PORT, N2_STATE_DIR: STATE_DIR },
  },
});
