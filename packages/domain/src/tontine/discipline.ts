/**
 * Amendes et discipline (lot L-09, ADR-0029 qui remplace la barre « aucune
 * pénalité » de l'ADR-0005 pour une caisse SÉPARÉE de la rotation).
 *
 * Le censeur constate, le membre peut contester (circuit de litige), le
 * trésorier encaisse le paiement (déclaration puis confirmation). Une amende
 * ne modifie JAMAIS un montant de cotisation : elle vit dans la caisse des
 * amendes.
 */
import { DomainError } from "../errors.js";
import { perAmount } from "../money.js";

export const FINE_KINDS = [
  "late_contribution",
  "meeting_late",
  "meeting_absence",
  "indiscipline",
] as const;
export type FineKind = (typeof FINE_KINDS)[number];

export const FINE_LABELS: Readonly<Record<FineKind, { fr: string; en: string }>> = {
  late_contribution: { fr: "Retard de cotisation", en: "Late contribution" },
  meeting_late: { fr: "Retard à la séance", en: "Late to meeting" },
  meeting_absence: { fr: "Absence non excusée", en: "Unexcused absence" },
  indiscipline: { fr: "Indiscipline", en: "Misconduct" },
};

export interface FineSchedule {
  /** Amende fixe de retard de cotisation (après la grâce). */
  readonly lateContributionFixed: bigint;
  /** Montant par jour de retard au-delà de la grâce (0 = sans). */
  readonly lateContributionPerDay: bigint;
  /** Plafond de l'amende de retard de cotisation (0 = sans plafond). */
  readonly lateContributionCap: bigint;
  readonly meetingLate: bigint;
  readonly meetingAbsence: bigint;
  /** Plafond d'une amende d'indiscipline à motif libre. */
  readonly indisciplineCap: bigint;
  /** Délai de grâce en jours avant qu'une cotisation soit « en retard ». */
  readonly graceDays: number;
}

export const DEFAULT_FINE_SCHEDULE: FineSchedule = {
  lateContributionFixed: 0n,
  lateContributionPerDay: 0n,
  lateContributionCap: 0n,
  meetingLate: 0n,
  meetingAbsence: 0n,
  indisciplineCap: 0n,
  graceDays: 0,
};

export function assertFineSchedule(s: FineSchedule): void {
  for (const v of [
    s.lateContributionFixed,
    s.lateContributionPerDay,
    s.lateContributionCap,
    s.meetingLate,
    s.meetingAbsence,
    s.indisciplineCap,
  ]) {
    perAmount(v);
  }
  if (!Number.isInteger(s.graceDays) || s.graceDays < 0 || s.graceDays > 60) {
    throw new DomainError("FINE_INVALID", "Délai de grâce de 0 à 60 jours");
  }
}

const DAY_MS = 86_400_000;

function isoMs(d: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) throw new DomainError("FINE_INVALID", "Date invalide");
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Jours de retard au-delà de la grâce (0 si à l'heure ou dans la grâce). */
export function daysLate(dueDate: string, paidOrToday: string, graceDays: number): number {
  const d = Math.round((isoMs(paidOrToday) - isoMs(dueDate)) / DAY_MS) - graceDays;
  return d > 0 ? d : 0;
}

/** État d'une échéance vu par le groupe : à l'heure, dans la grâce, en retard. */
export function lateness(dueDate: string, today: string, graceDays: number): "on_time" | "grace" | "late" {
  const raw = Math.round((isoMs(today) - isoMs(dueDate)) / DAY_MS);
  if (raw <= 0) return "on_time";
  if (raw <= graceDays) return "grace";
  return "late";
}

/** Montant de l'amende de retard de cotisation selon le barème accepté. */
export function lateContributionFine(s: FineSchedule, dueDate: string, paidOrToday: string): bigint {
  const late = daysLate(dueDate, paidOrToday, s.graceDays);
  if (late === 0) return 0n;
  let amount = s.lateContributionFixed + s.lateContributionPerDay * BigInt(late);
  if (s.lateContributionCap > 0n && amount > s.lateContributionCap) amount = s.lateContributionCap;
  return amount;
}

/** Montant d'une amende constatée, borné par le barème (jamais au-dessus). */
export function fineAmount(s: FineSchedule, kind: FineKind, requested: bigint | null): bigint {
  switch (kind) {
    case "meeting_late":
      return s.meetingLate;
    case "meeting_absence":
      return s.meetingAbsence;
    case "late_contribution":
      if (requested === null) throw new DomainError("FINE_INVALID", "Montant calculé requis");
      return requested;
    case "indiscipline": {
      if (requested === null || requested <= 0n) {
        throw new DomainError("FINE_INVALID", "Montant d'indiscipline requis");
      }
      if (s.indisciplineCap > 0n && requested > s.indisciplineCap) {
        throw new DomainError("FINE_INVALID", "Montant au-dessus du plafond du règlement");
      }
      perAmount(requested, { positive: true });
      return requested;
    }
  }
}

export const FINE_STATES = ["issued", "contested", "paid", "cancelled"] as const;
export type FineState = (typeof FINE_STATES)[number];

const FINE_TRANSITIONS: Readonly<Record<FineState, readonly FineState[]>> = {
  issued: ["contested", "paid", "cancelled"],
  contested: ["issued", "cancelled"],
  paid: [],
  cancelled: [],
};

export function transitionFine(from: FineState, to: FineState): FineState {
  if (!FINE_TRANSITIONS[from].includes(to)) {
    throw new DomainError("FINE_INVALID", `Amende : ${from} → ${to} impossible`);
  }
  return to;
}

/** Le censeur ne s'inflige pas d'amende à lui-même, ni n'en lève une sans motif. */
export function assertFineIssuable(input: {
  readonly issuerIdentityId: string;
  readonly targetIdentityId: string;
  readonly reason: string;
}): void {
  if (input.issuerIdentityId === input.targetIdentityId) {
    throw new DomainError("FINE_INVALID", "Une amende est constatée par une autre personne");
  }
  if (input.reason.trim().length < 3) {
    throw new DomainError("FINE_INVALID", "Motif de l'amende obligatoire");
  }
}

/* ── Graduation des sanctions ─────────────────────────────────────────── */

export const SANCTION_STEPS = ["warning", "fine", "payout_suspended", "exclusion_vote"] as const;
export type SanctionStep = (typeof SANCTION_STEPS)[number];

/**
 * Étape de sanction suggérée selon le nombre de retards non régularisés sur
 * le cycle. La suspension du droit de bouffer et l'exclusion restent des
 * DÉCISIONS humaines (bureau puis vote) : le module ne fait que suggérer.
 */
export function suggestedSanction(unsettledLateCount: number, thresholds = { fine: 1, suspend: 3, exclusion: 5 }): SanctionStep {
  if (unsettledLateCount >= thresholds.exclusion) return "exclusion_vote";
  if (unsettledLateCount >= thresholds.suspend) return "payout_suspended";
  if (unsettledLateCount >= thresholds.fine) return "fine";
  return "warning";
}
