/**
 * Invariants purs des modules « tontine réelle » (lots L-01 à L-21).
 * Aucune base : ces règles sont indépendantes de PostgreSQL.
 */
import { describe, expect, it } from "vitest";
import {
  DomainError,
  // rôles
  canAct,
  assertCanAct,
  assertRoleAssignable,
  removalAdopted,
  assertMandate,
  // téléphone
  normalizePhone,
  cameroonOperator,
  channelForIdentity,
  maskPhone,
  // cadence
  meetingDates,
  describeCadence,
  legacyCadence,
  deadlineUtcMs,
  // séance
  transitionMeeting,
  assertAttendance,
  assertPayoutWitnesses,
  buildMinutes,
  quorumOfMeeting,
  // caisses
  confirmMovement,
  controlMovement,
  fundLedger,
  assertChannelReference,
  assertFundKindEnabled,
  netAfterFees,
  assertOutflowCovered,
  DEFAULT_FUND_RULES,
  // amendes
  lateContributionFine,
  lateness,
  fineAmount,
  assertFineIssuable,
  suggestedSanction,
  DEFAULT_FINE_SCHEDULE,
  // secours
  aidAmount,
  assertAidScale,
  assertAidDecider,
  exceptionalCall,
  // dettes
  openDebt,
  settleDebt,
  writeOffDebt,
  planPayoutWithArrears,
  catchUpPlan,
  assertGuarantor,
  // ordre
  drawCommitment,
  drawOrder,
  drawWithFixed,
  swapRounds,
  swapApprovalsComplete,
  priorityMove,
  newcomersLast,
  settleAuction,
  // parts
  assertShares,
  oneSharePerMember,
  splitByWeight,
  memberDueForRound,
  potPerRound,
  // statuts
  buildStatutes,
  // extensions
  parseFeatureFlags,
  assertFlag,
  loanSchedule,
  collectorPayout,
  // import
  planLegacyImport,
  mapLegacyRole,
  // copie
  forbiddenCopyIn,
  reserveDistribution,
} from "../src/index.js";

const code = (fn: () => unknown): string | null => {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof DomainError ? e.code : "NOT_DOMAIN";
  }
};

describe("L-11 bureau et permissions", () => {
  it("le trésorier confirme, le commissaire contrôle, le membre ne confirme pas", () => {
    expect(canAct(["treasurer"], "movement.confirm")).toBe(true);
    expect(canAct(["treasurer_deputy"], "movement.confirm")).toBe(true);
    expect(canAct(["auditor"], "movement.control")).toBe(true);
    expect(canAct(["member"], "movement.confirm")).toBe(false);
    expect(code(() => assertCanAct(["member"], "member.admit"))).toBe("TONTINE_FORBIDDEN");
  });
  it("le censeur constate les amendes, un cumul de fonctions ouvre l'union des droits", () => {
    expect(canAct(["censor"], "fine.issue")).toBe(true);
    expect(canAct(["member", "secretary"], "meeting.manage")).toBe(true);
  });
  it("une fonction financière ne s'attribue pas à soi-même", () => {
    expect(code(() => assertRoleAssignable({ role: "treasurer", proposerIdentityId: "a", targetIdentityId: "a" }))).toBe(
      "APPROVER_NOT_DISTINCT",
    );
    expect(code(() => assertRoleAssignable({ role: "secretary", proposerIdentityId: "a", targetIdentityId: "a" }))).toBeNull();
  });
  it("destitution : majorité absolue des membres et 72 h minimum", () => {
    expect(removalAdopted({ activeMembers: 10, yes: 6, windowHours: 72 })).toBe(true);
    expect(removalAdopted({ activeMembers: 10, yes: 5, windowHours: 72 })).toBe(false);
    expect(removalAdopted({ activeMembers: 10, yes: 9, windowHours: 48 })).toBe(false);
  });
  it("mandat borné", () => {
    expect(code(() => assertMandate("2026-01-01", "2027-01-01"))).toBeNull();
    expect(code(() => assertMandate("2026-01-01", "2025-01-01"))).toBe("MANDATE_INVALID");
    expect(code(() => assertMandate("2026-01-01", "2035-01-01"))).toBe("MANDATE_INVALID");
  });
});

describe("L-01 identité par téléphone", () => {
  it("normalise les saisies camerounaises courantes", () => {
    expect(normalizePhone("677 12 34 56")).toBe("+237677123456");
    expect(normalizePhone("+237 699-12-34-56")).toBe("+237699123456");
    expect(normalizePhone("00237655123456")).toBe("+237655123456");
    expect(normalizePhone("+33612345678")).toBe("+33612345678");
  });
  it("refuse les numéros camerounais mal formés", () => {
    expect(code(() => normalizePhone("+237 5771234"))).toBe("PHONE_INVALID");
    expect(code(() => normalizePhone("abc"))).toBe("PHONE_INVALID");
    expect(code(() => normalizePhone("+237123456789"))).toBe("PHONE_INVALID");
  });
  it("opérateur indicatif et masque", () => {
    expect(cameroonOperator("+237677123456")).toBe("mtn");
    expect(cameroonOperator("+237699123456")).toBe("orange");
    expect(cameroonOperator("+237655123456")).toBe("orange");
    expect(cameroonOperator("+237662123456")).toBe("nexttel");
    expect(cameroonOperator("+33612345678")).toBe("inconnu");
    expect(maskPhone("+237677123456")).toBe("+2376•• •• •• 56");
  });
  it("canal déduit de l'identifiant", () => {
    expect(channelForIdentity("+237677123456")).toBe("phone");
    expect(channelForIdentity("a@b.cm")).toBe("email");
  });
});

describe("L-03 calendrier réel", () => {
  it("2e dimanche du mois", () => {
    expect(meetingDates({ kind: "monthly_nth_weekday", nth: 2, weekday: 0 }, "2026-10-01", 3)).toEqual([
      "2026-10-11",
      "2026-11-08",
      "2026-12-13",
    ]);
  });
  it("dernier samedi du mois", () => {
    expect(meetingDates({ kind: "monthly_nth_weekday", nth: -1, weekday: 6 }, "2026-10-01", 2)).toEqual([
      "2026-10-31",
      "2026-11-28",
    ]);
  });
  it("tous les 8 jours (semaine traditionnelle)", () => {
    expect(meetingDates({ kind: "every_n_days", n: 8 }, "2026-10-13", 3)).toEqual(["2026-10-13", "2026-10-21", "2026-10-29"]);
  });
  it("chaque dimanche, et une pause décale la séance", () => {
    expect(meetingDates({ kind: "weekly", weekday: 0 }, "2026-10-13", 3, ["2026-10-25"])).toEqual([
      "2026-10-18",
      "2026-11-01",
      "2026-11-08",
    ]);
  });
  it("un dimanche sur deux", () => {
    expect(meetingDates({ kind: "biweekly", weekday: 0 }, "2026-10-18", 3)).toEqual(["2026-10-18", "2026-11-01", "2026-11-15"]);
  });
  it("tontine de marché : chaque jour sauf le dimanche", () => {
    expect(meetingDates({ kind: "daily", excludedWeekdays: [0] }, "2026-10-17", 3)).toEqual(["2026-10-17", "2026-10-19", "2026-10-20"]);
  });
  it("le 31 de chaque mois est ramené au dernier jour", () => {
    expect(meetingDates({ kind: "monthly_day", day: 31 }, "2027-01-31", 2)).toEqual(["2027-01-31", "2027-02-28"]);
  });
  it("cadences invalides refusées", () => {
    expect(code(() => meetingDates({ kind: "every_n_days", n: 1 }, "2026-10-13", 2))).toBe("CADENCE_INVALID");
    expect(code(() => meetingDates({ kind: "weekly", weekday: 9 as never }, "2026-10-13", 2))).toBe("CADENCE_INVALID");
    expect(code(() => meetingDates({ kind: "weekly", weekday: 0 }, "2026-02-30", 2))).toBe("CADENCE_INVALID");
  });
  it("libellés et migration des anciennes règles", () => {
    expect(describeCadence({ kind: "monthly_nth_weekday", nth: 2, weekday: 0 })).toBe("Le 2e dimanche du mois");
    expect(describeCadence({ kind: "every_n_days", n: 8 }, "en")).toBe("Every 8 days");
    expect(legacyCadence("weekly", "2026-10-18")).toEqual({ kind: "weekly", weekday: 0 });
    expect(legacyCadence("monthly", "2026-10-15")).toEqual({ kind: "monthly_day", day: 15 });
  });
  it("heure limite Africa/Douala = UTC+1", () => {
    expect(new Date(deadlineUtcMs("2026-10-18", "18:00")).toISOString()).toBe("2026-10-18T17:00:00.000Z");
  });
});

describe("L-04 à L-06 séance, présence, remise, PV", () => {
  it("cycle de vie de la séance", () => {
    expect(transitionMeeting("planned", "open")).toBe("open");
    expect(code(() => transitionMeeting("closed", "open"))).toBe("MEETING_STATE_INVALID");
  });
  it("représentation tracée", () => {
    expect(code(() => assertAttendance({ status: "represented", membershipId: "a", representedByMembershipId: "b" }))).toBeNull();
    expect(code(() => assertAttendance({ status: "represented", membershipId: "a" }))).toBe("ATTENDANCE_INVALID");
    expect(code(() => assertAttendance({ status: "present", membershipId: "a", representedByMembershipId: "b" }))).toBe(
      "ATTENDANCE_INVALID",
    );
    expect(quorumOfMeeting(["present", "late", "represented", "excused", "absent"])).toEqual({ present: 3, absent: 1, excused: 1 });
  });
  it("deux témoins présents, distincts du bénéficiaire et du trésorier", () => {
    const base = { beneficiaryMembershipId: "b", declarantMembershipId: "t", presentMembershipIds: ["b", "t", "w1", "w2"] };
    expect(code(() => assertPayoutWitnesses({ ...base, witnessMembershipIds: ["w1", "w2"] }))).toBeNull();
    expect(code(() => assertPayoutWitnesses({ ...base, witnessMembershipIds: ["w1"] }))).toBe("WITNESS_REQUIRED");
    expect(code(() => assertPayoutWitnesses({ ...base, witnessMembershipIds: ["w1", "b"] }))).toBe("WITNESS_REQUIRED");
    expect(code(() => assertPayoutWitnesses({ ...base, witnessMembershipIds: ["w1", "x"] }))).toBe("WITNESS_REQUIRED");
  });
  it("PV généré depuis les faits, empreinte stable", () => {
    const input = {
      groupName: "Les Bâtisseurs",
      meetingSeq: 4,
      date: "2026-10-18",
      location: "Logpom",
      host: "Hervé",
      attendance: [
        { name: "Hervé", status: "present" as const },
        { name: "Aïcha", status: "represented" as const, representedBy: "Sandrine" },
      ],
      collections: [{ fund: "Njangi", member: "Aïcha", amount: 25000n, state: "validée" }],
      payouts: [{ fund: "Njangi", beneficiary: "Hervé", amount: 200000n, witnesses: ["Régine", "Ibrahim"], confirmed: true }],
      fines: [{ member: "Patrick", reason: "Retard à la séance", amount: 500n }],
      aids: [],
      decisions: ["Échange des tours 6 et 7 approuvé"],
      notes: null,
    };
    const a = buildMinutes(input);
    const b = buildMinutes(input);
    expect(a.hash).toBe(b.hash);
    expect(a.text).toContain("200 000 FCFA");
    expect(a.text).toContain("représenté par Sandrine");
    expect(a.text).toContain("ne garde pas l'argent");
    expect(forbiddenCopyIn(a.text)).toEqual([]);
  });
});

describe("L-07 / L-16 caisses et mouvements", () => {
  const acts = { declarantIdentityId: "m", confirmerIdentityId: null, controllerIdentityId: null };
  it("indépendance déclarant / confirmateur / contrôleur", () => {
    expect(code(() => confirmMovement("declared", acts, "m", true))).toBe("MOVEMENT_NOT_INDEPENDENT");
    expect(confirmMovement("declared", acts, "t", true).state).toBe("confirmed");
    expect(confirmMovement("declared", acts, "t", false).state).toBe("validated");
    expect(code(() => controlMovement("confirmed", { ...acts, confirmerIdentityId: "t" }, "t"))).toBe("MOVEMENT_NOT_INDEPENDENT");
    expect(controlMovement("confirmed", { ...acts, confirmerIdentityId: "t" }, "c").state).toBe("validated");
  });
  it("écart du registre : seuls les mouvements validés comptent, compensation neutre", () => {
    const l = fundLedger([
      { kind: "contribution", amount: 5000n, state: "validated" },
      { kind: "contribution", amount: 5000n, state: "declared" },
      { kind: "payout", amount: 2000n, state: "validated" },
      { kind: "contribution", amount: 1000n, state: "compensated" },
      { kind: "transfer_out", amount: 1000n, state: "validated" },
    ]);
    expect(l.registerBalance).toBe(3000n);
    expect(l.inProgressIn).toBe(5000n);
  });
  it("référence Mobile Money : motif si absente", () => {
    expect(code(() => assertChannelReference({ channel: "orange_money", reference: null, justification: null }))).toBe(
      "REFERENCE_JUSTIFICATION_REQUIRED",
    );
    expect(code(() => assertChannelReference({ channel: "mtn_momo", reference: "MP2610.1234.A56789", justification: null }))).toBeNull();
    expect(code(() => assertChannelReference({ channel: "cash", reference: null, justification: null }))).toBeNull();
  });
  it("caisses sous drapeau fermées par défaut", () => {
    expect(code(() => assertFundKindEnabled("loan", []))).toBe("FUND_KIND_DISABLED");
    expect(code(() => assertFundKindEnabled("solidarity", []))).toBeNull();
    expect(code(() => assertFundKindEnabled("loan", ["loan"]))).toBeNull();
  });
  it("frais de retrait selon la règle du groupe", () => {
    expect(netAfterFees(200000n, 2000n, "beneficiary")).toEqual({ net: 198000n, fundFee: 0n });
    expect(netAfterFees(200000n, 2000n, "fund")).toEqual({ net: 200000n, fundFee: 2000n });
  });
  it("une sortie ne dépasse pas l'écart, sauf caisse d'avance", () => {
    expect(code(() => assertOutflowCovered(1000n, 2000n, DEFAULT_FUND_RULES.solidarity))).toBe("FUND_INVALID");
    expect(code(() => assertOutflowCovered(1000n, 2000n, { ...DEFAULT_FUND_RULES.operating, allowNegative: true }))).toBeNull();
  });
});

describe("L-09 amendes", () => {
  const s = { ...DEFAULT_FINE_SCHEDULE, lateContributionFixed: 500n, lateContributionPerDay: 100n, lateContributionCap: 1500n, graceDays: 2, meetingLate: 200n, indisciplineCap: 1000n };
  it("retard de cotisation au-delà de la grâce, plafonné", () => {
    expect(lateContributionFine(s, "2026-10-18", "2026-10-20")).toBe(0n);
    expect(lateContributionFine(s, "2026-10-18", "2026-10-21")).toBe(600n);
    expect(lateContributionFine(s, "2026-10-18", "2026-11-30")).toBe(1500n);
    expect(lateness("2026-10-18", "2026-10-19", 2)).toBe("grace");
    expect(lateness("2026-10-18", "2026-10-25", 2)).toBe("late");
  });
  it("barème respecté, pas d'auto-amende", () => {
    expect(fineAmount(s, "meeting_late", null)).toBe(200n);
    expect(code(() => fineAmount(s, "indiscipline", 5000n))).toBe("FINE_INVALID");
    expect(code(() => assertFineIssuable({ issuerIdentityId: "c", targetIdentityId: "c", reason: "retard" }))).toBe("FINE_INVALID");
    expect(suggestedSanction(0)).toBe("warning");
    expect(suggestedSanction(3)).toBe("payout_suspended");
  });
});

describe("L-08 secours", () => {
  const scale = [
    { event: "death_member" as const, amount: 100000n, maxPerYear: 0 },
    { event: "birth" as const, amount: 25000n, maxPerYear: 1 },
  ];
  it("barème appliqué, plafond annuel, hors barème motivé", () => {
    expect(code(() => assertAidScale(scale))).toBeNull();
    expect(aidAmount({ scale, event: "birth", alreadyThisYear: 0 })).toBe(25000n);
    expect(code(() => aidAmount({ scale, event: "birth", alreadyThisYear: 1 }))).toBe("AID_CAP_EXCEEDED");
    expect(code(() => aidAmount({ scale, event: "marriage", alreadyThisYear: 0 }))).toBe("AID_INVALID");
    expect(code(() => aidAmount({ scale, event: "birth", alreadyThisYear: 0, overrideAmount: 30000n }))).toBe("AID_INVALID");
    expect(aidAmount({ scale, event: "birth", alreadyThisYear: 0, overrideAmount: 30000n, overrideReason: "jumeaux" })).toBe(30000n);
    expect(code(() => aidAmount({ scale, event: "birth", alreadyThisYear: 0, overrideAmount: 60000n, overrideReason: "x x x" }))).toBe(
      "AID_CAP_EXCEEDED",
    );
    expect(code(() => assertAidDecider("a", "a"))).toBe("APPROVER_NOT_DISTINCT");
    expect(exceptionalCall(["a", "b", "c"], "b", 2000n)).toHaveLength(2);
  });
});

describe("L-10 dettes, avance, reprise", () => {
  it("dette réglée partiellement puis totalement, jamais au-delà", () => {
    let d = openDebt({ debtId: "d1", debtorMembershipId: "m", origin: "unpaid_obligation", amount: 5000n, creditorFundId: null, guarantorMembershipId: "g" });
    d = settleDebt(d, 2000n);
    expect(d.state).toBe("open");
    d = settleDebt(d, 3000n);
    expect(d.state).toBe("settled");
    expect(code(() => settleDebt(d, 1n))).toBe("DEBT_INVALID");
  });
  it("abandon motivé par une autre personne", () => {
    const d = openDebt({ debtId: "d", debtorMembershipId: "m", origin: "fund_advance", amount: 1000n, creditorFundId: "f", guarantorMembershipId: null });
    expect(code(() => writeOffDebt(d, { reason: "décès", deciderIdentityId: "x", debtorIdentityId: "x" }))).toBe("APPROVER_NOT_DISTINCT");
    expect(writeOffDebt(d, { reason: "décès", deciderIdentityId: "p", debtorIdentityId: "x" }).state).toBe("written_off");
  });
  it("remise avec impayés : avance de caisse ou pot réduit", () => {
    const base = { expectedPot: 200000n, validatedCollected: 175000n, arrears: [{ membershipId: "r", missing: 25000n }] };
    const adv = planPayoutWithArrears({ ...base, policy: "full_with_advance", advanceFundId: "operating" });
    expect(adv.payoutAmount).toBe(200000n);
    expect(adv.advanceAmount).toBe(25000n);
    expect(adv.debts[0]).toEqual({ membershipId: "r", amount: 25000n, creditorFundId: "operating" });
    const red = planPayoutWithArrears({ ...base, policy: "reduced", advanceFundId: null });
    expect(red.payoutAmount).toBe(175000n);
    expect(code(() => planPayoutWithArrears({ ...base, policy: "wait", advanceFundId: null }))).toBe("DEBT_INVALID");
    expect(code(() => planPayoutWithArrears({ ...base, validatedCollected: 1n, policy: "reduced", advanceFundId: null }))).toBe(
      "RECONCILIATION_INCOHERENTE",
    );
  });
  it("rattrapage immédiat ou étalé, somme exacte", () => {
    expect(catchUpPlan({ contribution: 25000n, roundsAlreadyPassed: 3, roundsRemaining: 5, mode: "immediate" })).toEqual([75000n]);
    const spread = catchUpPlan({ contribution: 10000n, roundsAlreadyPassed: 1, roundsRemaining: 3, mode: "spread" });
    expect(spread.reduce((a, b) => a + b, 0n)).toBe(10000n);
    expect(code(() => assertGuarantor({ newMemberIdentityId: "a", guarantorIdentityId: "a", guarantorActive: true }))).toBe("DEBT_INVALID");
  });
});

describe("L-13 ordre de passage", () => {
  const seed = "graine-de-la-premiere-seance-2026";
  it("tirage vérifiable : rejouable, refus d'une graine différente", () => {
    const c = drawCommitment(seed);
    const o1 = drawOrder(seed, c, ["a", "b", "c", "d"]);
    const o2 = drawOrder(seed, c, ["d", "c", "b", "a"]);
    expect(o1).toEqual(o2);
    expect(new Set(o1).size).toBe(4);
    expect(code(() => drawOrder("autre-graine-de-seance-xx", c, ["a", "b"]))).toBe("DRAW_INVALID");
    expect(drawWithFixed(seed, c, ["x", null, null], ["a", "b"])[0]).toBe("x");
  });
  it("échange de tours non remis, accords requis", () => {
    const slots = [
      { seq: 1, holder: "a", paid: true },
      { seq: 2, holder: "b", paid: false },
      { seq: 3, holder: "c", paid: false },
    ];
    expect(swapRounds(slots, 2, 3).map((s) => s.holder)).toEqual(["a", "c", "b"]);
    expect(code(() => swapRounds(slots, 1, 3))).toBe("ORDER_CHANGE_INVALID");
    expect(swapApprovalsComplete({ holderA: "b", holderB: "c", acceptedBy: ["b", "c"], bureauApproverId: "p" })).toBe(true);
    expect(swapApprovalsComplete({ holderA: "b", holderB: "c", acceptedBy: ["b"], bureauApproverId: "p" })).toBe(false);
    expect(swapApprovalsComplete({ holderA: "b", holderB: "c", acceptedBy: ["b", "c"], bureauApproverId: "b" })).toBe(false);
  });
  it("tour prioritaire : les déplacés sont listés", () => {
    const slots = ["a", "b", "c", "d"].map((h, i) => ({ seq: i + 1, holder: h, paid: false }));
    const r = priorityMove(slots, "d", 2);
    expect(r.slots.map((s) => s.holder)).toEqual(["a", "d", "b", "c"]);
    expect(r.displaced).toEqual(["b", "c"]);
  });
  it("les nouveaux bouffent en dernier", () => {
    expect(newcomersLast(["n1", "a", "n2", "b"], { n1: "2026-09-01", n2: "2026-09-02", a: "2025-01-01", b: "2025-02-01" }, "2026-01-01")).toEqual([
      "a",
      "b",
      "n1",
      "n2",
    ]);
  });
  it("enchères : plus forte prime, net explicite, prime partagée", () => {
    const r = settleAuction({
      pot: 200000n,
      bids: [
        { holder: "a", premium: 10000n, at: 1 },
        { holder: "b", premium: 15000n, at: 2 },
      ],
      destination: "shared_by_others",
      members: ["a", "b", "c", "d"],
    });
    expect(r.winner).toBe("b");
    expect(r.netPayout).toBe(185000n);
    expect(r.shares.reduce((s, x) => s + x.amount, 0n)).toBe(15000n);
  });
});

describe("L-14 parts multiples et partagées", () => {
  it("deux mains et une demi-part", () => {
    const shares = [
      { shareId: "p1", holders: [{ membershipId: "a", weight: 1 }] },
      { shareId: "p2", holders: [{ membershipId: "a", weight: 1 }] },
      { shareId: "p3", holders: [{ membershipId: "b", weight: 1 }, { membershipId: "c", weight: 1 }] },
    ];
    expect(code(() => assertShares(shares, ["a", "b", "c"]))).toBeNull();
    const due = memberDueForRound(shares, 10000n);
    expect(due.get("a")).toBe(20000n);
    expect(due.get("b")).toBe(5000n);
    expect(potPerRound(shares, 10000n)).toBe(30000n);
    expect(splitByWeight(10001n, shares[2]!.holders).map((x) => x.amount)).toEqual([5001n, 5000n]);
    expect(code(() => assertShares(shares, ["a", "b", "c", "d"]))).toBe("SHARES_INVALID");
    expect(oneSharePerMember(["x", "y"])).toHaveLength(2);
  });
});

describe("L-12 statuts générés", () => {
  it("le texte reflète les règles et ne promet rien", () => {
    const doc = buildStatutes({
      groupName: "Les Bâtisseurs de Logpom",
      seat: "Douala",
      purpose: null,
      cadence: { kind: "monthly_nth_weekday", nth: 2, weekday: 0 },
      meetingPlace: null,
      funds: [{ kind: "solidarity", name: "Secours", perMeetingAmount: 2000n, annualAmount: 0n }],
      rotationContribution: 25000n,
      fines: { ...DEFAULT_FINE_SCHEDULE, meetingLate: 500n, graceDays: 3 },
      aidScale: [{ event: "death_member", amount: 100000n, maxPerYear: 0 }],
      bureau: [{ role: "animator", name: "Hervé", mandateEnd: "2027-12-31" }],
      feeBearer: "beneficiary",
      transparency: "all_members",
      guarantorRequired: true,
      newcomersLast: true,
      rulesVersion: 2,
    });
    expect(doc.text).toContain("2e dimanche du mois");
    expect(doc.text).toContain("90/053");
    expect(doc.text).toContain("Président : Hervé");
    expect(doc.text).toContain("avaliseur");
    expect(forbiddenCopyIn(doc.text)).toEqual([]);
  });
});

describe("L-19 / L-21 extensions fermées", () => {
  it("drapeaux fermés par défaut", () => {
    expect(parseFeatureFlags(undefined)).toEqual([]);
    expect(parseFeatureFlags("auction, inconnu")).toEqual(["auction"]);
    expect(code(() => assertFlag([], "loan_register"))).toBe("FUND_KIND_DISABLED");
  });
  it("prêt : frais fixes, échéancier exact", () => {
    const s = loanSchedule({ principal: 100000n, participationFee: 5000n, installments: 4, guarantorMembershipId: null });
    expect(s.reduce((a, b) => a + b, 0n)).toBe(105000n);
  });
  it("collecteur : commission d'une journée", () => {
    expect(collectorPayout({ dailyAmount: 1000n, daysCollected: 30, commissionDays: 1 })).toEqual({
      collected: 30000n,
      commission: 1000n,
      returned: 29000n,
    });
  });
});

describe("L-20 import de l'ancienne application", () => {
  it("accepte les lignes saines, rapporte les autres", () => {
    const plan = planLegacyImport({
      id: "nj1",
      name: "Njangi des collègues",
      members: [
        { uid: "u1", name: "Aïcha", phone: "+237677000000", role: "Trésorier" },
        { uid: "u1", name: "Doublon" },
        { uid: "u2", name: "Hervé" },
      ],
      contributions: [
        { id: "c1", uid: "u1", amount: 25000, date: "2026-03-01", status: "confirmed" },
        { id: "c2", uid: "u9", amount: 25000, date: "2026-03-01" },
        { id: "c3", uid: "u2", amount: 12.5, date: "2026-03-01" },
      ],
    });
    expect(plan.members).toHaveLength(2);
    expect(plan.contributions).toHaveLength(1);
    expect(plan.report.filter((r) => !r.accepted)).toHaveLength(3);
    expect(mapLegacyRole("Trésorier")).toBe("treasurer");
    expect(mapLegacyRole("président")).toBe("animator");
  });
});

describe("I-01 règles de copie", () => {
  it("détecte les promesses interdites", () => {
    expect(forbiddenCopyIn("Épargne & Tontine")).not.toEqual([]);
    expect(forbiddenCopyIn("Vos fonds sont protégés")).not.toEqual([]);
    expect(forbiddenCopyIn("Ce qui est validé par le serveur")).not.toEqual([]);
    expect(forbiddenCopyIn("KÓMBE ne garde pas votre argent.")).toEqual([]);
  });
});

describe("réserve de fin d'année", () => {
  it("rend à chacun ce qu'il a versé quand le registre couvre tout", () => {
    const out = reserveDistribution(
      [
        { membershipId: "a", contributed: 60000n, received: 0n },
        { membershipId: "b", contributed: 30000n, received: 10000n },
        { membershipId: "c", contributed: 0n, received: 0n },
      ],
      100000n,
    );
    expect(out).toEqual([
      { membershipId: "a", amount: 60000n },
      { membershipId: "b", amount: 20000n },
    ]);
  });
  it("partage au prorata en francs entiers, sans perte ni excès", () => {
    const out = reserveDistribution(
      [
        { membershipId: "a", contributed: 10000n, received: 0n },
        { membershipId: "b", contributed: 10000n, received: 0n },
        { membershipId: "c", contributed: 10000n, received: 0n },
      ],
      10000n,
    );
    expect(out.reduce((s, x) => s + x.amount, 0n)).toBe(10000n);
    expect(out.map((x) => x.amount).sort()).toEqual([3333n, 3333n, 3334n]);
  });
  it("ne distribue rien sans écart", () => {
    expect(reserveDistribution([{ membershipId: "a", contributed: 5n, received: 0n }], 0n)).toEqual([]);
  });
});
