/**
 * Tests d'invariants purs du socle C00 : monnaie, canonicalisation RFC 8785,
 * chaîne de journal, barrières serveur du pilote, autorisation objet.
 *
 * Aucun mock de PostgreSQL n'intervient : ces règles sont indépendantes de
 * la persistance. Les preuves d'isolation/verrouillage (C01) exigent une base
 * réelle et restent hors de ce suite.
 */
import { describe, expect, it } from "vitest";
import {
  DomainError,
  MAX_SAFE,
  PER_AMOUNT_CEILING,
  money,
  parseAmount,
  perAmount,
  canonicalizeJson,
  GENESIS_HASH,
  sealEvent,
  verifyChain,
  PILOT_FEATURE_GATES,
  requestFeature,
  assertNoForbiddenFeatureEnabled,
  can,
  isCrossGroupAccess,
  assertExpectedVersion,
} from "../src/index.js";

const codes = (fn: () => unknown): string | null => {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof DomainError ? e.code : "NOT_DOMAIN";
  }
};

describe("money — XAF entier, bornes, refus du float", () => {
  it("accepte un entier sûr positif ou nul", () => {
    expect(money(0n)).toBe(0n);
    expect(money(5000n)).toBe(5000n);
  });
  it("refuse le négatif", () => expect(codes(() => money(-1n))).toBe("MONEY_NEGATIVE"));
  it("refuse l'overlfow au-delà de l'entier sûr", () =>
    expect(codes(() => money(MAX_SAFE + 1n))).toBe("MONEY_OVER_SAFE_CEILING"));
  it("parseAmount refuse un float monétaire sans arrondir", () =>
    expect(codes(() => parseAmount(10.5))).toBe("MONEY_NOT_INTEGER"));
  it("parseAmount accepte chaîne et nombre entiers", () => {
    expect(parseAmount("25000")).toBe(25000n);
    expect(parseAmount(25000)).toBe(25000n);
  });
  it("perAmount applique le plafond unitaire [OPEN-D07]", () => {
    expect(perAmount(1_000_000n)).toBe(1_000_000n);
    expect(codes(() => perAmount(PER_AMOUNT_CEILING + 1n))).toBe(
      "MONEY_OVER_PER_AMOUNT_CEILING",
    );
    expect(codes(() => perAmount(0n, { positive: true }))).toBe("ROTATION_CONTRIBUTION_POSITIVE");
  });
});

describe("canonical — RFC 8785 (JCS), tri de clés et entiers", () => {
  it("trie les clés et conserve l'ordre des tableaux", () => {
    expect(canonicalizeJson({ c: 1, a: 2, b: [3, 1, 2] })).toBe('{"a":2,"b":[3,1,2],"c":1}');
  });
  it("trie récursivement les objets imbriqués", () => {
    expect(canonicalizeJson({ b: { d: 1, c: 2 }, a: 3 })).toBe('{"a":3,"b":{"c":2,"d":1}}');
  });
  it("convertit un bigint du domaine en entier canonique", () => {
    expect(canonicalizeJson({ amount: 5000n })).toBe('{"amount":5000}');
  });
  it("refuse un flottant dans le journal", () =>
    expect(codes(() => canonicalizeJson({ x: 1.5 }))).toBe("CANONICAL_HORS_ENTIER_SUR"));
  it("refuse un bigint hors entier sûr", () =>
    expect(codes(() => canonicalizeJson({ x: MAX_SAFE + 1n }))).toBe("CANONICAL_HORS_ENTIER_SUR"));
});

describe("events — chaîne de hash append-only", () => {
  const e1 = sealEvent({
    groupId: "grp_test_1",
    seq: 1,
    type: "member.joined",
    version: 1,
    previousHash: GENESIS_HASH,
    payload: { memberId: 7n },
  });
  const e2 = sealEvent({
    groupId: "grp_test_1",
    seq: 2,
    type: "contribution.declared",
    version: 1,
    previousHash: e1.hash,
    payload: { amount: 5000n },
  });

  it("valide une chaîne intacte", () => expect(() => verifyChain([e1, e2])).not.toThrow());
  it("détecte un payload altéré (hash non conforme)", () => {
    const tampered = { ...e1, payload: { memberId: 999n } };
    expect(codes(() => verifyChain([tampered, e2]))).toBe("EVENT_HASH_MISMATCH");
  });
  it("détecte une rupture de chaînage", () => {
    // Événement au contenu intègre (hash cohérent) mais branché sur un
    // previousHash erroné : l'intégrité passe, le chaînage échoue.
    const broken = sealEvent({
      groupId: "grp_test_1",
      seq: 2,
      type: "contribution.declared",
      version: 1,
      previousHash: "f".repeat(64),
      payload: { amount: 5000n },
    });
    expect(codes(() => verifyChain([e1, broken]))).toBe("EVENT_CHAIN_BREAK");
  });
});

describe("features — barrières serveur du pilote (C00-SCOPE)", () => {
  it("toutes les features interdites sont fermées par défaut", () => {
    expect(codes(() => assertNoForbiddenFeatureEnabled(PILOT_FEATURE_GATES))).toBeNull();
  });
  it("refuse wallet/prêt au pilote : rejected=true, enabled=false", () => {
    expect(requestFeature(PILOT_FEATURE_GATES, "wallet")).toEqual({
      enabled: false,
      rejected: true,
    });
    expect(requestFeature(PILOT_FEATURE_GATES, "loan").rejected).toBe(true);
  });
  it("un gates volontairement ouvert déclenche le refus", () => {
    const open = { ...PILOT_FEATURE_GATES, potAutoTransfer: true };
    expect(codes(() => assertNoForbiddenFeatureEnabled(open))).toBe("FEATURE_PILOT_FORBIDDEN");
  });
});

describe("authorization — RBAC objet, anti-IDOR, version (C01 logique pure)", () => {
  it("aucun rôle n'a d'approbation universelle silencieuse (fondateur exclu)", () => {
    expect(can("founder", "role.change.approve")).toBe(false);
    expect(can("auditor", "contribution.validate")).toBe(false);
  });
  it("le membre déclare mais ne valide pas sa cotisation", () => {
    expect(can("member", "contribution.declare")).toBe(true);
    expect(can("member", "contribution.validate")).toBe(false);
    expect(can("treasurer", "contribution.validate")).toBe(true);
  });
  it("garde anti-IDOR : objet d'un autre groupe refusé", () => {
    expect(isCrossGroupAccess(["grpA"], "grpB")).toBe(true);
    expect(isCrossGroupAccess(["grpA", "grpB"], "grpB")).toBe(false);
  });
  it("concurrence optimiste : version attendue obligatoire, conflit explicite", () => {
    expect(codes(() => assertExpectedVersion(3, 3))).toBeNull();
    expect(codes(() => assertExpectedVersion(4, 3))).toBe("EVENT_CHAIN_BREAK");
    expect(codes(() => assertExpectedVersion(4, 0))).toBe("RESERVATION_INCOHERENTE");
  });
});
