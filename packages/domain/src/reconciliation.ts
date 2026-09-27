/**
 * Rapprochement financier d'un groupe.
 *
 * L'écart = cotisations − versements nets − frais de groupe. Une clôture
 * n'est autorisée que si l'écart est nul ET qu'aucun litige n'est ouvert.
 * Un écart négatif est légal en calcul (signale un surplus de versement)
 * mais bloque la clôture ; il est traité comme anomalie métier, pas masqué.
 * Cf. oracle `reconciliation` ; ARCHITECTURE_CIBLE §Journal et preuves.
 */
import { money } from "./money.js";

export interface ReconciliationResult {
  readonly gap: bigint;
  readonly canCloseIfObligationsComplete: boolean;
}

export function reconciliation(
  contributions: bigint,
  netDisbursements: bigint,
  groupFees: bigint,
  disputed = false,
): ReconciliationResult {
  money(contributions);
  money(netDisbursements);
  money(groupFees);
  const gap = contributions - netDisbursements - groupFees;
  return {
    gap,
    canCloseIfObligationsComplete: gap === 0n && !disputed,
  };
}
