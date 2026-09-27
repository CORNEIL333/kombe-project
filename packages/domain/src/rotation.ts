/**
 * Rotation égale d'une tontine fermée : une part par membre, un tour par
 * membre, le pot de chaque tour financé par la cotisation de chacun.
 *
 * Oracle indépendant attendu : production.test croise ces résultats avec la
 * référence Python (`reference_oracles.rotation`), jamais l'inverse.
 * Cf. 01_Audit/ARCHITECTURE_CIBLE.md §Invariants ; STACK.md « rotation égale ».
 */
import { DomainError } from "./errors.js";
import { money } from "./money.js";

export interface RotationResult {
  readonly roundPot: bigint;
  readonly rounds: number;
  readonly cycleTotal: bigint;
}

export function rotation(memberCount: number, contribution: bigint): RotationResult {
  if (!Number.isInteger(memberCount) || memberCount < 2) {
    throw new DomainError("ROTATION_MEMBERS_MIN", "Au moins deux membres requis");
  }
  money(contribution);
  if (contribution === 0n) {
    throw new DomainError("ROTATION_CONTRIBUTION_POSITIVE", "Cotisation positive requise");
  }
  const n = BigInt(memberCount);
  const roundPot = money(n * contribution);
  const cycleTotal = money(n * roundPot);
  return { roundPot, rounds: memberCount, cycleTotal };
}
