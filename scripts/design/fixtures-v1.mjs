// Données d'EXEMPLE conformes à @kombe/domain, servies uniquement aux
// navigateurs de test (interception de /v1). Jamais embarquées dans une app.
const J = 86400000;
const now = Date.now();
const iso = (d) => new Date(now + d * J).toISOString().slice(0, 10);
const at = (d) => new Date(now + d * J).toISOString();
const noms = ["Amina Ngué", "Paul Abega", "Serge Nkoué", "Marie Abena", "Linda Mbarga", "Chantal Abega", "Éric Kamga", "Joëlle Bilong", "Didier Fotso", "Rose Essomba", "Alain Mbida", "Grâce Onana"];
export const G = "grp-etoiles";
const fines = { lateContributionFixed: "1000", lateContributionPerDay: "0", lateContributionCap: "5000", meetingLate: "500", meetingAbsence: "1000", indisciplineCap: "5000", graceDays: 2 };
const settings = {
  contributionPerShare: "25000", cadence: { kind: "monthly_day", day: 15 }, firstMeetingDate: iso(-95), deadlineTime: "18:00", meetingPlace: "Chez Amina, Bastos",
  maxMembers: 12, transparency: "all_members", feeBearer: "member", payoutPolicy: "full_with_advance", newcomersLast: false, guarantorRequired: false, payoutWitnesses: 2,
  fines, solidarity: { enabled: true, perMeeting: "1000", scale: [] }, operating: { enabled: false, perMeeting: "0" }, yearEndReserve: { enabled: false, perMeeting: "0" },
};
const membres = noms.map((n, i) => ({
  membershipId: `m${i + 1}`, displayName: n, state: "active", roles: i === 1 ? ["treasurer"] : i === 0 ? ["animator"] : i === 6 ? ["auditor"] : [], pendingRoles: [],
  login: i === 0 ? "amina@exemple.cm" : `+237 6•• •• •• ${String(10 + i)}`, isMe: i === 0, sponsorMembershipId: null, proxyMembershipId: null, offline: i === 9,
  joinedAt: at(-300 + i * 9), shares: 1, sharePartnerMembershipId: null,
}));
const tours = noms.map((n, i) => ({
  seq: i + 1, date: iso(-95 + i * 30), state: i < 3 ? "closed" : "open", beneficiaryMembershipId: `m${((i + 3) % 12) + 1}`, beneficiaryName: noms[(i + 3) % 12],
  meetingId: `mt${i + 1}`, expectedPot: "300000", collected: i < 3 ? "300000" : i === 3 ? "225000" : "0", payoutState: i < 3 ? "received" : "none",
}));
const funds = [
  { fundId: "f1", kind: "rotation", name: "Tontine", state: "active", confirmedBalance: "225000", pendingIn: "50000", perMeeting: "25000" },
  { fundId: "f2", kind: "solidarity", name: "Caisse de secours", state: "active", confirmedBalance: "38000", pendingIn: "0", perMeeting: "1000" },
];
const detail = {
  groupId: G, name: "Les Étoiles de Yaoundé", state: "active", settings, me: { membershipId: "m1", state: "active", roles: ["animator"] }, memberCount: 12, pendingCount: 1, funds,
  currentRound: tours[3], nextMeeting: { meetingId: "mt4", seq: 4, date: iso(5), state: "planned", location: "Chez Amina, Bastos", hostName: "Amina Ngué", roundSeq: 4, minutesApproved: false },
  statutes: { version: 3, hash: "h3", acceptedByMe: true }, cycleStarted: true, cycle: { number: 1, firstSeq: 1, lastSeq: 12, finished: false }, flags: [],
};
const summary = (g, name, n, amount, nextD, due, roles = []) => ({ groupId: g, name, state: "active", membershipId: "m1", membershipState: "active", roles, memberCount: n, contributionPerShare: amount, nextMeetingDate: iso(nextD), myOpenDue: due, myPayoutDate: iso(nextD + 60) });
export const fixtures = [
  ["GET", /\/v1\/me$/, { identityId: "me", login: "amina@exemple.cm", displayName: "Amina Ngué", language: "fr" }],
  ["GET", /\/v1\/me\/tontines/, [summary(G, "Les Étoiles de Yaoundé", 12, "25000", 5, "25000", ["animator"]), summary("grp-bam", "Solidarité Bamiléké", 10, "15000", 10, "0", ["treasurer"]), summary("grp-vis", "Vision Entrepreneurs", 8, "50000", 3, "0")]],
  ["GET", /\/v1\/me\/notifications/, [
    { notificationId: "n1", groupId: G, groupName: "Les Étoiles de Yaoundé", kind: "validation_waiting", target: null, createdAt: at(-0.1), read: false },
    { notificationId: "n2", groupId: G, groupName: "Les Étoiles de Yaoundé", kind: "meeting_reminder", target: null, createdAt: at(-1), read: false },
    { notificationId: "n3", groupId: "grp-bam", groupName: "Solidarité Bamiléké", kind: "payout_recorded", target: null, createdAt: at(-3), read: true },
  ]],
  ["GET", /\/v1\/me\/dues/, [{ groupId: G, fundId: "f1", fundKind: "rotation", fundName: "Tontine", roundSeq: 4, date: iso(5), due: "25000", confirmed: "0", declared: "0", remaining: "25000", lateness: "upcoming" },
    { groupId: G, fundId: "f2", fundKind: "solidarity", fundName: "Caisse de secours", roundSeq: 4, date: iso(5), due: "1000", confirmed: "0", declared: "0", remaining: "1000", lateness: "upcoming" }]],
  ["GET", /\/members/, membres],
  ["GET", /\/rounds$/, tours],
  ["GET", /\/funds/, funds],
  ["GET", /\/my-forecast/, { cycle: 1, totalDue: "300000", totalToReceive: "300000", confirmedSoFar: "75000", turns: [{ seq: 10, date: iso(185), amount: "300000", paidBeforeReceiving: "250000", position: "you_advance_group", gap: "50000", explanation: "Vous recevez au tour 10 : vous aurez versé 250 000 FCFA avant.", received: false }] }],
  ["GET", /\/regularity/, membres.map((m, i) => ({ membershipId: m.membershipId, name: m.displayName, isMe: m.isMe, dueSoFar: 3, onTime: i % 5 === 3 ? 2 : 3, late: i % 5 === 3 ? 1 : 0, unpaidLate: 0, openFines: 0, onTimeRate: i % 5 === 3 ? 0.67 : 1, badge: i % 5 === 3 ? "à suivre" : "exemplaire" }))],
  ["GET", /\/statutes/, { version: 3, title: "Statuts des Étoiles", body: "Article 1 — …", hash: "h3", publishedAt: at(-80), acceptedByMe: true, acceptedCount: 12 }],
  ["GET", /\/movements/, []],
  ["GET", /\/meetings$/, [detail.nextMeeting]],
  ["GET", /\/tontines\/[^/]+$/, detail],
  ["GET", /\/v1\/auth\/channels/, { sms: false, whatsapp: false, email: true }],
];


// Compléments pour l'Espace bureau (mêmes données d'exemple).
const etats = ["declared", "confirmed", "validated", "declared", "confirmed", "declared"];
const canaux = ["orange_money", "mtn_momo", "cash", "orange_money", "bank", "cash"];
const mouvements = noms.slice(0, 9).map((n, i) => ({
  movementId: `mv${i + 1}`, fundId: "f1", fundKind: "rotation", kind: "contribution", amount: "25000", membershipId: `m${i + 1}`, memberName: n,
  roundSeq: 4, meetingId: "mt4", state: etats[i % etats.length], channel: canaux[i % canaux.length], reference: i % 2 ? `OM-${48210 + i}` : null,
  payerNote: null, declaredBy: `id${i + 1}`, declaredByName: n, declaredAt: at(-2 + i * 0.1), confirmedByName: i % 3 === 1 ? "Paul Abega" : null, controlledByName: null,
  rejectedReason: null, relatedKind: null, relatedId: null, witnesses: [], beneficiaryConfirmedAt: null, can: { confirm: etats[i % etats.length] === "declared", control: false, reject: etats[i % etats.length] === "declared", acknowledge: false },
}));
const grille = {
  seq: 4, transparency: "all_members",
  rows: noms.map((n, i) => ({ membershipId: `m${i + 1}`, displayName: n, due: "25000", confirmed: i < 7 ? "25000" : i === 7 ? "10000" : "0", declared: i === 8 ? "25000" : "0", status: i < 7 ? "paid" : i === 7 ? "partial" : i === 8 ? "declared" : "unpaid" })),
  summary: { paid: 7, partial: 1, unpaid: 4, total: 12 },
};
fixtures.unshift(
  ["GET", /\/rounds\/\d+\/grid/, grille],
  ["GET", /\/movements/, mouvements],
  ["GET", /\/debts/, [{ debtId: "d1", debtorMembershipId: "m10", debtorName: noms[9], origin: "unpaid_obligation", amount: "25000", settled: "10000", remaining: "15000", state: "open", guarantorName: null, createdAt: at(-30) }]],
  ["GET", /\/fines/, [{ fineId: "fi1", membershipId: "m4", memberName: noms[3], kind: "late_contribution", amount: "1000", reason: "Cotisation du tour 3 reçue après l'heure limite", state: "open", issuedAt: at(-20), issuedByName: "Amina Ngué", meetingId: "mt3" }]],
  ["GET", /\/aids/, [{ aidId: "a1", beneficiaryMembershipId: "m6", beneficiaryName: noms[5], event: "birth", eventDate: iso(-12), amount: "20000", state: "paid", note: null, requestedAt: at(-11), decisionNote: "Accordé en séance" }]],
  ["GET", /\/decisions/, []],
  ["GET", /\/sanctions/, []],
  ["GET", /\/invitations/, [{ invitationId: "i1", code: "ETOILE7", url: "https://kombe.vercel.app/#/rejoindre/ETOILE7", whatsappText: "", expiresAt: at(20), maxUses: 5, usedCount: 2, revoked: false }]],
  ["GET", /\/journal/, { valid: true, entries: [] }],
  ["GET", /\/v1\/ops\/me/, { identityId: "me", operator: true }],
);
