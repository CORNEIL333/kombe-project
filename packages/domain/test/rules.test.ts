/**
 * Tests d'invariants purs du moteur de règles C04 (versionnement, immutabilité,
 * acceptation sur hash exact, non-rétroactivité, pénalités fermées au pilote).
 * Aucune persistance, aucune base : ces règles sont indépendantes de PostgreSQL.
 */
import { describe, expect, it } from "vitest";
import {
  DomainError,
  compileRuleSet,
  publishRule,
  acceptRuleVersion,
  assertVersionImmutable,
  isEssentialFinancialChange,
  planRuleChange,
  newRuleEffective,
  assertNonRetroactive,
  requestPenaltyEnabled,
  type RuleSet,
  type ExistingDue,
} from "../src/index.js";

const codes = (fn: () => unknown): string | null => {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof DomainError ? e.code : "NOT_DOMAIN";
  }
};

const DAY = 86_400_000;

function baseRule(over: Partial<RuleSet> = {}): RuleSet {
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

describe("C04 compileRuleSet — validation et clamp pilote", () => {
  it("accepte une règle cohérente (une part par membre)", () => {
    const r = compileRuleSet(baseRule(), { pilot: true });
    expect(r.rounds).toBe(r.memberCount);
  });
  it("force penaltyEnabled=false au pilote même si demandé vrai", () => {
    const r = compileRuleSet(baseRule({ penaltyEnabled: true }), { pilot: true });
    expect(r.penaltyEnabled).toBe(false);
  });
  it("refuse rounds != memberCount au pilote (multi-part interdit)", () => {
    expect(codes(() => compileRuleSet(baseRule({ rounds: 3 }), { pilot: true }))).toBe(
      "RULE_INVALID",
    );
  });
  it("refuse une cotisation nulle ou un quorum incohérent", () => {
    expect(codes(() => compileRuleSet(baseRule({ contribution: 0n }), { pilot: true }))).toBe(
      "ROTATION_CONTRIBUTION_POSITIVE",
    );
    expect(
      codes(() => compileRuleSet(baseRule({ quorum: { numerator: 4, denominator: 3 } }), { pilot: true })),
    ).toBe("RULE_INVALID");
  });
});

describe("C04 publishRule / acceptRuleVersion — hash exact et immutabilité", () => {
  const now = 1_700_000_000_000;
  const pub = publishRule({ version: 1, groupId: "grpA", snapshot: baseRule(), publishedAt: now });

  it("scelle la version par un hash canonique déterministe", () => {
    const again = publishRule({ version: 1, groupId: "grpA", snapshot: baseRule(), publishedAt: now });
    expect(again.hash).toBe(pub.hash);
    expect(pub.hash).toMatch(/^[0-9a-f]{64}$/);
  });
  it("un contenu différent produit un hash différent", () => {
    const other = publishRule({
      version: 2,
      groupId: "grpA",
      snapshot: baseRule({ contribution: 6000n }),
      publishedAt: now,
    });
    expect(other.hash).not.toBe(pub.hash);
  });
  it("acceptation sur le hash exact OK ; hash erroné refusé", () => {
    const ok = acceptRuleVersion(pub, "idn_a", pub.hash, now);
    expect(ok.version).toBe(1);
    expect(codes(() => acceptRuleVersion(pub, "idn_b", "f".repeat(64), now))).toBe(
      "RULE_ACCEPT_HASH_MISMATCH",
    );
  });
  it("modifier l'instantané d'une version publiée est refusé", () => {
    assertVersionImmutable(pub, baseRule()); // inchangé → OK
    expect(codes(() => assertVersionImmutable(pub, baseRule({ dueDay: 9 })))).toBe(
      "RULE_VERSION_IMMUTABLE",
    );
  });
});

describe("C04 planRuleChange / newRuleEffective — essentiel au cycle suivant", () => {
  const now = 1_700_000_000_000;
  const prev = baseRule();
  const next = baseRule({ contribution: 6000n }); // engagement essentiel
  const plan = planRuleChange(prev, next);

  it("détecte un changement financier essentiel", () => {
    expect(isEssentialFinancialChange(prev, next)).toBe(true);
    expect(plan.appliesTo).toBe("next_cycle");
    expect(plan.requiresAllConcernedAcceptance).toBe(true);
  });
  it("changement non essentiel (quorum seul) = immédiat", () => {
    const p = planRuleChange(baseRule(), baseRule({ quorum: { numerator: 1, denominator: 2 } }));
    expect(p.essential).toBe(false);
    expect(p.appliesTo).toBe("immediate");
  });
  it("un refus d'une personne concernée bloque l'exécution immédiate", () => {
    const pub = publishRule({ version: 2, groupId: "grpA", snapshot: next, publishedAt: now });
    const concerned = ["idn_a", "idn_b", "idn_c"];
    const acc = [
      acceptRuleVersion(pub, "idn_a", pub.hash, now),
      acceptRuleVersion(pub, "idn_b", pub.hash, now),
      // idn_c refuse (aucune acceptation)
    ];
    expect(newRuleEffective(plan, acc, 2, concerned)).toBe(false);
    const allIn = [...acc, acceptRuleVersion(pub, "idn_c", pub.hash, now)];
    expect(newRuleEffective(plan, allIn, 2, concerned)).toBe(true);
  });
});

describe("C04 assertNonRetroactive — aucune échéance passée réécrite", () => {
  const nowMs = 1_700_000_000_000;
  const past: ExistingDue = { obligationId: "obl_1", dueAtMs: nowMs - 10 * DAY, amount: 5000n };
  const future: ExistingDue = { obligationId: "obl_2", dueAtMs: nowMs + 10 * DAY, amount: 5000n };

  it("passer une échéance déjà passée est refusé", () => {
    const after = [past, { ...future, amount: 6000n }];
    expect(codes(() => assertNonRetroactive([past, future], [{ ...past, amount: 6500n }, ...after.slice(1)], nowMs))).toBe(
      "RULE_RETROACTIVE",
    );
  });
  it("augmenter une échéance future est permis", () => {
    const before = [past, future];
    const after = [past, { ...future, amount: 6000n }];
    expect(codes(() => assertNonRetroactive(before, after, nowMs))).toBeNull();
  });
});

describe("C04 requestPenaltyEnabled — pénalités fermées au pilote", () => {
  it("le pilote refuse toujours l'activation", () => {
    expect(requestPenaltyEnabled(true, true)).toEqual({
      requested: true,
      penalty_enabled: false,
      rejected: true,
    });
  });
  it("hors pilote, une activation explicite est possible", () => {
    expect(requestPenaltyEnabled(true, false).penalty_enabled).toBe(true);
  });
});
