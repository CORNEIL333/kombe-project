/* KÓMBE — E2E « vote de l'assemblée » (ADR-0038) dans un vrai navigateur,
   contre la vraie API et une vraie PostgreSQL. L'association (3 membres,
   cycle démarré) est préparée par l'API ; le vote se fait dans la PWA :
   Awa (présidente) demande une pause des séances, vote oui ; Bertrand vote
   oui → majorité absolue des 3 électeurs atteinte → décision adoptée et
   exécutée ; Chantal voit le résultat et la nouvelle date.

   Prérequis : API en mode réel sur KOMBE_E2E_API avec le simulateur SMS. */

import { expect, test, type Browser, type Page } from "@playwright/test";

const API = process.env.KOMBE_E2E_API ?? "http://localhost:3000";
const run = Date.now().toString().slice(-7);

interface Personne {
  readonly nom: string;
  readonly session: { sessionId: string; identityId: string; expiresAt: number };
}

async function apiJoignable(): Promise<boolean> {
  try {
    const r = await fetch(`${API}/v1/health/ready`);
    return r.ok && ((await r.json()) as { mode?: string }).mode === "réel";
  } catch {
    return false;
  }
}

async function appel<T>(p: Personne | null, methode: string, chemin: string, corps?: unknown): Promise<T> {
  const r = await fetch(`${API}${chemin}`, {
    method: methode,
    headers: {
      "content-type": "application/json",
      "idempotency-key": `e2e-${run}-${Math.random().toString(36).slice(2)}`,
      ...(p ? { authorization: `Bearer ${p.session.sessionId}` } : {}),
    },
    ...(corps !== undefined ? { body: JSON.stringify(corps) } : methode === "GET" ? {} : { body: "{}" }),
  });
  if (!r.ok) throw new Error(`${methode} ${chemin} → ${r.status} ${await r.text()}`);
  return (r.status === 204 ? null : await r.json()) as T;
}

async function personne(n: number, nom: string): Promise<Personne> {
  const tel = `6${run}${n}`.slice(0, 9);
  const req = await appel<{ login: string; devCode?: string }>(null, "POST", "/v1/auth/code-requests", { login: tel });
  const ses = await appel<{ sessionId: string; identityId: string; expiresAt: number }>(null, "POST", "/v1/auth/code-verifications", {
    login: req.login,
    code: req.devCode,
  });
  const p = { nom, session: ses };
  await appel(p, "PATCH", "/v1/me", { displayName: nom });
  return p;
}

async function pageDe(browser: Browser, p: Personne): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.route("**/kombe-dashboard-config.json", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ apiBaseUrl: API, environment: "e2e" }) }),
  );
  await page.addInitScript((s) => window.localStorage.setItem("kombe.session", JSON.stringify(s)), p.session);
  return page;
}

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
  const jour = new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
  const nomGroupe = `Njangi Votes ${run}`;
  const t = await appel<{ groupId: string }>(awa, "POST", "/v1/tontines", {
    name: nomGroupe,
    founderDisplayName: awa.nom,
    settings: {
      contributionPerShare: "5000",
      cadence: { kind: "weekly", weekday: new Date(`${jour}T12:00:00Z`).getUTCDay() },
      firstMeetingDate: jour,
      deadlineTime: "18:00",
      meetingPlace: "Chez Awa",
      maxMembers: 5,
      transparency: "all_members",
      feeBearer: "member",
      payoutPolicy: "full_with_advance",
      newcomersLast: false,
      guarantorRequired: false,
      payoutWitnesses: 1,
      fines: { lateContributionFixed: "0", lateContributionPerDay: "0", lateContributionCap: "0", meetingLate: "0", meetingAbsence: "0", indisciplineCap: "0", graceDays: 0 },
      solidarity: { enabled: false, perMeeting: "0", scale: [] },
      operating: { enabled: false, perMeeting: "0" },
      yearEndReserve: { enabled: false, perMeeting: "0" },
    },
  });
  const gid = t.groupId;
  const inv = await appel<{ code: string }>(awa, "POST", `/v1/tontines/${gid}/invitations`, { maxUses: 5, days: 7 });
  const ids: Record<string, string> = {};
  for (const p of [bertrand, chantal]) {
    const j = await appel<{ membershipId: string }>(p, "POST", `/v1/invitations/${inv.code}/join`, { displayName: p.nom });
    ids[p.nom] = j.membershipId;
    await appel(awa, "POST", `/v1/tontines/${gid}/members/${j.membershipId}/admission`, { decision: "admit" });
  }
  await appel(awa, "POST", `/v1/tontines/${gid}/roles`, { membershipId: ids[bertrand.nom], role: "treasurer" });
  await appel(bertrand, "POST", `/v1/tontines/${gid}/roles/acceptance`, { role: "treasurer" });
  const st = await appel<{ hash: string }>(awa, "POST", `/v1/tontines/${gid}/statutes`);
  for (const p of [awa, bertrand, chantal]) await appel(p, "POST", `/v1/tontines/${gid}/statutes/acceptance`, { hash: st.hash });
  await appel(awa, "POST", `/v1/tontines/${gid}/cycle`, { order: "join_order" });
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
