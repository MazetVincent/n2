// Parcours de N2 en mode démo : chaque onglet s'affiche sans erreur, le verrou tient, l'accessibilité est vérifiée.
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { createLoginCode } from "../src/server/session.ts";

/**
 * Ouvre `url` déverrouillé, comme bun run open (code à usage unique). Les tests en parallèle (Chromium et Firefox)
 * partagent le fichier du code : si un autre test l'a remplacé entre-temps, la page est verrouillée et on recommence.
 */
async function gotoUnlocked(page: Page, url: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.goto(`${url}${url.includes("?") ? "&" : "?"}login=${createLoginCode()}`);
    // Firefox : après une redirection depuis un autre site, la page se recharge une fois d'elle-même (sessionGate)
    await expect(page.locator('meta[http-equiv="refresh"]')).toHaveCount(0);
    if (!(await page.getByRole("heading", { name: /N2 est verrouillé|N2 is locked/ }).isVisible())) return;
    errorsOf.get(page)?.splice(0); // le 401 de la page verrouillée n'est pas une erreur de N2
  }
}

/** Déverrouille N2 pour ce navigateur */
const unlock = (page: Page, path = "/dashboard") => gotoUnlocked(page, path);

/** Erreurs relevées par watchErrors, par page (gotoUnlocked oublie celles d'une tentative refusée) */
const errorsOf = new WeakMap<Page, string[]>();

/** Erreurs de la console et exceptions de la page, relevées pendant le test */
function watchErrors(page: Page) {
  const errors: string[] = [];
  errorsOf.set(page, errors);
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
  await gotoUnlocked(page, `http://127.0.0.1:${port}/carte`);
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

test("liens : de vrais liens vers un nouvel onglet, pas de faux liens", async ({ page }) => {
  await unlock(page);
  await expect(page.locator("body")).toContainText(/À faire|To do/);
  await expect(page.locator('[role="link"]')).toHaveCount(0);
  // un élément de liste (erreur, PR, ticket…) : un <a href> nommé par son contenu, ouvert dans un nouvel onglet
  const row = page.locator("a[data-item-hit]").first();
  await expect(row).toHaveAttribute("href", /^https:\/\//);
  await expect(row).toHaveAttribute("target", "_blank");
  await expect(row).toHaveAttribute("rel", /noopener/);
  await expect(row).toHaveAccessibleName(/\S/);
  // les liens externes du contenu aussi
  for (const a of await page.locator('main a[href^="https://"]').all()) await expect(a).toHaveAttribute("target", "_blank");
});

test("Remind me : ajouter puis cocher un rappel (fichier en mémoire en mode démo)", async ({ page }) => {
  const errors = watchErrors(page);
  await unlock(page);
  const card = page.locator("section").filter({ has: page.getByRole("heading", { name: /^Remind me/ }) });
  await expect(card).toContainText("Relire la doc du cache");
  // un texte par navigateur : les projets Chromium et Firefox partagent le serveur de démo (le compteur « Faits » aussi)
  const text = `Point ajouté par le test e2e (${test.info().project.name})`;
  await card.getByRole("textbox").fill(text);
  await card.getByRole("textbox").press("Enter");
  const added = card.getByRole("checkbox", { name: text });
  await expect(added).toBeVisible();
  // coché, il passe dans « Faits », replié : sa case disparaît de la liste, et réapparaît cochée une fois « Faits » déplié
  await added.click();
  await expect(added).toBeHidden();
  await card.getByRole("button", { name: /^(Faits|Done) \(\d+\)$/ }).click();
  await expect(card.getByRole("checkbox", { name: text, checked: true })).toBeVisible();
  expect(errors).toEqual([]);
});
