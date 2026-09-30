/**
 * Tests d'invariants purs C08 — décaissements, frais, rapprochement et clôture.
 * Logique sans HTTP ni base : machine à états du décaissement, **séparation des
 * pouvoirs** (le bénéficiaire ne déclare pas le sien), indépendance du contrôle,
 * **contre-écriture unique** d'une correction, **grand livre** distinct pot /
 * personnel, et **décision de clôture** adossée à l'**oracle indépendant**
 * `reconciliation` (C00). Les scénarios BALANCE / GAP / CORRECTION du prompt
 * C08 sont observés ici par des actions réelles du composant, JAMAIS par une
 * constante lue dans un fichier d'attentes. La sérialisation concurrente des
 * contre-écritures sous verrou et l'atomicité relèvent de PostgreSQL — BLOCKED.
 */
import { describe, expect, it } from "vitest";
import {
  DomainError,
  approveDisbursementReversal,
  confirmDisbursement,
  controlDisbursement,
  declareDisbursement,
  feeLedger,
  reconcileRound,
  requestDisbursementReversal,
  stopGroupWithDiscrepancies,
  sumGroupFees,
  sumNetDisbursed,
  type DeclareDisbursementInput,
  type DisbursementRecord,
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

/** Déclaration minimale valide : déclarant distinct du bénéficiaire (6.10). */
function declare(over: Partial<DeclareDisbursementInput> = {}): DisbursementRecord {
  return declareDisbursement({
    disbursementId: "d1",
    groupId: "grp1",
    roundId: "r1",
    obligationId: "g1_r1_b2",
    beneficiaryIdentityId: "idn_benef",
    declarantIdentityId: "idn_treasurer",
    netAmount: 49000n,
    groupFees: 1000n,
    requiredControllers: 0,
    allegedDate: 1_000,
    serverDate: 2_000,
    ...over,
  });
}

/** Mène un décaissement à `completed` (déclaration + confirmation bénéficiaire). */
function completed(over: Partial<DeclareDisbursementInput> = {}): DisbursementRecord {
  const d = declare(over);
  return confirmDisbursement(d, d.beneficiaryIdentityId).record;
}

describe("C08 — déclaration et séparation des pouvoirs (6.10)", () => {
  it("une déclaration naît en demande, reversalCount 0, refundedExternally false", () => {
    const d = declare();
    expect(d.state).toBe("requested");
    expect(d.reversalCount).toBe(0);
    expect(d.refundedExternally).toBe(false);
    expect(d.beneficiaryConfirmedBy).toBeNull();
  });

  it("le bénéficiaire ne déclare pas son propre décaissement ⇒ suppléant requis", () => {
    expect(
      codes(() =>
        declare({ declarantIdentityId: "idn_benef", beneficiaryIdentityId: "idn_benef" }),
      ),
    ).toBe("DISBURSEMENT_SUBSTITUTE_REQUIRED");
  });

  it("nombre de contrôleurs requis invalide est refusé", () => {
    expect(codes(() => declare({ requiredControllers: -1 }))).toBe("DISBURSEMENT_STATE_INVALID");
  });

  it("un montant négatif est refusé par l'invariant monétaire (ADR-0002)", () => {
    expect(codes(() => declare({ netAmount: -1n }))).toBe("MONEY_NEGATIVE");
  });

  it("un montant au-dessus du plafond par montant `kombe_money` est refusé (ADR-0002)", () => {
    // 1 000 000 000 : plafond de la domain SQL `kombe_money` — `money()` seule
    // (MAX_SAFE) acceptait ici un montant irréalisable en base.
    expect(codes(() => declare({ netAmount: 1_000_000_001n }))).toBe(
      "MONEY_OVER_PER_AMOUNT_CEILING",
    );
    expect(codes(() => declare({ groupFees: 1_000_000_001n }))).toBe(
      "MONEY_OVER_PER_AMOUNT_CEILING",
    );
    expect(codes(() => declare({ personalFeesOutOfPot: 1_000_000_001n }))).toBe(
      "MONEY_OVER_PER_AMOUNT_CEILING",
    );
  });
});

describe("C08 — confirmation par le bénéficiaire seul (6.10)", () => {
  it("un acteur qui n'est pas le bénéficiaire n'est pas accepté, sans écriture", () => {
    const d = declare();
    const r = confirmDisbursement(d, "idn_quequonque");
    expect(r.actAccepted).toBe(false);
    expect(r.reason).toBe("NOT_BENEFICIARY");
    expect(r.record.state).toBe("requested");
    expect(r.record.beneficiaryConfirmedBy).toBeNull();
  });

  it("confirmation du bénéficiaire parachève si aucun contrôleur requis", () => {
    const d = declare({ requiredControllers: 0 });
    const r = confirmDisbursement(d, d.beneficiaryIdentityId);
    expect(r).toMatchObject({ actAccepted: true, completed: true });
    expect(r.record.state).toBe("completed");
  });

  it("avec contrôleur requis, confirmer laisse en attente (jamais parachévé)", () => {
    const d = declare({ requiredControllers: 1 });
    const r = confirmDisbursement(d, d.beneficiaryIdentityId);
    expect(r).toMatchObject({ actAccepted: true, completed: false, reason: "AWAITING_CONTROLLERS" });
    expect(r.record.state).toBe("requested");
  });

  it("confirmation sur un état non-demande est refusée", () => {
    expect(codes(() => confirmDisbursement(completed(), "idn_benef"))).toBe(
      "DISBURSEMENT_STATE_INVALID",
    );
  });
});

describe("C08 — contrôle distinct et indépendant (6.10)", () => {
  it("contrôler avant confirmation du bénéficiaire est refusé", () => {
    expect(codes(() => controlDisbursement(declare({ requiredControllers: 1 }), "idn_ctl"))).toBe(
      "DISBURSEMENT_STATE_INVALID",
    );
  });

  it("le déclarant ou le bénéficiaire ne peuvent se contrôler eux-mêmes", () => {
    const confirmed = confirmDisbursement(declare({ requiredControllers: 1 }), "idn_benef").record;
    expect(controlDisbursement(confirmed, "idn_treasurer").reason).toBe("NOT_INDEPENDENT");
    expect(controlDisbursement(confirmed, "idn_benef").reason).toBe("NOT_INDEPENDENT");
  });

  it("un même contrôleur ne compte pas deux fois (ACTOR_ALREADY_ACTED)", () => {
    const confirmed = confirmDisbursement(declare({ requiredControllers: 2 }), "idn_benef").record;
    const first = controlDisbursement(confirmed, "idn_ctl1");
    expect(first).toMatchObject({ actAccepted: true, completed: false });
    const again = controlDisbursement(first.record, "idn_ctl1");
    expect(again).toMatchObject({ actAccepted: false, reason: "ACTOR_ALREADY_ACTED" });
    expect(again.record.controllerIdentityIds).toHaveLength(1);
  });

  it("au seuil atteint par des contrôleurs distincts, le décaissement s'achève", () => {
    const confirmed = confirmDisbursement(declare({ requiredControllers: 2 }), "idn_benef").record;
    const one = controlDisbursement(confirmed, "idn_ctl1");
    const two = controlDisbursement(one.record, "idn_ctl2");
    expect(two).toMatchObject({ actAccepted: true, completed: true });
    expect(two.record.state).toBe("completed");
  });
});

describe("C08-CORRECTION — contre-écriture unique d'un décaissement achevé (6.10, 18.9)", () => {
  it("demander puis approuver (indépendant) reverse une seule fois ⇒ reversalCount = 1", () => {
    const done = completed();
    const requested = requestDisbursementReversal(done, "idn_treasurer", "montant errone");
    expect(requested.state).toBe("reversal_requested");
    expect(requested.refundedExternally).toBe(false);
    const approved = approveDisbursementReversal(requested, "idn_auditor");
    expect(approved.state).toBe("reversed");
    expect(approved.reversalCount).toBe(1);
    // Seconde course sur l'original déjà reversé : refus, compteur figé à 1.
    expect(codes(() => approveDisbursementReversal(approved, "idn_auditor2"))).toBe(
      "DISBURSEMENT_ALREADY_REVERSED",
    );
    expect(approved.reversalCount).toBe(1);
  });

  it("une correction n'approuve que sur demande ouverte", () => {
    expect(codes(() => approveDisbursementReversal(completed(), "idn_auditor"))).toBe(
      "DISBURSEMENT_STATE_INVALID",
    );
  });

  it("l'approbateur doit être indépendant du demandeur et du déclarant (403)", () => {
    const requested = requestDisbursementReversal(completed(), "idn_treasurer", "erreur");
    expect(codes(() => approveDisbursementReversal(requested, "idn_treasurer"))).toBe(
      "DISBURSEMENT_REVERSAL_NOT_INDEPENDENT",
    );
  });

  it("le bénéficiaire n'approuve pas la correction de son propre décaissement (403)", () => {
    // Il jugerait sa propre cause : la contre-écriture profite au pot, pas à lui.
    const requested = requestDisbursementReversal(completed(), "idn_treasurer", "erreur");
    expect(codes(() => approveDisbursementReversal(requested, "idn_benef"))).toBe(
      "DISBURSEMENT_REVERSAL_NOT_INDEPENDENT",
    );
  });

  it("demander une correction d'un décaissement non achevé est refusé", () => {
    expect(codes(() => requestDisbursementReversal(declare(), "idn_treasurer", "x"))).toBe(
      "DISBURSEMENT_STATE_INVALID",
    );
  });

  it("un motif vide est refusé", () => {
    expect(codes(() => requestDisbursementReversal(completed(), "idn_treasurer", "   "))).toBe(
      "DISBURSEMENT_STATE_INVALID",
    );
  });

  it("jamais de remboursement automatique externe : refundedExternally reste false", () => {
    const requested = requestDisbursementReversal(completed(), "idn_treasurer", "erreur");
    const approved = approveDisbursementReversal(requested, "idn_auditor");
    expect(approved.refundedExternally).toBe(false);
  });
});

describe("C08 — grand livre des frais : pot vs personnel (18.4)", () => {
  it("les frais groupe entrent au rapprochement, les personnels en restent exclus", () => {
    const totals = feeLedger([
      { amount: 1000n, borneBy: "group" },
      { amount: 500n, borneBy: "group" },
      { amount: 2000n, borneBy: "member_personal" },
    ]);
    expect(totals.groupFees).toBe(1500n);
    expect(totals.personalFeesOutOfPot).toBe(2000n);
  });

  it("sommes agrègent uniquement les décaissements achevés (non reversés)", () => {
    const a = completed({ disbursementId: "a", netAmount: 40000n, groupFees: 800n });
    const b = completed({ disbursementId: "b", netAmount: 9000n, groupFees: 200n });
    const reversed = approveDisbursementReversal(
      requestDisbursementReversal(
        completed({ disbursementId: "c", netAmount: 5000n, groupFees: 100n }),
        "idn_treasurer",
        "erreur",
      ),
      "idn_auditor",
    );
    expect(sumNetDisbursed([a, b, reversed])).toBe(49000n);
    expect(sumGroupFees([a, b, reversed])).toBe(1000n);
  });

  it("un décaissement `reversal_requested` compte encore dans les sommes (écart non masqué)", () => {
    // Les fonds sont physiquement sortis et ne réintègrent le pot qu'UNE FOIS la
    // contre-écriture approuvée. Les exclure pendant la correction fausse-
    // rait/baisserait l'écart de rapprochement (18.4 — l'écart reste visible).
    const pending = requestDisbursementReversal(
      completed({ disbursementId: "p", netAmount: 5000n, groupFees: 100n }),
      "idn_treasurer",
      "erreur",
    );
    expect(pending.state).toBe("reversal_requested");
    expect(sumNetDisbursed([pending])).toBe(5000n);
    expect(sumGroupFees([pending])).toBe(100n);
  });
});

describe("C08-BALANCE — clôture normale admise quand l'écart est nul (18.4)", () => {
  it("50000 validés, 49000 décaissés, 1000 frais groupe ⇒ gap = 0", () => {
    const r = reconcileRound({
      validatedNetTotal: 50000n,
      netDisbursedTotal: 49000n,
      groupFeesTotal: 1000n,
    });
    expect(r.reconciliationGap).toBe(0n);
    expect(r.normalCloseAccepted).toBe(true);
    expect(r.blockedByGap).toBe(false);
  });
});

describe("C08-GAP — clôture normale refusée quand un écart subsiste (18.4, 18.9)", () => {
  it("50000 validés, 48000 décaissés, 1000 frais ⇒ gap = 1000, normal_close = false", () => {
    const r = reconcileRound({
      validatedNetTotal: 50000n,
      netDisbursedTotal: 48000n,
      groupFeesTotal: 1000n,
    });
    expect(r.reconciliationGap).toBe(1000n);
    expect(r.normalCloseAccepted).toBe(false);
    expect(r.blockedByGap).toBe(true);
  });

  it("un litige bloquant empêche la clôture même à écart nul", () => {
    const r = reconcileRound({
      validatedNetTotal: 50000n,
      netDisbursedTotal: 49000n,
      groupFeesTotal: 1000n,
      hasBlockingDispute: true,
    });
    expect(r.reconciliationGap).toBe(0n);
    expect(r.normalCloseAccepted).toBe(false);
    expect(r.blockedByDispute).toBe(true);
  });

  it("un impayé affectant le pot empêche la clôture même à écart nul", () => {
    const r = reconcileRound({
      validatedNetTotal: 50000n,
      netDisbursedTotal: 49000n,
      groupFeesTotal: 1000n,
      hasUnpaidAffectingPot: true,
    });
    expect(r.normalCloseAccepted).toBe(false);
    expect(r.blockedByUnpaid).toBe(true);
  });
});

describe("C08 — arrêt exceptionnel : l'écart est conservé, jamais équilibré (18.9)", () => {
  it("le bilan conserve l'écart, les obligations restantes et se dit non équilibré", () => {
    const stop = stopGroupWithDiscrepancies(50000n, 47000n, 1000n, [
      { obligationId: "g1_r2_m3", remainingDue: 2000n },
    ]);
    expect(stop.kind).toBe("exceptional_stop");
    expect(stop.balanced).toBe(false);
    expect(stop.reconciliationGap).toBe(2000n);
    expect(stop.remainingObligations).toEqual([{ obligationId: "g1_r2_m3", remainingDue: 2000n }]);
  });

  it("une obligation restante à montant négatif est refusée par l'invariant monétaire", () => {
    expect(
      codes(() => stopGroupWithDiscrepancies(0n, 0n, 0n, [{ obligationId: "x", remainingDue: -1n }])),
    ).toBe("MONEY_NEGATIVE");
  });
});
