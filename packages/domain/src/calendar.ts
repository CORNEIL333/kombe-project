/**
 * Calendrier des échéances — bornes mensuelles et années bissextiles.
 *
 * L'horloge serveur tranche ; l'affichage se fait en Africa/Douala. Le
 * quantième demandé est ramené au dernier jour réel du mois (règle « bords
 * mensuels » de l'oracle `due_date`) : un « 31 février » devient le 28/29.
 * L'horloge cliente n'est jamais de confiance (STACK.md §Contraintes).
 */
import { DomainError } from "./errors.js";

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new DomainError("JOUR_INVALIDE", "Mois invalide");
  }
  if (month === 2 && isLeapYear(year)) return 29;
  return DAYS_IN_MONTH[month - 1] as number;
}

/** Date d'échéance au format ISO YYYY-MM-DD, quantième borné au mois réel. */
export function dueDate(year: number, month: number, day: number): string {
  if (!Number.isInteger(year)) throw new DomainError("JOUR_INVALIDE", "Année invalide");
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new DomainError("JOUR_INVALIDE", "Jour invalide");
  }
  const lastDay = daysInMonth(year, month);
  const clampedDay = Math.min(day, lastDay);
  const mm = String(month).padStart(2, "0");
  const dd = String(clampedDay).padStart(2, "0");
  return `${String(year).padStart(4, "0")}-${mm}-${dd}`;
}

/** Fuseau d'affichage contractuel des échéances. */
export const DISPLAY_TZ = "Africa/Douala" as const;
