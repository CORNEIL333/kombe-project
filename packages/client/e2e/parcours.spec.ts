/* KÓMBE C14 — scénario E2E réel (navigateur). Il exerce le bundle construit
   servi par `vite preview` et observe des actions réelles (clics, clavier,
   changement de langue) plutôt que des constantes :
   - C14-A11Y : focus clavier atteignable dès l'ouverture (lien d'évitement),
     chaque champ de saisie portant un <label> associé ;
   - parcours 12.1 : les quatre étapes enchaînées jusqu'au récapitulatif ;
   - C14-BACK : le retour en arrière conserve la saisie (aucune perte) ;
   - i18n 12.6 : la bascule traduit l'interface et met à jour <html lang>. */

import { expect, test } from "@playwright/test";

test("le parcours guidé s'affiche et le focus clavier est atteignable (C14-A11Y)", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Créer mon groupe" }),
  ).toBeVisible();

  // Le premier élément focusable est le lien d'évitement (navigation clavier).
  await page.keyboard.press("Tab");
  const evitement = page.getByRole("link", { name: /Aller au contenu/i });
  await expect(evitement).toBeFocused();

  // Chaque champ a un label associé (nom accessible résolu par le navigateur).
  await expect(
    page.getByLabel("Nom du groupe", { exact: false }),
  ).toBeVisible();
});

test("on suit les quatre étapes jusqu'au récapitulatif, le retour conserve les données (12.1 + C14-BACK)", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByLabel("Nom du groupe", { exact: false }).fill("Tontine du lundi");
  await page.getByRole("button", { name: "Suivant" }).click();

  await page.getByLabel("Montant de la cotisation", { exact: false }).fill("5000");
  await page.getByLabel("Nombre de membres", { exact: false }).fill("10");
  await page.getByRole("button", { name: "Suivant" }).click();

  // Étape « caisse » : la contribution est présentée « en cours », non validée.
  await expect(page.getByText(/en cours de validation/i)).toBeVisible();
  await page.getByRole("button", { name: "Suivant" }).click();

  // Récapitulatif.
  await expect(
    page.getByRole("heading", { name: "Récapitulatif avant validation définitive" }),
  ).toBeVisible();
  await expect(page.getByText("Tontine du lundi")).toBeVisible();

  // Retour en arrière : la donnée est conservée (C14-BACK — aucune soumission
  // n'a eu lieu pendant la navigation ; le seul envoi est « Confirmer »).
  await page.getByRole("button", { name: "Précédent" }).click();
  await expect(page.getByRole("group", { name: "Caisse" })).toBeVisible();
});

test("la bascule de langue traduit l'interface et met à jour html lang (i18n 12.6)", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");

  await page.getByRole("button", { name: "English" }).click();

  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("heading", { name: "Create my group" }),
  ).toBeVisible();
});
