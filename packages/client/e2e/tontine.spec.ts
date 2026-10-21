/* KÓMBE — E2E « tour complet » (L-02) dans un vrai navigateur, contre la vraie
   API et une vraie PostgreSQL. Trois personnes, trois contextes isolés :
   Awa (présidente), Bertrand (trésorier), Chantal (membre).
   Parcours : connexion par téléphone → création → invitation → adhésions →
   admission → trésorier nommé et accepté → statuts publiés et acceptés →
   démarrage → déclarations → confirmation en lot (trésorier) et confirmation
   du versement du trésorier (présidence) → remise devant témoin →
   « j'ai bien reçu » → clôture du tour.

   Prérequis : API en mode réel sur KOMBE_E2E_API (défaut http://localhost:3000)
   avec le simulateur SMS (le code de test s'affiche à l'écran, jamais en
   production). Sans API joignable, le test est ignoré avec le motif. */

import { expect, test, type Browser, type Page } from "@playwright/test";

const API = process.env.KOMBE_E2E_API ?? "http://localhost:3000";
const run = Date.now().toString().slice(-7);

async function apiJoignable(): Promise<boolean> {
  try {
    const r = await fetch(`${API}/v1/health/ready`);
    return r.ok && ((await r.json()) as { mode?: string }).mode === "réel";
  } catch {
    return false;
  }
}

async function nouvellePage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  // La configuration servie pointe vers l'API de production : on la redirige ici.
  await page.route("**/kombe-dashboard-config.json", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ apiBaseUrl: API, environment: "e2e" }) }),
  );
  return page;
}

async function connexion(page: Page, n: number, nom: string, hash = "") {
  await page.goto(`/${hash}`);
  const tel = `6${run}${String(n).padStart(1, "0")}`.slice(0, 9);
  await page.getByLabel("Numéro de téléphone").fill(tel);
  await page.getByRole("button", { name: "Recevoir mon code" }).click();
  const codeTest = page.getByText(/Code de test/);
  await expect(codeTest).toBeVisible();
  const code = ((await codeTest.textContent()) ?? "").match(/(\d{6})/)?.[1] ?? "";
  await page.getByLabel("Code à 6 chiffres").fill(code);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.getByLabel("Votre nom", { exact: true }).fill(nom);
  await page.getByRole("button", { name: "Continuer" }).click();
}

async function onglet(page: Page, nom: string) {
  await page.getByRole("navigation").getByRole("button", { name: nom, exact: true }).click();
}

test("tour complet de bout en bout, trois personnes (L-02)", async ({ browser }) => {
  test.skip(!(await apiJoignable()), `API réelle injoignable sur ${API} (lancer l'API en mode réel avec KOMBE_SMS_PROVIDER=simulator)`);
  test.setTimeout(180_000);

  const awa = await nouvellePage(browser);
  const bertrand = await nouvellePage(browser);
  const chantal = await nouvellePage(browser);

  /* Awa crée la tontine */
  await connexion(awa, 1, "Awa Ndongo");
  await expect(awa.getByRole("heading", { name: "Mes tontines" })).toBeVisible();
  await awa.getByRole("button", { name: "Créer une tontine" }).first().click();
  await awa.getByLabel("Nom du groupe").fill(`Njangi E2E ${run}`);
  await awa.getByLabel("Votre nom").fill("Awa Ndongo");
  await awa.getByRole("button", { name: "Suivant" }).click(); // → Rythme
  // Le rythme et la date se choisissent explicitement (rien n'est imposé).
  await expect(awa.getByRole("button", { name: "Suivant" })).toBeDisabled();
  await awa.getByLabel("Fréquence des séances").selectOption("weekly");
  await awa.getByLabel("Date de la première séance").fill(new Date(Date.now() + 3_600_000).toISOString().slice(0, 10));
  await awa.getByRole("button", { name: "Suivant" }).click(); // → Cotisation
  await awa.getByLabel("Cotisation par part et par séance (FCFA)").fill("5000");
  await awa.getByLabel(/Nombre maximum de membres/).fill("3");
  await expect(awa.getByText(/Cagnotte remise à chaque séance : 15/)).toBeVisible();
  await awa.getByRole("button", { name: "Suivant" }).click(); // → Ordre
  await awa.getByRole("button", { name: "Suivant" }).click(); // → Bureau
  await awa.getByLabel("Témoins présents exigés pour une remise").fill("1");
  await awa.getByRole("button", { name: "Suivant" }).click(); // → Règlement
  // Caisses annexes : décochées par défaut, le bureau les active avec SON montant.
  await awa.getByLabel(/Caisse de secours/).check();
  await expect(awa.getByRole("button", { name: "Suivant" })).toBeDisabled(); // montant exigé
  await awa.locator("#cr-secours").fill("1000");
  await awa.getByLabel(/Caisse de fonctionnement/).check();
  await awa.locator("#cr-fonct").fill("500");
  await awa.getByRole("button", { name: "Suivant" }).click(); // → Récapitulatif
  await awa.getByRole("button", { name: "Créer la tontine" }).click();
  await expect(awa.getByRole("heading", { name: `Njangi E2E ${run}` })).toBeVisible();

  /* Invitation */
  await onglet(awa, "Membres");
  await awa.getByRole("button", { name: "Créer un lien d'invitation" }).click();
  const codeTexte = (await awa.getByText(/^Code : [A-Z2-9]{8}$/).first().textContent()) ?? "";
  const code = codeTexte.replace("Code : ", "").trim();
  expect(code).toMatch(/^[A-Z2-9]{8}$/);
  await expect(awa.getByRole("link", { name: "Partager sur WhatsApp" }).first()).toHaveAttribute("href", /wa\.me/);

  /* Bertrand et Chantal rejoignent par le lien */
  for (const [page, n, nom] of [
    [bertrand, 2, "Bertrand Essomba"],
    [chantal, 3, "Chantal Mbarga"],
  ] as const) {
    await connexion(page, n, nom, `#/rejoindre/${code}`);
    await expect(page.getByText(`Vous allez rejoindre : Njangi E2E ${run}`)).toBeVisible({ timeout: 10_000 }).catch(async () => {
      await page.getByRole("button", { name: "Vérifier le code" }).click();
    });
    await page.getByLabel("Votre nom dans ce groupe").fill(nom);
    await page.getByRole("button", { name: "Demander à rejoindre" }).click();
    await expect(page.getByText(/Demande envoyée/)).toBeVisible();
  }

  /* Awa admet, nomme Bertrand trésorier */
  await awa.reload();
  await onglet(awa, "Membres");
  for (let i = 0; i < 2; i++) {
    await awa.getByRole("button", { name: "Admettre" }).first().click();
    await expect(awa.getByRole("button", { name: "Admettre" })).toHaveCount(1 - i);
  }
  await awa.getByLabel("Membres", { exact: true }).selectOption({ label: "Bertrand Essomba" });
  await awa.getByLabel("Fonction").selectOption({ label: "Trésorier" });
  await awa.getByRole("button", { name: "Proposer la nomination" }).click();

  await bertrand.goto("/");
  await bertrand.getByRole("button", { name: new RegExp(`Njangi E2E ${run}`) }).click();
  await onglet(bertrand, "Membres");
  await bertrand.getByRole("button", { name: "Accepter la fonction de Trésorier" }).click();
  await expect(bertrand.getByText(/Trésorier/).first()).toBeVisible();

  /* Statuts publiés avec une échéance (ADR-0042), acceptés par chacun */
  await awa.reload();
  await onglet(awa, "Statuts");
  await expect(awa.getByLabel("Délai pour accepter (jours)")).toHaveValue("7");
  await awa.getByRole("button", { name: "Publier et demander l'acceptation" }).click();
  await expect(awa.getByText("Vous avez accepté cette version.")).toBeVisible(); // qui publie approuve
  await expect(awa.getByText("Pas encore accepté (2)")).toBeVisible();
  // Bertrand passe par sa notification : la ligne ouvre directement les statuts.
  await bertrand.goto("/#/notifications");
  await bertrand.getByRole("button", { name: /Nouveaux statuts à accepter/ }).first().click();
  await expect(bertrand).toHaveURL(/#\/groupe\/[^/]+\/statuts$/);
  await expect(bertrand.getByText(/Acceptez avant le/)).toBeVisible();
  for (const page of [bertrand, chantal]) {
    await page.goto("/");
    await page.getByRole("button", { name: new RegExp(`Njangi E2E ${run}`) }).click();
    await expect(page.getByText(/Nouveaux statuts|statuts/i).first()).toBeVisible();
    await onglet(page, "Statuts");
    await expect(page.getByText(/Acceptez avant le/)).toBeVisible();
    await page.getByRole("button", { name: "J'accepte les statuts" }).click();
    await expect(page.getByText("Vous avez accepté cette version.")).toBeVisible();
  }
  await awa.reload();
  await onglet(awa, "Statuts");
  await expect(awa.getByText("Tout le monde a accepté.")).toBeVisible();

  /* Démarrage dans l'ordre d'arrivée : Awa reçoit au tour 1 */
  await onglet(awa, "Aperçu");
  await awa.getByLabel("Ordre d'arrivée dans le groupe").check();
  await awa.getByRole("button", { name: "Démarrer le cycle" }).click();
  await expect(awa.getByText(/Tour en cours : n° 1/)).toBeVisible();

  /* Chacun déclare en une fois ses parts du tour 1 (cagnotte, secours, fonctionnement) */
  for (const page of [awa, bertrand, chantal]) {
    await page.reload();
    await onglet(page, "Aperçu");
    await page.getByRole("button", { name: /Tout déclarer pour le tour 1/ }).click();
    await page.getByRole("button", { name: "Déclarer un paiement" }).click();
    await expect(page.getByText("À jour")).toBeVisible();
  }

  /* Bertrand confirme en lot (pas sa propre déclaration) */
  await bertrand.reload();
  await onglet(bertrand, "Cotisations");
  const lotB = bertrand.locator("section", { hasText: "À confirmer (trésorier)" });
  await lotB.getByRole("button", { name: /^✓ \d+$/ }).click();
  await lotB.getByRole("button", { name: /Confirmer la sélection/ }).click();
  await expect(lotB.getByRole("checkbox")).toHaveCount(0);

  /* Awa (présidence) confirme le versement de Bertrand */
  await awa.reload();
  await onglet(awa, "Cotisations");
  const lotA = awa.locator("section", { hasText: "À confirmer (trésorier)" });
  await lotA.getByRole("button", { name: /^✓ 3$/ }).click();
  await lotA.getByRole("button", { name: /Confirmer la sélection/ }).click();

  /* Awa ouvre la séance 1 et fait l'appel (tout le monde présent) */
  await onglet(awa, "Séances");
  await awa.getByRole("button", { name: "Ouvrir la séance" }).click();
  await awa.getByRole("button", { name: "Enregistrer l'appel" }).click();
  await expect(awa.getByText("✓")).toBeVisible();

  /* Remise déclarée par Bertrand devant Chantal (témoin) */
  await bertrand.reload();
  await onglet(bertrand, "Tours");
  await bertrand.getByLabel("Chantal Mbarga").check();
  await bertrand.getByRole("button", { name: "Déclarer la remise" }).click();
  await expect(bertrand.getByText("Remise déclarée").first()).toBeVisible();

  /* Awa confirme la réception, puis clôt le tour */
  await awa.reload();
  await onglet(awa, "Cotisations");
  await awa.getByRole("button", { name: "J'ai bien reçu" }).click();
  await onglet(awa, "Tours");
  await awa.getByRole("button", { name: "Clore le tour" }).click();
  await expect(awa.getByText("Clos").first()).toBeVisible();

  /* Registre : chaîne d'empreintes vérifiée */
  await onglet(awa, "Registre");
  await expect(awa.getByText(/Chaîne d'empreintes vérifiée/)).toBeVisible();
});
