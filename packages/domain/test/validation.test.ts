/**
 * Tests d'invariants purs C07 — validations et corrections de cotisations.
 * Logique sans HTTP ni base : machine à états, indépendance (anti-collusion),
 * compensation unique, contestation (fenêtre + gel des dépendances).
 */
import { describe, expect, it } from "vitest";
import {
  DomainError,
  ORDINARY_DISPUTE_WINDOW_SECONDS,
  assertDependentOperationsNotBlocked,
  assertValidationNotBlocked,
  compensateContribution,
  confirmContribution,
  controlContribution,
  newContribution,
  raiseDispute,
  rejectContribution,
  type ContributionRecord,
  type Dispute,
  type RaiseDisputeInput,
} from "../src/index.js";

/** Code d'erreur domaine levé par `fn` (null si aucune), style du socle C00. */
const codes = (fn: () => unknown): string | null => {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof DomainError ? e.code : "NOT_DOMAIN";
  }
};

function contrib(over: Partial<ContributionRecord> = {}): ContributionRecord {
  return {
    contributionId: "c1",
    obligationId: "g1_r1_m2",
    groupId: "grp1",
    amountMinor: 3000n,
    declarantIdentityId: "idn_treasurer",
    state: "declared",
    requiredControllers: 0,
    confirmerIdentityId: null,
    controllerIdentityIds: [],
    compensatedById: null,
    ...over,
  };
}

function dispute(over: Partial<RaiseDisputeInput> = {}): Dispute {
  return raiseDispute({
    disputeId: "dsp1",
    groupId: "grp1",
    obligationId: "g1_r1_m2",
    reason: "montant errone",
    category: "ordinary",
    raisedBy: "idn_member",
    notifiedAt: 1_000,
    raisedAt: 1_000 + ORDINARY_DISPUTE_WINDOW_SECONDS,
    ...over,
  });
}

describe("C07 — machine à états et construction", () => {
  it("nouvelle cotisation démarre en declaration", () => {
    expect(
      newContribution({
        contributionId: "c1",
        obligationId: "g1_r1_m2",
        groupId: "grp1",
        amountMinor: 3000n,
        declarantIdentityId: "idn_treasurer",
        requiredControllers: 0,
      }).state,
    ).toBe("declared");
  });

  it("nombre de controleurs requis invalide est refuse", () => {
    expect(
      codes(() =>
        newContribution({
          contributionId: "c1",
          obligationId: "g1_r1_m2",
          groupId: "grp1",
          amountMinor: 3000n,
          declarantIdentityId: "idn_treasurer",
          requiredControllers: -1,
        }),
      ),
    ).toBe("CONTRIBUTION_STATE_INVALID");
  });

  it("confirmation sur un etat non-declare est refusee", () => {
    expect(codes(() => confirmContribution(contrib({ state: "validated" }), "idn_x"))).toBe(
      "CONTRIBUTION_STATE_INVALID",
    );
  });
});

describe("C07-SELF — indépendance déclarant / confirmateur (6.3, 6.4)", () => {
  it("le déclarant qui confirme sa propre déclaration n'est pas accepté", () => {
    const r = confirmContribution(contrib(), "idn_treasurer");
    expect(r.validationAccepted).toBe(false);
    expect(r.reason).toBe("SELF_DECLARANT");
    // Aucune écriture : l'enregistrement est inchangé (toujours declared).
    expect(r.record.state).toBe("declared");
    expect(r.record.confirmerIdentityId).toBeNull();
  });

  it("confirmation par un acteur distinct valide atomiquement si aucun contrôleur requis", () => {
    const r = confirmContribution(contrib({ requiredControllers: 0 }), "idn_auditor");
    expect(r.validationAccepted).toBe(true);
    expect(r.validationCompleted).toBe(true);
    expect(r.record.state).toBe("validated");
  });
});

describe("C07-TRIPLE — troisième contrôleur distinct (6.3)", () => {
  it("confirmation laisse en attente de contrôleur requis", () => {
    const r = confirmContribution(contrib({ requiredControllers: 1 }), "idn_auditor");
    expect(r.validationAccepted).toBe(true);
    expect(r.validationCompleted).toBe(false);
    expect(r.reason).toBe("AWAITING_CONTROLLERS");
    expect(r.record.state).toBe("confirmed");
  });

  it("le même acteur qui a confirmé ne peut contrôler (validation non acceptée)", () => {
    const confirmed = confirmContribution(contrib({ requiredControllers: 1 }), "idn_auditor").record;
    const r = controlContribution(confirmed, "idn_auditor");
    expect(r.validationAccepted).toBe(false);
    expect(r.reason).toBe("ACTOR_ALREADY_ACTED");
    expect(r.record.state).toBe("confirmed");
    expect(r.record.controllerIdentityIds).toHaveLength(0);
  });

  it("un contrôleur distinct parachève la validation", () => {
    const confirmed = confirmContribution(
      contrib({ requiredControllers: 1, contributionId: "c1" }),
      "idn_auditor",
    ).record;
    const r = controlContribution(confirmed, "idn_secretary");
    expect(r.validationAccepted).toBe(true);
    expect(r.validationCompleted).toBe(true);
    expect(r.record.state).toBe("validated");
  });

  it("contrôle sur un état non-confirmé est refusé", () => {
    expect(codes(() => controlContribution(contrib({ requiredControllers: 1 }), "idn_x"))).toBe(
      "CONTRIBUTION_STATE_INVALID",
    );
  });

  it("le déclarant ne peut se substituer comme contrôleur", () => {
    const confirmed = confirmContribution(contrib({ requiredControllers: 1 }), "idn_auditor").record;
    const r = controlContribution(confirmed, "idn_treasurer");
    expect(r.validationAccepted).toBe(false);
    expect(r.reason).toBe("SELF_DECLARANT");
  });
});

describe("C07 — rejet avant validation seulement (6.2)", () => {
  it("rejet d'une déclaration en attente est permis", () => {
    expect(rejectContribution(contrib()).state).toBe("rejected");
  });
  it("rejet après validation est interdit", () => {
    expect(codes(() => rejectContribution(contrib({ state: "validated" })))).toBe(
      "CONTRIBUTION_STATE_INVALID",
    );
  });
});

describe("C07-REVERSE — compensation unique de l'original (6.2, 6.6)", () => {
  it("compensation d'un original validé lie une contre-écriture", () => {
    const validated = contrib({ state: "validated" });
    const { original, reversal } = compensateContribution(validated, "c1_reversal");
    expect(original.state).toBe("compensated");
    expect(original.compensatedById).toBe("c1_reversal");
    expect(reversal.obligationId).toBe(validated.obligationId);
    expect(reversal.amountMinor).toBe(validated.amountMinor);
  });

  it("second compensation du même original est refusée ⇒ reversal_count borne a 1", () => {
    const validated = contrib({ state: "validated" });
    const once = compensateContribution(validated, "c1_reversal").original;
    // La seconde course voit un original déjà compensé : refus, aucune seconde
    // contre-écriture (sérialisation réelle = verrou DB, BLOCKED).
    expect(codes(() => compensateContribution(once, "c1_reversal_2"))).toBe(
      "CONTRIBUTION_ALREADY_COMPENSATED",
    );
    expect(once.compensatedById).toBe("c1_reversal");
  });

  it("compensation avant validation est interdite", () => {
    expect(codes(() => compensateContribution(contrib(), "x"))).toBe("CONTRIBUTION_STATE_INVALID");
  });
});

describe("C07 — contestation / litige (6.5)", () => {
  it("motif obligatoire", () => {
    expect(codes(() => dispute({ reason: "   " }))).toBe("DISPUTE_REASON_REQUIRED");
  });

  it("ordinaire dans la fenêtre de 7 jours est recevable", () => {
    const d = dispute({ raisedAt: 1_000 + ORDINARY_DISPUTE_WINDOW_SECONDS });
    expect(d.state).toBe("open");
  });

  it("ordinaire hors fenêtre est refusé", () => {
    expect(
      codes(() => dispute({ raisedAt: 1_000 + ORDINARY_DISPUTE_WINDOW_SECONDS + 1 })),
    ).toBe("DISPUTE_WINDOW_CLOSED");
  });

  it("fraude hors fenêtre ordinaire reste signalable (toujours possible)", () => {
    const d = dispute({
      category: "fraud",
      raisedAt: 1_000 + ORDINARY_DISPUTE_WINDOW_SECONDS * 40,
    });
    expect(d.state).toBe("open");
  });

  it("avant validation, un litige ouvert bloque la validation", () => {
    expect(codes(() => assertValidationNotBlocked([dispute()], "g1_r1_m2", "confirmed"))).toBe(
      "VALIDATION_BLOCKED_BY_DISPUTE",
    );
  });

  it("après validation, la validation n'est plus bloquée (écriture conservée)", () => {
    expect(codes(() => assertValidationNotBlocked([dispute()], "g1_r1_m2", "validated"))).toBeNull();
  });

  it("après validation, un litige ouvert gèle les opérations dépendantes", () => {
    expect(codes(() => assertDependentOperationsNotBlocked([dispute()], "g1_r1_m2"))).toBe(
      "ROUND_CLOSE_BLOCKED_BY_DISPUTE",
    );
  });

  it("un litige résolu ne gèle plus rien", () => {
    const resolved: Dispute = { ...dispute(), state: "resolved" };
    expect(codes(() => assertDependentOperationsNotBlocked([resolved], "g1_r1_m2"))).toBeNull();
  });
});
