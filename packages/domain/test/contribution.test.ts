/**
 * Tests d'invariants purs C06 — déclarations partielles et idempotence.
 * Logique sans HTTP ni base : hash de corps, décision d'idempotence, capacité
 * sous verrou, restant dû sur validé net, validation canal/référence/motif.
 */
import { describe, expect, it } from "vitest";
import {
  DomainError,
  contributionBodyHash,
  decideIdempotency,
  reserveObligation,
  validateDeclaration,
  type ContributionDeclaration,
  type StoredCommandResult,
} from "../src/index.js";

function decl(over: Partial<ContributionDeclaration> = {}): ContributionDeclaration {
  return {
    obligationId: "g1_r1_m2",
    amountMinor: 3000n,
    channel: "cash",
    allegedDate: "2026-09-15",
    ...over,
  };
}

/** Code d'erreur domaine levé par `fn` (null si aucune), style du socle C00. */
const codes = (fn: () => unknown): string | null => {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof DomainError ? e.code : "NOT_DOMAIN";
  }
};

describe("C06 contributionBodyHash — hash canonique du corps sémantique", () => {
  it("deux corps identiques donnent le même hash", () => {
    expect(contributionBodyHash(decl())).toBe(contributionBodyHash(decl()));
  });

  it("un montant différent change le hash (déclenche un conflit de corps)", () => {
    expect(contributionBodyHash(decl({ amountMinor: 3000n }))).not.toBe(
      contributionBodyHash(decl({ amountMinor: 3001n })),
    );
  });

  it("présence vs absence d'une référence change le hash (absent ≠ valeur)", () => {
    expect(contributionBodyHash(decl())).not.toBe(
      contributionBodyHash(decl({ reference: "REF-42" })),
    );
  });

  it("la date alléguée est couverte par le hash", () => {
    expect(contributionBodyHash(decl({ allegedDate: "2026-09-15" }))).not.toBe(
      contributionBodyHash(decl({ allegedDate: "2026-09-16" })),
    );
  });
});

describe("C06 validateDeclaration — montant et canal (6.1)", () => {
  it("espèces sans référence : admis", () => {
    expect(() => validateDeclaration(decl())).not.toThrow();
  });

  it("électronique avec référence : admis (la référence n'authentifie rien)", () => {
    expect(() =>
      validateDeclaration(decl({ channel: "electronic", reference: "TX-9" })),
    ).not.toThrow();
  });

  it("électronique sans référence exige un motif", () => {
    expect(codes(() => validateDeclaration(decl({ channel: "electronic" })))).toBe(
      "REFERENCE_JUSTIFICATION_REQUIRED",
    );
  });

  it("électronique sans référence mais avec motif non vide : admis", () => {
    expect(() =>
      validateDeclaration(
        decl({ channel: "electronic", justification: "reçu illisible, virement confirmé en réunion" }),
      ),
    ).not.toThrow();
  });

  it("motif whitespace seul : refusé", () => {
    expect(
      codes(() => validateDeclaration(decl({ channel: "electronic", justification: "   "}))),
    ).toBe("REFERENCE_JUSTIFICATION_REQUIRED");
  });

  it("montant nul : cotisation positive exigée", () => {
    expect(codes(() => validateDeclaration(decl({ amountMinor: 0n })))).toBe(
      "ROTATION_CONTRIBUTION_POSITIVE",
    );
  });

  it("montant négatif : refusé", () => {
    expect(codes(() => validateDeclaration(decl({ amountMinor: -5n })))).toBe(
      "MONEY_NEGATIVE",
    );
  });
});

describe("C06 decideIdempotency — rejeu et conflit de corps (18.1)", () => {
  const result: StoredCommandResult = {
    commandId: "cmd_1",
    status: "applied",
    resultVersion: 2,
    eventHash: "a".repeat(64),
  };
  const hash = contributionBodyHash(decl());

  it("aucune entrée → exécution", () => {
    expect(decideIdempotency(undefined, hash)).toEqual({ kind: "execute" });
  });

  it("même clé, même corps → rejeu du résultat d'origine", () => {
    expect(decideIdempotency({ bodyHash: hash, result }, hash)).toEqual({
      kind: "replay",
      result,
    });
  });

  it("même clé, corps différent → conflit", () => {
    const other = contributionBodyHash(decl({ amountMinor: 999n }));
    expect(decideIdempotency({ bodyHash: hash, result }, other).kind).toBe("conflict");
  });
});

describe("C06 reserveObligation — capacité sous verrou et partiels (18.3)", () => {
  it("plusieurs déclarations couvrent une seule obligation", () => {
    const first = reserveObligation({ due: 5000n, validatedNet: 0n, activeReserved: 0n }, 2000n);
    expect(first.activeReserved).toBe(2000n);
    const second = reserveObligation(
      { due: 5000n, validatedNet: 0n, activeReserved: first.activeReserved },
      1000n,
    );
    expect(second.activeReserved).toBe(3000n);
    expect(second.availableToDeclare).toBe(2000n);
  });

  it("restant dû affiché calculé sur le validé net, pas sur les réservations", () => {
    // 5000 dus, 4000 déjà validés (et réservés), 500 de plus déclaré :
    // restant dû = dû − validé net = 1000 ; capacité restante après réservation = 500.
    const r = reserveObligation({ due: 5000n, validatedNet: 4000n, activeReserved: 4000n }, 500n);
    expect(r.remainingDue).toBe(1000n);
    expect(r.activeReserved).toBe(4500n);
    expect(r.availableToDeclare).toBe(500n);
  });

  it("excédent bloqué : montant au-dessus de la capacité restante", () => {
    expect(
      codes(() => reserveObligation({ due: 5000n, validatedNet: 0n, activeReserved: 4000n }, 2000n)),
    ).toBe("CONTRIBUTION_EXCEEDS_REMAINING");
  });

  it("C06-RACE : deux courses de 3000 sur 5000, sérialisées ⇒ total accepté 3000", () => {
    const due = 5000n;
    const first = reserveObligation({ due, validatedNet: 0n, activeReserved: 0n }, 3000n);
    const acceptedTotal = first.accepted;
    // La seconde course voit la capacité restante après la première (verrou).
    expect(
      codes(() => reserveObligation({ due, validatedNet: 0n, activeReserved: first.activeReserved }, 3000n)),
    ).toBe("CONTRIBUTION_EXCEEDS_REMAINING");
    expect(acceptedTotal).toBe(3000n);
  });

  it("montant nul refusé (positif requis)", () => {
    expect(
      codes(() => reserveObligation({ due: 5000n, validatedNet: 0n, activeReserved: 0n }, 0n)),
    ).toBe("ROTATION_CONTRIBUTION_POSITIVE");
  });

  it("entrée incohérente (réservé > dû) rejetée par l'oracle restant", () => {
    expect(
      codes(() => reserveObligation({ due: 1000n, validatedNet: 0n, activeReserved: 2000n }, 100n)),
    ).toBe("RESERVATION_INCOHERENTE");
  });
});
