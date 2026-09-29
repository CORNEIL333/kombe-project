/**
 * Tests d'invariants purs C10 — litiges et recours. Logique sans HTTP ni base :
 * vue commune vs détail privé (8.1), désignation indépendante des résolveurs
 * (8.2), résolution qui ne touche aucun montant + recours lié à l'original (8.3),
 * gel de clôture multi-obligations et temps calendaire vs ouvré (8.4/C10-FREEZE).
 */
import { describe, expect, it } from "vitest";
import {
  DomainError,
  businessProcessingSeconds,
  calendarProcessingSeconds,
  designateResolvers,
  disputeCommonView,
  isDisputeParty,
  openDisputeCase,
  reopenDispute,
  resolveDispute,
  assertRoundCloseNotFrozen,
  type DisputeRecord,
  type OpenDisputeCaseInput,
} from "../src/index.js";

const codes = (fn: () => unknown): string | null => {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof DomainError ? e.code : "NOT_DOMAIN";
  }
};

// Epochs UTC fixes (horloge injectée, jamais Date.now).
const MON_0900 = 1790586000; // 2026-09-28 (lundi) 09:00 UTC
const SAT_0900 = 1790413200; // 2026-09-26 (samedi) 09:00 UTC
const MON_NEXT_0900 = 1791190800; // 2026-10-05 (lundi) 09:00 UTC

function record(over: Partial<OpenDisputeCaseInput> = {}): DisputeRecord {
  return openDisputeCase({
    disputeId: "dsp1",
    groupId: "grp1",
    obligationId: "g1_r1_m2",
    category: "ordinary",
    raisedBy: "idn_m1",
    reason: "Montant declare differre du recu",
    requestedCorrection: "Compenser puis redeclarer le montant exact",
    involvedIdentityIds: ["idn_t1", "idn_t2"],
    notifiedAt: MON_0900,
    raisedAt: MON_0900 + 3600,
    ...over,
  });
}

describe("8.1 — ouverture du dossier", () => {
  it("motif vide → DISPUTE_REASON_REQUIRED", () => {
    expect(codes(() => record({ reason: "   " }))).toBe("DISPUTE_REASON_REQUIRED");
  });

  it("correction demandée vide → DISPUTE_RESOLUTION_REQUIRED", () => {
    expect(codes(() => record({ requestedCorrection: "" }))).toBe("DISPUTE_RESOLUTION_REQUIRED");
  });

  it("aucune pièce au pilote : le dossier ne porte aucun champ de pièce", () => {
    const r = record();
    expect(Object.keys(r)).not.toContain("attachments");
    expect(r.state).toBe("open");
    expect(r.reopenCount).toBe(0);
  });

  it("le levant est automatiquement partie impliquée", () => {
    const r = record();
    expect(r.involvedIdentityIds).toContain("idn_m1");
  });
});

describe("C10-PRIVACY — vue commune vs détail privé (8.1)", () => {
  it("la vue commune ne contient ni motif, ni correction, ni identité de partie", () => {
    const view = disputeCommonView(record()) as unknown as Record<string, unknown>;
    const serialized = JSON.stringify(view);
    for (const forbidden of ["reason", "requestedCorrection", "raisedBy", "idn_m1", "idn_t1", "involvedIdentityIds", "resolverIdentityIds"]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(view["state"]).toBe("open");
    expect(view["outcome"]).toBeNull();
  });

  it("parties autorisées : levant, impliqué, résolveur désigné", () => {
    const r = designateResolvers(record(), ["idn_sec"]);
    expect(isDisputeParty(r, "idn_m1")).toBe(true);
    expect(isDisputeParty(r, "idn_t1")).toBe(true);
    expect(isDisputeParty(r, "idn_sec")).toBe(true);
  });

  it("non-partie refusée : un membre du groupe sans lien n'est pas partie", () => {
    const r = record();
    expect(isDisputeParty(r, "idn_outsider")).toBe(false);
  });
});

describe("8.2 — désignation indépendante des résolveurs", () => {
  it("désigner un impliqué → DISPUTE_RESOLVER_NOT_INDEPENDENT", () => {
    expect(codes(() => designateResolvers(record(), ["idn_t1"]))).toBe("DISPUTE_RESOLVER_NOT_INDEPENDENT");
  });

  it("désigner le levant → DISPUTE_RESOLVER_NOT_INDEPENDENT (soulevé automatiquement)", () => {
    expect(codes(() => designateResolvers(record(), ["idn_m1"]))).toBe("DISPUTE_RESOLVER_NOT_INDEPENDENT");
  });

  it("désignation vide → DISPUTE_RESOLVER_NOT_DESIGNATED (gel maintenu, procédure externe)", () => {
    expect(codes(() => designateResolvers(record(), []))).toBe("DISPUTE_RESOLVER_NOT_DESIGNATED");
  });

  it("si tous sont impliqués, aucun résolveur éligible : le gel demeure", () => {
    const allInvolved = record({ involvedIdentityIds: ["idn_t1", "idn_t2", "idn_sec"] });
    expect(codes(() => designateResolvers(allInvolved, ["idn_sec"]))).toBe("DISPUTE_RESOLVER_NOT_INDEPENDENT");
    // Le dossier reste ouvert et gelé — aucune issue de contournement par rôle.
    expect(allInvolved.state).toBe("open");
  });
});

describe("C10-RESOLVE — la résolution ne change aucun montant (8.3)", () => {
  it("acteur non désigné → DISPUTE_RESOLVER_NOT_DESIGNATED", () => {
    const r = designateResolvers(record(), ["idn_sec"]);
    expect(
      codes(() => resolveDispute(r, { actorIdentityId: "idn_rand", outcome: "ok", resolvedAt: MON_NEXT_0900 })),
    ).toBe("DISPUTE_RESOLVER_NOT_DESIGNATED");
  });

  it("résolution par le résolveur désigné : aucun champ monétaire n'apparaît", () => {
    const r = designateResolvers(record(), ["idn_sec"]);
    const before = JSON.stringify(r);
    const d = resolveDispute(r, {
      actorIdentityId: "idn_sec",
      outcome: "Ecart confirme ; compensation referencees c-reversal-1",
      resolvedAt: MON_NEXT_0900,
      correctionContributionIds: ["c-reversal-1"],
    });
    expect(d.state).toBe("resolved");
    expect(d.outcome).toContain("c-reversal-1");
    // Structurel : la résolution ne produit ni montant ni événement monétaire —
    // le dossier résolu ne porte aucune cle de total (validated_total_delta = 0).
    const serialized = JSON.stringify(d);
    for (const forbidden of ["amountMinor", "amount", "delta", "total"]) {
      expect(serialized).not.toContain(forbidden);
    }
    // L'enregistrement d'origine (avant résolution) est intact — pas de mutation.
    expect(JSON.stringify(r)).toBe(before);
  });

  it("résoudre deux fois → DISPUTE_ALREADY_RESOLVED", () => {
    const r = designateResolvers(record(), ["idn_sec"]);
    const d = resolveDispute(r, { actorIdentityId: "idn_sec", outcome: "clos", resolvedAt: MON_NEXT_0900 });
    expect(codes(() => resolveDispute(d, { actorIdentityId: "idn_sec", outcome: "encore", resolvedAt: MON_NEXT_0900 + 1 })))
      .toBe("DISPUTE_ALREADY_RESOLVED");
  });

  it("décision sans motif documenté → DISPUTE_RESOLUTION_REQUIRED", () => {
    const r = designateResolvers(record(), ["idn_sec"]);
    expect(codes(() => resolveDispute(r, { actorIdentityId: "idn_sec", outcome: "  ", resolvedAt: MON_NEXT_0900 })))
      .toBe("DISPUTE_RESOLUTION_REQUIRED");
  });

  it("la résolution lève le gel des opérations dépendantes", () => {
    const r = designateResolvers(record(), ["idn_sec"]);
    expect(codes(() => assertRoundCloseNotFrozen([r], ["g1_r1_m2"]))).toBe("ROUND_CLOSE_BLOCKED_BY_DISPUTE");
    const d = resolveDispute(r, { actorIdentityId: "idn_sec", outcome: "clos", resolvedAt: MON_NEXT_0900 });
    expect(codes(() => assertRoundCloseNotFrozen([d], ["g1_r1_m2"]))).toBeNull();
  });
});

describe("8.3 — recours lié à l'original", () => {
  it("recours sur un litige résolu → réouverture liée, première résolution conservée", () => {
    const r = designateResolvers(record(), ["idn_sec"]);
    const d = resolveDispute(r, { actorIdentityId: "idn_sec", outcome: "clos", resolvedAt: MON_NEXT_0900 });
    const reopened = reopenDispute(d);
    expect(reopened.state).toBe("open");
    expect(reopened.reopenCount).toBe(1);
    expect(reopened.reopenedFromDisputeId).toBe("dsp1");
    // Le gel ciblé est rétabli sans toucher aux montants.
    expect(codes(() => assertRoundCloseNotFrozen([reopened], ["g1_r1_m2"]))).toBe("ROUND_CLOSE_BLOCKED_BY_DISPUTE");
  });

  it("recours sur un litige ouvert → DISPUTE_NOT_RESOLVABLE", () => {
    expect(codes(() => reopenDispute(record()))).toBe("DISPUTE_NOT_RESOLVABLE");
  });
});

describe("C10-FREEZE — gel de clôture sur somme d'obligations", () => {
  it("une seule obligation litigieuse sur trois gèle la clôture normale", () => {
    const d = record();
    expect(codes(() => assertRoundCloseNotFrozen([d], ["g1_r1_m1", "g1_r1_m2", "g1_r1_m3"])))
      .toBe("ROUND_CLOSE_BLOCKED_BY_DISPUTE");
  });

  it("aucun litige ouvert sur le tour → clôture normale admise", () => {
    expect(codes(() => assertRoundCloseNotFrozen([], ["g1_r1_m1", "g1_r1_m2"]))).toBeNull();
  });

  it("litige résolu puis rouvert : deux dossiers ouverts comptent", () => {
    const r = designateResolvers(record({ obligationId: "g1_r1_m3" }), ["idn_sec"]);
    const closed = resolveDispute(r, { actorIdentityId: "idn_sec", outcome: "ok", resolvedAt: MON_NEXT_0900 });
    expect(codes(() => assertRoundCloseNotFrozen([closed], ["g1_r1_m1", "g1_r1_m3"]))).toBeNull();
    const re = reopenDispute(closed);
    expect(codes(() => assertRoundCloseNotFrozen([re], ["g1_r1_m1", "g1_r1_m3"]))).toBe("ROUND_CLOSE_BLOCKED_BY_DISPUTE");
  });
});

describe("8.4 — temps calendaire et temps ouvré distincts", () => {
  it("samedi 09:00 → lundi 09:00 : 48 h calendaires, 1 h ouvrée", () => {
    // Week-end exclu, mais le lundi 00:00→09:00 contient 08:00→09:00 : 1 h.
    expect(calendarProcessingSeconds(SAT_0900, MON_0900)).toBe(2 * 24 * 3600);
    expect(businessProcessingSeconds(SAT_0900, MON_0900)).toBe(1 * 3600);
  });

  it("lundi 09:00 → jeudi 09:00 (+72 h) : 72 h calendaires, 30 h ouvrées", () => {
    // Fenêtre ouvrée 08:00–18:00 UTC, lun–ven : lundi 09:00→18:00 = 9 h ;
    // mardi 10 h ; mercredi 10 h ; jeudi 00:00→09:00 ⊃ 08:00→09:00 = 1 h
    // → 30 h pour 72 h calendaires. Les deux mesures restent distinctes (8.4).
    expect(calendarProcessingSeconds(MON_0900, MON_0900 + 72 * 3600)).toBe(72 * 3600);
    expect(businessProcessingSeconds(MON_0900, MON_0900 + 72 * 3600)).toBe(30 * 3600);
  });

  it("6 jours calendaires traversent un week-end : 144 h calendaires, 41 h ouvrées", () => {
    // Samedi 09:00 → vendredi 09:00 : sam/dim exclus ; lun–jeu 10 h chacun
    // (08:00–18:00) = 40 h ; vendredi 08:00→09:00 = 1 h → 41 h ouvrées.
    expect(calendarProcessingSeconds(SAT_0900, SAT_0900 + 6 * 24 * 3600)).toBe(6 * 24 * 3600);
    expect(businessProcessingSeconds(SAT_0900, SAT_0900 + 6 * 24 * 3600)).toBe(41 * 3600);
  });

  it("clôture antérieure à l'ouverture → DISPUTE_NOT_RESOLVABLE", () => {
    expect(codes(() => calendarProcessingSeconds(MON_0900, MON_0900 - 1))).toBe("DISPUTE_NOT_RESOLVABLE");
  });
});
