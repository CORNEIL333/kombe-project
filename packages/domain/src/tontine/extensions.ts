/**
 * Extensions sous drapeau fermé (lots L-19 et L-21, ADR-0032).
 *
 * Prêts internes : REGISTRE seulement. KÓMBE ne prête rien et ne calcule pas
 * d'« intérêt » : on parle de « frais de participation » fixés par le groupe.
 * Le risque de qualification réglementaire (COBAC/CEMAC, microfinance) est
 * noté dans l'ADR ; l'activation exige une décision écrite du porteur.
 *
 * Collecte journalière par un tontinier : un tiers collecte chaque jour et
 * restitue en fin de période moins sa commission. C'est LE COLLECTEUR qui
 * détient l'argent, jamais KÓMBE ; l'écran doit le dire.
 */
import { DomainError } from "../errors.js";
import { perAmount } from "../money.js";

export const FEATURE_FLAGS = ["loan_register", "auction", "daily_collector"] as const;
export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

/** Tous fermés par défaut ; seul le porteur les ouvre (variable d'environnement serveur). */
export function parseFeatureFlags(env: string | undefined): readonly FeatureFlag[] {
  if (!env) return [];
  return env
    .split(",")
    .map((x) => x.trim())
    .filter((x): x is FeatureFlag => (FEATURE_FLAGS as readonly string[]).includes(x));
}

export function assertFlag(flags: readonly FeatureFlag[], flag: FeatureFlag): void {
  if (!flags.includes(flag)) {
    throw new DomainError("FUND_KIND_DISABLED", "Fonction fermée tant que le porteur ne l'a pas ouverte");
  }
}

/* ── Registre de prêts ─────────────────────────────────────────────────── */

export interface LoanTerms {
  readonly principal: bigint;
  /** Frais de participation FIXES (jamais un taux). */
  readonly participationFee: bigint;
  readonly installments: number;
  readonly guarantorMembershipId: string | null;
}

export function loanSchedule(t: LoanTerms): readonly bigint[] {
  perAmount(t.principal, { positive: true });
  perAmount(t.participationFee);
  if (!Number.isInteger(t.installments) || t.installments < 1 || t.installments > 24) {
    throw new DomainError("FUND_INVALID", "De 1 à 24 échéances");
  }
  const total = t.principal + t.participationFee;
  const n = BigInt(t.installments);
  const base = total / n;
  const rest = total - base * n;
  return Array.from({ length: t.installments }, (_, i) => (i === t.installments - 1 ? base + rest : base));
}

/* ── Collecte journalière ──────────────────────────────────────────────── */

/**
 * Restitution d'une période de collecte : total collecté moins la commission
 * déclarée du collecteur (souvent une journée de mise par mois).
 */
export function collectorPayout(input: { readonly dailyAmount: bigint; readonly daysCollected: number; readonly commissionDays: number }): {
  readonly collected: bigint;
  readonly commission: bigint;
  readonly returned: bigint;
} {
  perAmount(input.dailyAmount, { positive: true });
  if (!Number.isInteger(input.daysCollected) || input.daysCollected < 0 || input.daysCollected > 31) {
    throw new DomainError("FUND_INVALID", "Jours collectés invalides");
  }
  if (!Number.isInteger(input.commissionDays) || input.commissionDays < 0 || input.commissionDays > input.daysCollected) {
    throw new DomainError("FUND_INVALID", "Commission invalide");
  }
  const collected = input.dailyAmount * BigInt(input.daysCollected);
  const commission = input.dailyAmount * BigInt(input.commissionDays);
  return { collected, commission, returned: collected - commission };
}

export const COLLECTOR_DISCLAIMER = {
  fr: "Le collecteur détient l'argent collecté. KÓMBE tient seulement le registre de ce qu'il a reçu et rendu.",
  en: "The collector holds the money collected. KÓMBE only keeps the record of what was received and returned.",
} as const;
