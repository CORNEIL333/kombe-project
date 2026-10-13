/**
 * Défaut, dette et avance de caisse (lot L-10, ADR-0030 ; résout I-12).
 *
 * Le risque numéro un d'une tontine est le membre qui « bouffe » tôt puis ne
 * cotise plus. Les groupes s'en protègent par un AVALISEUR, en faisant
 * bouffer les nouveaux en dernier, par l'AVANCE de la caisse (le bénéficiaire
 * du jour reçoit quand même, la dette passe à la caisse) et par la REPRISE de
 * place d'un membre sortant.
 *
 * Une dette n'est jamais transformée en paiement : elle se règle par des
 * mouvements déclarés et validés, ou s'abandonne par décision tracée.
 */
import { DomainError } from "../errors.js";
import { perAmount } from "../money.js";

export const DEBT_ORIGINS = ["unpaid_obligation", "fund_advance", "unpaid_fine", "catch_up"] as const;
export type DebtOrigin = (typeof DEBT_ORIGINS)[number];

export const DEBT_STATES = ["open", "settled", "written_off"] as const;
export type DebtState = (typeof DEBT_STATES)[number];

export interface Debt {
  readonly debtId: string;
  readonly debtorMembershipId: string;
  readonly origin: DebtOrigin;
  readonly amount: bigint;
  readonly settled: bigint;
  readonly state: DebtState;
  /** Caisse créancière (avance) ou null (dette envers la rotation). */
  readonly creditorFundId: string | null;
  /** Avaliseur notifié en cas de défaut après la remise. */
  readonly guarantorMembershipId: string | null;
}

export function openDebt(input: Omit<Debt, "settled" | "state">): Debt {
  perAmount(input.amount, { positive: true });
  if (!(DEBT_ORIGINS as readonly string[]).includes(input.origin)) {
    throw new DomainError("DEBT_INVALID", "Origine de dette inconnue");
  }
  if (input.guarantorMembershipId === input.debtorMembershipId) {
    throw new DomainError("DEBT_INVALID", "Un membre n'est pas son propre avaliseur");
  }
  return { ...input, settled: 0n, state: "open" };
}

/** Règlement partiel ou total par un mouvement VALIDÉ ; jamais au-delà du dû. */
export function settleDebt(debt: Debt, amount: bigint): Debt {
  if (debt.state !== "open") throw new DomainError("DEBT_INVALID", "Dette déjà close");
  perAmount(amount, { positive: true });
  const settled = debt.settled + amount;
  if (settled > debt.amount) throw new DomainError("DEBT_INVALID", "Règlement supérieur à la dette");
  return { ...debt, settled, state: settled === debt.amount ? "settled" : "open" };
}

/** Abandon de créance : décision humaine motivée, approuvée par une personne distincte. */
export function writeOffDebt(debt: Debt, input: { readonly reason: string; readonly deciderIdentityId: string; readonly debtorIdentityId: string }): Debt {
  if (debt.state !== "open") throw new DomainError("DEBT_INVALID", "Dette déjà close");
  if (input.reason.trim().length < 3) throw new DomainError("DEBT_INVALID", "Motif d'abandon obligatoire");
  if (input.deciderIdentityId === input.debtorIdentityId) {
    throw new DomainError("APPROVER_NOT_DISTINCT", "On n'abandonne pas sa propre dette");
  }
  return { ...debt, state: "written_off" };
}

export function remainingDebt(debt: Debt): bigint {
  return debt.state === "open" ? debt.amount - debt.settled : 0n;
}

/**
 * Remise d'un tour avec des impayés (I-12). Trois issues, décidées par le
 * groupe et tracées :
 *  - `full_with_advance` : la caisse indiquée avance les parts manquantes ;
 *    le bénéficiaire reçoit le pot complet ; chaque retardataire doit la
 *    somme à la caisse ;
 *  - `reduced` : le bénéficiaire reçoit seulement les parts validées ; chaque
 *    retardataire doit sa part au bénéficiaire (dette envers la rotation) ;
 *  - `wait` : la remise attend (comportement historique).
 */
export type PayoutPolicy = "full_with_advance" | "reduced" | "wait";

export function planPayoutWithArrears(input: {
  readonly policy: PayoutPolicy;
  readonly expectedPot: bigint;
  readonly validatedCollected: bigint;
  readonly arrears: readonly { readonly membershipId: string; readonly missing: bigint }[];
  readonly advanceFundId: string | null;
}): {
  readonly payoutAmount: bigint;
  readonly advanceAmount: bigint;
  readonly debts: readonly { readonly membershipId: string; readonly amount: bigint; readonly creditorFundId: string | null }[];
} {
  const missingTotal = input.arrears.reduce((s, a) => s + a.missing, 0n);
  if (input.validatedCollected + missingTotal !== input.expectedPot) {
    throw new DomainError("RECONCILIATION_INCOHERENTE", "Collecte + impayés ≠ pot attendu");
  }
  switch (input.policy) {
    case "wait":
      if (missingTotal > 0n) throw new DomainError("DEBT_INVALID", "Remise en attente : des parts manquent");
      return { payoutAmount: input.expectedPot, advanceAmount: 0n, debts: [] };
    case "reduced":
      return {
        payoutAmount: input.validatedCollected,
        advanceAmount: 0n,
        debts: input.arrears.filter((a) => a.missing > 0n).map((a) => ({ membershipId: a.membershipId, amount: a.missing, creditorFundId: null })),
      };
    case "full_with_advance":
      // Tour complet : aucune avance à faire, la caisse d'avance est inutile.
      if (missingTotal === 0n) return { payoutAmount: input.expectedPot, advanceAmount: 0n, debts: [] };
      if (!input.advanceFundId) throw new DomainError("DEBT_INVALID", "Caisse d'avance non désignée");
      return {
        payoutAmount: input.expectedPot,
        advanceAmount: missingTotal,
        debts: input.arrears
          .filter((a) => a.missing > 0n)
          .map((a) => ({ membershipId: a.membershipId, amount: a.missing, creditorFundId: input.advanceFundId })),
      };
  }
}

/* ── Reprise de place (rachat du nom) ─────────────────────────────────── */

export type CatchUpMode = "immediate" | "spread";

/**
 * Un repreneur prend la place d'un sortant : il hérite de son tour et de ses
 * obligations futures. Les cotisations déjà versées par le sortant restent
 * acquises au sortant (règlement hors application, documenté) ; le repreneur
 * doit le RATTRAPAGE des tours déjà passés, immédiatement ou étalé sur les
 * séances restantes (comme l'ancien CatchupEngine).
 */
export function catchUpPlan(input: {
  readonly contribution: bigint;
  readonly roundsAlreadyPassed: number;
  readonly roundsRemaining: number;
  readonly mode: CatchUpMode;
}): readonly bigint[] {
  perAmount(input.contribution, { positive: true });
  if (!Number.isInteger(input.roundsAlreadyPassed) || input.roundsAlreadyPassed < 0) {
    throw new DomainError("DEBT_INVALID", "Tours passés invalides");
  }
  const total = input.contribution * BigInt(input.roundsAlreadyPassed);
  if (total === 0n) return [];
  if (input.mode === "immediate" || input.roundsRemaining <= 1) return [total];
  const n = BigInt(input.roundsRemaining);
  const base = total / n;
  const rest = total - base * n;
  return Array.from({ length: input.roundsRemaining }, (_, i) => (i === 0 ? base + rest : base)).filter((x) => x > 0n);
}

/** Avaliseur : membre ACTIF distinct, accepté par le groupe à l'admission. */
export function assertGuarantor(input: {
  readonly newMemberIdentityId: string;
  readonly guarantorIdentityId: string;
  readonly guarantorActive: boolean;
}): void {
  if (input.newMemberIdentityId === input.guarantorIdentityId) {
    throw new DomainError("DEBT_INVALID", "On ne s'avalise pas soi-même");
  }
  if (!input.guarantorActive) {
    throw new DomainError("DEBT_INVALID", "L'avaliseur doit être un membre actif");
  }
}
