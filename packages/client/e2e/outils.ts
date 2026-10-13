/* Outils partagés des E2E préparés par l'API réelle (simulateur SMS). */
import type { Browser, Page } from "@playwright/test";

export const API = process.env.KOMBE_E2E_API ?? "http://localhost:3000";
export const run = Date.now().toString().slice(-7);

export interface Personne {
  readonly nom: string;
  readonly session: { sessionId: string; identityId: string; expiresAt: number };
}

export async function apiJoignable(): Promise<boolean> {
  try {
    const r = await fetch(`${API}/v1/health/ready`);
    return r.ok && ((await r.json()) as { mode?: string }).mode === "réel";
  } catch {
    return false;
  }
}

export async function appel<T>(p: Personne | null, methode: string, chemin: string, corps?: unknown): Promise<T> {
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

export async function personne(n: number, nom: string, prefixe = "6"): Promise<Personne> {
  const tel = `${prefixe}${run.slice(-(8 - prefixe.length))}${n}`;
  const req = await appel<{ login: string; devCode?: string }>(null, "POST", "/v1/auth/code-requests", { login: tel });
  const ses = await appel<{ sessionId: string; identityId: string; expiresAt: number }>(null, "POST", "/v1/auth/code-verifications", {
    login: req.login,
    code: req.devCode,
  });
  const p = { nom, session: ses };
  await appel(p, "PATCH", "/v1/me", { displayName: nom });
  return p;
}

export async function pageDe(browser: Browser, p: Personne): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.route("**/kombe-dashboard-config.json", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ apiBaseUrl: API, environment: "e2e" }) }),
  );
  await page.addInitScript((s) => window.localStorage.setItem("kombe.session", JSON.stringify(s)), p.session);
  return page;
}

/** Association de 3 membres prête (trésorier nommé, statuts acceptés, cycle démarré). */
export async function associationDemarree(
  nomGroupe: string,
  [president, tresorier, membre]: readonly [Personne, Personne, Personne],
  options: { readonly secoursParSeance?: string } = {},
): Promise<{ gid: string; ids: Record<string, string> }> {
  const jour = new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
  const t = await appel<{ groupId: string }>(president, "POST", "/v1/tontines", {
    name: nomGroupe,
    founderDisplayName: president.nom,
    settings: {
      contributionPerShare: "5000",
      cadence: { kind: "weekly", weekday: new Date(`${jour}T12:00:00Z`).getUTCDay() },
      firstMeetingDate: jour,
      deadlineTime: "18:00",
      meetingPlace: "Chez la présidente",
      maxMembers: 5,
      transparency: "all_members",
      feeBearer: "member",
      payoutPolicy: "full_with_advance",
      newcomersLast: false,
      guarantorRequired: false,
      payoutWitnesses: 1,
      fines: { lateContributionFixed: "0", lateContributionPerDay: "0", lateContributionCap: "0", meetingLate: "0", meetingAbsence: "0", indisciplineCap: "0", graceDays: 0 },
      solidarity: options.secoursParSeance
        ? { enabled: true, perMeeting: options.secoursParSeance, scale: [{ event: "birth", amount: "3000", maxPerYear: 2 }] }
        : { enabled: false, perMeeting: "0", scale: [] },
      operating: { enabled: false, perMeeting: "0" },
      yearEndReserve: { enabled: false, perMeeting: "0" },
    },
  });
  const gid = t.groupId;
  const inv = await appel<{ code: string }>(president, "POST", `/v1/tontines/${gid}/invitations`, { maxUses: 5, days: 7 });
  const ids: Record<string, string> = {};
  for (const p of [tresorier, membre]) {
    const j = await appel<{ membershipId: string }>(p, "POST", `/v1/invitations/${inv.code}/join`, { displayName: p.nom });
    ids[p.nom] = j.membershipId;
    await appel(president, "POST", `/v1/tontines/${gid}/members/${j.membershipId}/admission`, { decision: "admit" });
  }
  await appel(president, "POST", `/v1/tontines/${gid}/roles`, { membershipId: ids[tresorier.nom], role: "treasurer" });
  await appel(tresorier, "POST", `/v1/tontines/${gid}/roles/acceptance`, { role: "treasurer" });
  const st = await appel<{ hash: string }>(president, "POST", `/v1/tontines/${gid}/statutes`);
  for (const p of [president, tresorier, membre]) await appel(p, "POST", `/v1/tontines/${gid}/statutes/acceptance`, { hash: st.hash });
  await appel(president, "POST", `/v1/tontines/${gid}/cycle`, { order: "join_order" });
  return { gid, ids };
}
