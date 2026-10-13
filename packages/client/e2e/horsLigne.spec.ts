/* KÓMBE — E2E : le bandeau hors connexion suit la connectivité RÉELLE du
   navigateur (Playwright coupe le réseau). Il dit que rien n'est envoyé au
   groupe et ne prétend jamais qu'une saisie est validée. */

import { expect, test } from "@playwright/test";

test("couper le réseau affiche le bandeau hors connexion, sans fausse validation", async ({ page }) => {
  await page.route("**/kombe-dashboard-config.json", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ apiBaseUrl: "http://localhost:3000" }) }),
  );
  await page.goto("/");
  const bandeau = page.locator(".bandeau--horsLigne");
  await expect(bandeau).toHaveCount(0);

  await page.context().setOffline(true);
  await expect(bandeau).toBeVisible();
  await expect(bandeau).toContainText(/Hors connexion/);
  await expect(bandeau).not.toContainText(/valid/i);

  await page.context().setOffline(false);
  await expect(bandeau).toHaveCount(0);
});

test("le premier élément atteignable au clavier est le lien d'évitement ; chaque champ a un libellé", async ({ page }) => {
  await page.route("**/kombe-dashboard-config.json", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ apiBaseUrl: "http://localhost:3000" }) }),
  );
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.locator(".evitement")).toBeFocused();
  await expect(page.getByLabel("Numéro de téléphone")).toBeVisible();
  await page.getByText("Par e-mail").click();
  await expect(page.getByLabel("Adresse e-mail")).toBeVisible();
});
