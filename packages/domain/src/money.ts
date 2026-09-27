/**
 * Monnaie KÓMBE : XAF entier uniquement. Aucun float, aucune conversion.
 *
 * Représentation interne : bigint. Les montants validés sont bornés à
 * l'entier sûr JSON (Number.MAX_SAFE_INTEGER) pour rester canoniques et
 * comparables à l'oracle de référence indépendant.
 *
 * Plafond par montant (contribution / dette unitaire) : 1 000 000 000 XAF,
 * proposition `[OPEN-D07]` de STACK.md, à confirmer par ADR. Le plafond dur
 * de sécurité JSON s'applique à tout montant, y compris les agrégats.
 *
 * Cf. 01_Audit/ARCHITECTURE_CIBLE.md §Invariants de données.
 */
import { DomainError } from "./errors.js";

/** Borne dure : entier sûr JSON. Cohérent avec l'oracle MAX_SAFE. */
export const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER); // 9_007_199_254_740_991

/** Plafond par montant unitaire (contribution, dette). `[OPEN-D07]`. */
export const PER_AMOUNT_CEILING = 1_000_000_000n;

/** Devise du registre : franc CFA, entier, sans sous-unité. */
export const CURRENCY = "XAF" as const;

/**
 * Valide un montant monétaire : entier bigint, positif ou nul, dans
 * l'entier sûr. Toute autre valeur lève une erreur stable non divulguante.
 */
export function money(value: bigint): bigint {
  if (typeof value !== "bigint") {
    throw new DomainError("MONEY_NOT_INTEGER", "Montant entier requis");
  }
  if (value < 0n) {
    throw new DomainError("MONEY_NEGATIVE", "Montant négatif interdit");
  }
  if (value > MAX_SAFE) {
    throw new DomainError("MONEY_OVER_SAFE_CEILING", "Montant hors entier sûr");
  }
  return value;
}

/**
 * Analyse d'une entrée externe (chaîne, nombre ou bigint) vers un montant
 * valide. Les flottants et les valeurs non entières sont refusés sans
 * arrondi : un float monétaire est une erreur, jamais une approximation.
 */
export function parseAmount(input: string | number | bigint): bigint {
  if (typeof input === "bigint") return money(input);
  if (typeof input === "number") {
    if (!Number.isInteger(input)) {
      throw new DomainError("MONEY_NOT_INTEGER", "Montant non entier refusé");
    }
    if (!Number.isSafeInteger(input)) {
      throw new DomainError("MONEY_OVER_SAFE_CEILING", "Montant hors entier sûr");
    }
    return money(BigInt(input));
  }
  const trimmed = input.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    throw new DomainError("MONEY_NOT_INTEGER", "Montant non entier refusé");
  }
  return money(BigInt(trimmed));
}

/**
 * Valide un montant unitaire soumis à un plafond par montant (contribution,
 * cotisation, dette d'un tour). Refuse dépassement du plafond et valeur nulle
 * lorsqu'une cotisation positive est exigée.
 */
export function perAmount(value: bigint, { positive = false } = {}): bigint {
  money(value);
  if (value > PER_AMOUNT_CEILING) {
    throw new DomainError(
      "MONEY_OVER_PER_AMOUNT_CEILING",
      "Montant unitaire au-dessus du plafond",
    );
  }
  if (positive && value === 0n) {
    throw new DomainError("ROTATION_CONTRIBUTION_POSITIVE", "Cotisation positive requise");
  }
  return value;
}

/**
 * Convertit un montant validé en number pour la canonicalisation JSON.
 * Échoue si la valeur dépasse l'entier sûr — jamais de silencieuse perte.
 */
export function toSafeNumber(value: bigint): number {
  money(value);
  return Number(value);
}
