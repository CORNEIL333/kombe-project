// KÓMBE @kombe/api — preuve base réelle du CRM (0041_crm, ADR-0046).
//
// Sur une vraie PostgreSQL (rôle kombe_app sous RLS), avec des opérateurs
// promus par le VRAI script d'administration et leur second facteur :
//  - un membre ouvre une demande (référence KMB-…), ne voit que les siennes et
//    jamais les notes internes ; il reçoit une notification quand le support
//    répond ; il note la réponse une fois la demande résolue, une seule fois ;
//  - priorité ITIL (impact × urgence) et échéances de service posées par la base ;
//  - verrou optimiste : version périmée → 409 ;
//  - fonctions séparées : direction ≠ support, journal réservé à l'administration ;
//  - identifiant de connexion masqué par défaut, affiché seulement avec un motif,
//    et chaque consultation laisse une ligne au journal (ajout seul) ;
//  - cinq demandes ouvertes au plus par personne ;
//  - conservation : une demande close depuis plus de 730 jours est anonymisée.
// Sans base : BLOCKED (2), jamais simulé.
//
// Usage : KOMBE_API_DATABASE_URL=postgres://… KOMBE_DATABASE_URL=postgres://… node test/crm.proof.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { randomInt } from "node:crypto";
import { spawnSync } from "node:child_process";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const distRoot = resolve(here, "../dist");

function blocked(reason) {
  process.stdout.write(JSON.stringify({ target: "kombe.api.crm", status: "BLOCKED", reason, exitCode: 2 }, null, 2) + "\n");
  process.exit(2);
}

const url = process.env.KOMBE_API_DATABASE_URL;
const adminUrl = process.env.KOMBE_DATABASE_URL ?? url;
if (!url) blocked("KOMBE_API_DATABASE_URL absente : aucune base PostgreSQL joignable (jamais simulé).");

let buildApp, createApiPool, NullEmailSender, base32Decode, totpAt;
try {
  ({ buildApp } = await import(pathToFileURL(resolve(distRoot, "server.js")).href));
  ({ createApiPool } = await import(pathToFileURL(resolve(distRoot, "db/pgPool.js")).href));
  ({ NullEmailSender } = await import(pathToFileURL(resolve(distRoot, "email/emailSender.js")).href));
  ({ base32Decode, totpAt } = await import(pathToFileURL(resolve(distRoot, "ops/operatorAccess.js")).href));
} catch (err) {
  blocked(`Build manquant (pnpm --filter @kombe/api build requis) : ${String(err?.message ?? err)}`);
}

process.env.NODE_ENV = "test";
process.env.KOMBE_RATE_LIMIT_AUTH = "1000";
process.env.KOMBE_RATE_LIMIT_GLOBAL = "100000";
delete process.env.KOMBE_SMS_PROVIDER;
const pool = createApiPool({ connectionString: url });
const admin = new pg.Pool({ connectionString: adminUrl, max: 2 });
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
async function call(token, method, path, body, extra = {}) {
  const headers = { ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra };
  const res = await app.inject({ method, url: path, headers, ...(body !== undefined ? { payload: body } : {}) });
  let json = null;
  try {
    json = res.body ? JSON.parse(res.body) : null;
  } catch {
    json = res.body;
  }
  return { status: res.statusCode, body: json };
}
async function ok(token, method, path, body, extra) {
  const r = await call(token, method, path, body, extra);
  if (r.status >= 300) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

const run = String(randomInt(100000, 999999));
async function login(i, name) {
  const p = `69${run}${i}`.slice(0, 9);
  const req = await ok(null, "POST", "/v1/auth/code-requests", { login: p });
  const ses = await ok(null, "POST", "/v1/auth/code-verifications", { login: req.login, code: req.devCode });
  await ok(ses.sessionId, "PATCH", "/v1/me", { displayName: name });
  return { token: ses.sessionId, login: req.login };
}
async function operator(i, name, roles) {
  const who = await login(i, name);
  const g = spawnSync(process.execPath, [resolve(here, "../../db/scripts/grant-operator.mjs"), who.login, `--roles=${roles}`], {
    env: { ...process.env, KOMBE_DATABASE_URL: adminUrl },
    encoding: "utf8",
  });
  if (g.status !== 0) throw new Error(`grant-operator ${roles} : ${g.stdout} ${g.stderr}`);
  const enr = await ok(who.token, "POST", "/v1/ops/mfa/enrollment");
  await ok(who.token, "POST", "/v1/ops/mfa/activation", { code: totpAt(base32Decode(enr.secret), Date.now()) });
  return who;
}

try {
  const M1 = await login(1, "Awa Membre");
  const M2 = await login(2, "Bello Membre");
  const S = await operator(3, "Sandrine Support", "support");
  const D = await operator(4, "Daniel Direction", "direction");
  const A = await operator(5, "Alice Admin", "admin");

  const today = new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
  const settings = {
    contributionPerShare: "2000", cadence: { kind: "every_n_days", n: 8 }, firstMeetingDate: today, deadlineTime: "18:00",
    meetingPlace: null, maxMembers: 5, transparency: "all_members", feeBearer: "member", payoutPolicy: "full_with_advance",
    newcomersLast: true, guarantorRequired: false, payoutWitnesses: 0,
    fines: { lateContributionFixed: "0", lateContributionPerDay: "0", lateContributionCap: "0", meetingLate: "0", meetingAbsence: "0", indisciplineCap: "0", graceDays: 1 },
    solidarity: { enabled: false, perMeeting: "0", scale: [] }, operating: { enabled: false, perMeeting: "0" }, yearEndReserve: { enabled: false, perMeeting: "0" },
  };
  const grp = await ok(M1.token, "POST", "/v1/tontines", { name: `Groupe CRM ${run}`, founderDisplayName: "Awa Membre", settings });
  const groupId = grp.groupId ?? grp.id ?? grp.group?.groupId;

  /* ── Accès : membres refusés, fonctions séparées ── */
  const refused = await Promise.all(["/v1/crm/dashboard", "/v1/crm/tickets", "/v1/crm/accounts", "/v1/crm/audit"].map((p) => call(M1.token, "GET", p)));
  check("CRM-403-MEMBER", refused.every((r) => r.status === 403), refused.map((r) => r.status));
  check("CRM-401-ANON", (await call(null, "GET", "/v1/crm/dashboard")).status === 401, "anonyme accepté");
  check("CRM-DIRECTION-NO-TICKETS", (await call(D.token, "GET", "/v1/crm/tickets")).status === 403, "direction lit les demandes");
  check("CRM-SUPPORT-NO-AUDIT", (await call(S.token, "GET", "/v1/crm/audit")).status === 403, "support lit le journal");
  check("CRM-SUPPORT-NO-COMPLIANCE", (await call(S.token, "GET", "/v1/crm/compliance")).status === 403, "support lit la conformité");
  const dash0 = await ok(D.token, "GET", "/v1/crm/dashboard");
  check("CRM-DASHBOARD-DIRECTION", typeof dash0.tickets?.byStatus?.nouveau === "number" && "satisfaction" in dash0, dash0);

  /* ── Le membre ouvre une demande ── */
  const opened = await ok(M1.token, "POST", "/v1/me/support-tickets", {
    subject: "Ma cotisation n'apparaît pas", category: "cotisation", body: "J'ai versé 2000 XAF mardi, rien ne s'affiche.", groupId,
  });
  check("CRM-MEMBER-OPEN-REF", /^tk_[0-9a-f]{20}$/.test(opened.ticketId) && /^KMB-\d{6}$/.test(opened.ref), opened);
  // 0044 : le support est prévenu (support, admin), pas la direction ; le
  // message ne porte que la référence.
  const alertes = async (who) => {
    const r = await ok(who.token, "GET", "/v1/me/notifications");
    return (r.items ?? r).filter((n) => n.kind === "support_request");
  };
  const [aS, aA, aD] = await Promise.all([alertes(S), alertes(A), alertes(D)]);
  check("CRM-ALERT-NEW-TICKET",
    aS.length === 1 && aA.length === 1 && aD.length === 0 && String(aS[0].target).endsWith(opened.ticketId) &&
      !JSON.stringify(aS[0]).includes("2000 XAF"),
    { S: aS.length, A: aA.length, D: aD.length, n: aS[0] });
  const otherGroup = await call(M2.token, "POST", "/v1/me/support-tickets", { subject: "Accès", category: "connexion", body: "Je veux voir ce groupe-là.", groupId });
  check("CRM-MEMBER-FOREIGN-GROUP-REFUSED", otherGroup.status === 403, otherGroup);
  const m2list = await ok(M2.token, "GET", "/v1/me/support-tickets");
  check("CRM-MEMBER-ISOLATION-LIST", m2list.length === 0, m2list);
  check("CRM-MEMBER-ISOLATION-ONE", (await call(M2.token, "GET", `/v1/me/support-tickets/${opened.ticketId}`)).status === 404, "M2 lit la demande de M1");
  // Un opérateur, côté application, ne voit que SES demandes (pas toute la file).
  check("CRM-OPERATOR-AS-MEMBER-OWN-ONLY", (await ok(S.token, "GET", "/v1/me/support-tickets")).length === 0, "file entière exposée côté membre");

  /* ── Le support prend la demande ── */
  const queue = await ok(S.token, "GET", "/v1/crm/tickets");
  const t0 = queue.find((t) => t.ticketId === opened.ticketId);
  check("CRM-QUEUE", t0 && t0.status === "nouveau" && t0.priority === 4 && t0.requesterName === "Awa Membre" && t0.groupId === groupId, t0 ?? queue);
  check("CRM-QUEUE-NO-LOGIN", !JSON.stringify(queue).includes(M1.login), "identifiant en clair dans la file");
  const stale = t0.version;
  const triaged = await ok(S.token, "PATCH", `/v1/crm/tickets/${opened.ticketId}`, { impact: 1, urgency: 1 }, { "if-match-version": String(stale) });
  const hours = (a, b) => (new Date(a).getTime() - new Date(b).getTime()) / 3_600_000;
  check("CRM-ITIL-PRIORITY-SLA",
    triaged.priority === 1 && Math.abs(hours(triaged.firstResponseDue, triaged.createdAt) - 1) < 0.01 && Math.abs(hours(triaged.resolutionDue, triaged.createdAt) - 8) < 0.01,
    triaged);
  // 0046 : P1 sans réponse, 45 min plus tard (échéance à 1 h) → alerte unique au support.
  const scan1 = Number((await admin.query("SELECT kombe_crm_sla_scan(now() + interval '45 minutes') AS n")).rows[0].n);
  const scan2 = Number((await admin.query("SELECT kombe_crm_sla_scan(now() + interval '50 minutes') AS n")).rows[0].n);
  const delai = async (who) => { const r = await ok(who.token, "GET", "/v1/me/notifications"); return (r.items ?? r).filter((n) => n.kind === "support_sla"); };
  const [dS, dD] = [await delai(S), await delai(D)];
  check("CRM-SLA-ALERT-ONCE",
    scan1 >= 2 && scan2 === 0 && dS.length === 1 && dD.length === 0 && String(dS[0].target).endsWith(opened.ticketId),
    { scan1, scan2, S: dS.length, D: dD.length });
  const conflict = await call(S.token, "PATCH", `/v1/crm/tickets/${opened.ticketId}`, { urgency: 2 }, { "if-match-version": String(stale) });
  check("CRM-OPTIMISTIC-409", conflict.status === 409, conflict);
  const noVersion = await call(S.token, "PATCH", `/v1/crm/tickets/${opened.ticketId}`, { urgency: 2 });
  check("CRM-VERSION-REQUIRED", noVersion.status === 400, noVersion);

  await ok(S.token, "POST", `/v1/crm/tickets/${opened.ticketId}/messages`, { visibility: "interne", body: "Vérifier avec le trésorier du groupe." });
  await ok(S.token, "POST", `/v1/crm/tickets/${opened.ticketId}/messages`, { visibility: "public", body: "Bonjour, le trésorier doit confirmer votre déclaration." });
  const detail = await ok(S.token, "GET", `/v1/crm/tickets/${opened.ticketId}`);
  check("CRM-FIRST-RESPONSE", detail.firstResponseAt && detail.status === "en_cours" && detail.messages.length === 3 && detail.sla.firstResponseBreached === false, detail);
  const seen = await ok(M1.token, "GET", `/v1/me/support-tickets/${opened.ticketId}`);
  check("CRM-MEMBER-NO-INTERNAL-NOTE",
    seen.messages.length === 2 && !JSON.stringify(seen).includes("trésorier du groupe.") && seen.messages[1].from === "support" && !JSON.stringify(seen).includes("Sandrine"),
    seen);
  const inbox = await ok(M1.token, "GET", "/v1/me/notifications");
  const notif = (inbox.items ?? inbox).find?.((n) => n.kind === "support_reply");
  check("CRM-REPLY-NOTIFIED", notif && String(notif.target).endsWith(opened.ticketId), inbox);

  const earlyRate = await call(M1.token, "POST", `/v1/me/support-tickets/${opened.ticketId}/satisfaction`, { score: 5 });
  check("CRM-RATE-ONLY-WHEN-RESOLVED", earlyRate.status === 409 && /résolue/.test(earlyRate.body?.message ?? ""), earlyRate);
  await ok(M1.token, "POST", `/v1/me/support-tickets/${opened.ticketId}/messages`, { body: "Merci, j'attends." });
  // Réponse du membre : seul le responsable (S, assigné par sa réponse publique) est prévenu.
  const [rS, rA] = await Promise.all([alertes(S), alertes(A)]);
  check("CRM-ALERT-REPLY-ASSIGNEE-ONLY", rS.length === 2 && rA.length === 1, { S: rS.length, A: rA.length });
  const cur = await ok(S.token, "GET", `/v1/crm/tickets/${opened.ticketId}`);
  const resolved = await ok(S.token, "PATCH", `/v1/crm/tickets/${opened.ticketId}`, { status: "resolu" }, { "if-match-version": String(cur.version) });
  check("CRM-RESOLVED", resolved.status === "resolu" && resolved.resolvedAt, resolved);
  await ok(M1.token, "POST", `/v1/me/support-tickets/${opened.ticketId}/satisfaction`, { score: 4, comment: "Rapide" });
  const twice = await call(M1.token, "POST", `/v1/me/support-tickets/${opened.ticketId}/satisfaction`, { score: 1 });
  check("CRM-RATE-ONCE", twice.status === 409, twice);

  /* ── Comptes, contacts : masqués, affichage avec motif, journal ── */
  const account = await ok(S.token, "GET", `/v1/crm/accounts/${groupId}`);
  const c1 = account.contacts.find((c) => c.displayName === "Awa Membre");
  check("CRM-ACCOUNT-CONTACT-MASKED", c1 && /^ct_[0-9a-f]{20}$/.test(c1.contactId) && c1.loginMasked !== M1.login && !JSON.stringify(account).includes(M1.login) && c1.roles.length >= 1, account.contacts);
  check("CRM-ACCOUNT-TICKETS", account.tickets.some((t) => t.ticketId === opened.ticketId), account.tickets);
  const noMotif = await call(S.token, "POST", `/v1/crm/contacts/${c1.contactId}/reveal`, { motif: "court" });
  check("CRM-REVEAL-MOTIF-REQUIRED", noMotif.status === 422, noMotif);
  const reveal = await ok(S.token, "POST", `/v1/crm/contacts/${c1.contactId}/reveal`, { motif: "Rappel téléphonique demandé par la personne (KMB)" });
  check("CRM-REVEAL", reveal.login === M1.login, reveal);
  const found = await ok(S.token, "POST", "/v1/crm/contacts/search", { login: M1.login });
  check("CRM-SEARCH", found.contactId === c1.contactId, found);
  const card = await ok(S.token, "GET", `/v1/crm/contacts/${c1.contactId}`);
  check("CRM-CONTACT-CARD", card.groups.some((g) => g.groupId === groupId) && card.tickets.length === 1 && card.loginMasked !== M1.login, card);

  await ok(S.token, "POST", "/v1/crm/notes", { groupId, body: "Groupe accompagné au démarrage." });
  check("CRM-NOTE-TARGET-XOR", (await call(S.token, "POST", "/v1/crm/notes", { groupId, contactId: c1.contactId, body: "x" })).status === 400, "note double cible acceptée");
  const task = await ok(S.token, "POST", "/v1/crm/tasks", { title: "Rappeler le trésorier", groupId, ticketId: opened.ticketId, dueAt: new Date(Date.now() + 86_400_000).toISOString() });
  const tasks = await ok(S.token, "GET", "/v1/crm/tasks");
  const tk = tasks.find((x) => x.taskId === task.taskId);
  check("CRM-TASK", tk && tk.ticketRef === opened.ref && tk.status === "a_faire", tasks);
  const done = await ok(S.token, "PATCH", `/v1/crm/tasks/${task.taskId}`, { status: "fait" }, { "if-match-version": String(tk.version) });
  const doneAgain = await call(S.token, "PATCH", `/v1/crm/tasks/${task.taskId}`, { status: "annule" }, { "if-match-version": String(tk.version) });
  check("CRM-TASK-VERSION", done.status === "fait" && doneAgain.status === 409, { done, doneAgain });

  const segs = await ok(D.token, "GET", "/v1/crm/segments");
  const nouveaux = segs.find((s) => s.key === "nouveaux");
  check("CRM-SEGMENTS", segs.length === 7 && nouveaux.groups.some((g) => g.groupId === groupId), segs.map((s) => [s.key, s.count]));
  const accounts = await ok(D.token, "GET", "/v1/crm/accounts");
  check("CRM-ACCOUNTS-NO-LOGIN", accounts.some((g) => g.groupId === groupId) && !JSON.stringify(accounts).includes(M1.login), accounts.length);

  const journal = await ok(A.token, "GET", "/v1/crm/audit");
  const actions = new Set(journal.map((x) => x.action));
  const revealRow = journal.find((x) => x.action === "affichage_identifiant");
  check("CRM-AUDIT-TRAIL",
    ["consultation_demande", "modification_demande", "reponse_demande", "note_interne", "consultation_contact", "affichage_identifiant", "recherche_contact", "note", "tache"].every((a) => actions.has(a)) &&
      revealRow?.motif?.startsWith("Rappel") && revealRow.actorName === "Sandrine Support",
    [...actions]);

  /* ── Base : journal et messages en ajout seul, notes invisibles au membre ── */
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('kombe.identity_id', $1, true)", [S.login]);
    let denied = "";
    try {
      await c.query("SAVEPOINT a");
      await c.query("UPDATE crm_audit_log SET motif = 'effacé'");
    } catch (e) {
      denied += e.code;
      await c.query("ROLLBACK TO SAVEPOINT a");
    }
    try {
      await c.query("SAVEPOINT b");
      await c.query("DELETE FROM crm_ticket_message");
    } catch (e) {
      denied += `,${e.code}`;
      await c.query("ROLLBACK TO SAVEPOINT b");
    }
    check("CRM-APPEND-ONLY", denied === "42501,42501", denied);
    await c.query("SELECT set_config('kombe.identity_id', $1, true)", [M1.login]);
    const n = await c.query("SELECT (SELECT count(*) FROM crm_note) AS notes, (SELECT count(*) FROM crm_audit_log) AS audit, (SELECT count(*) FROM crm_task) AS tasks, (SELECT count(*) FROM crm_ticket_message WHERE visibility = 'interne') AS internes");
    check("CRM-RLS-MEMBER-SEES-NOTHING-INTERNAL", Object.values(n.rows[0]).every((v) => Number(v) === 0), n.rows[0]);
    await c.query("ROLLBACK");
  } finally {
    c.release();
  }

  /* ── Cinq demandes ouvertes au plus ── */
  for (let i = 0; i < 5; i += 1) await ok(M2.token, "POST", "/v1/me/support-tickets", { subject: `Question ${i}`, category: "application", body: "Comment fonctionne l'écran des tours ?" });
  const sixth = await call(M2.token, "POST", "/v1/me/support-tickets", { subject: "Question 6", category: "application", body: "Encore une question sur les tours." });
  check("CRM-MAX-5-OPEN", sixth.status === 409 && /5 demandes/.test(sixth.body?.message ?? ""), sixth);

  /* ── Conservation : anonymisation après 730 jours ── */
  const tooShort = await call(A.token, "POST", "/v1/crm/compliance/anonymize", { olderThanDays: 100 });
  check("CRM-ANONYMIZE-MIN-365", tooShort.status === 422, tooShort);
  check("CRM-ANONYMIZE-ADMIN-ONLY", (await call(D.token, "POST", "/v1/crm/compliance/anonymize", {})).status === 403, "direction anonymise");
  const cur2 = await ok(S.token, "GET", `/v1/crm/tickets/${opened.ticketId}`);
  await ok(S.token, "PATCH", `/v1/crm/tickets/${opened.ticketId}`, { status: "ferme" }, { "if-match-version": String(cur2.version) });
  await admin.query("UPDATE crm_ticket SET closed_at = now() - interval '800 days' WHERE ticket_id = $1", [opened.ticketId]);
  const comp = await ok(D.token, "GET", "/v1/crm/compliance");
  check("CRM-COMPLIANCE", comp.retention.eligibleForAnonymization >= 1 && comp.processingRecords.some((r) => r.recordId === "crm-support"), comp.retention);
  const anon = await ok(A.token, "POST", "/v1/crm/compliance/anonymize", {});
  const after = (await admin.query("SELECT t.subject, t.requester_contact_id, t.anonymized_at, array_agg(DISTINCT m.body) AS bodies FROM crm_ticket t JOIN crm_ticket_message m USING (ticket_id) WHERE t.ticket_id = $1 GROUP BY 1,2,3", [opened.ticketId])).rows[0];
  check("CRM-ANONYMIZED",
    anon.anonymized === 1 && after.subject === "[anonymisé]" && after.requester_contact_id === null && after.anonymized_at && after.bodies.length === 1 && after.bodies[0] === "[anonymisé]",
    { anon, after });
  check("CRM-ANONYMIZED-GONE-FOR-MEMBER", (await ok(M1.token, "GET", "/v1/me/support-tickets")).length === 0, "demande anonymisée encore liée à la personne");
  const journal2 = await ok(A.token, "GET", "/v1/crm/audit");
  check("CRM-ANONYMIZE-AUDITED", journal2.some((x) => x.action === "anonymisation" && x.detail?.demandes === 1), journal2.slice(0, 3));
} catch (err) {
  failures += 1;
  observations.EXCEPTION = String(err?.stack ?? err);
}

await app.close();
await pool.end();
await admin.end();
const status = failures === 0 ? "PASS" : "FAIL";
process.stdout.write(JSON.stringify({ target: "kombe.api.crm", status, failures, observations }, null, 2) + "\n");
process.exit(failures === 0 ? 0 : 1);
