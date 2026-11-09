// Données d'exemple des consoles, servies uniquement au navigateur de capture.
const J = 86400000, now = Date.now();
const at = (d) => new Date(now + d * J).toISOString();
const noms = ["Les Étoiles de Yaoundé", "Solidarité Bamiléké", "Vision Douala", "Mamans de Bonamoussadi", "Amicale Essos"];
const overview = {
  groupsByState: { active: 18, forming: 4, paused: 1 }, identities: 412, identitiesLast7d: 23, membershipsActive: 286, membershipsPending: 9, sessionsActive24h: 74,
  meetingsOpen: 2, meetingsNext7d: 11, meetingsClosedNoMinutesApproval: 1, movementsDeclared: 37, movementsDeclaredOver72h: 3, oldestDeclaredAt: at(-4),
  payoutsAwaitingReceipt: 2, finesContested: 1, aidsRequested: 2, debtsOpen: 6, outboxPending: 4, outboxDead: 0, outboxOldestPendingAt: at(-0.01), inboxLast24h: 128,
  supportRequestsPending: 1, securityEventsLast7d: 5, serverNow: at(0),
};
const groupes = noms.map((name, i) => ({
  groupId: `grp-${i + 1}`, name, state: i === 4 ? "forming" : "active", createdAt: at(-120 + i * 15), membersActive: 12 - i, membersPending: i % 2, meetingsTotal: 8 - i, meetingsClosed: 6 - i,
  movementsDeclaredPending: i === 0 ? 3 : 0, oldestPendingAt: i === 0 ? at(-4) : null, openDebts: i === 1 ? 2 : 0, lastActivityAt: at(-i * 0.7),
}));
const demande = {
  requestId: "sup_1", applicantIdentityId: "operateur-1", targetGroupId: "grp-1", targetGroupName: noms[0], motif: "Vérifier une déclaration restée sans réponse", permissions: ["view_trace"],
  approverCount: 1, requiredApprovals: 2, requestedAt: at(-0.1), expiresAt: null, status: "pending_approval", version: 1,
};
const kpis = Array.from({ length: 8 }, (_, i) => ({
  weekStart: at(-(8 - i) * 7).slice(0, 10), groupsCreated: 1 + (i % 3), identitiesCreated: 12 + i * 2, membersAdmitted: 9 + i, movementsDeclared: 40 + i * 6, movementsConfirmed: 34 + i * 6,
  amountDeclared: String(1000000 + i * 150000), amountConfirmed: String(860000 + i * 140000), payoutsReceived: 2 + (i % 2), meetingsClosed: 3 + (i % 2), medianConfirmHours: 6 + i,
}));
const risques = [
  { riskId: "R-pilote-1", severity: "moyen", probabilityPercent: 30, impactPercent: 50, control: "Relance des trésoriers", evidenceRef: "docs/production-readiness/13", owner: "Direction", reviewedAt: at(-3) },
  { riskId: "R-pilote-2", severity: "faible", probabilityPercent: 10, impactPercent: 30, control: "Runbook S3", evidenceRef: "docs/production-readiness/11", owner: "Opérations", reviewedAt: at(-9) },
];
export const consoleFx = [
  ["POST", /\/v1\/auth\/code-requests$/, { accepted: true, login: "amina@exemple.cm", channel: "email" }],
  ["POST", /\/v1\/auth\/code-verifications$/, { sessionId: "qa", expiresAt: now + 3600000, identityId: "me" }],
  ["GET", /\/v1\/ops\/me$/, { identityId: "me", operator: true, roles: ["admin"], mfa: { required: true, enrolled: true, verified: true } }],
  ["GET", /\/v1\/ops\/overview$/, overview],
  ["GET", /\/v1\/ops\/groups/, groupes],
  ["GET", /\/v1\/ops\/support-requests/, [demande]],
  ["GET", /\/v1\/support\/access-requests/, [demande]],
  ["GET", /\/v1\/ops\/kpis$/, kpis],
  ["GET", /\/v1\/ops\/engineering$/, {
    postgresVersion: "17.2", databaseSizeBytes: 48234496, migrations: [{ name: "0040_role_api.sql", appliedAt: at(-1) }, { name: "0039_securite.sql", appliedAt: at(-1) }], journalEntries: 18422, idempotencyKeys: 5210,
    serverNow: at(0), api: { nodeVersion: "22.11.0", uptimeSeconds: 8120, commit: "exemple", environment: "production", smsProvider: null, emailConfigured: true }, expectedLatestMigration: "0040_role_api.sql", schemaUpToDate: true,
  }],
  ["GET", /\/v1\/health/, { status: "ok", mode: "réel" }],
  ["GET", /\/v1\/metrics\/risks$/, risques],
  ["GET", /\/v1\/metrics\/extension-check$/, { extensionAllowed: false, criticalWithoutControl: [] }],
];
