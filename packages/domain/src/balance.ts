/**
 * Solde sous verrou : disponible à déclarer et restant dû affichés.
 *
 * Copie fidèle de l'oracle `remaining` : le validé ne dépasse jamais la
 * réservation active, et la réservation active ne dépasse jamais le dû.
 * En production, ces valeurs sont lues SOUS VERROU PostgreSQL ; ici elles
 * sont passées en argument pour isoler la règle de tout accès aux données.
 * Cf. 01_Audit/ARCHITECTURE_CIBLE.md §« Sous verrou ».
 */
import { DomainError } from "./errors.js";
import { money } from "./money.js";

export interface BalanceResult {
  readonly remainingDue: bigint;
  readonly availableToDeclare: bigint;
}

export function remaining(
  due: bigint,
  validated: bigint,
  activeReserved: bigint,
): BalanceResult {
  money(due);
  money(validated);
  money(activeReserved);
  if (validated > activeReserved || activeReserved > due) {
    throw new DomainError("RESERVATION_INCOHERENTE", "Réservation incohérente");
  }
  return {
    remainingDue: due - validated,
    availableToDeclare: due - activeReserved,
  };
}
