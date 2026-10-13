/* KÓMBE — E2E « vote de l'assemblée » (ADR-0038) dans un vrai navigateur,
   contre la vraie API et une vraie PostgreSQL. L'association (3 membres,
   cycle démarré) est préparée par l'API ; le vote se fait dans la PWA :
   Awa (présidente) demande une pause des séances, vote oui ; Bertrand vote
   oui → majorité absolue des 3 électeurs atteinte → décision adoptée et
   exécutée ; Chantal voit le résultat et la nouvelle date.

   Prérequis : API en mode réel sur KOMBE_E2E_API avec le simulateur SMS. */

import { expect, test, type Page } from "@playwright/test";

import { appel, apiJoignable, associationDemarree, pageDe, personne, run, API } from "./outils.js";

async function ouvrirVotes(page: Page, groupe: string) {
  await page.goto("/");
  await page.getByRole("button", { name: new RegExp(groupe) }).first().click();
  await page.getByRole("navigation").getByRole("button", { name: "Votes", exact: true }).click();
}

test("pause des séances votée par l'assemblée (ADR-0038), puis reprise du cahier (L-20)", async ({ browser }) => {
  test.skip(!(await apiJoignable()), `API réelle injoignable sur ${API}`);
  test.setTimeout(120_000);

  /* Préparation par l'API : 3 membres, trésorier, statuts, cycle démarré. */
  const awa = await personne(1, "Awa Ndongo");
  const bertrand = await personne(2, "Bertrand Ekwalla");
  const chantal = await personne(3, "Chantal Mbappe");
  const nomGroupe = `Njangi Votes ${run}`;
  const { gid } = await associationDemarree(nomGroupe, [awa, bertrand, chantal]);
  const avant = await appel<{ seq: number; date: string }[]>(awa, "GET", `/v1/tontines/${gid}/rounds`);

  /* Awa demande le vote dans la PWA. */
  const pAwa = await pageDe(browser, awa);
  await ouvrirVotes(pAwa, nomGroupe);
  await expect(pAwa.getByText(/majorité absolue des électeurs/)).toBeVisible();
  await pAwa.getByRole("button", { name: "Demander un vote" }).click();
  await pAwa.getByLabel("Objet du vote").selectOption("pause");
  await pAwa.getByLabel("Nombre de séances à sauter").selectOption("1");
  await pAwa.getByLabel("Motif").fill("Fête de fin d'année");
  await pAwa.getByRole("button", { name: "Ouvrir le vote" }).click();
  await expect(pAwa.getByText("Vote en cours")).toBeVisible();
  await expect(pAwa.getByText("0 bulletin(s) sur 3 électeurs")).toBeVisible();
  await pAwa.getByRole("button", { name: "Oui", exact: true }).click();
  await expect(pAwa.getByText("1 bulletin(s) sur 3 électeurs")).toBeVisible();
  // Vote secret : pas de décompte avant le dépouillement.
  await expect(pAwa.getByText(/Vote secret/)).toBeVisible();

  /* Bertrand vote oui : 2 sur 3 → adoptée et exécutée. */
  const pBertrand = await pageDe(browser, bertrand);
  await ouvrirVotes(pBertrand, nomGroupe);
  await pBertrand.getByRole("button", { name: "Oui", exact: true }).click();
  await expect(pBertrand.getByText("Adoptée")).toBeVisible();
  await expect(pBertrand.getByText("Oui 2 · Non 0 · Abstention 0")).toBeVisible();

  /* Chantal voit la décision et la note d'exécution. */
  const pChantal = await pageDe(browser, chantal);
  await ouvrirVotes(pChantal, nomGroupe);
  await expect(pChantal.getByText("Adoptée")).toBeVisible();
  await expect(pChantal.getByText(/Séances décalées de 1 occurrence/)).toBeVisible();
  await expect(pChantal.getByRole("button", { name: "Oui", exact: true })).toHaveCount(0);

  /* Awa reprend une page du cahier (L-20) : à part de tout total. */
  await pAwa.getByRole("navigation").getByRole("button", { name: "Registre", exact: true }).click();
  await pAwa.getByLabel("Collez les lignes du cahier").fill("Awa Ndongo ; 05/01/2025 ; 5 000\nBertrand Ekwalla ; 05/01/2025 ; 5000\nligne abîmée");
  await expect(pAwa.getByText(/2 ligne\(s\) lisible\(s\)/)).toBeVisible();
  await pAwa.getByRole("button", { name: "Reprendre ces lignes" }).click();
  await expect(pAwa.getByText(/2 ligne\(s\) reprise\(s\), 0 déjà présente\(s\)/)).toBeVisible();
  await expect(pAwa.getByText(/Total repris : 10\s000/)).toBeVisible();

  const apres = await appel<{ seq: number; date: string }[]>(awa, "GET", `/v1/tontines/${gid}/rounds`);
  const plus7 = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
  expect(apres[1]?.date).toBe(plus7(avant[1]?.date ?? ""));
});
