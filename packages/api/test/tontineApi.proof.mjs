// KÓMBE @kombe/api — preuve base réelle de l'API produit « tontine réelle ».
//
// Script de recette RÉEL (PostgreSQL 16, rôle kombe_app sous RLS, aucune
// simulation de succès). Sans KOMBE_API_DATABASE_URL : BLOCKED (exit 2).
// Le schéma doit être à jour (node packages/db/scripts/migrate.mjs migrate).
// Les codes SMS viennent du simulateur de développement (`devCode`) : aucun
// SMS réel n'est envoyé.
//
// Parcours : 5 personnes se connectent par téléphone ; une association de 4
// membres est créée, invitée, admise, dotée d'un trésorier et d'un
// commissaire ; statuts acceptés ; cycle démarré ; séance 1 (appel,
// cotisations déclarées / confirmées / contrôlées, remise devant témoin,
// accusé de réception, PV, amende d'absence payée, tour clos) ; tour 2 avec
// remise réduite et dette réglée ; secours demandé, accordé, remis ;
// journal vérifié ; contrôles d'accès (tiers 404, membre 403) ; idempotence.
//
// Usage : KOMBE_API_DATABASE_URL=postgres://... node test/tontineApi.proof.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { randomInt } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const distRoot = resolve(here, "../dist");

function blocked(reason) {
  process.stdout.write(JSON.stringify({ target: "kombe.api.tontine", status: "BLOCKED", reason, exitCode: 2 }, null, 2) + "\n");
  process.exit(2);
}

const url = process.env.KOMBE_API_DATABASE_URL;
if (!url) blocked("KOMBE_API_DATABASE_URL absente : aucune base PostgreSQL joignable (jamais simulé).");

let buildApp, createApiPool, NullEmailSender;
try {
  ({ buildApp } = await import(pathToFileURL(resolve(distRoot, "server.js")).href));
  ({ createApiPool } = await import(pathToFileURL(resolve(distRoot, "db/pgPool.js")).href));
  ({ NullEmailSender } = await import(pathToFileURL(resolve(distRoot, "email/emailSender.js")).href));
} catch (err) {
  blocked(`Build manquant (pnpm --filter @kombe/api build requis) : ${String(err?.message ?? err)}`);
}

process.env.NODE_ENV = "test";
// Le parcours enchaîne des dizaines d'appels depuis la même IP (inject).
process.env.KOMBE_RATE_LIMIT_AUTH = "1000";
process.env.KOMBE_RATE_LIMIT_GLOBAL = "100000";
delete process.env.KOMBE_SMS_PROVIDER;
const pool = createApiPool({ connectionString: url });
const app = buildApp({ pool, emailSender: new NullEmailSender() });
await app.ready();

const observations = {};
let failures = 0;
function check(name, cond, detail) {
  observations[name] = cond ? "OK" : detail;
  if (!cond) {
    failures += 1;
    process.stderr.write(`ÉCHEC ${name} : ${JSON.stringify(detail)}\n`);
  }
}

async function call(token, method, path, body, extraHeaders = {}) {
  const headers = { ...extraHeaders };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await app.inject({ method, url: path, headers, ...(body !== undefined ? { payload: body } : {}) });
  let json = null;
  try {
    json = res.body ? JSON.parse(res.body) : null;
  } catch {
    json = res.body;
  }
  return { status: res.statusCode, body: json };
}
async function ok(token, method, path, body, expected = [200, 201, 202, 204], headers) {
  const r = await call(token, method, path, body, headers);
  if (!expected.includes(r.status)) {
    throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(r.body)}`);
  }
  return r.body;
}

// Numéros uniques par exécution (la base peut contenir des runs précédents).
const run = String(randomInt(100000, 999999));

async function login(i, name) {
  const p = `6${String(i)}${run.slice(0, 6)}${i}`.slice(0, 9);
  const req = await ok(null, "POST", "/v1/auth/code-requests", { login: p });
  if (!req.devCode) throw new Error("devCode absent (simulateur attendu en test)");
  const bad = await call(null, "POST", "/v1/auth/code-verifications", { login: p, code: req.devCode === "000000" ? "111111" : "000000" });
  const ses = await ok(null, "POST", "/v1/auth/code-verifications", { login: req.login, code: req.devCode });
  await ok(ses.sessionId, "PATCH", "/v1/me", { displayName: name });
  return { token: ses.sessionId, login: req.login, name, badStatus: bad.status };
}

try {
  /* ── Connexion par téléphone ──────────────────────────────────────── */
  const A = await login(1, "Awa Présidente");
  const B = await login(2, "Bertrand Trésorier");
  const C = await login(3, "Chantal Commissaire");
  const D = await login(4, "Daniel");
  const E = await login(5, "Étranger");
  check("AUTH-PHONE", A.login.startsWith("+2376") && A.token.length > 10, A.login);
  check("AUTH-BAD-CODE", A.badStatus === 400 || A.badStatus === 409 || A.badStatus === 422, A.badStatus);
  const me = await ok(A.token, "GET", "/v1/me");
  check("AUTH-ME", me.displayName === "Awa Présidente", me);
  const noAuth = await call(null, "GET", "/v1/me");
  check("AUTH-REQUIRED", noAuth.status === 401, noAuth.status);

  /* ── Création de l'association ────────────────────────────────────── */
  const today = new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
  const settings = {
    contributionPerShare: "5000",
    cadence: { kind: "weekly", weekday: new Date(`${today}T12:00:00Z`).getUTCDay() },
    firstMeetingDate: today,
    deadlineTime: "18:00",
    meetingPlace: "Chez Awa, Bonamoussadi",
    maxMembers: 10,
    transparency: "all_members",
    feeBearer: "member",
    payoutPolicy: "full_with_advance",
    newcomersLast: false,
    guarantorRequired: false,
    payoutWitnesses: 1,
    fines: { lateContributionFixed: "0", lateContributionPerDay: "0", lateContributionCap: "0", meetingLate: "200", meetingAbsence: "500", indisciplineCap: "2000", graceDays: 2 },
    solidarity: { enabled: true, perMeeting: "1000", scale: [{ event: "birth", amount: "3000", maxPerYear: 2 }] },
    operating: { enabled: true, perMeeting: "500" },
    yearEndReserve: { enabled: false, perMeeting: "0" },
  };
  const t = await ok(A.token, "POST", "/v1/tontines", { name: `Les Amis de Bonamoussadi ${run}`, founderDisplayName: "Awa Présidente", settings });
  const gid = t.groupId;
  check("TONTINE-CREATED", t.state === "configuration" && t.me.roles.includes("animator"), { state: t.state, roles: t.me.roles });
  check("TONTINE-FUNDS", ["rotation", "solidarity", "operating", "fines"].every((k) => t.funds.some((f) => f.kind === k)), t.funds.map((f) => f.kind));

  /* ── Invitation et admission ─────────────────────────────────────── */
  const inv = await ok(A.token, "POST", `/v1/tontines/${gid}/invitations`, { maxUses: 5, days: 7 });
  check("INVITE-LINK", /^[A-Z2-9]{8}$/.test(inv.code) && inv.url.includes(inv.code) && inv.whatsappText.includes(inv.url), inv);
  const prev = await ok(E.token, "GET", `/v1/invitations/${inv.code}`);
  check("INVITE-PREVIEW", prev.usable === true && prev.alreadyMember === false, prev);
  const joined = {};
  for (const P of [B, C, D]) joined[P.name] = await ok(P.token, "POST", `/v1/invitations/${inv.code}/join`, { displayName: P.name });
  check("JOIN-PENDING", Object.values(joined).every((j) => j.membershipState === "pending"), joined);
  const outsiderEarly = await call(B.token, "GET", `/v1/tontines/${gid}/members`);
  check("PENDING-NO-ACCESS", outsiderEarly.status === 404, outsiderEarly.status);
  for (const j of Object.values(joined)) await ok(A.token, "POST", `/v1/tontines/${gid}/members/${j.membershipId}/admission`, { decision: "admit" });
  const members = await ok(A.token, "GET", `/v1/tontines/${gid}/members`);
  const mid = (name) => members.find((x) => x.displayName === name).membershipId;
  check("ADMITTED", members.filter((x) => x.state === "active").length === 4, members.map((x) => [x.displayName, x.state]));

  /* ── Fonctions : trésorier, commissaire ──────────────────────────── */
  await ok(A.token, "POST", `/v1/tontines/${gid}/roles`, { membershipId: mid(B.name), role: "treasurer" });
  await ok(B.token, "POST", `/v1/tontines/${gid}/roles/acceptance`, { role: "treasurer" });
  await ok(A.token, "POST", `/v1/tontines/${gid}/roles`, { membershipId: mid(C.name), role: "auditor" });
  await ok(C.token, "POST", `/v1/tontines/${gid}/roles/acceptance`, { role: "auditor" });
  const members2 = await ok(A.token, "GET", `/v1/tontines/${gid}/members`);
  check("ROLES", members2.find((x) => x.displayName === B.name).roles.includes("treasurer"), members2.map((x) => [x.displayName, x.roles]));
  const asMember = await ok(D.token, "GET", `/v1/tontines/${gid}/members`);
  check("PHONE-MASKED-FOR-MEMBER", asMember.filter((x) => !x.isMe).every((x) => !x.login || x.login.includes("•")), asMember.map((x) => x.login));

  /* ── Statuts ─────────────────────────────────────────────────────── */
  const st = await ok(A.token, "POST", `/v1/tontines/${gid}/statutes`);
  check("STATUTES-TEXT", st.body.length > 200 && !/épargne/i.test(st.body), st.body.slice(0, 120));
  for (const P of [A, B, C, D]) await ok(P.token, "POST", `/v1/tontines/${gid}/statutes/acceptance`, { hash: st.hash });

  /* ── Tirage scellé et démarrage ──────────────────────────────────── */
  const draw = await ok(A.token, "POST", `/v1/tontines/${gid}/draws`);
  const drawView = await ok(D.token, "GET", `/v1/tontines/${gid}/draws/${draw.drawId}`);
  check("DRAW-SEALED", drawView.commitment === draw.commitment && drawView.seed === null, drawView);
  const order = [mid(C.name), mid(D.name), mid(A.name), mid(B.name)];
  const started = await ok(A.token, "POST", `/v1/tontines/${gid}/cycle`, { order: "manual", membershipOrder: order });
  check("CYCLE-STARTED", started.state === "active" && started.cycleStarted, { state: started.state });
  const rounds = await ok(D.token, "GET", `/v1/tontines/${gid}/rounds`);
  check("ROUNDS", rounds.length === 4 && rounds[0].beneficiaryMembershipId === mid(C.name) && rounds[0].expectedPot === "20000", rounds.map((r) => [r.seq, r.date, r.beneficiaryName]));

  const remind = await ok(D.token, "GET", "/v1/me/notifications");
  check("MEETING-REMINDER", remind.some((n) => n.kind === "meeting_reminder" && n.groupId === gid), remind.map((n) => n.kind));

  /* ── Séance 1 ────────────────────────────────────────────────────── */
  const meetings = await ok(A.token, "GET", `/v1/tontines/${gid}/meetings`);
  const m1 = meetings[0].meetingId;
  await ok(A.token, "POST", `/v1/tontines/${gid}/meetings/${m1}/open`);
  const att = await ok(A.token, "PUT", `/v1/tontines/${gid}/meetings/${m1}/attendance`, {
    entries: [
      { membershipId: mid(A.name), status: "present" },
      { membershipId: mid(B.name), status: "present" },
      { membershipId: mid(C.name), status: "present" },
    ],
  });
  check("ATTENDANCE", att.attendance.filter((a) => a.status === "present").length === 3, att.attendance);

  const funds = await ok(A.token, "GET", `/v1/tontines/${gid}/funds`);
  const fund = (k) => funds.find((f) => f.kind === k).fundId;
  const dues = await ok(D.token, "GET", `/v1/me/dues?groupId=${gid}`);
  const r1dues = dues.filter((d) => d.roundSeq === 1);
  check("DUES", r1dues.length === 3 && r1dues.find((d) => d.fundKind === "rotation").due === "5000", r1dues.map((d) => [d.fundKind, d.due]));

  // Chacun déclare ses cotisations du tour 1 ; D (absent) paie par Orange Money.
  const declared = {};
  for (const P of [A, B, C, D]) {
    declared[P.name] = [];
    for (const k of ["rotation", "solidarity", "operating"]) {
      const amount = k === "rotation" ? "5000" : k === "solidarity" ? "1000" : "500";
      const body = P === D
        ? { fundId: fund(k), kind: "contribution", amount, roundSeq: 1, channel: "orange_money", reference: `OM${run}${k.slice(0, 3)}` }
        : { fundId: fund(k), kind: "contribution", amount, roundSeq: 1, channel: "cash" };
      const mv = await ok(P.token, "POST", `/v1/tontines/${gid}/movements`, body, [201], { "idempotency-key": `decl-${run}-${P.name.slice(0, 3)}-${k}` });
      declared[P.name].push(mv.movementId);
    }
  }
  // Idempotence : même clé, même corps → même mouvement, rejoué.
  const replay = await call(A.token, "POST", `/v1/tontines/${gid}/movements`, { fundId: fund("rotation"), kind: "contribution", amount: "5000", roundSeq: 1, channel: "cash" }, { "idempotency-key": `decl-${run}-${A.name.slice(0, 3)}-rotation` });
  check("IDEMPOTENT-REPLAY", replay.status === 201 && replay.body.movementId === declared[A.name][0], replay);
  const over = await call(A.token, "POST", `/v1/tontines/${gid}/movements`, { fundId: fund("rotation"), kind: "contribution", amount: "5000", roundSeq: 1, channel: "cash" });
  check("NO-OVERPAY", over.status === 409, over);
  const noRef = await call(D.token, "POST", `/v1/tontines/${gid}/movements`, { fundId: fund("rotation"), kind: "contribution", amount: "5000", roundSeq: 2, channel: "mtn_momo" });
  check("MOMO-NEEDS-REFERENCE", noRef.status === 422, noRef);

  // Un membre ne confirme rien ; le trésorier ne confirme pas son propre versement.
  const forbidden = await call(D.token, "POST", `/v1/tontines/${gid}/movements/confirmations`, { movementIds: declared[A.name] });
  check("MEMBER-CANNOT-CONFIRM", forbidden.status === 403, forbidden);
  const selfConfirm = await call(B.token, "POST", `/v1/tontines/${gid}/movements/confirmations`, { movementIds: declared[B.name] });
  check("TREASURER-NOT-OWN", selfConfirm.status === 403, selfConfirm);
  const conf = await ok(B.token, "POST", `/v1/tontines/${gid}/movements/confirmations`, { movementIds: [...declared[A.name], ...declared[C.name], ...declared[D.name]] });
  check("CONFIRMED-BATCH", conf.length === 9 && conf.every((x) => x.state === "confirmed"), conf.map((x) => x.state));
  const confB = await ok(A.token, "POST", `/v1/tontines/${gid}/movements/confirmations`, { movementIds: declared[B.name] });
  check("PRESIDENCY-CONFIRMS-TREASURER", confB.every((x) => x.state === "confirmed" && x.confirmedByName === A.name), confB.map((x) => x.state));
  const ctrl = await ok(C.token, "POST", `/v1/tontines/${gid}/movements/${declared[D.name][0]}/control`);
  check("AUDITOR-VALIDATES", ctrl.state === "validated" && ctrl.controlledByName === C.name, ctrl.state);
  const ctrlOwn = await call(C.token, "POST", `/v1/tontines/${gid}/movements/${declared[C.name][0]}/control`);
  check("AUDITOR-NOT-OWN", ctrlOwn.status === 403, ctrlOwn);

  // Remise devant témoin : témoin absent refusé, puis témoin présent.
  const badWitness = await call(B.token, "POST", `/v1/tontines/${gid}/rounds/1/payout`, { channel: "cash", witnessMembershipIds: [mid(D.name)] });
  check("WITNESS-MUST-BE-PRESENT", badWitness.status === 422, badWitness);
  const payout = await ok(B.token, "POST", `/v1/tontines/${gid}/rounds/1/payout`, { channel: "cash", witnessMembershipIds: [mid(A.name)] });
  check("PAYOUT-DECLARED", payout.amount === "20000" && payout.state === "declared" && payout.can.acknowledge === false, payout);
  const earlyClose = await call(A.token, "POST", `/v1/tontines/${gid}/rounds/1/close`);
  check("CLOSE-NEEDS-RECEIPT", earlyClose.status === 409, earlyClose);
  const mvC = await ok(C.token, "GET", `/v1/tontines/${gid}/movements?roundSeq=1`);
  check("BENEFICIARY-CAN-ACK", mvC.find((x) => x.movementId === payout.movementId).can.acknowledge === true, null);
  const ack = await ok(C.token, "POST", `/v1/tontines/${gid}/movements/${payout.movementId}/acknowledgement`);
  check("PAYOUT-RECEIVED", ack.beneficiaryConfirmedAt !== null && ack.state === "confirmed", ack);

  // Clôture de séance : D absent → amende d'absence ; PV généré.
  const closed = await ok(A.token, "POST", `/v1/tontines/${gid}/meetings/${m1}/close`, { notes: "Prochaine séance chez Bertrand.", decisions: ["Achat de chaises reporté"] });
  const fineD = closed.fines.find((f) => f.membershipId === mid(D.name));
  check("ABSENCE-FINE", fineD && fineD.amount === "500" && fineD.kind === "meeting_absence", closed.fines);
  check("MINUTES", closed.minutes && closed.minutes.text.includes("PROCÈS-VERBAL") && closed.minutes.text.includes("20 000 FCFA") && /^[0-9a-f]{64}$/.test(closed.minutes.hash), closed.minutes?.text);
  check("MINUTES-NO-FORBIDDEN-WORDS", !/épargne|solde|retrait|débité/i.test(closed.minutes.text), null);
  const approve = await ok(A.token, "POST", `/v1/tontines/${gid}/meetings/${m1}/minutes-approval`, { hash: closed.minutes.hash });
  check("MINUTES-APPROVED", approve.minutesApproved === true, approve.minutesApproved);

  // D paie son amende ; le trésorier confirme → amende payée.
  const finePay = await ok(D.token, "POST", `/v1/tontines/${gid}/movements`, { fundId: fund("fines"), kind: "fine_payment", amount: "500", channel: "orange_money", reference: `OMF${run}`, relatedKind: "fine", relatedId: fineD.fineId });
  await ok(B.token, "POST", `/v1/tontines/${gid}/movements/confirmations`, { movementIds: [finePay.movementId] });
  const finesAfter = await ok(D.token, "GET", `/v1/tontines/${gid}/fines`);
  check("FINE-PAID", finesAfter.find((f) => f.fineId === fineD.fineId).state === "paid", finesAfter);

  const closeR1 = await ok(A.token, "POST", `/v1/tontines/${gid}/rounds/1/close`);
  check("ROUND1-CLOSED", closeR1.state === "closed" && closeR1.payoutState === "received", closeR1);

  /* ── Tour 2 : D bénéficiaire mais n'a pas cotisé → remise réduite + dette ── */
  const m2 = (await ok(A.token, "GET", `/v1/tontines/${gid}/meetings`))[1].meetingId;
  await ok(A.token, "POST", `/v1/tontines/${gid}/meetings/${m2}/open`);
  await ok(A.token, "PUT", `/v1/tontines/${gid}/meetings/${m2}/attendance`, {
    entries: [A, B, C, D].map((P) => ({ membershipId: mid(P.name), status: "present" })),
  });
  const r2 = [];
  for (const P of [A, B, C]) r2.push((await ok(P.token, "POST", `/v1/tontines/${gid}/movements`, { fundId: fund("rotation"), kind: "contribution", amount: "5000", roundSeq: 2, channel: "cash" })).movementId);
  await ok(B.token, "POST", `/v1/tontines/${gid}/movements/confirmations`, { movementIds: [r2[0], r2[2]] });
  await ok(A.token, "POST", `/v1/tontines/${gid}/movements/confirmations`, { movementIds: [r2[1]] });
  const noAdvance = await call(B.token, "POST", `/v1/tontines/${gid}/rounds/2/payout`, { channel: "cash", witnessMembershipIds: [mid(C.name)] });
  check("ADVANCE-NEEDS-FUND", noAdvance.status === 422, noAdvance);
  const reduced = await ok(B.token, "POST", `/v1/tontines/${gid}/rounds/2/payout`, { channel: "cash", witnessMembershipIds: [mid(C.name)], policy: "reduced" });
  check("PAYOUT-REDUCED", reduced.amount === "15000", reduced.amount);
  await ok(D.token, "POST", `/v1/tontines/${gid}/movements/${reduced.movementId}/acknowledgement`);
  const debts = await ok(D.token, "GET", `/v1/tontines/${gid}/debts`);
  const debtD = debts.find((d) => d.debtorMembershipId === mid(D.name) && d.state === "open");
  check("DEBT-OPENED", debtD && debtD.remaining === "5000" && debtD.origin === "unpaid_obligation", debts);
  const dues2 = await ok(D.token, "GET", `/v1/me/dues?groupId=${gid}`);
  check("DUE-MOVED-TO-DEBT", !dues2.some((d) => d.roundSeq === 2 && d.fundKind === "rotation"), dues2.map((d) => [d.roundSeq, d.fundKind, d.remaining]));
  const repay = await ok(D.token, "POST", `/v1/tontines/${gid}/movements`, { fundId: fund("rotation"), kind: "contribution", amount: "5000", channel: "cash", relatedKind: "debt", relatedId: debtD.debtId });
  await ok(B.token, "POST", `/v1/tontines/${gid}/movements/confirmations`, { movementIds: [repay.movementId] });
  const debtsAfter = await ok(B.token, "GET", `/v1/tontines/${gid}/debts`);
  check("DEBT-SETTLED", debtsAfter.find((d) => d.debtId === debtD.debtId).state === "settled", debtsAfter);
  await ok(A.token, "POST", `/v1/tontines/${gid}/meetings/${m2}/close`, {});
  await ok(A.token, "POST", `/v1/tontines/${gid}/rounds/2/close`);

  /* ── Secours ─────────────────────────────────────────────────────── */
  const aid = await ok(A.token, "POST", `/v1/tontines/${gid}/aids`, { beneficiaryMembershipId: mid(C.name), event: "birth", eventDate: today, note: "Naissance de Junior" });
  check("AID-REQUESTED", aid.amount === "3000" && aid.state === "requested", aid);
  const selfApprove = await call(A.token, "POST", `/v1/tontines/${gid}/aids/${aid.aidId}/decision`, { decision: "approve" });
  check("AID-NOT-SELF-APPROVED", selfApprove.status === 403, selfApprove);
  const approved = await ok(B.token, "POST", `/v1/tontines/${gid}/aids/${aid.aidId}/decision`, { decision: "approve" });
  check("AID-APPROVED", approved.state === "approved", approved);
  const paidAid = await ok(B.token, "POST", `/v1/tontines/${gid}/aids/${aid.aidId}/payout`, { channel: "cash" });
  await ok(C.token, "POST", `/v1/tontines/${gid}/movements/${paidAid.movementId}/acknowledgement`);
  const fundsEnd = await ok(D.token, "GET", `/v1/tontines/${gid}/funds`);
  const sol = fundsEnd.find((f) => f.kind === "solidarity");
  check("SOLIDARITY-BALANCE", sol.confirmedBalance === "1000", fundsEnd.map((f) => [f.kind, f.confirmedBalance]));
  const rot = fundsEnd.find((f) => f.kind === "rotation");
  check("ROTATION-BALANCE", rot.confirmedBalance === "5000", rot);

  /* ── Journal, notifications, accès ───────────────────────────────── */
  const journal = await ok(D.token, "GET", `/v1/tontines/${gid}/journal`);
  check("JOURNAL-VALID", journal.valid === true && journal.entries.length > 30, { valid: journal.valid, n: journal.entries.length });
  const notes = await ok(C.token, "GET", "/v1/me/notifications");
  check("NOTIFICATIONS", notes.length > 0 && notes.every((n) => !/\d{3,}/.test(n.kind)), notes.map((n) => n.kind));
  const read = await ok(C.token, "POST", "/v1/me/notifications/read", { ids: "all" });
  check("NOTIFICATIONS-READ", read.updated === notes.filter((n) => !n.read).length, read);
  const outsider = await call(E.token, "GET", `/v1/tontines/${gid}`);
  check("OUTSIDER-404", outsider.status === 404, outsider.status);
  const outsiderMv = await call(E.token, "GET", `/v1/tontines/${gid}/movements`);
  check("OUTSIDER-MOVEMENTS-404", outsiderMv.status === 404, outsiderMv.status);
  const mine = await ok(D.token, "GET", "/v1/me/tontines");
  check("MY-TONTINES", mine.some((x) => x.groupId === gid && x.state === "active"), mine);
  const logout = await call(E.token, "POST", "/v1/auth/logout");
  const afterLogout = await call(E.token, "GET", "/v1/me");
  check("LOGOUT", logout.status === 204 && afterLogout.status === 401, [logout.status, afterLogout.status]);
} catch (err) {
  failures += 1;
  observations.EXCEPTION = String(err?.stack ?? err);
}

await app.close();
await pool.end();
const status = failures === 0 ? "PASS" : "FAIL";
process.stdout.write(JSON.stringify({ target: "kombe.api.tontine", status, failures, observations }, null, 2) + "\n");
process.exit(failures === 0 ? 0 : 1);
