/**
 * Tests d'invariants purs C09 — propositions, votes et décisions.
 * Logique sans HTTP ni base : **électorat figé** à l'ouverture, bulletin
 * **unique et identifié**, **aucune réception après échéance SERVEUR**,
 * quorum/majorité via l'**oracle indépendant** `voteResult`, exécution
 * **idempotente** portant résultat + date d'effet **jamais rétroactive**.
 * Les scénarios C09-PASS / C09-TIE / C09-LATE sont observés par des actions
 * réelles du composant, jamais par une constante lue d'un fichier d'attentes.
 */
import { describe, it, expect } from "vitest";
import { DomainError } from "../src/errors.js";
import {
  cancelProposal,
  castBallot,
  closeProposal,
  executeProposal,
  openProposal,
  type BallotChoice,
  type ProposalRecord,
} from "../src/proposal.js";

const T0 = 1_700_000_000_000; // ouverture serveur (ms epoch)

function electorate(n: number, prefix = "m"): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}${i}`);
}

function openWith(ids: readonly string[], over: Partial<{ num: number; den: number; durationSeconds: number }> = {}): ProposalRecord {
  return openProposal({
    proposalId: "prop_1",
    groupId: "g1",
    subjectKind: "rule",
    subjectRef: "rules/rotation",
    reason: "Ajuster la rotation",
    rulesVersion: 1,
    electorate: ids,
    quorumNumerator: over.num ?? 2,
    quorumDenominator: over.den ?? 3,
    openedAt: T0,
    durationSeconds: over.durationSeconds ?? 3600,
  });
}

function tally(record: ProposalRecord, votes: Record<string, BallotChoice>, serverNow: number): ProposalRecord {
  let cur = record;
  for (const [who, choice] of Object.entries(votes)) {
    const r = castBallot(cur, who, choice, serverNow);
    cur = r.record;
  }
  return cur;
}

describe("openProposal — scellement de l'électorat et échéance serveur", () => {
  it("scelle l'électorat, calcule l'échéance serveur et pose un hash stable", () => {
    const r = openWith(electorate(10));
    expect(r.state).toBe("open");
    expect(r.electorate).toHaveLength(10);
    expect(r.deadline).toBe(T0 + 3600 * 1000);
    expect(r.canonicalHash).toHaveLength(64);
    // Reproductibilité : la même entrée donne le même hash.
    const r2 = openWith(electorate(10));
    expect(r2.canonicalHash).toBe(r.canonicalHash);
  });

  it("refuse un électorat vide", () => {
    expect(() => openWith([])).toThrowError(DomainError);
    try {
      openWith([]);
    } catch (e) {
      expect((e as DomainError).code).toBe("ELECTORATE_INVALIDE");
    }
  });

  it("refuse un électorat avec doublon", () => {
    expect(() => openWith(["a", "a", "b"])).toThrow(/ELECTORATE_INVALIDE|doublon/);
  });

  it("exige un motif non vide", () => {
    expect(() =>
      openProposal({
        proposalId: "p", groupId: "g1", subjectKind: "rule", subjectRef: "r",
        reason: "   ", rulesVersion: 1, electorate: electorate(3),
        quorumNumerator: 2, quorumDenominator: 3, openedAt: T0, durationSeconds: 60,
      }),
    ).toThrowError(DomainError);
  });

  it("refuse un quorum hors limites (num > den)", () => {
    expect(() => openWith(electorate(5), { num: 4, den: 3 })).toThrowError(DomainError);
  });

  it("refuse un quorum à numérateur nul (0/N incompressible → un seul oui suffirait)", () => {
    expect(() => openWith(electorate(10), { num: 0, den: 3 })).toThrowError(DomainError);
  });

  it("refuse une durée non positive", () => {
    expect(() => openWith(electorate(5), { durationSeconds: 0 })).toThrowError(DomainError);
  });
});

describe("castBallot — bulletin unique, identifié, dans la volée serveur", () => {
  it("accepte un bulletin d'un électeur dans la volée", () => {
    const r = openWith(electorate(10));
    const res = castBallot(r, "m0", "yes", T0 + 1000);
    expect(res.voteAccepted).toBe(true);
    expect(res.record.ballots["m0"]).toBe("yes");
  });

  it("refuse un non-électeur sans mutation", () => {
    const r = openWith(electorate(10));
    const res = castBallot(r, "extraterrestre", "yes", T0 + 1000);
    expect(res.voteAccepted).toBe(false);
    expect(res.reason).toBe("NOT_ELIGIBLE");
    expect(res.record.ballots).toEqual(r.ballots);
  });

  it("C09-LATE : bulletin après échéance serveur → refus sans mutation", () => {
    const r = openWith(electorate(10), { durationSeconds: 60 });
    const late = T0 + 60 * 1000 + 1;
    const res = castBallot(r, "m0", "yes", late);
    expect(res.voteAccepted).toBe(false);
    expect(res.reason).toBe("LATE");
    expect(Object.keys(res.record.ballots)).toHaveLength(0);
  });

  it("interdit le double vote (7.2) sans mutation", () => {
    const r = openWith(electorate(10));
    const first = castBallot(r, "m0", "yes", T0 + 1000);
    const second = castBallot(first.record, "m0", "no", T0 + 2000);
    expect(second.voteAccepted).toBe(false);
    expect(second.reason).toBe("ALREADY_VOTED");
    expect(second.record.ballots["m0"]).toBe("yes"); // inchangé
  });

  it("refuse un bulletin sur une proposition non ouverte", () => {
    let r = tally(openWith(electorate(10)), { m0: "yes", m1: "yes", m2: "yes", m3: "yes", m4: "no", m5: "no", m6: "abstain" }, T0 + 1000);
    r = closeProposal(r, T0 + 3600 * 1000);
    const res = castBallot(r, "m7", "yes", T0 + 3600 * 1000);
    expect(res.voteAccepted).toBe(false);
    expect(res.reason).toBe("NOT_OPEN");
  });
});

describe("closeProposal — résultat reproductible via oracle indépendant", () => {
  it("C09-PASS : 10 électeurs, 4 oui / 2 non / 1 abstention → approuvé", () => {
    let r = tally(openWith(electorate(10)), {
      m0: "yes", m1: "yes", m2: "yes", m3: "yes", m4: "no", m5: "no", m6: "abstain",
    }, T0 + 1000);
    r = closeProposal(r, T0 + 3600 * 1000);
    expect(r.tally).toEqual({ yes: 4, no: 2, abstain: 1, turnout: 7, quorum: 7, approved: true });
    expect(r.effectiveAt).toBe(T0 + 3600 * 1000);
  });

  it("C09-TIE : 10 électeurs, 3 oui / 3 non / 1 abstention → rejeté", () => {
    let r = tally(openWith(electorate(10)), {
      m0: "yes", m1: "yes", m2: "yes", m3: "no", m4: "no", m5: "no", m6: "abstain",
    }, T0 + 1000);
    r = closeProposal(r, T0 + 3600 * 1000);
    expect(r.tally?.approved).toBe(false);
    expect(r.tally?.quorum).toBe(7);
  });

  it("le départ d'un électeur n'altère pas le dénominateur (figé)", () => {
    // Électorat de 10 scellé ; seuls 7 votent, quorum = ceil(20/3) = 7 atteint.
    let r = tally(openWith(electorate(10)), {
      m0: "yes", m1: "yes", m2: "yes", m3: "yes", m4: "no", m5: "no", m6: "abstain",
    }, T0 + 1000);
    r = closeProposal(r, T0 + 3600 * 1000);
    expect(r.tally?.quorum).toBe(7); // dénominateur = 10, pas le nombre de votants
    expect(r.tally?.approved).toBe(true);
  });

  it("zéro suffrage exprimé rejette (abstentions seules comptent au quorum)", () => {
    let r = tally(openWith(electorate(9)), {
      m0: "abstain", m1: "abstain", m2: "abstain", m3: "abstain", m4: "abstain", m5: "abstain",
    }, T0 + 1000);
    r = closeProposal(r, T0 + 3600 * 1000);
    expect(r.tally?.approved).toBe(false);
  });

  it("refuse de clôturer avant l'échéance serveur", () => {
    const r = tally(openWith(electorate(10), { durationSeconds: 3600 }), { m0: "yes" }, T0 + 1000);
    expect(() => closeProposal(r, T0 + 1000)).toThrowError(DomainError);
    try {
      closeProposal(r, T0 + 1000);
    } catch (e) {
      expect((e as DomainError).code).toBe("PROPOSAL_NOT_DUE");
    }
  });

  it("refuse de clôturer deux fois", () => {
    let r = tally(openWith(electorate(10)), { m0: "yes" }, T0 + 1000);
    r = closeProposal(r, T0 + 3600 * 1000);
    expect(() => closeProposal(r, T0 + 4000 * 1000)).toThrowError(DomainError);
  });
});

describe("executeProposal — exécution idempotente, seulement si approuvée", () => {
  function approvedClosed(): ProposalRecord {
    let r = tally(openWith(electorate(10)), {
      m0: "yes", m1: "yes", m2: "yes", m3: "yes", m4: "no", m5: "no", m6: "abstain",
    }, T0 + 1000);
    return closeProposal(r, T0 + 3600 * 1000);
  }

  it("exécute une décision approuvée et date l'exécution serveur", () => {
    const r = approvedClosed();
    const out = executeProposal(r, "secretary1", T0 + 4000 * 1000);
    expect(out.executed).toBe(true);
    expect(out.idempotent).toBe(false);
    expect(out.record.state).toBe("executed");
    expect(out.record.executedByIdentityId).toBe("secretary1");
  });

  it("ré-exécution idempotente : même état, aucun nouvel effet", () => {
    const r = approvedClosed();
    const first = executeProposal(r, "secretary1", T0 + 4000 * 1000);
    const second = executeProposal(first.record, "secretary2", T0 + 5000 * 1000);
    expect(second.idempotent).toBe(true);
    expect(second.record.executedByIdentityId).toBe("secretary1"); // ne change pas
    expect(second.record).toBe(first.record);
  });

  it("refuse d'exécuter une décision non approuvée", () => {
    let r = tally(openWith(electorate(10)), { m0: "yes", m1: "no" }, T0 + 1000);
    r = closeProposal(r, T0 + 3600 * 1000);
    expect(r.tally?.approved).toBe(false);
    expect(() => executeProposal(r, "a", T0 + 4000 * 1000)).toThrowError(DomainError);
    try {
      executeProposal(r, "a", T0 + 4000 * 1000);
    } catch (e) {
      expect((e as DomainError).code).toBe("PROPOSAL_NOT_APPROVED");
    }
  });

  it("refuse d'exécuter une proposition encore ouverte", () => {
    const r = openWith(electorate(10));
    expect(() => executeProposal(r, "a", T0 + 1000)).toThrowError(DomainError);
  });
});

describe("cancelProposal — annulation motivée, jamais après exécution", () => {
  it("annule une proposition ouverte avec motif", () => {
    const r = openWith(electorate(10));
    const out = cancelProposal(r, "Électorat à corriger", T0 + 1000);
    expect(out.state).toBe("cancelled");
    expect(out.cancelReason).toBe("Électorat à corriger");
  });

  it("exige un motif", () => {
    const r = openWith(electorate(10));
    expect(() => cancelProposal(r, "  ", T0 + 1000)).toThrowError(DomainError);
  });

  it("ne peut annuler une décision déjà exécutée", () => {
    let r = tally(openWith(electorate(10)), {
      m0: "yes", m1: "yes", m2: "yes", m3: "yes", m4: "no", m5: "no", m6: "abstain",
    }, T0 + 1000);
    r = closeProposal(r, T0 + 3600 * 1000);
    const exec = executeProposal(r, "sec", T0 + 4000 * 1000).record;
    expect(() => cancelProposal(exec, "trop tard", T0 + 5000 * 1000)).toThrowError(DomainError);
  });
});
