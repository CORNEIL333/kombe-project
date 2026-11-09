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
  "custom",
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
  custom: { fr: "Caisse personnalisée", en: "Custom fund" },
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
  custom: { perMeetingAmount: 0n, annualAmount: 0n, controlRequired: false, allowNegative: false },
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

/* ── Caisses personnalisées (retours terrain, oct. 2026) ─────────────────
 * Une tontine crée ses propres caisses et cotisations, chacune avec SES
 * règles : projet commun, fête de fin d'année, achat groupé, caisse d'urgence…
 *
 *   each_meeting : un montant dû à chaque séance (cotisation régulière) ;
 *   one_time     : un montant dû une seule fois (cotisation exceptionnelle),
 *                  à la première séance à partir de la date d'effet ;
 *   free         : contributions libres (volontaires), aucun montant dû.
 *
 * Règle d'or du registre : AUCUNE règle n'est rétroactive. Le montant d'une
 * caisse évolue par un barème daté (`schedule`) ; chaque entrée ne vaut que
 * pour les séances à partir de sa date d'effet, jamais pour les séances
 * passées. Clore une caisse arrête les échéances des séances APRÈS sa date
 * de clôture ; les séances jusqu'à ce jour inclus restent dues.
 */
export const CUSTOM_FUND_MODES = ["each_meeting", "one_time", "free"] as const;
export type CustomFundMode = (typeof CUSTOM_FUND_MODES)[number];

export interface CustomFundStep {
  /** Date d'effet (AAAA-MM-JJ, heure de Douala). */
  readonly from: string;
  /** Montant dû (FCFA entiers) à partir de cette date. */
  readonly amount: string;
}

export interface CustomFundRules {
  readonly mode: CustomFundMode;
  /** À quoi sert la caisse (affiché aux membres). */
  readonly purpose: string | null;
  /** Objectif à atteindre, facultatif (FCFA). */
  readonly target: string | null;
  /** Barème daté, trié par date croissante (vide pour une caisse libre). */
  readonly schedule: readonly CustomFundStep[];
  /** Date de clôture : plus aucune échéance pour les séances postérieures. */
  readonly closedOn: string | null;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const AMOUNT = /^\d{1,12}$/;

/** Lit des règles stockées (JSON) en règles sûres ; défauts prudents. */
export function parseCustomFundRules(raw: unknown): CustomFundRules {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const mode = (CUSTOM_FUND_MODES as readonly string[]).includes(String(r.mode)) ? (r.mode as CustomFundMode) : "free";
  const schedule = Array.isArray(r.schedule)
    ? (r.schedule as unknown[])
        .map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : {}))
        .filter((x) => ISO_DAY.test(String(x.from)) && AMOUNT.test(String(x.amount)))
        .map((x) => ({ from: String(x.from), amount: String(x.amount) }))
        .sort((a, b) => a.from.localeCompare(b.from))
    : [];
  return {
    mode,
    purpose: typeof r.purpose === "string" && r.purpose.trim() ? r.purpose.trim() : null,
    target: typeof r.target === "string" && AMOUNT.test(r.target) && r.target !== "0" ? r.target : null,
    schedule,
    closedOn: typeof r.closedOn === "string" && ISO_DAY.test(r.closedOn) ? r.closedOn : null,
  };
}

/**
 * Montant dû sur une caisse personnalisée pour une séance datée.
 * `firstOnOrAfter` : date de la première séance à partir de la date d'effet
 * (sert au mode « une seule fois »).
 */
export function customFundDue(rules: CustomFundRules, roundDate: string, firstOnOrAfter: string | null): bigint {
  if (rules.closedOn && roundDate > rules.closedOn) return 0n;
  if (rules.mode === "free" || rules.schedule.length === 0) return 0n;
  if (rules.mode === "one_time") {
    const first = rules.schedule[0];
    if (!first || firstOnOrAfter === null || roundDate !== firstOnOrAfter) return 0n;
    return BigInt(first.amount);
  }
  let due = 0n;
  for (const step of rules.schedule) if (step.from <= roundDate) due = BigInt(step.amount);
  return due;
}

export interface CreateCustomFundInput {
  readonly name: string;
  readonly mode: CustomFundMode;
  readonly amount?: string | undefined;
  readonly from?: string | undefined;
  readonly purpose?: string | null | undefined;
  readonly target?: string | null | undefined;
}

/** Construit et valide les règles d'une nouvelle caisse (date d'effet ≥ aujourd'hui). */
export function newCustomFundRules(input: CreateCustomFundInput, today: string): CustomFundRules {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) throw new DomainError("FUND_INVALID", "Nom de caisse de 2 à 80 caractères");
  if (!(CUSTOM_FUND_MODES as readonly string[]).includes(input.mode)) throw new DomainError("FUND_INVALID", "Type de cotisation inconnu");
  const purpose = input.purpose?.trim() ? input.purpose.trim().slice(0, 280) : null;
  const target = input.target && input.target !== "0" ? input.target : null;
  if (target !== null && !AMOUNT.test(target)) throw new DomainError("FUND_INVALID", "Objectif : montant entier en FCFA");
  if (input.mode === "free") return { mode: "free", purpose, target, schedule: [], closedOn: null };
  const amount = input.amount ?? "";
  if (!AMOUNT.test(amount) || BigInt(amount) <= 0n) throw new DomainError("FUND_INVALID", "Montant de la cotisation : entier positif en FCFA");
  perAmount(BigInt(amount));
  const from = input.from ?? today;
  if (!ISO_DAY.test(from)) throw new DomainError("FUND_INVALID", "Date d'effet invalide");
  if (from < today) throw new DomainError("FUND_INVALID", "Une règle n'est jamais rétroactive : la date d'effet est aujourd'hui ou plus tard");
  return { mode: input.mode, purpose, target, schedule: [{ from, amount }], closedOn: null };
}

export interface UpdateCustomFundInput {
  readonly name?: string | undefined;
  readonly purpose?: string | null | undefined;
  readonly target?: string | null | undefined;
  /** Nouveau montant, à partir de `from` (≥ aujourd'hui). */
  readonly amount?: string | undefined;
  readonly from?: string | undefined;
  /** Clôturer la caisse aujourd'hui (les séances jusqu'à aujourd'hui restent dues). */
  readonly close?: boolean | undefined;
}

/** Applique une modification sans jamais réécrire le passé. */
export function updateCustomFundRules(cur: CustomFundRules, input: UpdateCustomFundInput, today: string): CustomFundRules {
  if (cur.closedOn) throw new DomainError("FUND_INVALID", "Caisse déjà clôturée");
  let schedule = [...cur.schedule];
  if (input.amount !== undefined) {
    if (cur.mode === "free") throw new DomainError("FUND_INVALID", "Une caisse libre n'a pas de montant dû");
    if (cur.mode === "one_time") throw new DomainError("FUND_INVALID", "Une cotisation unique ne change pas de montant : créez une nouvelle cotisation");
    if (!AMOUNT.test(input.amount) || BigInt(input.amount) <= 0n) throw new DomainError("FUND_INVALID", "Montant : entier positif en FCFA");
    perAmount(BigInt(input.amount));
    const from = input.from ?? today;
    if (!ISO_DAY.test(from) || from < today) throw new DomainError("FUND_INVALID", "Une règle n'est jamais rétroactive : la date d'effet est aujourd'hui ou plus tard");
    schedule = schedule.filter((st) => st.from < from).concat([{ from, amount: input.amount }]);
  }
  const target = input.target === undefined ? cur.target : input.target && input.target !== "0" ? input.target : null;
  if (target !== null && !AMOUNT.test(target)) throw new DomainError("FUND_INVALID", "Objectif : montant entier en FCFA");
  return {
    mode: cur.mode,
    purpose: input.purpose === undefined ? cur.purpose : input.purpose?.trim() ? input.purpose.trim().slice(0, 280) : null,
    target,
    schedule,
    closedOn: input.close ? today : null,
  };
}
