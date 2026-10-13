/* KÓMBE — E2E « séance sans réseau » (L-05) : Chantal déclare ses parts du
   tour pendant que le réseau est coupé ; la PWA les garde sur le téléphone,
   dit clairement que rien n'est transmis, puis les envoie d'elle-même au
   retour du réseau — une seule fois (clé d'idempotence d'origine). */

import { expect, test } from "@playwright/test";
import { appel, apiJoignable, associationDemarree, pageDe, personne, run, API } from "./outils.js";

test("déclarations gardées sans réseau puis envoyées une seule fois (L-05)", async ({ browser }) => {
  test.skip(!(await apiJoignable()), `API réelle injoignable sur ${API}`);
  test.setTimeout(120_000);
  const awa = await personne(1, "Awa Ndongo", "65");
  const bertrand = await personne(2, "Bertrand Ekwalla", "65");
  const chantal = await personne(3, "Chantal Mbappe", "65");
  const nom = `Njangi Sans Réseau ${run}`;
  const { gid } = await associationDemarree(nom, [awa, bertrand, chantal], { secoursParSeance: "1000" });

  const page = await pageDe(browser, chantal);
  await page.goto("/");
  await page.getByRole("button", { name: new RegExp(nom) }).first().click();
  await expect(page.getByRole("button", { name: /Tout déclarer pour le tour 1/ })).toBeVisible();

  // Le réseau tombe en pleine séance.
  await page.context().setOffline(true);
  await expect(page.locator(".bandeau--horsLigne")).toContainText(/gardés sur ce téléphone/);
  await page.getByRole("button", { name: /Tout déclarer pour le tour 1/ }).click();
  await page.getByRole("button", { name: "Déclarer un paiement" }).click();
  await expect(page.getByText(/Pas de réseau : enregistré sur ce téléphone/)).toBeVisible();
  await expect(page.locator(".bandeau--file")).toContainText("2 opération(s) gardée(s) sur ce téléphone, pas encore transmise(s)");
  // Rien n'est arrivé au serveur.
  const avant = await appel<unknown[]>(bertrand, "GET", `/v1/tontines/${gid}/movements`);
  expect(avant).toHaveLength(0);

  // Le réseau revient : envoi automatique, sans clic.
  await page.context().setOffline(false);
  await expect(page.getByText("2 opération(s) gardée(s) hors connexion transmise(s) au groupe.")).toBeVisible({ timeout: 15_000 });
  const apres = await appel<{ state: string; amount: string }[]>(bertrand, "GET", `/v1/tontines/${gid}/movements`);
  expect(apres.map((m) => `${m.amount}:${m.state}`).sort()).toEqual(["1000:declared", "5000:declared"]);

  // Recharger ne renvoie rien : la file est vide.
  await page.reload();
  await expect(page.locator(".bandeau--file")).toHaveCount(0);
  const encore = await appel<unknown[]>(bertrand, "GET", `/v1/tontines/${gid}/movements`);
  expect(encore).toHaveLength(2);
});
