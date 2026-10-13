/**
 * Décisions votées (ADR-0038) : majorité absolue des électeurs, délai de
 * défense pour la destitution et l'exclusion, pause sur la cadence réelle.
 */
import { describe, expect, it } from "vitest";
import {
  DECISION_KINDS,
  DECISION_LABELS,
  DECISION_OPENERS,
  DomainError,
  assertDecisionWindow,
  canAct,
  planPayoutWithArrears,
  shiftedRoundDates,
  tallyDecision,
  targetExcludedFromElectorate,
} from "../src/index.js";

const base = { electorate: 9, yes: 0, no: 0, abstain: 0, windowElapsed: false } as const;

describe("tallyDecision", () => {
  it("adopte à la majorité absolue des électeurs, pas des votants", () => {
    expect(tallyDecision({ ...base, kind: "pause", yes: 4, no: 0 })).toBe("pending");
    expect(tallyDecision({ ...base, kind: "pause", yes: 5 })).toBe("adopted");
    // 3 oui contre 1 non mais 9 électeurs : rien n'est acquis à l'échéance.
    expect(tallyDecision({ ...base, kind: "pause", yes: 3, no: 1, windowElapsed: true })).toBe("rejected");
  });

  it("protège la personne visée : pas d'exclusion avant l'échéance", () => {
    expect(tallyDecision({ ...base, kind: "exclusion", yes: 6 })).toBe("pending");
    expect(tallyDecision({ ...base, kind: "removal", yes: 6, windowElapsed: true })).toBe("adopted");
    expect(tallyDecision({ ...base, kind: "exclusion", yes: 6, no: 3 })).toBe("adopted"); // tous ont voté
  });

  it("constate un rejet dès qu'il est certain", () => {
    expect(tallyDecision({ ...base, kind: "exclusion", no: 5 })).toBe("rejected");
    expect(tallyDecision({ ...base, kind: "pause", no: 4, abstain: 1 })).toBe("rejected");
    expect(tallyDecision({ ...base, kind: "pause", no: 4 })).toBe("pending");
  });

  it("refuse un décompte incohérent", () => {
    expect(() => tallyDecision({ ...base, kind: "pause", yes: 10 })).toThrow(DomainError);
    expect(() => tallyDecision({ ...base, kind: "pause", electorate: 0 })).toThrow(DomainError);
  });
});

describe("règles d'ouverture", () => {
  it("fenêtre minimale de 72 h pour destitution et exclusion", () => {
    expect(() => assertDecisionWindow("exclusion", 48)).toThrow(DomainError);
    expect(() => assertDecisionWindow("removal", 72)).not.toThrow();
    expect(() => assertDecisionWindow("pause", 24)).not.toThrow();
    expect(() => assertDecisionWindow("pause", 400)).toThrow(DomainError);
  });

  it("tout membre peut demander une destitution ; l'exclusion part de la présidence", () => {
    expect(canAct(["member"], DECISION_OPENERS.removal)).toBe(true);
    expect(canAct(["member"], DECISION_OPENERS.exclusion)).toBe(false);
    expect(canAct(["animator"], DECISION_OPENERS.exclusion)).toBe(true);
    expect(canAct(["censor"], DECISION_OPENERS.payout_suspension)).toBe(true);
  });

  it("la personne visée ne vote pas sur son sort", () => {
    expect(targetExcludedFromElectorate("exclusion")).toBe(true);
    expect(targetExcludedFromElectorate("pause")).toBe(false);
  });

  it("chaque décision a un libellé FR et EN", () => {
    for (const k of DECISION_KINDS) expect(DECISION_LABELS[k].fr.length * DECISION_LABELS[k].en.length).toBeGreaterThan(0);
  });
});

describe("pause", () => {
  it("décale les tours d'autant d'occurrences de la cadence", () => {
    const weekly = { kind: "weekly", weekday: 0 } as const;
    expect(shiftedRoundDates(weekly, "2026-10-18", 3, 2)).toEqual(["2026-11-01", "2026-11-08", "2026-11-15"]);
  });

  it("borne la pause de 1 à 6 séances", () => {
    const weekly = { kind: "weekly", weekday: 0 } as const;
    expect(() => shiftedRoundDates(weekly, "2026-10-18", 3, 0)).toThrow(DomainError);
    expect(() => shiftedRoundDates(weekly, "2026-10-18", 3, 7)).toThrow(DomainError);
  });
});

describe("remise d'un tour complet", () => {
  it("n'exige pas de caisse d'avance quand personne ne manque (association sans caisse de fonctionnement)", () => {
    const plan = planPayoutWithArrears({ policy: "full_with_advance", expectedPot: 25000n, validatedCollected: 25000n, arrears: [], advanceFundId: null });
    expect(plan.payoutAmount).toBe(25000n);
    expect(() =>
      planPayoutWithArrears({ policy: "full_with_advance", expectedPot: 25000n, validatedCollected: 20000n, arrears: [{ membershipId: "m", missing: 5000n }], advanceFundId: null }),
    ).toThrow(DomainError);
  });
});
