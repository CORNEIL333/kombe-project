/**
 * Échéances et relances (ADR-0042). Logique pure : à partir d'une date limite
 * et de l'instant présent, quel palier de relance s'applique. Les relances se
 * rapprochent à l'approche de l'échéance (une semaine avant, puis chaque jour
 * les trois derniers jours, puis quelques heures avant) ; chaque palier ne se
 * déclenche qu'une fois par personne (clé de déduplication côté serveur).
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Paliers, du plus lointain au plus proche. */
export const REMINDER_STAGES = ["j7", "j3", "j2", "j1", "h6"] as const;
export type ReminderStage = (typeof REMINDER_STAGES)[number];

/** Durée restante (ms) sous laquelle chaque palier s'ouvre. */
const STAGE_THRESHOLD_MS: Readonly<Record<ReminderStage, number>> = {
  j7: 7 * DAY_MS,
  j3: 3 * DAY_MS,
  j2: 2 * DAY_MS,
  j1: DAY_MS,
  h6: 6 * HOUR_MS,
};

/**
 * Palier de relance en cours, « expired » si l'échéance est passée, null si
 * l'échéance est encore lointaine (plus de 7 jours).
 */
export function reminderStage(nowMs: number, deadlineMs: number): ReminderStage | "expired" | null {
  const left = deadlineMs - nowMs;
  if (left <= 0) return "expired";
  let stage: ReminderStage | null = null;
  for (const s of REMINDER_STAGES) if (left <= STAGE_THRESHOLD_MS[s]) stage = s;
  return stage;
}

/** Instant où un palier s'ouvre pour une échéance donnée. */
export function reminderStageOpensAt(stage: ReminderStage, deadlineMs: number): number {
  return deadlineMs - STAGE_THRESHOLD_MS[stage];
}

/** Bornes du délai d'acceptation des statuts (jours). */
export const STATUTES_ACCEPTANCE_DAYS = { min: 1, max: 60, default: 7 } as const;

/**
 * Échéance effective d'une personne : l'échéance de la version, ou, pour qui
 * a été admis après la publication, le même délai compté depuis son admission.
 */
export function effectiveStatutesDeadline(deadlineMs: number, acceptanceDays: number, joinedAtMs: number | null): number {
  if (joinedAtMs === null) return deadlineMs;
  return Math.max(deadlineMs, joinedAtMs + acceptanceDays * DAY_MS);
}

/**
 * Relance d'une échéance au jour près (cotisation, séance) : « j2 », « j1 »,
 * « j0 » selon le nombre de jours calendaires restants (dates ISO de Douala).
 */
export function dayReminderStage(todayIso: string, dueIso: string): "j2" | "j1" | "j0" | null {
  const days = Math.round((Date.parse(`${dueIso}T12:00:00Z`) - Date.parse(`${todayIso}T12:00:00Z`)) / DAY_MS);
  if (days === 2) return "j2";
  if (days === 1) return "j1";
  if (days === 0) return "j0";
  return null;
}
