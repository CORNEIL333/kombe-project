/**
 * Caisse de secours (lot L-08, ADR-0029).
 *
 * Quasi universelle dans les associations : une cotisation fixe alimente une
 * caisse qui verse une aide selon un BARÈME inscrit au règlement (décès du
 * membre, du conjoint, d'un parent ou d'un enfant ; naissance ; mariage ;
 * maladie ou hospitalisation). Aucune pièce justificative n'est exigée par
 * défaut (minimisation, ADR-0016) : le bureau décide, ou le groupe vote.
 */
import { DomainError } from "../errors.js";
import { perAmount } from "../money.js";

export const AID_EVENTS = [
  "death_member",
  "death_spouse",
  "death_parent",
  "death_child",
  "birth",
  "marriage",
  "illness",
  "other",
] as const;
export type AidEvent = (typeof AID_EVENTS)[number];

export const AID_LABELS: Readonly<Record<AidEvent, { fr: string; en: string }>> = {
  death_member: { fr: "Décès du membre", en: "Death of the member" },
  death_spouse: { fr: "Décès du conjoint", en: "Death of a spouse" },
  death_parent: { fr: "Décès d'un parent", en: "Death of a parent" },
  death_child: { fr: "Décès d'un enfant", en: "Death of a child" },
  birth: { fr: "Naissance", en: "Birth" },
  marriage: { fr: "Mariage", en: "Marriage" },
  illness: { fr: "Maladie ou hospitalisation", en: "Illness or hospital stay" },
  other: { fr: "Autre événement", en: "Other event" },
};

export interface AidScaleEntry {
  readonly event: AidEvent;
  readonly amount: bigint;
  /** Nombre maximal d'aides de ce type par membre et par exercice (0 = sans). */
  readonly maxPerYear: number;
}

/** Barème : une ligne par événement couvert ; un événement absent n'est pas couvert. */
export type AidScale = readonly AidScaleEntry[];

export function assertAidScale(scale: AidScale): void {
  const seen = new Set<AidEvent>();
  for (const e of scale) {
    if (!(AID_EVENTS as readonly string[]).includes(e.event)) {
      throw new DomainError("AID_INVALID", "Événement inconnu au barème");
    }
    if (seen.has(e.event)) throw new DomainError("AID_INVALID", "Événement en double au barème");
    seen.add(e.event);
    perAmount(e.amount, { positive: true });
    if (!Number.isInteger(e.maxPerYear) || e.maxPerYear < 0 || e.maxPerYear > 52) {
      throw new DomainError("AID_INVALID", "Nombre maximal par an invalide");
    }
  }
}

export const AID_STATES = ["requested", "approved", "rejected", "paid", "cancelled"] as const;
export type AidState = (typeof AID_STATES)[number];

const AID_TRANSITIONS: Readonly<Record<AidState, readonly AidState[]>> = {
  requested: ["approved", "rejected", "cancelled"],
  approved: ["paid", "cancelled"],
  rejected: [],
  paid: [],
  cancelled: [],
};

export function transitionAid(from: AidState, to: AidState): AidState {
  if (!AID_TRANSITIONS[from].includes(to)) {
    throw new DomainError("AID_INVALID", `Secours : ${from} → ${to} impossible`);
  }
  return to;
}

/**
 * Montant d'aide applicable : celui du barème, plafonné par le nombre d'aides
 * déjà reçues sur l'exercice. Un montant différent du barème exige une
 * décision motivée (vote ou bureau) et n'est jamais supérieur au double du
 * barème (garde-fou contre la faveur).
 */
export function aidAmount(input: {
  readonly scale: AidScale;
  readonly event: AidEvent;
  readonly alreadyThisYear: number;
  readonly overrideAmount?: bigint | null;
  readonly overrideReason?: string | null;
}): bigint {
  const entry = input.scale.find((e) => e.event === input.event);
  if (!entry) throw new DomainError("AID_INVALID", "Événement non couvert par le règlement");
  if (entry.maxPerYear > 0 && input.alreadyThisYear >= entry.maxPerYear) {
    throw new DomainError("AID_CAP_EXCEEDED", "Plafond annuel atteint pour cet événement");
  }
  const override = input.overrideAmount ?? null;
  if (override === null) return entry.amount;
  perAmount(override, { positive: true });
  if (!input.overrideReason || input.overrideReason.trim().length < 3) {
    throw new DomainError("AID_INVALID", "Un montant hors barème exige un motif");
  }
  if (override > entry.amount * 2n) {
    throw new DomainError("AID_CAP_EXCEEDED", "Montant hors barème plafonné au double du barème");
  }
  return override;
}

/** Le décideur n'est jamais le bénéficiaire de l'aide. */
export function assertAidDecider(deciderIdentityId: string, beneficiaryIdentityId: string): void {
  if (deciderIdentityId === beneficiaryIdentityId) {
    throw new DomainError("APPROVER_NOT_DISTINCT", "On ne décide pas de sa propre aide");
  }
}

/** Exercice d'une date (année civile par défaut ; les associations clôturent souvent en décembre). */
export function fiscalYear(isoDate: string): number {
  const m = /^(\d{4})-\d{2}-\d{2}$/.exec(isoDate);
  if (!m) throw new DomainError("AID_INVALID", "Date invalide");
  return Number(m[1]);
}

/**
 * Cotisation exceptionnelle votée (« on cotise pour le deuil de X ») :
 * montant identique pour chaque membre actif, sauf le bénéficiaire.
 */
export function exceptionalCall(memberIds: readonly string[], beneficiaryId: string, amountEach: bigint): readonly { readonly memberId: string; readonly amount: bigint }[] {
  perAmount(amountEach, { positive: true });
  return memberIds.filter((m) => m !== beneficiaryId).map((memberId) => ({ memberId, amount: amountEach }));
}
