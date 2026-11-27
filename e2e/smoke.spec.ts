// Parcours de N2 en mode démo : chaque onglet s'affiche sans erreur, le verrou tient, l'accessibilité est vérifiée.
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { createLoginCode } from "../src/server/session.ts";

/** Déverrouille N2 pour ce navigateur, comme bun run open (code à usage unique) */
async function unlock(page: Page, path = "/dashboard") {
  await page.goto(`${path}${path.includes("?") ? "&" : "?"}login=${createLoginCode()}`);
}

/** Erreurs de la console et exceptions de la page, relevées pendant le test */
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

test("sans cookie : N2 est verrouillé", async ({ page }) => {
  const res = await page.goto("/dashboard");
  expect(res?.status()).toBe(401);
  await expect(page.locator("body")).toContainText(/verrouillé|locked/i);
});

test("un favori sur 127.0.0.1 est renvoyé vers n2.localhost, déverrouillé", async ({ page }) => {
  const port = process.env.N2_PORT;
  await page.goto(`http://127.0.0.1:${port}/carte?login=${createLoginCode()}`);
  await expect(page).toHaveURL(new RegExp(`^http://n2\\.localhost:${port}/carte`));
  await expect(page.getByRole("heading", { name: /Carte du projet/i })).toBeVisible();
});

const TABS: [string, RegExp][] = [
  ["/dashboard", /À faire|To do/],
  ["/pull-requests", /Pull requests/],
  ["/sprint", /Sprint 24/],
  ["/carte", /Carte du projet/],
  ["/librairies", /Librairies critiques|Critical libraries/],
  ["/observabilite", /TypeError: Cannot read properties of undefined/],
  ["/observabilite?vue=cloudwatch", /boutique-web-5xx/],
  ["/deploiements", /Erreurs de la release en production|CI GitHub/],
  ["/statistiques", /PR/],
  ["/sources", /État des sources|Source status/],
];

for (const [path, text] of TABS) {
  test(`onglet ${path} : contenu affiché, aucune erreur dans la console`, async ({ page }) => {
    const errors = watchErrors(page);
    await unlock(page, path);
    await expect(page.locator("main, body").first()).toContainText(text, { timeout: 15_000 });
    await expect(page.locator("body")).not.toContainText(/verrouillé/i);
    expect(errors).toEqual([]);
  });
}

test("badge « Démo » sous le logo", async ({ page }) => {
  await unlock(page);
  await expect(page.getByTitle(/Données inventées|Made-up data/)).toBeVisible();
});

test("accessibilité du Dashboard : aucune violation critique", async ({ page }) => {
  await unlock(page);
  await expect(page.locator("body")).toContainText(/À faire|To do/);
  const { violations } = await new AxeBuilder({ page }).analyze();
  const critical = violations.filter((v) => v.impact === "critical");
  expect(critical.map((v) => `${v.id} : ${v.help} (${v.nodes.length})`)).toEqual([]);
});

test("Remind me : ajouter puis cocher un rappel (fichier en mémoire en mode démo)", async ({ page }) => {
  const errors = watchErrors(page);
  await unlock(page);
  const card = page.locator("section").filter({ has: page.getByRole("heading", { name: /^Remind me/ }) });
  await expect(card).toContainText("Relire la doc du cache");
  await card.getByRole("textbox").fill("Point ajouté par le test e2e");
  await card.getByRole("textbox").press("Enter");
  const added = card.getByRole("checkbox", { name: "Point ajouté par le test e2e" });
  await expect(added).toBeVisible();
  // coché, il passe dans « Faits », replié : sa case disparaît de la liste
  await added.click();
  await expect(added).toBeHidden();
  await expect(card.getByRole("button", { name: /^(Faits|Done) \(2\)$/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Apparence : « Toujours la nuit » s'applique tout de suite et reste après un rechargement", async ({ page }) => {
  const errors = watchErrors(page);
  // macOS (émulé) en clair : en Automatique, N2 est en clair
  await page.emulateMedia({ colorScheme: "light" });
  await unlock(page, "/dashboard?fenetre=preferences");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-scheme", "light");
  await page.getByRole("dialog").getByText(/^(Toujours la nuit|Always night)$/).click();
  await expect(html).toHaveAttribute("data-scheme", "dark");
  await expect(html).toHaveAttribute("data-theme", "enseigne");
  // rendu par le serveur dès le chargement (cookie), sans attendre la page
  await page.reload();
  await expect(html).toHaveAttribute("data-mode", "night");
  await expect(html).toHaveAttribute("data-scheme", "dark");
  // Automatique : suit de nouveau macOS, y compris quand il change
  await page.getByRole("dialog").getByText(/^(Automatique|Automatic)$/).click();
  await expect(html).toHaveAttribute("data-scheme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(html).toHaveAttribute("data-scheme", "dark");
  expect(errors).toEqual([]);
});
