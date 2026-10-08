/**
 * KÓMBE @kombe/api — codec d'instantané de règle pour la persistance réelle
 * (C04/C05). Un `RuleSet` porte une cotisation `bigint` : `JSON.stringify`
 * refuserait un bigint brut, et la colonne `rule_version.snapshot` (jsonb)
 * doit rester fidèle à l'instantané scellé par `canonicalHash`. La cotisation
 * est donc sérialisée en **chaîne d'entiers** (jamais un flottant, ADR-0002)
 * et relue via `BigInt` — la forme relue redonne EXACTEMENT le même hash
 * canonique (aucune reprise de données n'est possible sans nouvelle version).
 */
import { DomainError, type Frequency, type RuleSet } from "@kombe/domain";

/** Sérialise un instantané pour jsonb : la cotisation devient une chaîne. */
export function serializeRuleSnapshot(s: RuleSet): string {
  return JSON.stringify({ ...s, contribution: s.contribution.toString() });
}

/** Relit un instantané persisté ; toute forme illisible est refusée. */
export function reviveRuleSnapshot(value: unknown): RuleSet {
  const v = value as Record<string, unknown> | null;
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    throw new DomainError("RULE_INVALID", "Instantané de règle illisible");
  }
  const quorum = v["quorum"] as { numerator?: unknown; denominator?: unknown } | null;
  const frequency = v["frequency"];
  try {
    if (frequency !== "monthly" && frequency !== "weekly") throw new Error("fréquence");
    const contribution = BigInt(String(v["contribution"]));
    if (contribution < 0n) throw new Error("cotisation");
    const out: RuleSet = {
      memberCount: Number(v["memberCount"]),
      contribution,
      rounds: Number(v["rounds"]),
      frequency: frequency as Frequency,
      dueDay: Number(v["dueDay"]),
      quorum: {
        numerator: Number(quorum?.numerator),
        denominator: Number(quorum?.denominator),
      },
      gracePeriodDays: Number(v["gracePeriodDays"]),
      penaltyEnabled: v["penaltyEnabled"] === true,
    };
    if (
      !Number.isInteger(out.memberCount) ||
      !Number.isInteger(out.rounds) ||
      !Number.isInteger(out.dueDay) ||
      !Number.isInteger(out.quorum.numerator) ||
      !Number.isInteger(out.quorum.denominator) ||
      !Number.isInteger(out.gracePeriodDays)
    ) {
      throw new Error("entier");
    }
    return out;
  } catch {
    throw new DomainError("RULE_INVALID", "Instantané de règle illisible");
  }
}
