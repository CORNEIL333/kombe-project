// KÓMBE @kombe/api — preuve base réelle de la « tontine réelle » (lots L-01 à
// L-21) : un parcours complet d'association camerounaise, de la connexion par
// téléphone à l'approbation du procès-verbal, sur le serveur Fastify RÉEL
// (`buildApp({ pool })`, `.inject()`) contre PostgreSQL 16+.
//
// Isolation : la preuve crée sa PROPRE base (`kombe_tontine_proof_<pid>`) sur
// le serveur désigné par KOMBE_API_DATABASE_URL, y applique toutes les
// migrations, puis la supprime : elle ne pollue jamais la base partagée des
// autres preuves. Sans KOMBE_API_DATABASE_URL : BLOCKED (exit 2), jamais
// simulé. Aucun SMS ni e-mail réel (expéditeurs nuls injectés).
//
// Usage : KOMBE_API_DATABASE_URL=postgres://... node test/tontineRealMode.proof.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const dbRoot = resolve(here, "../../db");
const distRoot = resolve(here, "../dist");

function blocked(reason) {
  process.stdout.write(JSON.stringify({ target: "kombe.api.tontineRealMode", status: "BLOCKED", reason, exitCode: 2 }, null, 2) + "\n");
  process.exit(2);
}

const url = process.env.KOMBE_API_DATABASE_URL;
if (!url) blocked("KOMBE_API_DATABASE_URL absente : aucune base PostgreSQL joignable (jamais simulé).");

let pg;
try {
  pg = (await import("pg")).default;
} catch {
  blocked("Pilote 'pg' non installé.");
}
let buildApp, createApiPool, NullEmailSender, NullSmsSender, runReminders;
try {
  ({ buildApp } = await import(pathToFileURL(resolve(distRoot, "server.js")).href));
  ({ createApiPool } = await import(pathToFileURL(resolve(distRoot, "db/pgPool.js")).href));
  ({ NullEmailSender } = await import(pathToFileURL(resolve(distRoot, "email/emailSender.js")).href));
  ({ NullSmsSender } = await import(pathToFileURL(resolve(distRoot, "tontine/sms.js")).href));
  ({ runReminders } = await import(pathToFileURL(resolve(distRoot, "tontine/insights.js")).href));
} catch (err) {
  blocked(`Build manquant (pnpm --filter @kombe/api build requis) : ${String(err?.message ?? err)}`);
}

const UP = [
  "provision/roles_create.sql",
  ...Array.from({ length: 26 }, (_, i) => i + 1).map((n) => {
    const prefix = String(n).padStart(4, "0");
    return `migrations/${readMigrationName(prefix)}`;
  }),
  "provision/roles.sql",
];
function readMigrationName(prefix) {
  const names = {
    "0001": "0001_init.sql", "0002": "0002_role_change.sql", "0003": "0003_access.sql", "0004": "0004_group_governance.sql",
    "0005": "0005_rules_engine.sql", "0006": "0006_cycle_schedule.sql", "0007": "0007_event_journal.sql",
    "0008": "0008_contribution_idempotency.sql", "0009": "0009_contribution_validation.sql", "0010": "0010_dispute_cases.sql",
    "0011": "0011_disbursement.sql", "0012": "0012_proposal.sql", "0013": "0013_outbox.sql", "0014": "0014_support_security.sql",
    "0015": "0015_export_manifest.sql", "0016": "0016_privacy_law.sql", "0017": "0017_pilot_metrics.sql",
    "0018": "0018_session_resolver.sql", "0019": "0019_token_security.sql", "0020": "0020_group_resolvers.sql",
    "0021": "0021_privacy_restore_points.sql", "0022": "0022_cycle_schedule.sql", "0023": "0023_worker_discovery.sql",
    "0024": "0024_tontine_core.sql", "0025": "0025_association.sql", "0026": "0026_reminders.sql",
  };
  return names[prefix];
}

const dbName = `kombe_tontine_proof_${process.pid}`;
const admin = new pg.Client({ connectionString: url });
await admin.connect();
await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
await admin.query(`CREATE DATABASE ${dbName}`);
const u = new URL(url);
u.pathname = `/${dbName}`;
const proofUrl = u.toString();

const observations = {};
let failures = 0;
function check(name, cond, detail) {
  observations[name] = detail;
  if (!cond) {
    failures += 1;
    process.stderr.write(`ÉCHEC ${name} : ${JSON.stringify(detail)}\n`);
  }
}

let pool;
let exitCode = 1;
try {
  const migrator = new pg.Client({ connectionString: proofUrl });
  await migrator.connect();
  for (const f of UP) await migrator.query(readFileSync(resolve(dbRoot, f), "utf8"));
  await migrator.end();

  pool = createApiPool({ connectionString: proofUrl, max: 5 });
  const email = new NullEmailSender();
  const sms = new NullSmsSender();
  // Un parcours complet dépasse les plafonds anti-abus par IP (tout passe par
  // la même adresse en `.inject()`) : plafonds relevés pour CETTE preuve.
  process.env.KOMBE_RATE_LIMIT_AUTH = "10000";
  process.env.KOMBE_RATE_LIMIT_GLOBAL = "10000";
  let offsetMs = 0;
  const app = buildApp({ pool, emailSender: email, smsSender: sms, now: () => Date.now() + offsetMs, featureFlags: [] });

  async function call(session, method, path, payload, headers = {}) {
    const res = await app.inject({
      method,
      url: path,
      headers: { ...(session ? { authorization: `Bearer ${session}` } : {}), ...headers },
      ...(payload !== undefined ? { payload } : {}),
    });
    let json = null;
    try {
      json = res.body ? res.json() : null;
    } catch {
      json = res.body;
    }
    return { status: res.statusCode, json };
  }
  const lastCode = (sender) => sender.sent.at(-1)?.text.match(/(\d{6})/)?.[1] ?? null;

  /** Inscription + connexion réelles, par SMS si l'identifiant est un numéro. */
  async function signUp(identityInput, channel) {
    const sender = channel === "phone" ? sms : email;
    await call(null, "POST", "/v1/access/registrations", { identityId: identityInput, channel });
    const v = await call(null, "POST", "/v1/access/registrations/verifications", { identityId: identityInput, code: lastCode(sender) });
    await call(null, "POST", "/v1/access/login-requests", { identityId: identityInput });
    const l = await call(null, "POST", "/v1/access/login-completions", { identityId: identityInput, code: lastCode(sender) });
    return { verify: v, session: l.json?.sessionId ?? null, status: l.status };
  }

  // ── L-01 : connexion par téléphone (numéro saisi en format national) ──
  const pres = await signUp("6 90 00 00 01", "phone");
  check("L01-PHONE-LOGIN", pres.status === 201 && typeof pres.session === "string" && sms.sent.at(-1)?.to === "+237690000001", {
    status: pres.status,
    smsTo: sms.sent.at(-1)?.to,
  });
  const P = pres.session;
  const T = (await signUp("tresoriere@example.test", "email")).session;
  const A = (await signUp("+237 677 00 00 03", "phone")).session;
  const M1 = (await signUp("m1@example.test", "email")).session;
  const M2 = (await signUp("m2@example.test", "email")).session;
  const X = (await signUp("etranger@example.test", "email")).session;
  check("L01-ALL-SESSIONS", [T, A, M1, M2, X].every((s) => typeof s === "string"), {});

  // ── L-02 : création du groupe, le créateur devient Président ──────────
  const created = await call(P, "POST", "/v1/tontine/groups", { name: "Njangi des Bamenda de Bonabéri", displayName: "Mama Ngono" });
  const G = created.json?.groupId;
  check("L02-CREATE", created.status === 201 && typeof G === "string", created);
  const mine = await call(P, "GET", "/v1/me/groups");
  check("I06-ME-GROUPS", mine.status === 200 && mine.json.some((g) => g.groupId === G && g.roles.includes("animator")), mine);
  const funds0 = await call(P, "GET", `/v1/groups/${G}/funds`);
  check("L07-DEFAULT-FUNDS", funds0.status === 200 && ["rotation", "solidarity", "fines", "operating", "year_end_reserve"].every((k) => funds0.json.some((f) => f.kind === k)), funds0.json?.map((f) => f.kind));

  // ── I-14 : invitation par code, demande, admission ────────────────────
  const inv = await call(P, "POST", `/v1/groups/${G}/invitations`, { maxUses: 10, ttlHours: 48, channel: "whatsapp" });
  check("I14-INVITE", inv.status === 201 && /^[A-HJ-NP-Z2-9]{8}$/.test(inv.json?.code ?? ""), inv);
  const code = inv.json.code;
  const look = await call(M1, "GET", `/v1/invitations/by-code/${code}`);
  check("I14-BY-CODE", look.status === 200 && look.json.groupName === "Njangi des Bamenda de Bonabéri" && look.json.usable === true, look);
  const names = { [T]: "Tata Esther", [A]: "Papa Fon", [M1]: "Brice", [M2]: "Clarisse" };
  const reqs = {};
  for (const s of [T, A, M1, M2]) reqs[s] = await call(s, "POST", `/v1/invitations/by-code/${code}/requests`, { displayName: names[s] });
  check("I14-REQUEST", Object.values(reqs).every((r) => r.status === 201 && r.json.state === "pending"), Object.values(reqs).map((r) => r.status));
  const pendingView = await call(M1, "GET", `/v1/groups/${G}/overview`);
  check("L02-PENDING-NO-ACCESS", pendingView.status === 403, pendingView);
  for (const s of [T, A, M1, M2]) {
    const d = await call(P, "POST", `/v1/groups/${G}/memberships/${reqs[s].json.membershipId}/decisions`, { decision: "admit" });
    if (d.status !== 200) check(`L02-ADMIT-${names[s]}`, false, d);
  }
  const membersRes = await call(P, "GET", `/v1/groups/${G}/members`);
  const mid = (name) => membersRes.json.find((m) => m.displayName === name)?.membershipId;
  check("L02-MEMBERS", membersRes.status === 200 && membersRes.json.filter((m) => m.state === "active").length === 5, membersRes.json?.length);
  check("L02-CONTACT-MASKED", membersRes.json.some((m) => m.contact === "+237 6•• •• •• 03" || (m.contact ?? "").includes("••")), membersRes.json.map((m) => m.contact));
  const memberCannotInvite = await call(M2, "POST", `/v1/groups/${G}/invitations`, {});
  check("L11-MEMBER-CANNOT-INVITE", memberCannotInvite.status === 403 && memberCannotInvite.json.code === "TONTINE_FORBIDDEN", memberCannotInvite);
  const foreign = await call(X, "GET", `/v1/groups/${G}/overview`);
  check("RLS-FOREIGN-403", foreign.status === 403, foreign);

  // ── L-11 : bureau ──────────────────────────────────────────────────────
  const assign = async (session, name, role) => {
    const p = await call(P, "POST", `/v1/groups/${G}/roles`, { membershipId: mid(name), role, mandateStart: "2026-10-13", mandateEnd: "2027-10-13" });
    const a = await call(session, "POST", `/v1/groups/${G}/roles/${p.json?.roleAssignmentId}/acceptances`);
    return { p: p.status, a: a.status };
  };
  const r1 = await assign(T, "Tata Esther", "treasurer");
  const r2 = await assign(A, "Papa Fon", "auditor");
  const r3 = await assign(M1, "Brice", "censor");
  const r4 = await assign(M2, "Clarisse", "secretary");
  check("L11-BUREAU", [r1, r2, r3, r4].every((r) => r.p === 201 && r.a === 204), [r1, r2, r3, r4]);
  const selfFinance = await call(P, "POST", `/v1/groups/${G}/roles`, { membershipId: mid("Mama Ngono"), role: "treasurer", mandateStart: "2026-10-13", mandateEnd: null });
  check("L11-NO-SELF-TREASURER", selfFinance.status === 403 || selfFinance.status === 422, selfFinance);

  // ── Règlement : amendes, secours ───────────────────────────────────────
  const settings = await call(P, "PATCH", `/v1/groups/${G}/settings`, {
    fines: { lateContributionFixed: 1000, lateContributionPerDay: 100, lateContributionCap: 3000, meetingLate: 200, meetingAbsence: 500, indisciplineCap: 1000, graceDays: 3 },
    aidScale: [{ event: "birth", amount: 20000, maxPerYear: 2 }],
    meetingPlace: "Chez le président, Bonabéri",
  });
  check("L09-SETTINGS", settings.status === 200 && settings.json.fines.meetingAbsence === "500", settings);

  // ── L-13 : tirage engagé (empreinte publiée avant la graine) ───────────
  const seed = "graine-publique-du-13-octobre-2026";
  const commitment = createHash("sha256").update(`kombe-draw:${seed}`).digest("hex");
  const draw = await call(P, "POST", `/v1/groups/${G}/draws`, { commitment });
  const badReveal = await call(P, "POST", `/v1/groups/${G}/draws/${draw.json?.drawId}/reveal`, { seed: "une-autre-graine-tres-longue" });
  const reveal = await call(P, "POST", `/v1/groups/${G}/draws/${draw.json?.drawId}/reveal`, { seed });
  check("L13-DRAW", draw.status === 201 && badReveal.status === 422 && reveal.status === 200 && reveal.json.order.length === 5, { badReveal, reveal });

  // ── L-03 / L-04 : calendrier « 2e samedi du mois », ordre manuel ──────
  const order = ["Brice", "Clarisse", "Papa Fon", "Mama Ngono", "Tata Esther"].map(mid);
  const sched = await call(P, "PUT", `/v1/groups/${G}/tontine-schedule`, {
    cadence: { kind: "monthly_nth_weekday", nth: 2, weekday: 6 },
    startDate: "2026-11-01",
    contributionPerShare: 10000,
    order: { mode: "manual", membershipIds: order },
  });
  check(
    "L03-SCHEDULE",
    sched.status === 200 && sched.json.rounds.length === 5 && sched.json.rounds[0].date === "2026-11-14" && sched.json.rounds[1].date === "2026-12-12" && sched.json.potPerRound === "50000",
    { status: sched.status, dates: sched.json?.rounds?.map((r) => r.date), label: sched.json?.cadenceLabel, pot: sched.json?.potPerRound },
  );
  const start = await call(P, "POST", `/v1/groups/${G}/tontine-schedule/start`);
  check("L03-START", start.status === 200 && start.json.state === "started" && start.json.rounds.every((r) => r.meetingId), start.status);
  const rebuild = await call(P, "PUT", `/v1/groups/${G}/tontine-schedule`, { cadence: { kind: "weekly", weekday: 6 }, startDate: "2026-11-01", contributionPerShare: 10000, order: { mode: "join_order" } });
  check("L03-FROZEN", rebuild.status === 409, rebuild);

  // ── Innovation : simulateur et « mon tour » ───────────────────────────
  const sim = await call(P, "POST", "/v1/tontine/simulations", { cadence: { kind: "monthly_nth_weekday", nth: 2, weekday: 6 }, startDate: "2026-11-01", shares: 5, contributionPerShare: 10000 });
  check("INNOV-SIMULATE", sim.status === 200 && sim.json.lastMeeting === "2027-03-13" && sim.json.potPerMeeting === "50000", sim.json?.summary);
  const fc = await call(M1, "GET", `/v1/groups/${G}/my-forecast`);
  const fcLast = await call(T, "GET", `/v1/groups/${G}/my-forecast`);
  check(
    "INNOV-MY-TURN",
    fc.status === 200 && fc.json.turns[0].position === "group_advances_you" && fc.json.turns[0].advance === "40000" && fcLast.json.turns[0].position === "even",
    { m1: fc.json?.turns?.[0], t: fcLast.json?.turns?.[0] },
  );

  // ── L-05 : séance 1, appel ─────────────────────────────────────────────
  const meetings = await call(P, "GET", `/v1/groups/${G}/meetings`);
  const m1 = meetings.json[0].meeting_id;
  const m2 = meetings.json[1].meeting_id;
  const open = await call(P, "POST", `/v1/groups/${G}/meetings/${m1}/open`);
  check("L05-OPEN", open.status === 200 && open.json.state === "open", open);
  const att = await call(M2, "PUT", `/v1/groups/${G}/meetings/${m1}/attendance`, {
    entries: [
      { membershipId: mid("Mama Ngono"), status: "present" },
      { membershipId: mid("Tata Esther"), status: "present" },
      { membershipId: mid("Papa Fon"), status: "late" },
      { membershipId: mid("Brice"), status: "present" },
      { membershipId: mid("Clarisse"), status: "present" },
    ],
  });
  check("L05-ATTENDANCE", att.status === 200 && att.json.present === 5, att);

  // ── L-06 : collecte en séance (secrétaire), confirmation (trésorière),
  //           contrôle (commissaire) ─────────────────────────────────────
  const collect = await call(M2, "POST", `/v1/groups/${G}/meetings/${m1}/collections`, {
    items: order.map((m) => ({ membershipId: m, amount: 10000, channel: "cash" })),
  });
  check("L06-COLLECT", collect.status === 201 && collect.json.movementIds.length === 5, collect);
  const pendingT = await call(T, "GET", `/v1/groups/${G}/pending-validations`);
  check("L06-PENDING-TREASURER", pendingT.status === 200 && pendingT.json.length === 5, pendingT.json?.length);
  const confirmAll = await call(T, "POST", `/v1/groups/${G}/movements/confirmations`, { movementIds: collect.json.movementIds });
  check("L06-CONFIRM-BATCH", confirmAll.status === 200 && Object.values(confirmAll.json).every((s) => s === "confirmed"), confirmAll);
  const selfControl = await call(T, "POST", `/v1/groups/${G}/movements/${collect.json.movementIds[0]}/controls`);
  check("L06-NO-SELF-CONTROL", selfControl.status === 403, selfControl);
  for (const m of collect.json.movementIds) {
    const c = await call(A, "POST", `/v1/groups/${G}/movements/${m}/controls`);
    if (c.status !== 200) check(`L06-CONTROL-${m}`, false, c);
  }
  const myObl = await call(M1, "GET", `/v1/groups/${G}/my-obligations`);
  check("I06-MY-OBLIGATIONS", myObl.status === 200 && myObl.json[0].status === "settled" && myObl.json.length === 5, myObl.json?.[0]);

  // Remise devant témoins : un témoin absent ou le bénéficiaire refusés.
  const badWitness = await call(T, "POST", `/v1/groups/${G}/meetings/${m1}/payouts`, { channel: "cash", witnessMembershipIds: [mid("Brice"), mid("Clarisse")] });
  check("L06-WITNESS-NOT-BENEFICIARY", badWitness.status === 422 && badWitness.json.code === "WITNESS_REQUIRED", badWitness);
  const payout = await call(T, "POST", `/v1/groups/${G}/meetings/${m1}/payouts`, { channel: "orange_money", reference: "OM-2611-4471", witnessMembershipIds: [mid("Papa Fon"), mid("Clarisse")] });
  check("L06-PAYOUT", payout.status === 201 && payout.json.movementIds.length === 1, payout);
  const treasurerConfirmsPayout = await call(T, "POST", `/v1/groups/${G}/movements/${payout.json.movementIds[0]}/confirmations`);
  check("L06-ONLY-BENEFICIARY-RECEIPT", treasurerConfirmsPayout.status === 403, treasurerConfirmsPayout);
  const receipt = await call(M1, "POST", `/v1/groups/${G}/movements/${payout.json.movementIds[0]}/confirmations`);
  const ctl = await call(A, "POST", `/v1/groups/${G}/movements/${payout.json.movementIds[0]}/controls`);
  check("L06-RECEIPT-VALIDATED", receipt.status === 200 && ctl.status === 200 && ctl.json.state === "validated", { receipt, ctl });
  const rot = (await call(P, "GET", `/v1/groups/${G}/funds`)).json.find((f) => f.kind === "rotation");
  check("L07-ROTATION-BALANCED", rot.registerBalance === "0", rot);
  const schedAfter1 = await call(M1, "GET", `/v1/groups/${G}/tontine-schedule`);
  check("CYCLE-ROUND-CLOSED-ON-PAYOUT", schedAfter1.json.rounds[0].state === "closed" && schedAfter1.json.rounds[1].state === "open" && schedAfter1.json.cycleNo === 1, schedAfter1.json?.rounds?.map((r) => r.state));
  const earlyRenew = await call(P, "POST", `/v1/groups/${G}/tontine-schedule/renewals`, { cadence: { kind: "monthly_nth_weekday", nth: 2, weekday: 6 }, startDate: "2027-04-01", contributionPerShare: 15000, order: { mode: "join_order" } });
  check("CYCLE-RENEW-NEEDS-ALL-PAYOUTS", earlyRenew.status >= 400 && earlyRenew.json.code === "CYCLE_START_NOT_READY", earlyRenew);

  // ── Clôture : amendes automatiques (retard), procès-verbal scellé ─────
  const close = await call(P, "POST", `/v1/groups/${G}/meetings/${m1}/close`, { decisions: ["Prochaine séance chez Tata Esther"], autoFines: true });
  check("L06-CLOSE-MINUTES", close.status === 200 && /^[0-9a-f]{64}$/.test(close.json.minutesHash) && close.json.finesIssued === 1, close);
  const detail = await call(M1, "GET", `/v1/groups/${G}/meetings/${m1}`);
  check("L06-MINUTES-TEXT", detail.status === 200 && detail.json.minutesText.includes("Brice") && detail.json.minutesText.includes("Prochaine séance"), detail.json?.minutesText?.slice(0, 200));

  const share = await call(M1, "GET", `/v1/groups/${G}/meetings/${m1}/share-text`);
  check("INNOV-WHATSAPP-SUMMARY", share.status === 200 && share.json.text.includes("Remise : 50 000 FCFA à Brice") && share.json.text.includes("ne garde pas notre argent"), share.json?.text);
  const reg = await call(M1, "GET", `/v1/groups/${G}/regularity`);
  check("INNOV-REGULARITY", reg.status === 200 && reg.json.length === 5 && reg.json.every((r) => r.onTime === 1), reg.json);

  // ── L-09 : amende d'indiscipline, contestation, maintien, paiement ────
  const fine = await call(M1, "POST", `/v1/groups/${G}/fines`, { membershipId: mid("Clarisse"), kind: "indiscipline", amount: 500, reason: "Téléphone en pleine séance" });
  const overCap = await call(M1, "POST", `/v1/groups/${G}/fines`, { membershipId: mid("Clarisse"), kind: "indiscipline", amount: 5000, reason: "Trop" });
  const contest = await call(M2, "POST", `/v1/groups/${G}/fines/${fine.json?.fineId}/contest`, { reason: "J'étais appelée par l'école" });
  const uphold = await call(P, "POST", `/v1/groups/${G}/fines/${fine.json?.fineId}/uphold`, { reason: "Règlement clair" });
  const finesFund = (await call(P, "GET", `/v1/groups/${G}/funds`)).json.find((f) => f.kind === "fines");
  const pay = await call(M2, "POST", `/v1/groups/${G}/movements`, { fundId: finesFund.fundId, kind: "fine_payment", amount: 500, channel: "mtn_momo", reference: "MOMO-77812", relatedId: fine.json?.fineId }, { "idempotency-key": "fine-pay-0001" });
  const payAgain = await call(M2, "POST", `/v1/groups/${G}/movements`, { fundId: finesFund.fundId, kind: "fine_payment", amount: 500, channel: "mtn_momo", reference: "MOMO-77812", relatedId: fine.json?.fineId }, { "idempotency-key": "fine-pay-0001" });
  const confFine = await call(T, "POST", `/v1/groups/${G}/movements/${pay.json?.movementId}/confirmations`);
  const fines = await call(M2, "GET", `/v1/groups/${G}/fines`);
  check(
    "L09-FINE-CYCLE",
    fine.status === 201 && overCap.status === 422 && contest.json?.state === "contested" && uphold.json?.state === "issued" && pay.status === 201 &&
      payAgain.json?.movementId === pay.json?.movementId && confFine.json?.state === "validated" && fines.json.find((f) => f.fine_id === fine.json.fineId)?.state === "paid",
    { fine: fine.status, overCap: overCap.status, contest: contest.json, uphold: uphold.json, pay: pay.status, conf: confFine.json },
  );

  // ── L-08 : caisse de secours, naissance chez Clarisse ─────────────────
  const solid = (await call(P, "GET", `/v1/groups/${G}/funds`)).json.find((f) => f.kind === "solidarity");
  const sIn = await call(M1, "POST", `/v1/groups/${G}/movements`, { fundId: solid.fundId, kind: "contribution", amount: 25000, channel: "cash" });
  await call(T, "POST", `/v1/groups/${G}/movements/${sIn.json?.movementId}/confirmations`);
  await call(A, "POST", `/v1/groups/${G}/movements/${sIn.json?.movementId}/controls`);
  const aid = await call(M2, "POST", `/v1/groups/${G}/aids`, { beneficiaryMembershipId: mid("Clarisse"), event: "birth", eventDate: "2026-11-20", note: "Naissance de Junior" });
  const selfDecide = await call(M2, "POST", `/v1/groups/${G}/aids/${aid.json?.aidId}/decisions`, { decision: "approve" });
  const decide = await call(P, "POST", `/v1/groups/${G}/aids/${aid.json?.aidId}/decisions`, { decision: "approve" });
  const payAid = await call(T, "POST", `/v1/groups/${G}/aids/${aid.json?.aidId}/payments`, { channel: "cash" });
  await call(M2, "POST", `/v1/groups/${G}/movements/${payAid.json?.movementId}/confirmations`);
  await call(A, "POST", `/v1/groups/${G}/movements/${payAid.json?.movementId}/controls`);
  const aids = await call(P, "GET", `/v1/groups/${G}/aids`);
  check(
    "L08-AID",
    aid.json?.amount === "20000" && selfDecide.status === 403 && decide.json?.state === "approved" && aids.json[0].state === "paid",
    { aid: aid.json, selfDecide: selfDecide.status, decide: decide.json, aidState: aids.json?.[0]?.state },
  );

  // ── L-13 : échange de tours 2 ↔ 3 (Clarisse ↔ Papa Fon) ───────────────
  const swap = await call(M2, "POST", `/v1/groups/${G}/order-changes`, { seqA: 2, seqB: 3, reason: "Rentrée scolaire" });
  const acc = await call(A, "POST", `/v1/groups/${G}/order-changes/${swap.json?.changeId}/accept`);
  const appr = await call(P, "POST", `/v1/groups/${G}/order-changes/${swap.json?.changeId}/approve`);
  const sched2 = await call(P, "GET", `/v1/groups/${G}/tontine-schedule`);
  const paidSwap = await call(M1, "POST", `/v1/groups/${G}/order-changes`, { seqA: 1, seqB: 4, reason: "test" });
  check(
    "L13-SWAP",
    swap.status === 201 && acc.json?.state === "requested" && appr.json?.state === "applied" && sched2.json.rounds[1].holders[0].name === "Papa Fon" && sched2.json.rounds[2].holders[0].name === "Clarisse" && paidSwap.status === 422,
    { swap: swap.status, acc: acc.json, appr: appr.json, r2: sched2.json?.rounds?.[1]?.holders, paidSwap: paidSwap.status },
  );

  // ── Séance 2 : approbation du PV de la séance 1 ───────────────────────
  await call(P, "POST", `/v1/groups/${G}/meetings/${m2}/open`);
  const wrongHash = await call(P, "POST", `/v1/groups/${G}/meetings/${m1}/minutes-approval`, { hash: "0".repeat(64), inMeetingId: m2 });
  const approve = await call(P, "POST", `/v1/groups/${G}/meetings/${m1}/minutes-approval`, { hash: close.json.minutesHash, inMeetingId: m2 });
  check("L06-MINUTES-APPROVAL", wrongHash.status >= 400 && approve.status === 204, { wrongHash, approve: approve.status });

  // ── L-10 : dette, avaliseur, abandon motivé ───────────────────────────
  const debt = await call(T, "POST", `/v1/groups/${G}/debts`, { debtorMembershipId: mid("Clarisse"), origin: "unpaid_obligation", amount: 10000 });
  const selfWriteOff = await call(M2, "POST", `/v1/groups/${G}/debts/${debt.json?.debtId}/write-off`, { reason: "Je ne paierai pas" });
  const writeOff = await call(P, "POST", `/v1/groups/${G}/debts/${debt.json?.debtId}/write-off`, { reason: "Décision de l'assemblée du 12/12" });
  check("L10-DEBT", debt.status === 201 && selfWriteOff.status === 403 && writeOff.status === 204, { debt, selfWriteOff: selfWriteOff.status, writeOff: writeOff.status });

  // ── L-12 : statuts générés, acceptation par empreinte ─────────────────
  const stat = await call(M2, "POST", `/v1/groups/${G}/statutes`);
  const latest = await call(M1, "GET", `/v1/groups/${G}/statutes`);
  const acceptStat = await call(M1, "POST", `/v1/groups/${G}/statutes/${stat.json?.version}/acceptances`, { hash: stat.json?.hash });
  check(
    "L12-STATUTES",
    stat.status === 201 && latest.json?.body.includes("90/053") && latest.json.body.includes("ne garde pas son argent") && latest.json.body.includes("Censeur") && acceptStat.status === 204,
    { stat: stat.json, acc: acceptStat.status },
  );

  // ── L-20 : reprise de l'historique d'un ancien njangi ─────────────────
  const imp = await call(P, "POST", `/v1/groups/${G}/history-imports`, {
    njangi: {
      id: "fb-njangi-1",
      name: "Ancien njangi",
      members: [{ uid: "u1", name: "Brice", role: "membre" }, { uid: "u2", name: "Ancien membre" }],
      contributions: [
        { id: "c1", uid: "u1", amount: 10000, date: "2025-03-08", status: "confirmed" },
        { id: "c2", uid: "u2", amount: 10000.5, date: "2025-03-08", status: "confirmed" },
      ],
    },
  });
  const hist = await call(M1, "GET", `/v1/groups/${G}/history`);
  check("L20-IMPORT", imp.status === 201 && imp.json.rejected === 1 && hist.json.length === 1 && hist.json[0].membership_id === mid("Brice"), { imp: imp.json, hist: hist.json });

  // ── Drapeaux : prêts fermés par défaut ────────────────────────────────
  const loan = await call(P, "POST", `/v1/groups/${G}/funds`, { kind: "loan", name: "Prêts" });
  check("L21-LOAN-FLAG-OFF", loan.status === 403 && loan.json.code === "FUND_KIND_DISABLED", loan);

  // ── L-15 : notifications in-app sans montant ni nom ───────────────────
  const notes = await call(M1, "GET", "/v1/me/notifications");
  check("L15-NOTIFICATIONS", notes.status === 200 && notes.json.length > 0 && notes.json.every((n) => !/\d{3,}/.test(n.target ?? "") || n.target.startsWith("group:")), notes.json?.map((n) => n.kind));
  const read = await call(M1, "POST", `/v1/me/notifications/${notes.json[0].notification_id}/read`);
  check("L15-MARK-READ", read.status === 204, read);

  // ── Rappels automatiques J-1 de la séance 3 (tâche planifiée) ─────────
  const rem = await runReminders(pool, Date.parse("2027-01-08T08:00:00Z"));
  const rem2 = await runReminders(pool, Date.parse("2027-01-08T08:00:00Z"));
  const notesAfter = await call(M1, "GET", "/v1/me/notifications");
  const reminders = notesAfter.json.filter((n) => n.kind === "meeting_reminder" || n.kind === "due_reminder");
  check("INNOV-REMINDERS", rem.meetings === 1 && rem2.meetings === 1 && reminders.filter((n) => n.kind === "due_reminder").length === 1, { rem, kinds: notesAfter.json?.map((n) => n.kind) });

  // ── Cycle complet : séances 2 à 5 (collecte, remise, réception, contrôle) ──
  const sessionOf = { [mid("Mama Ngono")]: P, [mid("Tata Esther")]: T, [mid("Papa Fon")]: A, [mid("Brice")]: M1, [mid("Clarisse")]: M2 };
  const fullSched = await call(P, "GET", `/v1/groups/${G}/tontine-schedule`);
  const loopIssues = [];
  let substituteControl = null;
  let treasurerOwnPayout = null;
  for (const rnd of fullSched.json.rounds.slice(1)) {
    const mtg = rnd.meetingId;
    const ben = rnd.holders[0].membershipId;
    const o = await call(P, "POST", `/v1/groups/${G}/meetings/${mtg}/open`);
    const at = await call(M2, "PUT", `/v1/groups/${G}/meetings/${mtg}/attendance`, { entries: order.map((m) => ({ membershipId: m, status: "present" })) });
    const col = await call(M2, "POST", `/v1/groups/${G}/meetings/${mtg}/collections`, { items: order.map((m) => ({ membershipId: m, amount: 10000, channel: "cash" })) });
    const cf = await call(T, "POST", `/v1/groups/${G}/movements/confirmations`, { movementIds: col.json?.movementIds ?? [] });
    for (const mvId of col.json?.movementIds ?? []) {
      const c = await call(A, "POST", `/v1/groups/${G}/movements/${mvId}/controls`);
      if (c.status !== 200) loopIssues.push({ seq: rnd.seq, control: c });
    }
    const witnesses = [mid("Papa Fon"), mid("Clarisse"), mid("Brice"), mid("Mama Ngono")].filter((m) => m !== ben).slice(0, 2);
    let po;
    if (ben === mid("Tata Esther")) {
      // La trésorière reçoit sa remise : elle ne la déclare pas, la présidente si.
      const selfPayout = await call(T, "POST", `/v1/groups/${G}/meetings/${mtg}/payouts`, { channel: "cash", witnessMembershipIds: witnesses });
      const memberPayout = await call(M1, "POST", `/v1/groups/${G}/meetings/${mtg}/payouts`, { channel: "cash", witnessMembershipIds: witnesses });
      po = await call(P, "POST", `/v1/groups/${G}/meetings/${mtg}/payouts`, { channel: "cash", witnessMembershipIds: [mid("Papa Fon"), mid("Brice")] });
      treasurerOwnPayout = { self: selfPayout.status, member: memberPayout.status, president: po.status };
    } else {
      po = await call(T, "POST", `/v1/groups/${G}/meetings/${mtg}/payouts`, { channel: "cash", witnessMembershipIds: witnesses });
    }
    const pid = po.json?.movementIds?.[0];
    const rc = await call(sessionOf[ben], "POST", `/v1/groups/${G}/movements/${pid}/confirmations`);
    let ct;
    if (ben === mid("Papa Fon")) {
      // Le commissaire reçoit sa propre remise : le censeur contrôle à sa place.
      const selfCtl = await call(A, "POST", `/v1/groups/${G}/movements/${pid}/controls`);
      const memberCtl = await call(M2, "POST", `/v1/groups/${G}/movements/${pid}/controls`);
      ct = await call(M1, "POST", `/v1/groups/${G}/movements/${pid}/controls`);
      substituteControl = { self: selfCtl.status, member: memberCtl.status, censor: ct.status };
    } else {
      ct = await call(A, "POST", `/v1/groups/${G}/movements/${pid}/controls`);
    }
    const cl = await call(P, "POST", `/v1/groups/${G}/meetings/${mtg}/close`, { autoFines: false });
    if (o.status !== 200 && !(o.status === 409 && rnd.seq === 2)) loopIssues.push({ seq: rnd.seq, open: o });
    if (![at.status, cf.status, rc.status, ct.status, cl.status].every((x) => x === 200) || col.status !== 201 || po.status !== 201) {
      loopIssues.push({ seq: rnd.seq, o: o.status, at: at.status, col: col.status, cf: cf.status, po, rc, ct, cl: cl.status });
    }
  }
  check("CYCLE-FULL-ROTATION", loopIssues.length === 0, loopIssues);
  check("CYCLE-TREASURER-OWN-PAYOUT", treasurerOwnPayout?.self === 403 && treasurerOwnPayout?.member === 403 && treasurerOwnPayout?.president === 201, treasurerOwnPayout);
  check("CYCLE-AUDITOR-CONFLICT-SUBSTITUTE", substituteControl?.self >= 400 && substituteControl?.member === 403 && substituteControl?.censor === 200, substituteControl);
  const doneSched = await call(M1, "GET", `/v1/groups/${G}/tontine-schedule`);
  check("CYCLE-COMPLETE", doneSched.json.cycleComplete === true && doneSched.json.rounds.every((r) => r.state === "closed"), doneSched.json?.rounds?.map((r) => r.state));

  // ── Renouvellement : cycle 2, nouvelle cotisation, tours à la suite ──
  const memberRenew = await call(M1, "POST", `/v1/groups/${G}/tontine-schedule/renewals`, { cadence: { kind: "monthly_nth_weekday", nth: 2, weekday: 6 }, startDate: "2027-04-01", contributionPerShare: 15000, order: { mode: "join_order" } });
  const renew = await call(P, "POST", `/v1/groups/${G}/tontine-schedule/renewals`, { cadence: { kind: "monthly_nth_weekday", nth: 2, weekday: 6 }, startDate: "2027-04-01", contributionPerShare: 15000, order: { mode: "join_order" } });
  check(
    "CYCLE-RENEWED",
    memberRenew.status === 403 && renew.status === 201 && renew.json.cycleNo === 2 && renew.json.rounds.length === 5 && renew.json.rounds[0].seq === 6 &&
      renew.json.rounds.every((r) => r.meetingId && r.state === "open") && renew.json.potPerRound === "75000" && renew.json.contributionPerShare === "15000",
    { memberRenew: memberRenew.status, renew: renew.json },
  );
  const renewAgain = await call(P, "POST", `/v1/groups/${G}/tontine-schedule/renewals`, { cadence: { kind: "monthly_nth_weekday", nth: 2, weekday: 6 }, startDate: "2027-09-01", contributionPerShare: 15000, order: { mode: "join_order" } });
  const c2detail = await call(M1, "GET", `/v1/groups/${G}/meetings/${renew.json?.rounds?.[0]?.meetingId}`);
  const ov = await call(M1, "GET", `/v1/groups/${G}/overview`);
  check("CYCLE-2-COHERENT", renewAgain.status >= 400 && c2detail.json?.pot === "75000" && c2detail.json.dues.length === 5 && c2detail.json.dues.every((d) => d.due === "15000") && ov.json.schedule.cycleNo === 2, { renewAgain: renewAgain.status, pot: c2detail.json?.pot, ov: ov.json?.schedule });

  // ── Réserve de fin d'année : chacun récupère ce qu'il a versé ─────────
  const reserve = (await call(P, "GET", `/v1/groups/${G}/funds`)).json.find((f) => f.kind === "year_end_reserve");
  const rIn1 = await call(M1, "POST", `/v1/groups/${G}/movements`, { fundId: reserve.fundId, kind: "contribution", amount: 10000, channel: "cash" });
  const rIn2 = await call(M2, "POST", `/v1/groups/${G}/movements`, { fundId: reserve.fundId, kind: "contribution", amount: 5000, channel: "cash" });
  const tooEarly = await call(T, "POST", `/v1/groups/${G}/year-end-reserve/distributions`, { channel: "cash" });
  for (const mvId of [rIn1.json?.movementId, rIn2.json?.movementId]) {
    await call(T, "POST", `/v1/groups/${G}/movements/${mvId}/confirmations`);
    await call(A, "POST", `/v1/groups/${G}/movements/${mvId}/controls`);
  }
  const notTreasury = await call(M1, "POST", `/v1/groups/${G}/year-end-reserve/distributions`, { channel: "cash" });
  const dist = await call(T, "POST", `/v1/groups/${G}/year-end-reserve/distributions`, { channel: "cash" });
  const distAgain = await call(T, "POST", `/v1/groups/${G}/year-end-reserve/distributions`, { channel: "cash" });
  const byMember = Object.fromEntries((dist.json?.distributions ?? []).map((d) => [d.membershipId, d.amount]));
  check(
    "RESERVE-DISTRIBUTION",
    tooEarly.status >= 400 && notTreasury.status === 403 && dist.status === 201 && byMember[mid("Brice")] === "10000" && byMember[mid("Clarisse")] === "5000" &&
      Object.keys(byMember).length === 2 && distAgain.status >= 400,
    { tooEarly: tooEarly.status, notTreasury: notTreasury.status, dist: dist.json, distAgain: distAgain.status },
  );
  for (const d of dist.json?.distributions ?? []) {
    await call(sessionOf[d.membershipId], "POST", `/v1/groups/${G}/movements/${d.movementId}/confirmations`);
    await call(A, "POST", `/v1/groups/${G}/movements/${d.movementId}/controls`);
  }
  const reserveAfter = (await call(P, "GET", `/v1/groups/${G}/funds`)).json.find((f) => f.kind === "year_end_reserve");
  check("RESERVE-EMPTIED", reserveAfter.registerBalance === "0", reserveAfter);

  // ── Journal chaîné intact après tout le parcours ──────────────────────
  const verify = await call(P, "GET", `/v1/groups/${G}/journal/verify`);
  check("C11-JOURNAL-VERIFY", verify.status === 200 && verify.json.intact === true && verify.json.throughSeq > 40, verify);
  const memberVerify = await call(M1, "GET", `/v1/groups/${G}/journal/verify`);
  check("C11-MEMBER-LEGACY-ROUTE", memberVerify.status === 200, memberVerify.status);

  await app.close();
  exitCode = failures === 0 ? 0 : 1;
} catch (err) {
  check("UNCAUGHT", false, { error: String(err?.stack ?? err) });
  exitCode = 1;
} finally {
  if (pool) await pool.end().catch(() => {});
  await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`).catch(() => {});
  await admin.end();
}

process.stdout.write(
  JSON.stringify({ target: "kombe.api.tontineRealMode", status: failures === 0 ? "PASS" : "FAIL", checks: Object.keys(observations).length, failures, observations }, null, 2) + "\n",
);
process.exit(exitCode);
