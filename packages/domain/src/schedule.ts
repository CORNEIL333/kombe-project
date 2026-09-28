/**
 * Calendrier des cycles, tours, échéances et bénéficiaires (C05 ; stories
 * 5.1–5.5). Logique **pure**, horloge/date injectées, sans persistance. Produit
 * N tours pour N membres, **une occurrence de chaque bénéficiaire**, **obligation
 * unique membre/tour**, et dates métier **Africa/Douala** bornées au dernier jour
 * réel du mois (`dueDate`). Les instants sont persistés en **UTC** et rattachés à
 * une **version de règle** précise (5.2).
 *
 * Invariants cardinaux du pilote :
 * - une part par membre → `rounds === memberCount`, pot de tour = cotisation × N
 *   (`rotation`, ADR-0002) ; `cycle_expected_total` = total du cycle ;
 * - rotation **égale** : chaque membre bénéficie d'**exactement un** tour ;
 *   deux tours au même bénéficiaire ⇒ refus (`SCHEDULE_BENEFICIARY_DUPLICATE`) ;
 * - ordre **figé** à la construction (5.3, P0) : non modifiable par simple édition
 *   après démarrage (`SCHEDULE_FROZEN`) ; le réaménagement voté (5.4) est P1 ;
 * - un **départ ne réaffecte pas** la dette déjà due et **ne réduit pas**
 *   silencieusement le nombre de tours ;
 * - un **renouvellement** (5.5) repart de la version acceptée et **exige de
 *   nouvelles acceptations** si l'engagement financier change (réutilise C04).
 *
 * Cf. 01_Audit/ARCHITECTURE_CIBLE.md §Calendrier ; ADR-0002 (monnaie), ADR-0003
 * (canonicalisation), ADR-0014 (règles versionnées, non-rétroactivité).
 */
import { DomainError } from "./errors.js";
import { dueDate, DISPLAY_TZ } from "./calendar.js";
import { rotation } from "./rotation.js";
import { isEssentialFinancialChange, type Frequency, type RuleSet } from "./rules.js";

/** Fuseau d'affichage contractuel (UTC+1, sans changement d'heure). */
const DOUALA_OFFSET_HOURS = 1;
/** Heure métier par défaut d'une échéance (12:00 Africa/Douala). */
const DUE_WALL_HOUR = 12;

/** Convertit une date métier ISO (YYYY-MM-DD) en instant UTC (12:00 Douala). */
export function businessDateToUtcMs(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d, DUE_WALL_HOUR - DOUALA_OFFSET_HOURS, 0, 0);
}

/**
 * Date métier du tour `seq` (1-based) selon la fréquence. Mensuel : décale le
 * mois et ramène le quantième au dernier jour réel (`dueDate`). Hebdomadaire :
 * pas de 7 jours depuis la première échéance (bornée).
 */
export function businessDateFor(
  p: { frequency: Frequency; dueDay: number; startYear: number; startMonth: number },
  seq: number,
): string {
  const offset = seq - 1;
  if (p.frequency === "monthly") {
    const total = p.startMonth - 1 + offset;
    const year = p.startYear + Math.floor(total / 12);
    const month = (total % 12) + 1;
    return dueDate(year, month, p.dueDay);
  }
  const first = dueDate(p.startYear, p.startMonth, p.dueDay);
  const [y, m, d] = first.split("-").map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(y, m - 1, d) + offset * 7 * 86_400_000);
  return dueDate(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

/** Une échéance : obligation unique d'un membre pour un tour donné. */
export interface Obligation {
  readonly obligationId: string;
  readonly roundSeq: number;
  readonly memberId: string;
  readonly amount: bigint;
  readonly dueDate: string; // date métier Africa/Douala
  readonly dueAtMs: number; // instant UTC persisté
  readonly ruleVersion: number;
}

/** Un tour : bénéficiaire désigné, date d'échéance et obligations de cotisation. */
export interface ScheduledRound {
  readonly seq: number;
  readonly beneficiaryId: string;
  readonly dueDate: string;
  readonly dueAtMs: number;
  readonly roundPot: bigint;
  readonly obligations: readonly Obligation[];
}

/** Cycle complet : calendrier figé, totaux nés de l'oracle `rotation`. */
export interface CycleSchedule {
  readonly groupId: string;
  readonly ruleVersion: number;
  readonly memberCount: number;
  readonly rounds: number;
  readonly contribution: bigint;
  readonly roundPot: bigint;
  readonly cycleExpectedTotal: bigint;
  readonly displayTz: string;
  readonly frequency: Frequency;
  readonly state: "draft" | "started";
  readonly schedule: readonly ScheduledRound[];
}

export interface BuildScheduleParams {
  readonly groupId: string;
  readonly ruleVersion: number;
  readonly members: readonly string[]; // identité actives, uniques
  readonly contribution: bigint;
  readonly frequency: Frequency;
  readonly dueDay: number; // 1..31
  readonly startYear: number;
  readonly startMonth: number; // 1..12
  readonly beneficiaryOrder: readonly string[]; // permutation attendue de members
  readonly pilot: boolean;
}

/** Vérifie l'unicité structurelle (membre, tour) des obligations. */
export function assertUniqueMemberRound(obligations: readonly Obligation[]): void {
  const seen = new Set<string>();
  for (const o of obligations) {
    const key = `${o.memberId}#${o.roundSeq}`;
    if (seen.has(key)) {
      throw new DomainError("SCHEDULE_OBLIGATION_DUPLICATE", "Obligation membre/tour dupliquée");
    }
    seen.add(key);
  }
}

function assertPermutation(members: readonly string[], order: readonly string[]): void {
  const memberSet = new Set(members);
  if (members.length !== memberSet.size) {
    throw new DomainError("SCHEDULE_MEMBER_UNKNOWN", "Membres dupliqués dans le groupe");
  }
  if (order.length !== members.length) {
    throw new DomainError(
      "SCHEDULE_ROUNDS_MISMATCH",
      "Autant de tours que de bénéficiaires requis (une part)",
    );
  }
  const assigned = new Set<string>();
  for (const b of order) {
    if (!memberSet.has(b)) {
      throw new DomainError("SCHEDULE_MEMBER_UNKNOWN", "Bénéficiaire étranger au groupe");
    }
    if (assigned.has(b)) {
      // Deux tours pour un même bénéficiaire au pilote ⇒ refus (C05-UNIQUE).
      throw new DomainError(
        "SCHEDULE_BENEFICIARY_DUPLICATE",
        "Un bénéficiaire ne peut recevoir qu'une seule part",
      );
    }
    assigned.add(b);
  }
}

/**
 * Construit le calendrier d'un cycle : N tours pour N membres, un bénéficiaire
 * unique par tour, obligations membre/tour, dates nées de `businessDateFor` et
 * totaux nés de `rotation`. Toute anomalie (bénéficiaire dupliqué/inconnu, nombre
 * de tours incohérent) est levée **avant** production du calendrier.
 */
export function buildSchedule(p: BuildScheduleParams): CycleSchedule {
  assertPermutation(p.members, p.beneficiaryOrder);
  const rot = rotation(p.members.length, p.contribution); // TOTaux oracle (ADR-0002)
  if (p.pilot && rot.rounds !== p.members.length) {
    throw new DomainError("SCHEDULE_ROUNDS_MISMATCH", "Pilote : un tour par membre");
  }
  const dateParams = {
    frequency: p.frequency,
    dueDay: p.dueDay,
    startYear: p.startYear,
    startMonth: p.startMonth,
  };
  const rounds: ScheduledRound[] = p.beneficiaryOrder.map((beneficiaryId, i) => {
    const seq = i + 1;
    const iso = businessDateFor(dateParams, seq);
    const dueAtMs = businessDateToUtcMs(iso);
    const obligations: Obligation[] = p.members.map((memberId, j) => ({
      obligationId: `${p.groupId}_r${seq}_m${j + 1}`,
      roundSeq: seq,
      memberId,
      amount: p.contribution,
      dueDate: iso,
      dueAtMs,
      ruleVersion: p.ruleVersion,
    }));
    assertUniqueMemberRound(obligations);
    return Object.freeze({
      seq,
      beneficiaryId,
      dueDate: iso,
      dueAtMs,
      roundPot: rot.roundPot,
      obligations: Object.freeze(obligations),
    });
  });

  const allObligations = rounds.flatMap((r) => r.obligations);
  assertUniqueMemberRound(allObligations);

  return Object.freeze({
    groupId: p.groupId,
    ruleVersion: p.ruleVersion,
    memberCount: p.members.length,
    rounds: rot.rounds,
    contribution: p.contribution,
    roundPot: rot.roundPot,
    cycleExpectedTotal: rot.cycleTotal,
    displayTz: DISPLAY_TZ,
    frequency: p.frequency,
    state: "draft",
    schedule: Object.freeze(rounds),
  });
}

/** Garde de démarrage : calendrier **complet** avant amorçage (interdit le
 *  démarrage incomplet). Chaque tour a un bénéficiaire du groupe et l'ensemble
 *  des obligations membre/tour est exactement une fois présent. */
export function assertScheduleStartable(schedule: CycleSchedule): void {
  if (schedule.rounds !== schedule.memberCount) {
    throw new DomainError("SCHEDULE_ROUNDS_MISMATCH", "Démarrage incomplet : tours ≠ membres");
  }
  const memberSet = new Set(schedule.schedule.flatMap((r) => r.obligations.map((o) => o.memberId)));
  for (const r of schedule.schedule) {
    if (!memberSet.has(r.beneficiaryId)) {
      throw new DomainError("SCHEDULE_MEMBER_UNKNOWN", "Bénéficiaire sans obligation dans le cycle");
    }
  }
  assertUniqueMemberRound(schedule.schedule.flatMap((r) => r.obligations));
}

/** Démarre (gèle) le calendrier : l'ordre des bénéficiaires devient figé (5.3). */
export function startSchedule(schedule: CycleSchedule): CycleSchedule {
  if (schedule.state === "started") {
    throw new DomainError("SCHEDULE_FROZEN", "Calendrier déjà démarré, ordre figé");
  }
  assertScheduleStartable(schedule);
  return Object.freeze({ ...schedule, state: "started" as const });
}

/**
 * Tentative de réaffectation d'un bénéficiaire. Après démarrage, l'ordre est
 * **figé** : seule une procédure votée (5.4, P1) pourrait l'altérer — refusée ici
 * (`SCHEDULE_FROZEN`). Avant démarrage, la nouvelle liste doit rester une
 * permutation valide (unicité du bénéficiaire maintenue).
 */
export function reassignBeneficiary(
  schedule: CycleSchedule,
  seq: number,
  newBeneficiaryId: string,
): CycleSchedule {
  if (schedule.state === "started") {
    throw new DomainError("SCHEDULE_FROZEN", "Ordre figé après démarrage (5.4 = vote P1)");
  }
  const members = [...new Set(schedule.schedule.flatMap((r) => r.obligations.map((o) => o.memberId)))];
  const order = schedule.schedule.map((r) => r.beneficiaryId);
  const idx = seq - 1;
  if (idx < 0 || idx >= order.length) {
    throw new DomainError("SCHEDULE_ROUNDS_MISMATCH", "Tour inexistant");
  }
  order[idx] = newBeneficiaryId;
  return buildSchedule({
    groupId: schedule.groupId,
    ruleVersion: schedule.ruleVersion,
    members,
    contribution: schedule.contribution,
    frequency: schedule.frequency,
    dueDay: 1,
    startYear: 2000,
    startMonth: 1,
    beneficiaryOrder: order,
    pilot: true,
  });
}

/** Vue d'un départ : la dette déjà due reste affectée au partant et le nombre de
 *  tours **ne diminue pas** silencieusement (5.x). Ne réaffecte aucune obligation. */
export interface DepartureView {
  readonly departingId: string;
  readonly roundsUnchanged: boolean;
  readonly debtReassigned: boolean;
  readonly retainedObligations: number;
}

export function applyDeparture(schedule: CycleSchedule, departingId: string): DepartureView {
  const retained = schedule.schedule
    .flatMap((r) => r.obligations)
    .filter((o) => o.memberId === departingId).length;
  return Object.freeze({
    departingId,
    roundsUnchanged: schedule.rounds === schedule.memberCount, // pas de réduction
    debtReassigned: false, // la dette du partant n'est réaffectée à personne
    retainedObligations: retained,
  });
}

/** Plan de renouvellement (5.5, P1) : repart de la version acceptée ; exige de
 *  nouvelles acceptations si l'engagement **essentiel** change ; l'historique de
 *  l'ancien cycle reste conservé et accessible séparément. **Plan** only — la
 *  création effective du nouveau cycle relève d'une commande ultérieure. */
export interface RenewalPlan {
  readonly fromRuleVersion: number;
  readonly toRuleVersion: number;
  readonly essentialChange: boolean;
  readonly requiresNewAcceptances: boolean;
  readonly historyPreserved: boolean;
}

export function planRenewal(
  prevRule: RuleSet,
  nextRule: RuleSet,
  prevVersion: number,
  nextVersion: number,
): RenewalPlan {
  const essential = isEssentialFinancialChange(prevRule, nextRule);
  return Object.freeze({
    fromRuleVersion: prevVersion,
    toRuleVersion: nextVersion,
    essentialChange: essential,
    requiresNewAcceptances: essential, // engagement changé ⇒ nouvelles acceptations
    historyPreserved: true,
  });
}
