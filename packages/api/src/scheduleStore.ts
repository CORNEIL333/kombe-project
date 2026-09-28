/**
 * Store de calendrier FICTIF en mémoire pour la recette C05. Il conserve l'état
 * d'un cycle par groupe (brouillon → démarré/gelé) et délègue TOUTE décision aux
 * fonctions pures de `@kombe/domain` (`schedule.ts`). Comme les stores C00–C04,
 * il ne prétend NI persister, NI verrouiller, NI isoler : la preuve base réelle
 * (unicité membre/tour, ordre `seq` figé, rotation par groupe) est le contrat
 * `0006_cycle_schedule.sql` et reste **BLOCKED** sans PostgreSQL. Dates métier
 * injectées (année/mois de départ, quantième, fréquence) ; aucun horloge réelle.
 */
import {
  DomainError,
  buildSchedule,
  startSchedule,
  reassignBeneficiary,
  applyDeparture,
  planRenewal,
  type BuildScheduleParams,
  type CycleSchedule,
  type DepartureView,
  type RenewalPlan,
  type RuleSet,
} from "@kombe/domain";

export class FictitiousScheduleStore {
  private readonly schedules = new Map<string, CycleSchedule>();
  private pilot = true;

  setPilot(value: boolean): void {
    this.pilot = value;
  }

  /** Construit et mémorise le calendrier d'un cycle (brouillon). */
  build(params: Omit<BuildScheduleParams, "pilot">): CycleSchedule {
    const s = buildSchedule({ ...params, pilot: this.pilot });
    this.schedules.set(s.groupId, s);
    return s;
  }

  private require(groupId: string): CycleSchedule {
    const s = this.schedules.get(groupId);
    if (!s) throw new DomainError("RESERVATION_INCOHERENTE", "Cycle absent");
    return s;
  }

  get(groupId: string): CycleSchedule {
    return this.require(groupId);
  }

  /** Démarre (gèle) le calendrier : l'ordre des bénéficiaires devient figé. */
  start(groupId: string): { state: "started"; rounds: number } {
    const started = startSchedule(this.require(groupId));
    this.schedules.set(groupId, started);
    return { state: "started", rounds: started.rounds };
  }

  /** Réassignation d'un bénéficiaire (refusée après démarrage). */
  reassign(groupId: string, seq: number, newBeneficiaryId: string): CycleSchedule {
    const next = reassignBeneficiary(this.require(groupId), seq, newBeneficiaryId);
    this.schedules.set(groupId, next);
    return next;
  }

  /** Départ d'un membre : dette conservée, nombre de tours non réduit. */
  depart(groupId: string, departingId: string): DepartureView {
    return applyDeparture(this.require(groupId), departingId);
  }

  /**
   * Plan de renouvellement (5.5) : compare les paramètres financiers de la
   * version courante du cycle stocké à ceux de la version cible ; un changement
   * essentiel exige de nouvelles acceptations. Ne crée pas le nouveau cycle.
   */
  renew(
    groupId: string,
    to: { version: number; memberCount: number; contribution: bigint; rounds: number },
  ): RenewalPlan {
    const s = this.require(groupId);
    const baseRule = (over: Partial<RuleSet>): RuleSet => ({
      memberCount: s.memberCount,
      contribution: s.contribution,
      rounds: s.rounds,
      frequency: s.frequency,
      dueDay: 1,
      quorum: { numerator: 1, denominator: 1 },
      gracePeriodDays: 0,
      penaltyEnabled: false,
      ...over,
    });
    const prev = baseRule({});
    const next = baseRule({
      memberCount: to.memberCount,
      contribution: to.contribution,
      rounds: to.rounds,
    });
    return planRenewal(prev, next, s.ruleVersion, to.version);
  }
}
