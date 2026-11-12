// KÓMBE @kombe/api — preuve base réelle de la livraison des notifications (ADR-0044).
//
// Sur une vraie PostgreSQL (rôle kombe_app sous RLS) :
//  - aucun envoi sans consentement (pas d'appareil, SMS/e-mail désactivés) ;
//  - une notification créée par une VRAIE action part après la validation de
//    la transaction (sans tâche planifiée), avec un texte générique ;
//  - heures de silence (différé, jamais perdu), types en sourdine ;
//  - bail : deux répartiteurs concurrents ne livrent jamais deux fois ;
//    bail expiré repris ; attente croissante puis « dead » après 5 essais ;
//  - interrupteur général fermé ou canal non configuré : « suppressed », jamais
//    un faux succès ; FCM : jeton refusé (404) retiré ;
//  - RLS : préférences et appareils strictement personnels ; pastille.
// Sans base : BLOCKED (2), jamais simulé.
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { generateKeyPairSync, randomInt } from "node:crypto";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const distRoot = resolve(here, "../dist");
function blocked(reason) {
  process.stdout.write(JSON.stringify({ target: "kombe.api.notificationDelivery", status: "BLOCKED", reason, exitCode: 2 }, null, 2) + "\n");
  process.exit(2);
}
const url = process.env.KOMBE_API_DATABASE_URL;
const adminUrl = process.env.KOMBE_DATABASE_URL ?? url;
if (!url) blocked("KOMBE_API_DATABASE_URL absente : aucune base PostgreSQL joignable (jamais simulé).");
const { buildApp } = await import(pathToFileURL(resolve(distRoot, "server.js")).href);
const { createApiPool } = await import(pathToFileURL(resolve(distRoot, "db/pgPool.js")).href);
const { NullEmailSender } = await import(pathToFileURL(resolve(distRoot, "email/emailSender.js")).href);
const { NotificationDispatcher, SimulatorProvider, FcmProvider } = await import(pathToFileURL(resolve(distRoot, "tontine/delivery.js")).href);

process.env.NODE_ENV = "test";
process.env.KOMBE_RATE_LIMIT_AUTH = "1000";
process.env.KOMBE_RATE_LIMIT_GLOBAL = "100000";
delete process.env.KOMBE_SMS_PROVIDER;
const pool = createApiPool({ connectionString: url, max: 20 });
const push = new SimulatorProvider("push");
const delivery = { enabled: true, publicUrl: "https://kombe.test", providers: { push } };
const app = buildApp({ pool, emailSender: new NullEmailSender(), delivery });
await app.ready();
const admin = new pg.Client({ connectionString: adminUrl });
await admin.connect();

const observations = {};
let failures = 0;
function check(name, cond, detail) {
  observations[name] = cond ? "OK" : detail;
  if (!cond) {
    failures += 1;
    process.stderr.write(`ÉCHEC ${name} : ${JSON.stringify(detail)}\n`);
  }
}
async function call(token, method, path, body) {
  const h = {};
  if (token) h.authorization = `Bearer ${token}`;
  const res = await app.inject({ method, url: path, headers: h, ...(body !== undefined ? { payload: body } : {}) });
  let json = null;
  try { json = res.body ? JSON.parse(res.body) : null; } catch { json = res.body; }
  return { status: res.statusCode, body: json };
}
async function ok(token, method, path, body) {
  const r = await call(token, method, path, body);
  if (r.status >= 300) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}
const run = String(randomInt(100000, 999999));
async function login(i, name) {
  const p = `6${i}${run}${i}`.slice(0, 9);
  const req = await ok(null, "POST", "/v1/auth/code-requests", { login: p });
  const ses = await ok(null, "POST", "/v1/auth/code-verifications", { login: req.login, code: req.devCode });
  await ok(ses.sessionId, "PATCH", "/v1/me", { displayName: name });
  return { token: ses.sessionId, login: req.login, name };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rowsOf = async (login) => (await admin.query(`SELECT * FROM notification_outbox WHERE identity_id = $1 ORDER BY outbox_id`, [login])).rows;
async function waitState(outboxId, states, ms = 4000) {
  const t0 = Date.now();
  for (;;) {
    const r = (await admin.query(`SELECT state, last_code FROM notification_outbox WHERE outbox_id = $1`, [outboxId])).rows[0];
    if (states.includes(r?.state) || Date.now() - t0 > ms) return r;
    await sleep(100);
  }
}
const QUIET_OFF = { pushEnabled: true, smsEnabled: false, emailEnabled: false, quietStart: null, quietEnd: null, mutedKinds: [] };
let seq = 0;
async function directNotif(login, gid, kind = "general") {
  seq += 1;
  await admin.query(`INSERT INTO inbox_notification (identity_id, group_id, kind, target, dedup_key) VALUES ($1,$2,$3,$4,$5)`, [login, gid, kind, `/tontines/${gid}/apercu`, `proof:${run}:${seq}`]);
}

try {
  const A = await login(1, "Awa Fondatrice");
  const today = new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
  const settings = {
    contributionPerShare: "2000", cadence: { kind: "every_n_days", n: 8 }, firstMeetingDate: today, deadlineTime: "18:00",
    meetingPlace: null, maxMembers: 12, transparency: "all_members", feeBearer: "member", payoutPolicy: "full_with_advance",
    newcomersLast: true, guarantorRequired: false, payoutWitnesses: 0,
    fines: { lateContributionFixed: "0", lateContributionPerDay: "0", lateContributionCap: "0", meetingLate: "0", meetingAbsence: "0", indisciplineCap: "0", graceDays: 1 },
    solidarity: { enabled: false, perMeeting: "0", scale: [] }, operating: { enabled: false, perMeeting: "0" }, yearEndReserve: { enabled: false, perMeeting: "0" },
  };
  const groupName = `Cercle secret ${run}`;
  const gid = (await ok(A.token, "POST", "/v1/tontines", { name: groupName, founderDisplayName: A.name, settings })).groupId;
  const inv = await ok(A.token, "POST", `/v1/tontines/${gid}/invitations`, { maxUses: 20, days: 7 });
  const join = async (i, name) => {
    const P = await login(i, name);
    await ok(P.token, "POST", `/v1/invitations/${inv.code}/join`, { displayName: name });
    return P;
  };

  // ── Consentement : aucune ligne sans appareil ni canal choisi ───────────
  const B = await join(2, "Bernard Membre");
  const inboxA = await ok(A.token, "GET", "/v1/me/notifications");
  check("REAL-ACTION-NOTIFIES", inboxA.some((n) => n.kind === "join_request"), inboxA.map((n) => n.kind));
  check("NO-CONSENT-NO-DELIVERY", (await rowsOf(A.login)).length === 0, await rowsOf(A.login));
  const p0 = await ok(A.token, "GET", "/v1/me/notification-preferences");
  check("PREFS-DEFAULTS", p0.pushEnabled === true && p0.smsEnabled === false && p0.emailEnabled === false && p0.quietStart === "21:00" && p0.quietEnd === "07:00" && p0.available.sms === true && p0.available.email === false && p0.devices === 0, p0);
  const badge = await ok(A.token, "GET", "/v1/me/notifications/unread-count");
  check("BADGE-UNREAD", badge.unread === inboxA.filter((n) => !n.readAt).length && badge.unread >= 1, { badge, n: inboxA.length });
  const badEmail = await call(A.token, "PUT", "/v1/me/notification-preferences", { ...QUIET_OFF, emailEnabled: true });
  check("EMAIL-NEEDS-EMAIL-ACCOUNT", badEmail.status === 400 && badEmail.body?.code === "PREFERENCE_INVALID", badEmail);
  const badQuiet = await call(A.token, "PUT", "/v1/me/notification-preferences", { ...QUIET_OFF, quietStart: "22:00" });
  check("QUIET-BOTH-ENDS", badQuiet.status === 400, badQuiet.status);

  // ── Appareil enregistré : la notification d'une VRAIE action part seule ─
  const dev = await ok(A.token, "POST", "/v1/me/push-devices", { platform: "android", token: `tokA-${run}-aaaaaaaaaaaaaaaa` });
  await ok(A.token, "PUT", "/v1/me/notification-preferences", QUIET_OFF);
  const C = await join(3, "Chantal Membre");
  const rC = await rowsOf(A.login);
  check("CONSENT-ONE-PUSH-ROW", rC.length === 1 && rC[0].channel === "push", rC);
  const stC = await waitState(rC[0]?.outbox_id, ["sent"]);
  check("SENT-AFTER-COMMIT-WITHOUT-CRON", stC?.state === "sent" && stC.last_code === "SIMULATED", stC);
  const m = push.sent.at(-1);
  check("GENERIC-TEXT-NO-NAMES", m && !JSON.stringify([m.title, m.body]).includes("Chantal") && !JSON.stringify([m.title, m.body]).includes(groupName) && /\d/.test(m.link) === true, m && { title: m.title, body: m.body });
  check("DEEP-LINK", m?.link === `https://kombe.test/#/notifications/${m?.notificationId}`, m?.link);

  // ── A15 : messages hors application dans la langue du profil ───────────
  check("LOCALE-DEFAULT-FR", m?.locale === "fr" && m?.title === "Nouvelle demande d'adhésion" && m?.body === "Ouvrez KÓMBE pour voir le détail.", m && { locale: m.locale, title: m.title });
  await ok(A.token, "PATCH", "/v1/me", { language: "en" });
  await join(9, "Ines Member");
  const rI = (await rowsOf(A.login)).at(-1);
  await waitState(rI?.outbox_id, ["sent"]);
  const mEn = push.sent.at(-1);
  check("LOCALE-EN-DELIVERED", mEn?.locale === "en" && mEn?.title === "New membership request" && mEn?.body === "Open KÓMBE to see the details.", mEn && { locale: mEn.locale, title: mEn.title });
  await ok(A.token, "PATCH", "/v1/me", { language: "fr" });

  // ── Heures de silence : différé, jamais perdu ──────────────────────────
  const douala = new Date(Date.now() + 3_600_000); // UTC+1, sans heure d'été
  const hh = (d) => String(d.getUTCHours()).padStart(2, "0") + ":00";
  await ok(A.token, "PUT", "/v1/me/notification-preferences", { ...QUIET_OFF, quietStart: hh(new Date(douala.getTime() - 3_600_000)), quietEnd: hh(new Date(douala.getTime() + 2 * 3_600_000)) });
  await join(4, "Daniel Membre");
  await sleep(600);
  const rD = (await rowsOf(A.login)).at(-1);
  check("QUIET-DEFERRED", rD.state === "pending" && new Date(rD.not_before).getTime() > Date.now() + 30 * 60_000, { state: rD.state, notBefore: rD.not_before });
  const later = new NotificationDispatcher(pool, () => new Date(rD.not_before).getTime() + 1000, delivery);
  await later.drain();
  check("QUIET-RELEASED-LATER", (await waitState(rD.outbox_id, ["sent"]))?.state === "sent", (await rowsOf(A.login)).at(-1).state);

  // ── Type en sourdine : aucune ligne ────────────────────────────────────
  await ok(A.token, "PUT", "/v1/me/notification-preferences", { ...QUIET_OFF, mutedKinds: ["join_request"] });
  const before = (await rowsOf(A.login)).length;
  await join(5, "Esther Membre");
  check("MUTED-KIND-NO-ROW", (await rowsOf(A.login)).length === before, (await rowsOf(A.login)).length - before);
  await ok(A.token, "PUT", "/v1/me/notification-preferences", QUIET_OFF);
  await sleep(500); // laisse finir le traitement d'après-réponse de cette écriture

  // ── Concurrence : deux répartiteurs, chaque ligne livrée UNE fois ──────
  const p1 = new SimulatorProvider("push");
  const p2 = new SimulatorProvider("push");
  // Les lignes sont créées puis livrées par deux instances concurrentes (sans « kick » : insertion directe).
  for (let i = 0; i < 12; i += 1) await directNotif(A.login, gid);
  const d1 = new NotificationDispatcher(pool, () => Date.now(), { ...delivery, providers: { push: p1 } });
  const d2 = new NotificationDispatcher(pool, () => Date.now(), { ...delivery, providers: { push: p2 } });
  await Promise.all([d1.drain({ batch: 3 }), d2.drain({ batch: 3 }), d1.drain({ batch: 2 }), d2.drain({ batch: 2 })]);
  const ids = [...p1.sent, ...p2.sent].map((x) => x.outboxId);
  check("LEASE-NO-DOUBLE-DELIVERY", ids.length === 12 && new Set(ids).size === 12, { delivered: ids.length, distinct: new Set(ids).size });

  // ── Bail expiré : une instance morte en plein envoi ne bloque rien ────
  await directNotif(A.login, gid);
  const dead = (await admin.query(`SELECT * FROM kombe_outbox_claim(10, 5, now())`)).rows;
  check("CLAIMED-BY-DEAD-INSTANCE", dead.length === 1, dead.length);
  const notYet = new SimulatorProvider("push");
  await new NotificationDispatcher(pool, () => Date.now(), { ...delivery, providers: { push: notYet } }).drain();
  check("LEASE-HELD-NOT-RECLAIMED", notYet.sent.length === 0, notYet.sent.length);
  const rescue = new SimulatorProvider("push");
  await new NotificationDispatcher(pool, () => Date.now() + 10_000, { ...delivery, providers: { push: rescue } }).drain();
  check("EXPIRED-LEASE-RECLAIMED", rescue.sent.length === 1 && rescue.sent[0].outboxId === Number(dead[0].outbox_id), rescue.sent.length);

  // ── Échecs : attente croissante, puis « dead » au 5e essai ────────────
  await directNotif(A.login, gid);
  const failing = new SimulatorProvider("push", () => ({ outcome: "retry", code: "PROVIDER_ERROR" }));
  let t = Date.now();
  const gaps = [];
  for (let i = 0; i < 6; i += 1) {
    const d = new NotificationDispatcher(pool, () => t, { ...delivery, providers: { push: failing } });
    await d.drain({ rounds: 1 });
    const r = (await rowsOf(A.login)).at(-1);
    gaps.push(r.state === "retry" ? Math.round((new Date(r.not_before).getTime() - t) / 60000) : r.state);
    t += 20 * 60_000;
  }
  const last = (await rowsOf(A.login)).at(-1);
  check("BACKOFF-THEN-DEAD", last.state === "dead" && last.attempts === 5 && gaps.slice(0, 4).join(",") === "1,4,9,16", { gaps, state: last.state, attempts: last.attempts });

  // ── Interrupteur général fermé / canal non configuré : jamais de faux succès
  await directNotif(A.login, gid);
  await new NotificationDispatcher(pool, () => Date.now(), { ...delivery, enabled: false }).drain();
  const sup = (await rowsOf(A.login)).at(-1);
  check("KILL-SWITCH-SUPPRESSED", sup.state === "suppressed" && sup.last_code === "EXTERNAL_DISABLED", { state: sup.state, code: sup.last_code });
  await directNotif(A.login, gid);
  await new NotificationDispatcher(pool, () => Date.now(), { ...delivery, providers: {} }).drain();
  const nc = (await rowsOf(A.login)).at(-1);
  check("UNCONFIGURED-SUPPRESSED", nc.state === "suppressed" && nc.last_code === "CHANNEL_NOT_CONFIGURED", { state: nc.state, code: nc.last_code });

  // ── FCM : un jeton refusé (404) est retiré, jamais réessayé ─────────────
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const calls = [];
  const fakeFetch = async (u, init) => {
    calls.push(String(u));
    if (String(u).includes("oauth2")) return new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }), { status: 200 });
    return new Response(JSON.stringify({ error: { status: "NOT_FOUND" } }), { status: 404 });
  };
  const fcm = new FcmProvider({ project_id: "kombe-proof", client_email: "x@kombe-proof.iam", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) }, fakeFetch);
  await directNotif(A.login, gid);
  await new NotificationDispatcher(pool, () => Date.now(), { ...delivery, providers: { push: fcm } }).drain();
  const fr = (await rowsOf(A.login)).at(-1);
  const devRow = (await admin.query(`SELECT revoked_at FROM push_device WHERE device_id = $1`, [dev.deviceId])).rows[0];
  check("FCM-UNREGISTERED-TOKEN-REVOKED", devRow.revoked_at !== null && fr.state === "suppressed" && fr.last_code === "NO_DEVICE" && calls.some((c) => c.includes("projects/kombe-proof/messages:send")), { state: fr.state, code: fr.last_code, revoked: devRow.revoked_at, calls });
  const afterRevoke = (await rowsOf(A.login)).length;
  await directNotif(A.login, gid);
  check("NO-DEVICE-NO-ROW", (await rowsOf(A.login)).length === afterRevoke, "ligne créée sans appareil");

  // ── RLS et rattachement d'un téléphone qui change de mains ─────────────
  const dev2 = await ok(A.token, "POST", "/v1/me/push-devices", { platform: "android", token: `tokA2-${run}-bbbbbbbbbbbbbbbb` });
  const pB = await ok(B.token, "GET", "/v1/me/notification-preferences");
  check("RLS-PREFS-PERSONAL", pB.devices === 0 && pB.quietStart === "21:00", pB);
  const steal = await call(B.token, "DELETE", `/v1/me/push-devices/${dev2.deviceId}`);
  check("RLS-NO-FOREIGN-DEVICE-REVOKE", steal.status === 404, steal.status);
  await ok(B.token, "POST", "/v1/me/push-devices", { platform: "android", token: `tokA2-${run}-bbbbbbbbbbbbbbbb` });
  const pA2 = await ok(A.token, "GET", "/v1/me/notification-preferences");
  const pB2 = await ok(B.token, "GET", "/v1/me/notification-preferences");
  check("DEVICE-REBOUND-TO-NEW-OWNER", pA2.devices === 0 && pB2.devices === 1, { a: pA2.devices, b: pB2.devices });
  const appDb = await pool.connect();
  try {
    await appDb.query("BEGIN");
    await appDb.query("SELECT set_config('kombe.identity_id', $1, true)", [B.login]);
    const seen = (await appDb.query("SELECT count(*)::int AS n FROM notification_outbox")).rows[0].n;
    let w = "accepted";
    try { await appDb.query("SAVEPOINT s"); await appDb.query("UPDATE notification_outbox SET state = 'sent'"); } catch (e) { w = e.code; await appDb.query("ROLLBACK TO SAVEPOINT s"); }
    check("RLS-OUTBOX-READ-OWN-WRITE-NONE", seen === 0 && w === "42501", { seen, w });
  } finally {
    await appDb.query("ROLLBACK");
    appDb.release();
  }
  void C;
} catch (err) {
  failures += 1;
  observations.EXCEPTION = String(err?.stack ?? err);
}
await sleep(300);
await admin.end();
await app.close();
await pool.end();
const status = failures === 0 ? "PASS" : "FAIL";
process.stdout.write(JSON.stringify({ target: "kombe.api.notificationDelivery", status, failures, observations }, null, 2) + "\n");
process.exit(failures === 0 ? 0 : 1);
