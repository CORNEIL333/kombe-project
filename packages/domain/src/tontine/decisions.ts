/**
 * Décisions votées de l'association (lots L-03 pause, L-09 suspension,
 * L-10 reprise de place, L-11 destitution, exclusion ; ADR-0038).
 *
 * Toutes les décisions se prennent à la MAJORITÉ ABSOLUE DES ÉLECTEURS
 * (membres actifs ayant un téléphone, la personne visée exclue), jamais des
 * seuls votants : une poignée de votants ne peut pas exclure un membre.
 * Le vote est secret pendant le scrutin (seul le nombre de bulletins est
 * visible) ; le décompte est publié au dépouillement. Le serveur n'exécute
 * que ce que le vote a adopté.
 */
import { DomainError } from "../errors.js";
import { meetingDates, type Cadence } from "./cadence.js";
import type { TontineAction } from "./roles.js";

export const DECISION_KINDS = ["pause", "removal", "exclusion", "payout_suspension", "replacement"] as const;
export type DecisionKind = (typeof DECISION_KINDS)[number];

export const DECISION_STATES = ["open", "adopted", "rejected", "cancelled", "lifted"] as const;
export type DecisionState = (typeof DECISION_STATES)[number];

export const DECISION_LABELS: Readonly<Record<DecisionKind, { fr: string; en: string }>> = {
  pause: { fr: "Pause des séances", en: "Pause of meetings" },
  removal: { fr: "Destitution d'un membre du bureau", en: "Removal from office" },
  exclusion: { fr: "Exclusion d'un membre", en: "Exclusion of a member" },
  payout_suspension: { fr: "Suspension du droit de bouffer", en: "Payout suspension" },
  replacement: { fr: "Reprise de place", en: "Place takeover" },
};

/** Qui peut OUVRIR le vote (la décision, elle, appartient à l'assemblée). */
export const DECISION_OPENERS: Readonly<Record<DecisionKind, TontineAction>> = {
  pause: "schedule.manage",
  removal: "group.read",
  exclusion: "member.remove",
  payout_suspension: "fine.issue",
  replacement: "order.manage",
};

/** Fenêtre de vote en heures : la personne visée a le temps d'être entendue. */
export const DECISION_WINDOW_HOURS: Readonly<Record<DecisionKind, { readonly min: number; readonly max: number }>> = {
  pause: { min: 24, max: 336 },
  removal: { min: 72, max: 336 },
  exclusion: { min: 72, max: 336 },
  payout_suspension: { min: 24, max: 336 },
  replacement: { min: 24, max: 336 },
};

export function isDecisionKind(v: string): v is DecisionKind {
  return (DECISION_KINDS as readonly string[]).includes(v);
}

/** La personne visée ne vote pas sur son propre sort. */
export function targetExcludedFromElectorate(kind: DecisionKind): boolean {
  return kind !== "pause";
}

export function assertDecisionWindow(kind: DecisionKind, hours: number): void {
  const b = DECISION_WINDOW_HOURS[kind];
  if (!Number.isInteger(hours) || hours < b.min || hours > b.max) {
    throw new DomainError("DECISION_INVALID", `Durée du vote : de ${b.min} h à ${b.max} h`);
  }
}

export function assertPauseOccurrences(n: number): void {
  if (!Number.isInteger(n) || n < 1 || n > 6) {
    throw new DomainError("DECISION_INVALID", "Pause : de 1 à 6 séances");
  }
}

export interface TallyInput {
  readonly kind: DecisionKind;
  readonly electorate: number;
  readonly yes: number;
  readonly no: number;
  readonly abstain: number;
  /** Vrai si l'échéance du scrutin est passée. */
  readonly windowElapsed: boolean;
}

/**
 * Résultat d'un scrutin. `pending` tant que l'issue n'est pas acquise.
 * Adoption = oui > moitié des électeurs. Une destitution ou une exclusion
 * n'est jamais adoptée avant l'échéance, sauf si tous les électeurs ont
 * voté (la personne visée garde son délai pour se défendre). Un rejet
 * certain se constate dès qu'il est mathématiquement acquis.
 */
export function tallyDecision(t: TallyInput): "adopted" | "rejected" | "pending" {
  if (t.electorate < 1) throw new DomainError("DECISION_INVALID", "Corps électoral vide");
  const cast = t.yes + t.no + t.abstain;
  if (cast > t.electorate || t.yes < 0 || t.no < 0 || t.abstain < 0) {
    throw new DomainError("DECISION_INVALID", "Décompte incohérent");
  }
  const majority = t.yes * 2 > t.electorate;
  const stillPossible = (t.yes + (t.electorate - cast)) * 2 > t.electorate;
  if (!stillPossible) return "rejected";
  if (majority) {
    const protectedKind = t.kind === "removal" || t.kind === "exclusion";
    if (!protectedKind || t.windowElapsed || cast === t.electorate) return "adopted";
    return "pending";
  }
  return t.windowElapsed ? "rejected" : "pending";
}

/**
 * Nouvelles dates des tours décalés par une pause de `occurrences` séances :
 * le tour `fromDate` et les suivants glissent d'autant d'occurrences de la
 * cadence (jamais une date hors cadence).
 */
export function shiftedRoundDates(cadence: Cadence, fromDate: string, count: number, occurrences: number): string[] {
  assertPauseOccurrences(occurrences);
  if (!Number.isInteger(count) || count < 1) throw new DomainError("DECISION_INVALID", "Aucun tour à décaler");
  return meetingDates(cadence, fromDate, count + occurrences).slice(occurrences);
}
