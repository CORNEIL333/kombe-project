/**
 * Calendrier réel des séances (lot L-03, ADR-0027).
 *
 * Les groupes ne s'expriment pas en « quantième + 7 jours » mais en :
 * « tous les dimanches », « tous les 8 jours » (semaine traditionnelle de
 * l'Ouest), « tous les 15 jours », « le 2e samedi du mois », « le dernier
 * dimanche », « chaque jour de marché sauf le dimanche » (tontines de marché).
 *
 * Toutes les dates sont des dates MÉTIER (YYYY-MM-DD, Africa/Douala) ; aucun
 * calcul n'utilise l'heure locale de la machine (UTC pur, pas de DST au
 * Cameroun). Une PAUSE (fêtes, deuil, rentrée) décale les séances suivantes :
 * la date mise en pause est sautée et la séance a lieu à l'occurrence d'après.
 */
import { DomainError } from "../errors.js";

/** 0 = dimanche … 6 = samedi (convention JavaScript `getUTCDay`). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type Cadence =
  | { readonly kind: "daily"; readonly excludedWeekdays?: readonly Weekday[] }
  | { readonly kind: "every_n_days"; readonly n: number }
  | { readonly kind: "weekly"; readonly weekday: Weekday }
  | { readonly kind: "biweekly"; readonly weekday: Weekday }
  | { readonly kind: "monthly_day"; readonly day: number }
  | { readonly kind: "monthly_nth_weekday"; readonly nth: 1 | 2 | 3 | 4 | -1; readonly weekday: Weekday };

export const CADENCE_KINDS = [
  "daily",
  "every_n_days",
  "weekly",
  "biweekly",
  "monthly_day",
  "monthly_nth_weekday",
] as const;

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

function parseIso(date: string): number {
  const m = ISO.exec(date);
  if (!m) throw new DomainError("CADENCE_INVALID", "Date invalide (AAAA-MM-JJ attendu)");
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (formatIso(ms) !== date) throw new DomainError("CADENCE_INVALID", "Date inexistante");
  return ms;
}

function formatIso(ms: number): string {
  const d = new Date(ms);
  const y = String(d.getUTCFullYear()).padStart(4, "0");
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

function isWeekday(v: unknown): v is Weekday {
  return Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 6;
}

/** Valide une cadence venue d'un client ou d'un instantané de règles. */
export function assertCadence(c: Cadence): void {
  switch (c.kind) {
    case "daily": {
      const ex = c.excludedWeekdays ?? [];
      if (!ex.every(isWeekday) || new Set(ex).size !== ex.length || ex.length >= 7) {
        throw new DomainError("CADENCE_INVALID", "Jours exclus invalides");
      }
      return;
    }
    case "every_n_days":
      if (!Number.isInteger(c.n) || c.n < 2 || c.n > 31) {
        throw new DomainError("CADENCE_INVALID", "Intervalle de 2 à 31 jours");
      }
      return;
    case "weekly":
    case "biweekly":
      if (!isWeekday(c.weekday)) throw new DomainError("CADENCE_INVALID", "Jour de semaine invalide");
      return;
    case "monthly_day":
      if (!Number.isInteger(c.day) || c.day < 1 || c.day > 31) {
        throw new DomainError("CADENCE_INVALID", "Quantième de 1 à 31");
      }
      return;
    case "monthly_nth_weekday":
      if (!isWeekday(c.weekday) || ![1, 2, 3, 4, -1].includes(c.nth)) {
        throw new DomainError("CADENCE_INVALID", "Rang (1 à 4 ou dernier) ou jour invalide");
      }
      return;
    default:
      throw new DomainError("CADENCE_INVALID", "Rythme inconnu");
  }
}

function daysInMonthUtc(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

function nthWeekdayOfMonth(year: number, month0: number, nth: 1 | 2 | 3 | 4 | -1, weekday: Weekday): number {
  if (nth === -1) {
    const last = Date.UTC(year, month0, daysInMonthUtc(year, month0));
    const delta = (new Date(last).getUTCDay() - weekday + 7) % 7;
    return last - delta * DAY_MS;
  }
  const first = Date.UTC(year, month0, 1);
  const delta = (weekday - new Date(first).getUTCDay() + 7) % 7;
  return first + (delta + (nth - 1) * 7) * DAY_MS;
}

/** Première occurrence de la cadence à partir de `from` (incluse). */
function firstOnOrAfter(c: Cadence, fromMs: number): number {
  switch (c.kind) {
    case "daily": {
      let t = fromMs;
      const ex = new Set(c.excludedWeekdays ?? []);
      while (ex.has(new Date(t).getUTCDay() as Weekday)) t += DAY_MS;
      return t;
    }
    case "every_n_days":
      return fromMs;
    case "weekly":
    case "biweekly": {
      const delta = (c.weekday - new Date(fromMs).getUTCDay() + 7) % 7;
      return fromMs + delta * DAY_MS;
    }
    case "monthly_day": {
      const d = new Date(fromMs);
      let y = d.getUTCFullYear();
      let m = d.getUTCMonth();
      for (;;) {
        const day = Math.min(c.day, daysInMonthUtc(y, m));
        const t = Date.UTC(y, m, day);
        if (t >= fromMs) return t;
        m += 1;
        if (m === 12) {
          m = 0;
          y += 1;
        }
      }
    }
    case "monthly_nth_weekday": {
      const d = new Date(fromMs);
      let y = d.getUTCFullYear();
      let m = d.getUTCMonth();
      for (;;) {
        const t = nthWeekdayOfMonth(y, m, c.nth, c.weekday);
        if (t >= fromMs) return t;
        m += 1;
        if (m === 12) {
          m = 0;
          y += 1;
        }
      }
    }
  }
}

/** Occurrence strictement suivante (la cadence est ancrée sur `prev`). */
function nextAfter(c: Cadence, prevMs: number): number {
  switch (c.kind) {
    case "daily":
      return firstOnOrAfter(c, prevMs + DAY_MS);
    case "every_n_days":
      return prevMs + c.n * DAY_MS;
    case "weekly":
      return prevMs + 7 * DAY_MS;
    case "biweekly":
      return prevMs + 14 * DAY_MS;
    case "monthly_day":
    case "monthly_nth_weekday":
      return firstOnOrAfter(c, prevMs + DAY_MS);
  }
}

/**
 * Génère `count` dates de séance à partir de `start` (incluse si elle tombe
 * sur la cadence). Les dates de `paused` sont sautées SANS consommer de
 * séance : la séance concernée glisse à l'occurrence suivante.
 */
export function meetingDates(
  cadence: Cadence,
  start: string,
  count: number,
  paused: readonly string[] = [],
): string[] {
  assertCadence(cadence);
  if (!Number.isInteger(count) || count < 1 || count > 1000) {
    throw new DomainError("CADENCE_INVALID", "Nombre de séances invalide");
  }
  const pausedSet = new Set(paused.map((p) => formatIso(parseIso(p))));
  const out: string[] = [];
  let t = firstOnOrAfter(cadence, parseIso(start));
  let guard = 0;
  while (out.length < count) {
    const iso = formatIso(t);
    if (!pausedSet.has(iso)) out.push(iso);
    t = nextAfter(cadence, t);
    guard += 1;
    if (guard > 20_000) throw new DomainError("CADENCE_INVALID", "Calendrier non borné");
  }
  return out;
}

/** Instant UTC (ms) de l'heure limite d'une date métier Africa/Douala (UTC+1, sans DST). */
export function deadlineUtcMs(businessDate: string, hhmm = "18:00"): number {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) {
    throw new DomainError("CADENCE_INVALID", "Heure limite invalide (HH:MM)");
  }
  return parseIso(businessDate) + (Number(m[1]) - 1) * 3_600_000 + Number(m[2]) * 60_000;
}

/** Durée du cycle en jours entre la première et la dernière séance. */
export function cycleSpanDays(dates: readonly string[]): number {
  if (dates.length < 2) return 0;
  return Math.round((parseIso(dates[dates.length - 1] as string) - parseIso(dates[0] as string)) / DAY_MS);
}

/**
 * Migration des anciennes règles (I-11) : `weekly` + quantième devient
 * `weekly` + jour de semaine de la première échéance ; `monthly` + quantième
 * devient `monthly_day`.
 */
export function legacyCadence(frequency: "monthly" | "weekly", firstDueDate: string): Cadence {
  if (frequency === "monthly") {
    return { kind: "monthly_day", day: new Date(parseIso(firstDueDate)).getUTCDate() };
  }
  return { kind: "weekly", weekday: new Date(parseIso(firstDueDate)).getUTCDay() as Weekday };
}

const WEEKDAY_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const WEEKDAY_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const NTH_FR: Record<string, string> = { "1": "1er", "2": "2e", "3": "3e", "4": "4e", "-1": "dernier" };
const NTH_EN: Record<string, string> = { "1": "1st", "2": "2nd", "3": "3rd", "4": "4th", "-1": "last" };

/** Libellé humain d'une cadence, tel qu'on le dit en séance. */
export function describeCadence(c: Cadence, lang: "fr" | "en" = "fr"): string {
  const wd = lang === "fr" ? WEEKDAY_FR : WEEKDAY_EN;
  switch (c.kind) {
    case "daily": {
      const ex = (c.excludedWeekdays ?? []).map((d) => wd[d]);
      if (lang === "fr") return ex.length ? `Chaque jour sauf le ${ex.join(", ")}` : "Chaque jour";
      return ex.length ? `Every day except ${ex.join(", ")}` : "Every day";
    }
    case "every_n_days":
      return lang === "fr" ? `Tous les ${c.n} jours` : `Every ${c.n} days`;
    case "weekly":
      return lang === "fr" ? `Chaque ${wd[c.weekday]}` : `Every ${wd[c.weekday]}`;
    case "biweekly":
      return lang === "fr" ? `Un ${wd[c.weekday]} sur deux` : `Every other ${wd[c.weekday]}`;
    case "monthly_day":
      return lang === "fr" ? `Le ${c.day} de chaque mois` : `On day ${c.day} of each month`;
    case "monthly_nth_weekday":
      return lang === "fr"
        ? `Le ${NTH_FR[String(c.nth)]} ${wd[c.weekday]} du mois`
        : `The ${NTH_EN[String(c.nth)]} ${wd[c.weekday]} of the month`;
  }
}
