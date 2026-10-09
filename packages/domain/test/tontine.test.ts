/**
 * Tests de la dérive produit d'amorçage (C03 §2.1–2.4, C05 §5.3, C21 §2.5) :
 * modèles de tontine, typologie de rotation à garde fermée, devise/fuseau du
 * pilote, hiérarchie parent/enfant anti-cycle, parrainage, et multi-adhésion.
 * Logique pure uniquement — la persistance/RLS relève des preuves base réelle.
 */
import { describe, expect, it } from "vitest";
import {
  DomainError,
  TONTINE_MODELS,
  ROTATION_TYPES,
  PILOT_TIMEZONE,
  isTontineModel,
  modelPreset,
  isRotationType,
  rotationTypeSupportedAtPilot,
  assertGroupDefaults,
  MAX_PARENT_DEPTH,
  MAX_CHILD_GROUPS,
  assertParentAssignable,
  assertChildCapacity,
  assertSupervisionIsNotFinancialRight,
  requestSponsorship,
  decideSponsorship,
  withdrawSponsorship,
  consolidateCommitments,
  type MemberCommitment,
} from "../src/index.js";

const codes = (fn: () => unknown): string | null => {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof DomainError ? e.code : "NOT_DOMAIN";
  }
};

const T0 = 1_700_000_000;

describe("2.2 modèles de tontine", () => {
  it("couvre les six modèles canoniques", () => {
    expect(TONTINE_MODELS).toEqual([
      "famille",
      "collegues",
      "fetes",
      "construction",
      "etudiant",
      "personnalise",
    ]);
  });

  it("chaque modèle pré-remplit une règle opérationnelle valide, sans montant", () => {
    for (const m of TONTINE_MODELS) {
      const p = modelPreset(m);
      expect(p.model).toBe(m);
      expect(["monthly", "weekly"]).toContain(p.frequency);
      expect(p.dueDay).toBeGreaterThanOrEqual(1);
      expect(p.dueDay).toBeLessThanOrEqual(31);
      expect(p.gracePeriodDays).toBeGreaterThanOrEqual(0);
      expect(typeof p.penaltyEnabled).toBe("boolean");
      expect(p.quorumNumerator).toBeLessThanOrEqual(p.quorumDenominator);
      expect(p.quorumDenominator).toBeGreaterThanOrEqual(1);
    }
  });

  it("'personnalise' est la page vierge (blank)", () => {
    expect(modelPreset("personnalise").blank).toBe(true);
    expect(modelPreset("famille").blank).toBe(false);
  });

  it("refuse un modèle inconnu (erreur stable)", () => {
    expect(codes(() => modelPreset("crypto"))).toBe("TONTINE_MODEL_UNKNOWN");
    expect(isTontineModel("famille")).toBe(true);
    expect(isTontineModel("inconnu")).toBe(false);
  });
});

describe("2.3 typologie de rotation", () => {
  it("ne démarre au pilote que la rotation fermée égale", () => {
    expect(ROTATION_TYPES).toContain("rotative_fermee");
    expect(rotationTypeSupportedAtPilot("rotative_fermee")).toBe(true);
    expect(rotationTypeSupportedAtPilot("tirage")).toBe(false);
    expect(rotationTypeSupportedAtPilot("negocie")).toBe(false);
    expect(rotationTypeSupportedAtPilot("bidon")).toBe(false);
    expect(isRotationType("tirage")).toBe(true);
  });

  it("accepte les defaults du pilote (XAF / Africa/Douala / rotation fermée)", () => {
    expect(
      codes(() =>
        assertGroupDefaults({
          currency: "XAF",
          timezone: PILOT_TIMEZONE,
          rotationType: "rotative_fermee",
        }),
      ),
    ).toBe(null);
  });

  it("échoue fermé sur devise, fuseau, typologie inconnue ou typologie P1", () => {
    expect(
      codes(() => assertGroupDefaults({ currency: "EUR", timezone: PILOT_TIMEZONE, rotationType: "rotative_fermee" })),
    ).toBe("GROUP_CURRENCY_UNSUPPORTED");
    expect(
      codes(() => assertGroupDefaults({ currency: "XAF", timezone: "UTC", rotationType: "rotative_fermee" })),
    ).toBe("GROUP_TIMEZONE_UNSUPPORTED");
    expect(
      codes(() => assertGroupDefaults({ currency: "XAF", timezone: PILOT_TIMEZONE, rotationType: "????" })),
    ).toBe("ROTATION_TYPE_UNKNOWN");
    expect(
      codes(() => assertGroupDefaults({ currency: "XAF", timezone: PILOT_TIMEZONE, rotationType: "tirage" })),
    ).toBe("ROTATION_TYPE_NOT_READY");
  });
});

describe("C21 hiérarchie parent / enfant", () => {
  it("interdit l'auto-parent et le cycle", () => {
    expect(
      codes(() => assertParentAssignable({ groupId: "g1", parentId: "g1", ancestorIds: [] })),
    ).toBe("GROUP_PARENT_SELF_FORBIDDEN");
    expect(
      codes(() => assertParentAssignable({ groupId: "g1", parentId: "g2", ancestorIds: ["g2", "g3"] })),
    ).toBe("GROUP_PARENT_CYCLE");
  });

  it("borne la profondeur de la chaîne de supervision", () => {
    const ancestors = Array.from({ length: MAX_PARENT_DEPTH - 1 }, (_, i) => `p${i}`);
    // parent + chaîne + soi dépasse MAX_PARENT_DEPTH
    expect(
      codes(() => assertParentAssignable({ groupId: "leaf", parentId: "newParent", ancestorIds: ancestors })),
    ).toBe("GROUP_PARENT_DEPTH_EXCEEDED");
    // une chaîne d'une seulement sous la limite passe
    expect(
      codes(() => assertParentAssignable({ groupId: "leaf", parentId: "newParent", ancestorIds: ancestors.slice(0, ancestors.length - 1) })),
    ).toBe(null);
  });

  it("plafonne la taille du portefeuille supervisé", () => {
    expect(codes(() => assertChildCapacity(MAX_CHILD_GROUPS - 1))).toBe(null);
    expect(codes(() => assertChildCapacity(MAX_CHILD_GROUPS))).toBe("GROUP_PARENT_DEPTH_EXCEEDED");
  });

  it("la supervision ne confère aucun droit financier", () => {
    expect(codes(() => assertSupervisionIsNotFinancialRight())).toBe("SUPERVISOR_FINANCIAL_FORBIDDEN");
  });
});

describe("parrainage / cooptation", () => {
  const base = {
    sponsorshipId: "sp1",
    groupId: "g1",
    candidateId: "cand",
    sponsorId: "spon",
    now: T0,
  };

  it("ouvre une demande si le parrain est membre actif", () => {
    const s = requestSponsorship({ ...base, sponsorIsActiveMember: true });
    expect(s.state).toBe("requested");
    expect(s.sponsorId).toBe("spon");
    expect(s.decidedAt).toBeNull();
  });

  it("refuse l'auto-parrainage et un parrain non membre", () => {
    expect(
      codes(() => requestSponsorship({ ...base, candidateId: "spon", sponsorIsActiveMember: true })),
    ).toBe("SPONSOR_SELF_FORBIDDEN");
    expect(codes(() => requestSponsorship({ ...base, sponsorIsActiveMember: false }))).toBe(
      "SPONSOR_NOT_ACTIVE_MEMBER",
    );
  });

  it("transitions tranchées et refus de re-trancher un terminal", () => {
    const open = requestSponsorship({ ...base, sponsorIsActiveMember: true });
    const endorsed = decideSponsorship(open, "endorsed", T0 + 10);
    expect(endorsed.state).toBe("endorsed");
    expect(endorsed.decidedAt).toBe(T0 + 10);
    expect(codes(() => decideSponsorship(endorsed, "rejected", T0 + 20))).toBe("SPONSORSHIP_STATE_INVALID");
    expect(codes(() => withdrawSponsorship(endorsed, T0 + 20))).toBe("SPONSORSHIP_STATE_INVALID");
  });

  it("retrait possible tant que demandé", () => {
    const open = requestSponsorship({ ...base, sponsorIsActiveMember: true });
    const w = withdrawSponsorship(open, T0 + 5);
    expect(w.state).toBe("withdrawn");
  });
});

describe("C21 §2.5 multi-adhésion consolidée", () => {
  it("additionne exactement (bigint) et prend l'échéance la plus proche", () => {
    const commitments: MemberCommitment[] = [
      { groupId: "gA", groupName: "A", nextDueAtUtc: T0 + 100, amountDue: 5000n },
      { groupId: "gB", groupName: "B", nextDueAtUtc: T0 + 50, amountDue: 3000n },
      { groupId: "gC", groupName: "C", nextDueAtUtc: T0 + 200, amountDue: 2000n },
    ];
    const out = consolidateCommitments(commitments);
    expect(out.totalDue).toBe(10000n);
    expect(out.nextDueAtUtc).toBe(T0 + 50);
    expect(out.groupCount).toBe(3);
  });

  it("liste vide = total 0, aucune échéance", () => {
    const out = consolidateCommitments([]);
    expect(out.totalDue).toBe(0n);
    expect(out.nextDueAtUtc).toBeNull();
    expect(out.groupCount).toBe(0);
  });

  it("permet le cumul sans plafond implicite (un membre, N tontines)", () => {
    const many: MemberCommitment[] = Array.from({ length: 12 }, (_, i) => ({
      groupId: `g${i}`,
      groupName: `G${i}`,
      nextDueAtUtc: T0 + i,
      amountDue: 1000n,
    }));
    expect(consolidateCommitments(many).groupCount).toBe(12);
    expect(consolidateCommitments(many).totalDue).toBe(12000n);
  });
});
