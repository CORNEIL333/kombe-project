/**
 * Tests d'invariants purs du calendrier C05 (N tours / N membres, bénéficiaire
 * unique, obligation membre/tour, dates métier bornées, instants UTC, ordre figé
 * après démarrage, départ sans réaffectation de dette, renouvellement). Aucune
 * persistance, aucune base : ces règles sont indépendantes de PostgreSQL.
 */
import { describe, expect, it } from "vitest";
import {
  DomainError,
  buildSchedule,
  businessDateFor,
  businessDateToUtcMs,
  assertUniqueMemberRound,
  assertScheduleStartable,
  startSchedule,
  reassignBeneficiary,
  applyDeparture,
  planRenewal,
  type BuildScheduleParams,
  type CycleSchedule,
  type RuleSet,
} from "../src/index.js";

const codes = (fn: () => unknown): string | null => {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof DomainError ? e.code : "NOT_DOMAIN";
  }
};

const members = (n: number) => Array.from({ length: n }, (_, i) => `m${i + 1}`);

function build(over: Partial<BuildScheduleParams> = {}): CycleSchedule {
  return buildSchedule({
    groupId: "g1",
    ruleVersion: 1,
    members: members(10),
    contribution: 5000n,
    frequency: "monthly",
    dueDay: 5,
    startYear: 2028,
    startMonth: 1,
    beneficiaryOrder: members(10),
    pilot: true,
    ...over,
  });
}

function ruleWith(over: Partial<RuleSet> = {}): RuleSet {
  return {
    memberCount: 10,
    contribution: 5000n,
    rounds: 10,
    frequency: "monthly",
    dueDay: 5,
    quorum: { numerator: 2, denominator: 3 },
    gracePeriodDays: 0,
    penaltyEnabled: false,
    ...over,
  };
}

describe("C05-SCHEDULE — N tours pour N membres, totaux oracle (5.1)", () => {
  it("10 membres à 5000 sur 10 tours ⇒ cycle_expected_total = 500000", () => {
    const s = build();
    expect(s.cycleExpectedTotal).toBe(500_000n);
    expect(s.rounds).toBe(10);
    expect(s.roundPot).toBe(50_000n);
    expect(s.schedule.length).toBe(10);
    // une obligation par membre et par tour ⇒ 100 obligations ; chacune à 5000.
    const all = s.schedule.flatMap((r) => r.obligations);
    expect(all.length).toBe(100);
    expect(all.reduce((a, o) => a + o.amount, 0n)).toBe(500_000n);
  });

  it("un bénéficiaire distinct par tour (rotation égale)", () => {
    const s = build();
    const beneficiaries = s.schedule.map((r) => r.beneficiaryId);
    expect(new Set(beneficiaries).size).toBe(10);
  });
});

describe("C05-MONTH — quantième ramené au dernier jour réel du mois (5.2)", () => {
  it("mensuel 31 janv. 2028 puis févr. ⇒ second_due_date = 2028-02-29 (bissextil)", () => {
    const s = build({ dueDay: 31 });
    expect(s.schedule[0]!.dueDate).toBe("2028-01-31");
    expect(s.schedule[1]!.dueDate).toBe("2028-02-29");
  });

  it("décalage annuel : déc. 2028 → janv. 2029 (roue des mois)", () => {
    const s = build({ dueDay: 31, startMonth: 12 });
    expect(s.schedule[0]!.dueDate).toBe("2028-12-31");
    expect(s.schedule[1]!.dueDate).toBe("2029-01-31");
  });

  it("businessDateFor hebdomadaire : pas de 7 jours", () => {
    const d = businessDateFor(
      { frequency: "weekly", dueDay: 31, startYear: 2028, startMonth: 1 },
      2,
    );
    expect(d).toBe("2028-02-07");
  });

  it("instant UTC persisté = 12:00 Africa/Douala (UTC+1) = 11:00 UTC", () => {
    expect(businessDateToUtcMs("2028-01-31")).toBe(Date.UTC(2028, 0, 31, 11, 0, 0));
    const s = build();
    expect(s.schedule[0]!.dueAtMs).toBe(Date.UTC(2028, 0, 5, 11, 0, 0));
  });

  it("chaque obligation porte la date et la version de règle de son tour (5.2)", () => {
    const s = build({ ruleVersion: 7 });
    for (const r of s.schedule) {
      for (const o of r.obligations) {
        expect(o.ruleVersion).toBe(7);
        expect(o.dueDate).toBe(r.dueDate);
        expect(o.dueAtMs).toBe(r.dueAtMs);
      }
    }
  });
});

describe("C05-UNIQUE — refus de deux tours au même bénéficiaire (5.3)", () => {
  it("bénéficiaire dupliqué ⇒ SCHEDULE_BENEFICIARY_DUPLICATE", () => {
    const order = members(10);
    order[1] = order[0]!; // deux tours pour m1
    expect(codes(() => build({ beneficiaryOrder: order }))).toBe("SCHEDULE_BENEFICIARY_DUPLICATE");
  });

  it("bénéficiaire étranger au groupe ⇒ SCHEDULE_MEMBER_UNKNOWN", () => {
    const order = members(10);
    order[3] = "x_hors_groupe";
    expect(codes(() => build({ beneficiaryOrder: order }))).toBe("SCHEDULE_MEMBER_UNKNOWN");
  });

  it("nombre de bénéficiaires ≠ nombre de tours ⇒ SCHEDULE_ROUNDS_MISMATCH", () => {
    expect(codes(() => build({ beneficiaryOrder: members(9) }))).toBe("SCHEDULE_ROUNDS_MISMATCH");
  });

  it("membres dupliqués dans le groupe ⇒ SCHEDULE_MEMBER_UNKNOWN", () => {
    const ms = members(10);
    ms[5] = ms[0]!;
    expect(codes(() => build({ members: ms }))).toBe("SCHEDULE_MEMBER_UNKNOWN");
  });
});

describe("C05 — unicité structurelle membre/tour", () => {
  it("le calendrier construit ne présente aucune doublure membre/tour", () => {
    const s = build();
    expect(codes(() => assertUniqueMemberRound(s.schedule.flatMap((r) => r.obligations)))).toBeNull();
  });

  it("assertUniqueMemberRound refuse une doublure", () => {
    const o = {
      obligationId: "a",
      roundSeq: 1,
      memberId: "m1",
      amount: 5000n,
      dueDate: "2028-01-05",
      dueAtMs: 0,
      ruleVersion: 1,
    };
    expect(codes(() => assertUniqueMemberRound([o, o]))).toBe("SCHEDULE_OBLIGATION_DUPLICATE");
  });
});

describe("C05 — démarrage complet puis ordre figé (5.1, 5.3)", () => {
  it("démarrage acceptable puis gel ; redémarrage refusé", () => {
    const s = build();
    expect(codes(() => assertScheduleStartable(s))).toBeNull();
    const started = startSchedule(s);
    expect(started.state).toBe("started");
    expect(codes(() => startSchedule(started))).toBe("SCHEDULE_FROZEN");
  });

  it("réassignation après démarrage refusée (SCHEDULE_FROZEN)", () => {
    const started = startSchedule(build());
    expect(codes(() => reassignBeneficiary(started, 1, "m5"))).toBe("SCHEDULE_FROZEN");
  });

  it("réassignation sur brouillon produisant une doublure refusée", () => {
    // m1 est déjà bénéficiaire du tour 1 ; le réaffecter au tour 2 duplique.
    expect(codes(() => reassignBeneficiary(build(), 2, "m1"))).toBe("SCHEDULE_BENEFICIARY_DUPLICATE");
  });
});

describe("C05 — départ sans réaffectation de dette (contrainte 5.x)", () => {
  it("le départ conserve les tours et la dette du partant, sans réaffectation", () => {
    const s = build();
    const view = applyDeparture(s, "m3");
    expect(view.roundsUnchanged).toBe(true);
    expect(view.debtReassigned).toBe(false);
    expect(view.retainedObligations).toBe(10); // une obligation par tour pour m3
  });
});

describe("C05 — renouvellement à partir de la version acceptée (5.5)", () => {
  it("engagement essentiel changé ⇒ nouvelles acceptations requises", () => {
    const plan = planRenewal(ruleWith(), ruleWith({ contribution: 6000n }), 1, 2);
    expect(plan.essentialChange).toBe(true);
    expect(plan.requiresNewAcceptances).toBe(true);
    expect(plan.historyPreserved).toBe(true);
  });

  it("changement non essentiel ⇒ pas de nouvelles acceptations", () => {
    const plan = planRenewal(ruleWith(), ruleWith({ dueDay: 10 }), 1, 2);
    expect(plan.essentialChange).toBe(false);
    expect(plan.requiresNewAcceptances).toBe(false);
  });
});
