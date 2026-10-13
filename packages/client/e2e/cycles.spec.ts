/* KÓMBE — E2E « cycle complet puis cycle 2 » (ADR-0039) dans un vrai
   navigateur, contre la vraie API et une vraie PostgreSQL.

   L'association (Awa présidente, Bertrand trésorier UNIQUE, Chantal) a
   commencé il y a deux semaines : ses trois tours sont échus. Dans la PWA,
   Awa voit « Mon tour » et la régularité. Les trois tours sont faits par
   l'API ; au tour 2, Bertrand bouffe : c'est la présidence qui déclare sa
   remise. Quand tout est clos, Awa démarre le cycle 2 depuis la PWA.

   Prérequis : API en mode réel sur KOMBE_E2E_API avec le simulateur SMS. */

import { expect, test, type Page } from "@playwright/test";

import { appel, apiJoignable, associationDemarree, pageDe, personne, run, API, type Personne } from "./outils.js";

async function ouvrirGroupe(page: Page, groupe: string) {
  await page.goto("/");
  await page.getByRole("button", { name: new RegExp(groupe) }).first().click();
}

test("cycle complet avec trésorier unique bénéficiaire, puis cycle 2 depuis la PWA", async ({ browser }) => {
  test.skip(!(await apiJoignable()), `API réelle injoignable sur ${API}`);
  test.setTimeout(120_000);

  const awa = await personne(1, "Awa Ndongo");
  const bertrand = await personne(2, "Bertrand Ekwalla");
  const chantal = await personne(3, "Chantal Mbappe");
  const nomGroupe = `Njangi Cycles ${run}`;
  const debut = new Date(Date.now() + 3_600_000 - 14 * 86_400_000).toISOString().slice(0, 10);
  const { gid } = await associationDemarree(nomGroupe, [awa, bertrand, chantal], { premiereSeance: debut });

  /* Awa voit « Mon tour » et la régularité. */
  const pAwa = await pageDe(browser, awa);
  await ouvrirGroupe(pAwa, nomGroupe);
  await expect(pAwa.getByRole("heading", { name: "Mon tour" })).toBeVisible();
  await expect(pAwa.getByText(/Tour 1 · .* : vous recevez 15\s000/)).toBeVisible();
  await expect(pAwa.getByRole("heading", { name: "Régularité" })).toBeVisible();
  await expect(pAwa.getByText("Cycle 1", { exact: false }).first()).toBeVisible();

  /* Les trois tours par l'API (ordre d'arrivée : Awa, Bertrand, Chantal). */
  const fonds = await appel<{ kind: string; fundId: string }[]>(awa, "GET", `/v1/tontines/${gid}/funds`);
  const cagnotte = fonds.find((f) => f.kind === "rotation")?.fundId as string;
  const ordre: Personne[] = [awa, bertrand, chantal];
  for (const seq of [1, 2, 3]) {
    const mv: Record<string, string> = {};
    for (const p of ordre) {
      mv[p.nom] = (await appel<{ movementId: string }>(p, "POST", `/v1/tontines/${gid}/movements`, {
        fundId: cagnotte, kind: "contribution", amount: "5000", roundSeq: seq, channel: "cash",
      })).movementId;
    }
    await appel(bertrand, "POST", `/v1/tontines/${gid}/movements/confirmations`, { movementIds: [mv[awa.nom], mv[chantal.nom]] });
    await appel(awa, "POST", `/v1/tontines/${gid}/movements/confirmations`, { movementIds: [mv[bertrand.nom]] });
    const beneficiaire = ordre[seq - 1] as Personne;
    // Bertrand, seul trésorier, ne déclare pas sa propre remise : la présidence le fait.
    const declarant = beneficiaire === bertrand ? awa : bertrand;
    const remise = await appel<{ movementId: string }>(declarant, "POST", `/v1/tontines/${gid}/rounds/${seq}/payout`, {
      channel: "orange_money", reference: `OM${run}${seq}`, witnessMembershipIds: [],
    });
    await appel(beneficiaire, "POST", `/v1/tontines/${gid}/movements/${remise.movementId}/acknowledgement`);
    await appel(awa, "POST", `/v1/tontines/${gid}/rounds/${seq}/close`);
  }

  /* Tout est clos : Awa démarre le cycle 2 dans la PWA. */
  await pAwa.reload();
  await ouvrirGroupe(pAwa, nomGroupe);
  await expect(pAwa.getByRole("heading", { name: "Démarrer le cycle 2" })).toBeVisible();
  await expect(pAwa.getByText(/Tous les tours du cycle 1 sont clos/)).toBeVisible();
  await pAwa.getByLabel("Ordre d'arrivée dans le groupe").check();
  await pAwa.getByRole("button", { name: "Démarrer le cycle 2" }).click();
  await expect(pAwa.getByText(/Cycle 2/).first()).toBeVisible();
  await expect(pAwa.getByRole("heading", { name: "Démarrer le cycle 2" })).toHaveCount(0);

  const tours = await appel<{ seq: number; state: string }[]>(awa, "GET", `/v1/tontines/${gid}/rounds`);
  expect(tours.map((t) => t.seq)).toEqual([1, 2, 3, 4, 5, 6]);
  expect(tours.filter((t) => t.state === "open").map((t) => t.seq)).toEqual([4, 5, 6]);
});
