/**
 * KÓMBE @kombe/api — store RÉEL (PostgreSQL) de la mesure pilote et de
 * l'économie unitaire (C18 ; stories 16.1, 16.2, 16.3, 18.13). Même surface
 * publique que `FictitiousMetricsStore` (interface `MetricsStore`), mais les
 * événements d'analytics, les cohortes et le registre des risques sont
 * **persistés** dans les tables de la migration `0017_pilot_metrics` :
 *  - `analytics_event` (append-only, RLS par groupe, CHECK « no-financial/
 *    no-personal-field ») : un événement ne peut structurellement porter aucun
 *    champ individuel — C18-ANALYTICS (`individual_financial_fields = 0`) ;
 *  - `pilot_cohort` (RLS par groupe, `member_count >= 1`) : les cycles et
 *    l'éligibilité « trois cycles » restent **dérivés par le domaine** ;
 *  - `pilot_risk` (registre PROGRAMME transverse, **hors RLS**, révisable) :
 *    le blocage d'extension d'un risque critique sans contrôle effectif est
 *    **jugé par le domaine**.
 *
 * TOUTE décision métier reste dans les fonctions pures de `@kombe/domain`
 * (`metrics.ts`) : ce fichier ne fait que lire/écrire ces décisions dans
 * Postgres, sous transaction scopée par groupe (`withGroupTx`, RLS
 * `kombe.group_id`) pour les tables multi-tenant. L'économie unitaire
 * (`computeEconomics`) est un **calcul réel** délégué au domaine — elle n'est
 * pas persistée ici (le contrat HTTP `economicsBody` ne porte pas de groupe ;
 * l'instantané `unit_economics_snapshot` relève d'une projection dédiée). Ce
 * n'est ni une heuristique ni une simulation : les nombres sont calculés par le
 * domaine et, pour l'analytics/les cohortes/les risques, relus depuis la base.
 *
 * `groupId` est OPTIONNEL dans la signature (interface commune avec le store
 * fictif qui l'ignore) mais **EXIGÉ** à l'exécution pour l'analytics et les
 * cohortes : `analytics_event.group_id` / `pilot_cohort.group_id` sont NOT NULL
 * + FK `"group"` et la RLS filtre sur `kombe.group_id`. Un groupe absent est
 * refusé (`METRICS_IDENTIFIANT_REQUIS`) — jamais deviné.
 */
import { randomUUID } from "node:crypto";
import type pg from "pg";
import {
  DomainError,
  blocksPilotExtension,
  buildAnalyticsEvent,
  buildCohort,
  buildRisk,
  completedCycles,
  computeUnitEconomics,
  countFinancialFieldsInExport,
  eligibleThreeCycleRetention,
  exportAnalytics,
  funnelCounts,
  hasEffectiveControl,
  type AnalyticsEvent,
  type PaymentSignal,
  type Risk,
} from "@kombe/domain";
import { withGroupTx } from "./txContext.js";
import type {
  CohortView,
  EconomicsInput,
  EconomicsView,
  ExtensionView,
  FunnelView,
  MetricsContext,
  MetricsStore,
  RiskInput,
} from "../metricsStore.js";

export class PgMetricsStore implements MetricsStore {
  constructor(private readonly pool: pg.Pool) {}

  /* --- garde d'accès (identique au store fictif) --- */

  private gateAuth(ctx: MetricsContext): void {
    if (!ctx.actorIdentityId) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    }
  }

  private static requireGroup(groupId: string | undefined): string {
    if (!groupId || groupId.trim().length === 0) {
      throw new DomainError("METRICS_IDENTIFIANT_REQUIS", "Groupe porteur requis");
    }
    return groupId;
  }

  /* --- 16.1 funnel analytics (pseudonymisé, sans contenu financier) --- */

  async trackAnalyticsEvent(
    ctx: MetricsContext,
    input: { cohortId: string; groupId?: string; step: string; properties: Record<string, string | number | boolean> },
  ): Promise<AnalyticsEvent> {
    this.gateAuth(ctx);
    const groupId = PgMetricsStore.requireGroup(input.groupId);
    // Le domaine valide AVANT l'écriture : étape hors whitelist ou clé
    // financière/identitaire individuelle ⇒ refus (422), rien n'est persisté.
    // L'horodatage est SERVEUR (`ctx.serverNow`), jamais une heure client.
    const event = buildAnalyticsEvent({
      eventId: randomUUID(),
      cohortId: input.cohortId,
      step: input.step,
      occurredAt: ctx.serverNow,
      properties: input.properties,
    });
    await withGroupTx(this.pool, groupId, async (client) => {
      await client.query(
        `INSERT INTO analytics_event (event_id, cohort_id, group_id, step, occurred_at, properties)
         VALUES ($1,$2,$3,$4,to_timestamp($5),$6::jsonb)`,
        [event.eventId, event.cohortId, groupId, event.step, event.occurredAt, JSON.stringify(event.properties)],
      );
    });
    return event;
  }

  async analyticsFunnel(ctx: MetricsContext, cohortId: string, groupId?: string): Promise<FunnelView> {
    this.gateAuth(ctx);
    const group = PgMetricsStore.requireGroup(groupId);
    return withGroupTx(this.pool, group, async (client) => {
      const res = await client.query(
        `SELECT event_id, cohort_id, step, EXTRACT(EPOCH FROM occurred_at)::bigint AS occurred_at, properties
         FROM analytics_event WHERE cohort_id = $1 ORDER BY occurred_at ASC`,
        [cohortId],
      );
      const events: AnalyticsEvent[] = res.rows.map((row) =>
        buildAnalyticsEvent({
          eventId: String(row.event_id),
          cohortId: String(row.cohort_id),
          step: String(row.step),
          occurredAt: Number(row.occurred_at),
          properties: (row.properties ?? {}) as Record<string, string | number | boolean>,
        }),
      );
      const rows = exportAnalytics(events);
      return {
        cohortId,
        steps: funnelCounts(events),
        individualFinancialFields: countFinancialFieldsInExport(rows),
      };
    });
  }

  /* --- 18.13 cohortes : tours / cycles / trois cycles --- */

  async upsertCohort(
    ctx: MetricsContext,
    input: { groupId: string; memberCount: number; roundsCompleted: number },
  ): Promise<CohortView> {
    this.gateAuth(ctx);
    const cohort = buildCohort(input);
    await withGroupTx(this.pool, cohort.groupId, async (client) => {
      await client.query(
        `INSERT INTO pilot_cohort (group_id, member_count, rounds_completed, updated_at)
         VALUES ($1,$2,$3,now())
         ON CONFLICT (group_id) DO UPDATE
           SET member_count = EXCLUDED.member_count,
               rounds_completed = EXCLUDED.rounds_completed,
               updated_at = now()`,
        [cohort.groupId, cohort.memberCount, cohort.roundsCompleted],
      );
    });
    return {
      groupId: cohort.groupId,
      memberCount: cohort.memberCount,
      roundsCompleted: cohort.roundsCompleted,
      completedCycles: completedCycles(cohort),
      eligibleThreeCycleRetention: eligibleThreeCycleRetention(cohort),
    };
  }

  async getCohort(ctx: MetricsContext, groupId: string): Promise<CohortView> {
    this.gateAuth(ctx);
    return withGroupTx(this.pool, groupId, async (client) => {
      const res = await client.query(
        `SELECT group_id, member_count, rounds_completed FROM pilot_cohort WHERE group_id = $1`,
        [groupId],
      );
      const row = res.rows[0];
      // Non-divulgation : une cohorte inconnue (ou masquée par RLS hors du
      // groupe scopé) répond comme une erreur interne de réservation (404).
      if (!row) {
        throw new DomainError("RESERVATION_INCOHERENTE", "Cohorte introuvable");
      }
      const cohort = buildCohort({
        groupId: String(row.group_id),
        memberCount: Number(row.member_count),
        roundsCompleted: Number(row.rounds_completed),
      });
      return {
        groupId: cohort.groupId,
        memberCount: cohort.memberCount,
        roundsCompleted: cohort.roundsCompleted,
        completedCycles: completedCycles(cohort),
        eligibleThreeCycleRetention: eligibleThreeCycleRetention(cohort),
      };
    });
  }

  /* --- 16.2 économie unitaire (XAF entier, réel ≠ promesse) : calcul RÉEL --- */

  async computeEconomics(ctx: MetricsContext, input: EconomicsInput): Promise<EconomicsView> {
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

  /* --- 16.3 registre des risques (registre PROGRAMME, hors RLS) --- */

  async addRisk(ctx: MetricsContext, input: RiskInput): Promise<Risk> {
    this.gateAuth(ctx);
    const risk = buildRisk(input);
    // `pilot_risk` est révisable (une revue met à jour la ligne), non append-only.
    await this.pool.query(
      `INSERT INTO pilot_risk
         (risk_id, severity, probability_percent, impact_percent, control, evidence_ref, owner, reviewed_at, residual)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,$9)
       ON CONFLICT (risk_id) DO UPDATE
         SET severity = EXCLUDED.severity,
             probability_percent = EXCLUDED.probability_percent,
             impact_percent = EXCLUDED.impact_percent,
             control = EXCLUDED.control,
             evidence_ref = EXCLUDED.evidence_ref,
             owner = EXCLUDED.owner,
             reviewed_at = EXCLUDED.reviewed_at,
             residual = EXCLUDED.residual`,
      [
        risk.riskId,
        risk.severity,
        risk.probabilityPercent,
        risk.impactPercent,
        risk.control,
        risk.evidenceRef,
        risk.owner,
        risk.reviewedAt,
        risk.residual,
      ],
    );
    return risk;
  }

  async listRisks(ctx: MetricsContext): Promise<Risk[]> {
    this.gateAuth(ctx);
    // `to_char` fige la date de revue en AAAA-MM-JJ : évite tout décalage de
    // fuseau qu'introduirait la conversion d'un `date` en `Date` JS.
    const res = await this.pool.query(
      `SELECT risk_id, severity, probability_percent, impact_percent, control, evidence_ref,
              owner, to_char(reviewed_at, 'YYYY-MM-DD') AS reviewed_at, residual
       FROM pilot_risk ORDER BY risk_id ASC`,
    );
    return res.rows.map((row) =>
      buildRisk({
        riskId: String(row.risk_id),
        severity: String(row.severity),
        probabilityPercent: Number(row.probability_percent),
        impactPercent: Number(row.impact_percent),
        control: String(row.control),
        evidenceRef: String(row.evidence_ref),
        owner: String(row.owner),
        reviewedAt: String(row.reviewed_at),
        residual: String(row.residual),
      }),
    );
  }

  async extensionStatus(ctx: MetricsContext): Promise<ExtensionView> {
    this.gateAuth(ctx);
    const all = await this.listRisks(ctx);
    const blocked = blocksPilotExtension(all);
    return {
      extensionAllowed: !blocked,
      criticalWithoutControl: all
        .filter((r) => r.severity === "critique" && !hasEffectiveControl(r))
        .map((r) => r.riskId),
    };
  }
}
