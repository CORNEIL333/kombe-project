/**
 * Caisses multiples d'une association (lots L-07, L-16 ; ADR-0029).
 *
 * Une association camerounaise tient plusieurs caisses en parallèle :
 * njangi (rotation), secours, réserve de fin d'année, fonds de caisse
 * (fonctionnement, réception), amendes, et parfois prêts. KÓMBE tient le
 * REGISTRE de chaque caisse ; il ne détient jamais l'argent.
 *
 * Toute entrée ou sortie d'une caisse est un MOUVEMENT déclaré (mouvement
 * externe : espèces, Orange Money, MTN MoMo, banque), confirmé par la
 * trésorerie et, si la caisse l'exige, contrôlé par le commissaire. Le solde
 * affiché est un « écart du registre » dérivé des mouvements validés, jamais
 * une somme détenue par KÓMBE.
 */
import { DomainError } from "../errors.js";
import { perAmount } from "../money.js";

export const FUND_KINDS = [
  "rotation",
  "solidarity",
  "year_end_reserve",
  "operating",
  "fines",
  "loan",
  "collector",
] as const;
export type FundKind = (typeof FUND_KINDS)[number];

/** Caisses sous drapeau fermé par défaut (ADR-0032) : activation par le porteur. */
export const FLAGGED_FUND_KINDS: readonly FundKind[] = ["loan", "collector"];

export const FUND_LABELS: Readonly<Record<FundKind, { fr: string; en: string }>> = {
  rotation: { fr: "Tontine (njangi)", en: "Njangi (rotation)" },
  solidarity: { fr: "Caisse de secours", en: "Solidarity fund" },
  year_end_reserve: { fr: "Réserve de fin d'année", en: "Year-end reserve" },
  operating: { fr: "Fonds de caisse", en: "Operating fund" },
  fines: { fr: "Caisse des amendes", en: "Fines fund" },
  loan: { fr: "Caisse de prêts (registre)", en: "Loan fund (register)" },
  collector: { fr: "Collecte par un tontinier", en: "Daily collector" },
};

/**
 * `international_transfer` : membre de la diaspora qui paie par un service de
 * transfert (Western Union, WorldRemit, Wave, Taptap Send…). Le montant
 * déclaré est celui REÇU en FCFA au Cameroun ; la référence du transfert est
 * obligatoire (ou un motif), comme pour tout canal électronique (L-16).
 */
export const PAYMENT_CHANNELS = ["cash", "orange_money", "mtn_momo", "bank", "international_transfer", "other"] as const;
export type PaymentChannel = (typeof PAYMENT_CHANNELS)[number];

export const CHANNEL_LABELS: Readonly<Record<PaymentChannel, { fr: string; en: string }>> = {
  cash: { fr: "Espèces", en: "Cash" },
  orange_money: { fr: "Orange Money", en: "Orange Money" },
  mtn_momo: { fr: "MTN MoMo", en: "MTN MoMo" },
  bank: { fr: "Banque", en: "Bank" },
  international_transfer: { fr: "Transfert depuis l'étranger", en: "Transfer from abroad" },
  other: { fr: "Autre", en: "Other" },
};

/**
 * Format INDICATIF de la référence de transaction par canal. Une référence
 * n'est jamais un reçu authentifié : elle aide le trésorier à rapprocher.
 * Absente pour un canal électronique ⇒ motif obligatoire (comme en C06).
 */
export function assertChannelReference(input: {
  readonly channel: PaymentChannel;
  readonly reference: string | null;
  readonly justification: string | null;
}): void {
  if (!(PAYMENT_CHANNELS as readonly string[]).includes(input.channel)) {
    throw new DomainError("FUND_INVALID", "Canal de paiement inconnu");
  }
  const ref = input.reference?.trim() ?? "";
  if (input.channel === "cash") return;
  if (ref === "") {
    if (!input.justification || input.justification.trim() === "") {
      throw new DomainError("REFERENCE_JUSTIFICATION_REQUIRED", "Référence absente : motif obligatoire");
    }
    return;
  }
  if (ref.length > 64 || !/^[A-Za-z0-9.\-_/ ]+$/.test(ref)) {
    throw new DomainError("FUND_INVALID", "Référence de transaction illisible");
  }
}

/** Qui supporte les frais Mobile Money d'envoi et de cash-out (règle du groupe). */
export const WITHDRAWAL_FEE_BEARERS = ["member", "beneficiary", "fund"] as const;
export type WithdrawalFeeBearer = (typeof WITHDRAWAL_FEE_BEARERS)[number];

export const MOVEMENT_KINDS = [
  "contribution", // cotisation d'un membre à la caisse
  "payout", // remise (cagnotte, secours, restitution de réserve)
  "fine_payment", // paiement d'une amende
  "advance", // avance de la caisse à un membre ou pour le compte d'un membre
  "advance_repayment", // remboursement d'une avance
  "transfer_in",
  "transfer_out",
  "fee", // frais supportés par la caisse
  "expense", // dépense de fonctionnement (réception, fournitures)
] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

/** Sens d'un mouvement pour l'écart du registre de la caisse. */
export function movementSign(kind: MovementKind): 1 | -1 {
  switch (kind) {
    case "contribution":
    case "fine_payment":
    case "advance_repayment":
    case "transfer_in":
      return 1;
    case "payout":
    case "advance":
    case "transfer_out":
    case "fee":
    case "expense":
      return -1;
  }
}

export const MOVEMENT_STATES = ["declared", "confirmed", "validated", "rejected", "compensated"] as const;
export type MovementState = (typeof MOVEMENT_STATES)[number];

export interface MovementActs {
  readonly declarantIdentityId: string;
  readonly confirmerIdentityId: string | null;
  readonly controllerIdentityId: string | null;
}

/**
 * Circuit de validation d'un mouvement : déclaré → confirmé (trésorerie,
 * personne distincte du déclarant) → validé (commissaire distinct des deux,
 * si la caisse l'exige ; sinon la confirmation valide). Même règle
 * d'indépendance que les cotisations C07 (ADR-0018).
 */
export function confirmMovement(
  state: MovementState,
  acts: MovementActs,
  confirmerIdentityId: string,
  controlRequired: boolean,
): { readonly state: MovementState } {
  if (state !== "declared") {
    throw new DomainError("MOVEMENT_STATE_INVALID", "Seul un mouvement déclaré se confirme");
  }
  if (confirmerIdentityId === acts.declarantIdentityId) {
    throw new DomainError("MOVEMENT_NOT_INDEPENDENT", "Le déclarant ne confirme pas sa propre opération");
  }
  return { state: controlRequired ? "confirmed" : "validated" };
}

export function controlMovement(
  state: MovementState,
  acts: MovementActs,
  controllerIdentityId: string,
): { readonly state: MovementState } {
  if (state !== "confirmed") {
    throw new DomainError("MOVEMENT_STATE_INVALID", "Seul un mouvement confirmé se contrôle");
  }
  if (controllerIdentityId === acts.declarantIdentityId || controllerIdentityId === acts.confirmerIdentityId) {
    throw new DomainError("MOVEMENT_NOT_INDEPENDENT", "Le contrôleur est distinct du déclarant et du confirmateur");
  }
  return { state: "validated" };
}

export function rejectMovement(state: MovementState, reason: string): { readonly state: MovementState } {
  if (state !== "declared" && state !== "confirmed") {
    throw new DomainError("MOVEMENT_STATE_INVALID", "Seul un mouvement en cours se rejette");
  }
  if (reason.trim() === "") throw new DomainError("FUND_INVALID", "Motif de rejet obligatoire");
  return { state: "rejected" };
}

/** Une correction compense un mouvement VALIDÉ par une contre-écriture totale. */
export function assertCompensable(state: MovementState, alreadyCompensated: boolean): void {
  if (state !== "validated") {
    throw new DomainError("MOVEMENT_STATE_INVALID", "Seul un mouvement validé se compense");
  }
  if (alreadyCompensated) {
    throw new DomainError("CONTRIBUTION_ALREADY_COMPENSATED", "Mouvement déjà compensé");
  }
}

export interface LedgerLine {
  readonly kind: MovementKind;
  readonly amount: bigint;
  readonly state: MovementState;
  readonly compensatesId?: string | null;
}

/**
 * Écart du registre d'une caisse : somme signée des mouvements VALIDÉS,
 * les contre-écritures annulant leur original. Un mouvement déclaré ou
 * confirmé n'entre jamais dans ce total (il est montré à part, « en cours »).
 */
export function fundLedger(lines: readonly LedgerLine[]): {
  readonly registerBalance: bigint;
  readonly inProgressIn: bigint;
  readonly inProgressOut: bigint;
} {
  let balance = 0n;
  let inIn = 0n;
  let inOut = 0n;
  for (const l of lines) {
    const sign = BigInt(movementSign(l.kind));
    if (l.state === "validated") {
      balance += sign * l.amount;
    } else if (l.state === "compensated") {
      // L'original compensé reste dans l'historique, son effet est annulé par
      // la contre-écriture (elle-même validée, de signe opposé) : on le garde
      // ici pour que la paire s'annule exactement.
      balance += sign * l.amount;
    } else if (l.state === "declared" || l.state === "confirmed") {
      if (sign > 0n) inIn += l.amount;
      else inOut += l.amount;
    }
  }
  return { registerBalance: balance, inProgressIn: inIn, inProgressOut: inOut };
}

/** Kind de la contre-écriture d'un mouvement (sens opposé). */
export function reversalKind(kind: MovementKind): MovementKind {
  return movementSign(kind) > 0 ? "transfer_out" : "transfer_in";
}

export interface FundRules {
  /** Montant fixe dû par séance (secours, fonds de caisse) ; 0 = libre. */
  readonly perMeetingAmount: bigint;
  /** Montant annuel fixe (secours annuel) ; 0 = sans. */
  readonly annualAmount: bigint;
  /** Contrôle du commissaire exigé en plus de la confirmation. */
  readonly controlRequired: boolean;
  /** Une sortie peut-elle rendre l'écart du registre négatif ? (avance) */
  readonly allowNegative: boolean;
}

export const DEFAULT_FUND_RULES: Readonly<Record<FundKind, FundRules>> = {
  rotation: { perMeetingAmount: 0n, annualAmount: 0n, controlRequired: true, allowNegative: false },
  solidarity: { perMeetingAmount: 0n, annualAmount: 0n, controlRequired: true, allowNegative: false },
  year_end_reserve: { perMeetingAmount: 0n, annualAmount: 0n, controlRequired: true, allowNegative: false },
  operating: { perMeetingAmount: 0n, annualAmount: 0n, controlRequired: false, allowNegative: false },
  fines: { perMeetingAmount: 0n, annualAmount: 0n, controlRequired: false, allowNegative: false },
  loan: { perMeetingAmount: 0n, annualAmount: 0n, controlRequired: true, allowNegative: false },
  collector: { perMeetingAmount: 0n, annualAmount: 0n, controlRequired: false, allowNegative: false },
};

export function assertFundRules(r: FundRules): void {
  perAmount(r.perMeetingAmount);
  perAmount(r.annualAmount);
}

/**
 * Une sortie validée ne peut pas dépasser l'écart du registre, sauf caisse
 * autorisant l'avance (fonds de caisse qui avance une cagnotte, ADR-0030).
 */
export function assertOutflowCovered(balance: bigint, amount: bigint, rules: FundRules): void {
  if (!rules.allowNegative && amount > balance) {
    throw new DomainError("FUND_INVALID", "Sortie supérieure à l'écart du registre de la caisse");
  }
}

/** Une caisse sous drapeau fermé ne se crée pas sans décision du porteur. */
export function assertFundKindEnabled(kind: FundKind, enabledFlags: readonly FundKind[]): void {
  if (!(FUND_KINDS as readonly string[]).includes(kind)) {
    throw new DomainError("FUND_INVALID", "Type de caisse inconnu");
  }
  if (FLAGGED_FUND_KINDS.includes(kind) && !enabledFlags.includes(kind)) {
    throw new DomainError("FUND_KIND_DISABLED", "Caisse désactivée tant que le porteur ne l'a pas ouverte");
  }
}

/** Montant net remis quand des frais Mobile Money existent. */
export function netAfterFees(gross: bigint, fee: bigint, bearer: WithdrawalFeeBearer): { readonly net: bigint; readonly fundFee: bigint } {
  perAmount(gross);
  perAmount(fee);
  if (fee > gross) throw new DomainError("FUND_INVALID", "Frais supérieurs au montant");
  switch (bearer) {
    case "beneficiary":
      return { net: gross - fee, fundFee: 0n };
    case "fund":
      return { net: gross, fundFee: fee };
    case "member":
      return { net: gross, fundFee: 0n };
  }
}

/* ── Réserve de fin d'année : chacun reprend ce qu'il a mis ─────────────── */

export interface ReserveEntitlement {
  readonly membershipId: string;
  /** Total confirmé versé par le membre dans la réserve. */
  readonly contributed: bigint;
  /** Déjà rendu (remises de réserve non rejetées). */
  readonly returned: bigint;
}

/**
 * Plan de redistribution de la réserve : chacun reprend ce qu'il a versé et
 * qui ne lui a pas encore été rendu. Si la caisse ne couvre pas tout (dépense
 * votée, par exemple), le disponible est partagé au prorata, au franc près
 * (plus forts restes, puis ordre des identifiants) : la somme rendue n'excède
 * jamais le disponible.
 */
export function planReserveDistribution(
  available: bigint,
  entitlements: readonly ReserveEntitlement[],
): { readonly membershipId: string; readonly owed: bigint; readonly amount: bigint }[] {
  const owed = entitlements
    .map((e) => ({ membershipId: e.membershipId, owed: e.contributed - e.returned }))
    .filter((e) => e.owed > 0n)
    .sort((a, b) => (a.membershipId < b.membershipId ? -1 : a.membershipId > b.membershipId ? 1 : 0));
  const total = owed.reduce((s, e) => s + e.owed, 0n);
  if (total === 0n || available <= 0n) return [];
  if (available >= total) return owed.map((e) => ({ ...e, amount: e.owed }));
  const base = owed.map((e) => ({ ...e, amount: (e.owed * available) / total, rest: (e.owed * available) % total }));
  let left = available - base.reduce((s, e) => s + e.amount, 0n);
  const byRest = [...base].sort((a, b) => (b.rest > a.rest ? 1 : b.rest < a.rest ? -1 : a.membershipId < b.membershipId ? -1 : 1));
  for (const e of byRest) {
    if (left === 0n) break;
    e.amount += 1n;
    left -= 1n;
  }
  return base.filter((e) => e.amount > 0n).map(({ membershipId, owed: o, amount }) => ({ membershipId, owed: o, amount }));
}
