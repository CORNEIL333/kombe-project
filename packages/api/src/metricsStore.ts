/**
 * Store FICTIF en mémoire pour la recette C18 — mesure du pilote et économie
 * unitaire. Il délègue TOUTE décision aux fonctions pures de `@kombe/domain`
 * (`metrics.ts`) : un événement d'analytics portant un **champ financier ou
 * identitaire individuel** est **refusé** (C18-ANALYTICS), une cohorte à 3 tours
 * sur 10 membres n'est **pas** éligible à une rétention trois cycles
 * (C18-COHORT), un **taux de paiement réel** de 2/10 (20 %) est **sous** le seuil
 * exploratoire (25 %) ⇒ porte G2 non atteinte (C18-PAYERS), et un risque
 * **critique sans contrôle effectif bloque l'extension**. Les montants sont en
 * **XAF entier** (bigint côté domaine), **sérialisés en chaînes** à la frontière
 * API (jamais de flottant JSON). L'horloge est **SERVEUR** (`x-server-date`) ;
 * l'acteur est résolu serveur. Comme les autres stores, il ne prétend NI
 * persister, NI brancher un vrai outil d'analytics : la durabilité (RLS
 * d'agrégats, tables append-only, CHECK « no-financial-field ») est le contrat
 * SQL de la migration `0017_pilot_metrics` — preuve base réelle **BLOCKED** sans
 * PostgreSQL (ADR-0006/0007).
 */
import {
  DomainError,
  buildAnalyticsEvent,
  buildCohort,
  buildRisk,
  blocksPilotExtension,
  completedCycles,
  computeUnitEconomics,
  countFinancialFieldsInExport,
  eligibleThreeCycleRetention,
  exportAnalytics,
  funnelCounts,
  hasEffectiveControl,
  type AnalyticsEvent,
  type AnalyticsStep,
  type Cohort,
  type PaymentSignal,
  type Risk,
} from "@kombe/domain";

export interface MetricsContext {
  readonly actorIdentityId: string;
  readonly actorRole: string;
  /** Horloge SERVEUR en secondes d'époque (injectée ; jamais fournie par le client). */
  readonly serverNow: number;
}

export interface CohortView {
  readonly groupId: string;
  readonly memberCount: number;
  readonly roundsCompleted: number;
  readonly completedCycles: number;
  readonly eligibleThreeCycleRetention: boolean;
}

export interface EconomicsView {
  readonly exposedMembers: number;
  readonly realPayers: number;
  readonly promisedOnly: number;
  readonly paymentRealPercent: number;
  readonly gateG2Met: boolean;
  readonly supportMinutes: number;
  readonly supportCostMinor: string;
  readonly infrastructureCostMinor: string;
  readonly cancellations: number;
  readonly taxesMinor: string;
  readonly totalCostMinor: string;
}

export interface EconomicsInput {
  readonly exposedMembers: number;
  readonly paidCount: number;
  readonly promisedCount: number;
  readonly supportMinutes: number;
  readonly supportCostPerMinuteMinor: bigint;
  readonly infrastructureCostMinor: bigint;
  readonly cancellations: number;
  readonly taxesMinor: bigint;
}

export interface RiskInput {
  readonly riskId: string;
  readonly severity: string;
  readonly probabilityPercent: number;
  readonly impactPercent: number;
  readonly control: string;
  readonly evidenceRef: string;
  readonly owner: string;
  readonly reviewedAt: string;
  readonly residual: string;
}

/** Forme de l'entonnoir d'analytics (16.1) renvoyée par les deux stores. */
export interface FunnelView {
  readonly cohortId: string;
  readonly steps: { readonly step: AnalyticsStep; readonly count: number }[];
  readonly individualFinancialFields: number;
}

/** Verdict d'extension du pilote (16.3) renvoyé par les deux stores. */
export interface ExtensionView {
  readonly extensionAllowed: boolean;
  readonly criticalWithoutControl: string[];
}

/**
 * Surface commune des stores de mesure pilote : le store FICTIF en mémoire
 * (recette C18 sans base) et le store RÉEL `PgMetricsStore` (persistance
 * Postgres, migration `0017_pilot_metrics`). Les méthodes peuvent être
 * synchrones (fictif) ou asynchrones (réel) : les routes `await`-ent
 * systématiquement, donc les deux implementations sont interchangeables.
 * `groupId` est OPTIONNEL dans la signature (compatibilité ascendante avec le
 * store fictif qui l'ignore) mais EXIGÉ à l'exécution par le store réel pour
 * l'analytics scopée par RLS.
 */
export interface MetricsStore {
  trackAnalyticsEvent(
    ctx: MetricsContext,
    input: { cohortId: string; groupId?: string; step: string; properties: Record<string, string | number | boolean> },
  ): AnalyticsEvent | Promise<AnalyticsEvent>;
  analyticsFunnel(ctx: MetricsContext, cohortId: string, groupId?: string): FunnelView | Promise<FunnelView>;
  upsertCohort(
    ctx: MetricsContext,
    input: { groupId: string; memberCount: number; roundsCompleted: number },
  ): CohortView | Promise<CohortView>;
  getCohort(ctx: MetricsContext, groupId: string): CohortView | Promise<CohortView>;
  computeEconomics(ctx: MetricsContext, input: EconomicsInput): EconomicsView | Promise<EconomicsView>;
  addRisk(ctx: MetricsContext, input: RiskInput): Risk | Promise<Risk>;
  listRisks(ctx: MetricsContext): Risk[] | Promise<Risk[]>;
  extensionStatus(ctx: MetricsContext): ExtensionView | Promise<ExtensionView>;
}

export class FictitiousMetricsStore implements MetricsStore {
  private readonly eventsByCohort = new Map<string, AnalyticsEvent[]>();
  private readonly cohorts = new Map<string, Cohort>();
  private readonly risks = new Map<string, Risk>();

  /* --- gardes --- */

  private gateAuth(ctx: MetricsContext): void {
    if (!ctx.actorIdentityId) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    }
  }

  /* --- 16.1 funnel analytics (pseudonymisé, sans contenu financier) --- */

  trackAnalyticsEvent(
    ctx: MetricsContext,
    input: { cohortId: string; groupId?: string; step: string; properties: Record<string, string | number | boolean> },
  ): AnalyticsEvent {
    this.gateAuth(ctx);
    // L'horodatage est SERVEUR (jamais fourni par le client) ; l'étape et les
    // propriétés passent par le domaine, qui refuse tout champ individuel.
    const list = this.eventsByCohort.get(input.cohortId) ?? [];
    const event = buildAnalyticsEvent({
      eventId: `${input.cohortId}:${input.step}#${list.length + 1}`,
      cohortId: input.cohortId,
      step: input.step,
      occurredAt: ctx.serverNow,
      properties: input.properties,
    });
    list.push(event);
    this.eventsByCohort.set(input.cohortId, list);
    return event;
  }

  analyticsFunnel(ctx: MetricsContext, cohortId: string, _groupId?: string): FunnelView {
    this.gateAuth(ctx);
    const events = this.eventsByCohort.get(cohortId) ?? [];
    const rows = exportAnalytics(events);
    return {
      cohortId,
      steps: funnelCounts(events),
      // Observation C18-ANALYTICS : un export ne contient JAMAIS de champ
      // financier individuel (le domaine l'a garanti à la construction).
      individualFinancialFields: countFinancialFieldsInExport(rows),
    };
  }

  /* --- 18.13 cohortes : tours / cycles / trois cycles --- */

  upsertCohort(
    ctx: MetricsContext,
    input: { groupId: string; memberCount: number; roundsCompleted: number },
  ): CohortView {
    this.gateAuth(ctx);
    const cohort = buildCohort(input);
    this.cohorts.set(cohort.groupId, cohort);
    return FictitiousMetricsStore.toCohortView(cohort);
  }

  getCohort(ctx: MetricsContext, groupId: string): CohortView {
    this.gateAuth(ctx);
    const cohort = this.cohorts.get(groupId);
    if (!cohort) {
      throw new DomainError("RESERVATION_INCOHERENTE", "Cohorte introuvable");
    }
    return FictitiousMetricsStore.toCohortView(cohort);
  }

  private static toCohortView(cohort: Cohort): CohortView {
    return {
      groupId: cohort.groupId,
      memberCount: cohort.memberCount,
      roundsCompleted: cohort.roundsCompleted,
      completedCycles: completedCycles(cohort),
      eligibleThreeCycleRetention: eligibleThreeCycleRetention(cohort),
    };
  }

  /* --- 16.2 économie unitaire (XAF entier, réel ≠ promesse) --- */

  computeEconomics(ctx: MetricsContext, input: EconomicsInput): EconomicsView {
    this.gateAuth(ctx);
    const signals: PaymentSignal[] = [
      ...Array.from({ length: input.paidCount }, () => ({ status: "paid" as const })),
      ...Array.from({ length: input.promisedCount }, () => ({ status: "promised" as const })),
    ];
    const v = computeUnitEconomics({
      exposedMembers: input.exposedMembers,
      paymentSignals: signals,
      supportMinutes: input.supportMinutes,
      supportCostPerMinuteMinor: input.supportCostPerMinuteMinor,
      infrastructureCostMinor: input.infrastructureCostMinor,
      cancellations: input.cancellations,
      taxesMinor: input.taxesMinor,
    });
    return {
      exposedMembers: v.exposedMembers,
      realPayers: v.realPayers,
      promisedOnly: v.promisedOnly,
      paymentRealPercent: v.paymentRealPercent,
      gateG2Met: v.gateG2Met,
      supportMinutes: v.supportMinutes,
      supportCostMinor: v.supportCostMinor.toString(),
      infrastructureCostMinor: v.infrastructureCostMinor.toString(),
      cancellations: v.cancellations,
      taxesMinor: v.taxesMinor.toString(),
      totalCostMinor: v.totalCostMinor.toString(),
    };
  }

  /* --- 16.3 registre des risques --- */

  addRisk(ctx: MetricsContext, input: RiskInput): Risk {
    this.gateAuth(ctx);
    const risk = buildRisk(input);
    this.risks.set(risk.riskId, risk);
    return risk;
  }

  listRisks(ctx: MetricsContext): Risk[] {
    this.gateAuth(ctx);
    return [...this.risks.values()];
  }

  extensionStatus(ctx: MetricsContext): ExtensionView {
    this.gateAuth(ctx);
    const all = [...this.risks.values()];
    const blocked = blocksPilotExtension(all);
    return {
      extensionAllowed: !blocked,
      criticalWithoutControl: all
        .filter((r) => r.severity === "critique" && !hasEffectiveControl(r))
        .map((r) => r.riskId),
    };
  }
}
