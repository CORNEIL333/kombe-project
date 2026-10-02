/**
 * Mesure du pilote et économie unitaire (C18 ; stories 16.1, 16.2, 16.3, 18.13).
 * Logique **pure**, horloge et mesures injectées, sans persistance ni analytics
 * réelle. Trois principes non négociables structurent ce module :
 *
 * 1. **Analytics sans contenu financier individuel** (16.1, C18-ANALYTICS) :
 *    le funnel suit des **étapes** d'une **whitelist** ferme, agrégées et
 *    **pseudonymisées** par cohorte. Aucun **montant**, aucune **référence**
 *    ni **commentaire** individuel, aucune identité personnelle ne transitent
 *    par un événement : une clé interdite est **refusée** à la construction, et
 *    l'export ne contient que des clés propres (`individual_financial_fields=0`).
 * 2. **Tours ≠ cycles ≠ trois cycles** (18.13, C18-COHORT) : un **cycle** est
 *    une **rotation complète** = `memberCount` tours (rotation égale, ADR-0002) ;
 *    « trois cycles » = `memberCount × 3` tours **achevés**. Une rétention à
 *    trois cycles n'est **jamais** annoncée avant la **durée observée** : un
 *    groupe à 3 tours sur 10 membres affiche `eligible_three_cycle_retention=false`.
 * 3. **Complétude ≠ solvabilité ; paiement réel ≠ promesse** (16.2, C18-PAYERS) :
 *    les taux utilisent des **dénominateurs** réels et des **nombres bruts** ;
 *    le **paiement réel** (hors application, ADR-0005) est **distinct** de la
 *    **promesse** : seules les occurrences `paid` comptent. Le coût support est
 *    `minutes × coût par minute` en **XAF entier** (bigint, jamais de flottant).
 *
 * Erreurs stables non divulguantes (cf. errors.ts). Ce module **ne prétend** à
 * aucune valeur commerciale : les **seuils** sont **exploratoires** (documentés,
 * jamais des promesses) et le **registre des risques** rend un risque
 * **critique sans contrôle effectif** **bloquant** pour l'extension du pilote.
 * Cf. 01_Audit/ARCHITECTURE_CIBLE.md ; ADR-0002 (monnaie XAF entière),
 * ADR-0005 (serveur canonique), ADR-0016 (journal/projections).
 */
import { DomainError } from "./errors.js";
import { money } from "./money.js";

/* ── utilitaires bornés ─────────────────────────────────────────────────── */

function blank(v: string): boolean {
  return v.trim().length === 0;
}

/** Entier **non négatif** né d'une mesure (compte, minute, tour). */
function nonNegativeInt(value: number, what: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new DomainError("METRICS_VALEUR_INVALIDE", `${what} entier >= 0 requis`);
  }
  return value;
}

/** Entier borné à un pourcentage [0, 100]. */
function percent0to100(value: number, what: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    throw new DomainError("METRICS_VALEUR_INVALIDE", `${what} entier dans [0,100] requis`);
  }
  return value;
}

/**
 * Taux en **pourcentage entier**, calcul par **entier** (jamais de flottant) :
 * `floor(numerator × 100 / denominator)`. Un **dénominateur** nul ou négatif est
 * une erreur (jamais une division silencieuse) : `METRICS_DENOMINATEUR_NUL`.
 */
export function ratePercent(numerator: number, denominator: number): number {
  const n = nonNegativeInt(numerator, "Numérateur");
  const d = nonNegativeInt(denominator, "Dénominateur");
  if (d === 0) {
    throw new DomainError("METRICS_DENOMINATEUR_NUL", "Dénominateur nul interdit");
  }
  return Math.floor((n * 100) / d);
}

/* ── 16.1 funnel analytics : whitelist + non-divulgation financière ─────── */

/** Étapes **suivies** du funnel — whitelist **ferme** (rien d'autre n'est instrumenté). */
export const ANALYTICS_STEPS = [
  "visite",
  "demarrage",
  "regles_crees",
  "invitations",
  "membres_acceptes",
  "premiere_contribution",
  "premiere_validation",
  "cycle_termine",
  "paiement_abonnement",
] as const;
export type AnalyticsStep = (typeof ANALYTICS_STEPS)[number];

/** Tokens **financiers individuels** : aucun ne doit apparaître dans un événement. */
export const INDIVIDUAL_FINANCIAL_TOKENS = [
  "montant",
  "amount",
  "cotisation",
  "contribution",
  "solde",
  "balance",
  "pot",
  "iban",
  "reference",
  "référence",
  "commentaire",
  "comment",
] as const;

/** Tokens **identifiants personnels** : l'analytics reste pseudonymisé par cohorte. */
export const PERSONAL_TOKENS = [
  "identity",
  "member",
  "email",
  "e-mail",
  "phone",
  "telephone",
  "téléphone",
  "prenom",
  "prénom",
  "surname",
  "nom",
  "address",
  "adresse",
  "user",
] as const;

type AnalyticsProperties = Readonly<Record<string, string | number | boolean>>;

/** Une clé porte-t-elle un jeton **financier individuel** ? */
function keyIsFinancial(key: string): boolean {
  const k = key.toLowerCase();
  return INDIVIDUAL_FINANCIAL_TOKENS.some((tok) => k.includes(tok));
}

/** Une clé porte-t-elle un jeton **personnel** (identité individuelle) ? */
function keyIsPersonal(key: string): boolean {
  const k = key.toLowerCase();
  return PERSONAL_TOKENS.some((tok) => k.includes(tok));
}

/** Compte les clés **financières individuelles** d'un jeu de propriétés. */
export function individualFinancialFieldCount(props: AnalyticsProperties): number {
  return Object.keys(props).filter(keyIsFinancial).length;
}

/** Clés sensibles (financières OU personnelles) présentes dans un jeu de propriétés. */
export function findSensitiveKeys(props: AnalyticsProperties): string[] {
  return Object.keys(props).filter((k) => keyIsFinancial(k) || keyIsPersonal(k));
}

export interface AnalyticsEvent {
  readonly eventId: string;
  readonly cohortId: string;
  readonly step: AnalyticsStep;
  /** Horodatage **serveur** (secondes d'époque), injecté, jamais une heure client. */
  readonly occurredAt: number;
  /** Propriétés **assainies** : aucune clé financière ni personnelle individuelle. */
  readonly properties: AnalyticsProperties;
}

/**
 * Construit un événement d'analytics **publiable** : étape dans la whitelist,
 * identifiants renseignés, et **aucune** clé sensible (financière individuelle,
 * référence, commentaire, identité personnelle) — une telle clé est **refusée**
 * (`METRICS_CHAMPS_FINANCIER_INDIVIDUEL`). Les propriétés conservées sont
 * **assainies** (double garde : seules les clés non sensibles survivent).
 */
export function buildAnalyticsEvent(input: {
  eventId: string;
  cohortId: string;
  step: string;
  occurredAt: number;
  properties?: AnalyticsProperties;
}): AnalyticsEvent {
  if (blank(input.eventId) || blank(input.cohortId)) {
    throw new DomainError("METRICS_IDENTIFIANT_REQUIS", "Identifiant d'événement/cohorde requis");
  }
  if (!(ANALYTICS_STEPS as readonly string[]).includes(input.step)) {
    throw new DomainError("METRICS_ETAPE_ANALYTICS_INCONNUE", "Étape hors whitelist");
  }
  const props = input.properties ?? {};
  const sensitive = findSensitiveKeys(props);
  if (sensitive.length > 0) {
    throw new DomainError(
      "METRICS_CHAMPS_FINANCIER_INDIVIDUEL",
      "Champ individuel interdit dans l'analytics",
    );
  }
  const sanitized: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(props)) {
    if (!keyIsFinancial(k) && !keyIsPersonal(k)) sanitized[k] = v;
  }
  return {
    eventId: input.eventId,
    cohortId: input.cohortId,
    step: input.step as AnalyticsStep,
    occurredAt: nonNegativeInt(input.occurredAt, "Horodatage"),
    properties: sanitized,
  };
}

/** Une ligne d'export d'analytics (agrégée par cohorte, sans contenu individuel). */
export interface AnalyticsExportRow {
  readonly cohortId: string;
  readonly step: AnalyticsStep;
  readonly occurredAt: number;
  readonly properties: AnalyticsProperties;
}

/** Exporte le funnel en lignes **assainies** ; garantit `individual_financial_fields=0`. */
export function exportAnalytics(events: readonly AnalyticsEvent[]): AnalyticsExportRow[] {
  return events.map((e) => ({
    cohortId: e.cohortId,
    step: e.step,
    occurredAt: e.occurredAt,
    properties: e.properties,
  }));
}

/** Compte total de champs financiers individuels servis dans un export (doit être 0). */
export function countFinancialFieldsInExport(rows: readonly AnalyticsExportRow[]): number {
  return rows.reduce((acc, r) => acc + individualFinancialFieldCount(r.properties), 0);
}

/** Comptes du funnel, dans l'ordre des étapes (nombres bruts par étape). */
export function funnelCounts(events: readonly AnalyticsEvent[]): { step: AnalyticsStep; count: number }[] {
  return ANALYTICS_STEPS.map((step) => ({
    step,
    count: events.filter((e) => e.step === step).length,
  }));
}

/* ── 18.13 cohortes : tours / cycles / trois cycles ─────────────────────── */

export interface Cohort {
  readonly groupId: string;
  /** Nombre de membres → un cycle = rotation complète = `memberCount` tours. */
  readonly memberCount: number;
  /** Tours **achevés** observés à ce jour. */
  readonly roundsCompleted: number;
}

/** Nombre de **tours** pour un cycle complet (rotation égale : un par membre). */
export function roundsPerCycle(cohort: Cohort): number {
  return cohort.memberCount;
}

/** **Cycles complets** achevés = `floor(roundsCompleted / roundsPerCycle)`. */
export function completedCycles(cohort: Cohort): number {
  if (cohort.memberCount <= 0) {
    throw new DomainError("METRICS_DENOMINATEUR_NUL", "Cohorte sans membre : dénominateur nul");
  }
  return Math.floor(cohort.roundsCompleted / cohort.memberCount);
}

/** Minimum de **cycles observés** avant d'annoncer une rétention à trois cycles. */
export const MIN_CYCLES_FOR_RETENTION = 3;

/**
 * Cohorte **éligible** à une rétention trois cycles ? Uniquement si **trois
 * cycles complets** sont **observés** (durée atteinte). Jamais « vrai » sur la
 * seule foi de tours partiels (C18-COHORT : 3 tours / 10 membres ⇒ `false`).
 */
export function eligibleThreeCycleRetention(cohort: Cohort): boolean {
  return completedCycles(cohort) >= MIN_CYCLES_FOR_RETENTION;
}

/** Construit/valide une cohorte de pilote (identifiant + bornes entières). */
export function buildCohort(input: {
  groupId: string;
  memberCount: number;
  roundsCompleted: number;
}): Cohort {
  if (blank(input.groupId)) {
    throw new DomainError("METRICS_IDENTIFIANT_REQUIS", "Identifiant de groupe requis");
  }
  nonNegativeInt(input.roundsCompleted, "Tours achevés");
  if (!Number.isInteger(input.memberCount) || input.memberCount < 1) {
    throw new DomainError("METRICS_VALEUR_INVALIDE", "Nombre de membres entier >= 1 requis");
  }
  return { groupId: input.groupId, memberCount: input.memberCount, roundsCompleted: input.roundsCompleted };
}

/* ── 16.2 économie unitaire + seuils exploratoires (XAF entier) ──────────── */

/**
 * Seuils **exploratoires** du pilote (documentés, **jamais** des promesses ni
 * des engagements contractuels). En pourcentages entiers ou heures.
 */
export const PILOT_THRESHOLDS = {
  activationPercent: 70,
  completenessPercent: 90,
  disputesMaxPercent: 2,
  retentionThreeCyclesPercent: 60,
  paymentRealPercent: 25,
  validationMedianHoursMax: 24,
} as const;

/** Signal de paiement d'un membre exposé à l'offre : **réel** vs **promis**. */
export type PaymentStatus = "paid" | "promised";
export interface PaymentSignal {
  readonly status: PaymentStatus;
}

/**
 * Compte les payeurs **réels** : seules les occurrences `paid` (paiement
 * effectivement reçu, hors application) comptent. Les promesses (`promised`)
 * sont **exclues** — une promesse n'est jamais un paiement (16.2, 18.13).
 */
export function countRealPayers(signals: readonly PaymentSignal[]): number {
  return signals.filter((s) => s.status === "paid").length;
}

/**
 * La porte **G2** est-elle atteinte ? Le **taux de paiement réel** (payeurs
 * réels / exposés) doit **au moins** égaler le **seuil exploratoire** (25 %).
 * Calcul en **entier** (pas de flottant) : `2/10 = 20 % < 25 %` ⇒ `false`
 * (C18-PAYERS). Un exposé nul ⇒ erreur de dénominateur, jamais un faux `true`.
 */
export function gateG2Met(exposed: number, signals: readonly PaymentSignal[]): boolean {
  return ratePercent(countRealPayers(signals), exposed) >= PILOT_THRESHOLDS.paymentRealPercent;
}

export interface UnitEconomicsInput {
  /** Membres exposés à l'offre d'abonnement (dénominateur du taux réel). */
  readonly exposedMembers: number;
  readonly paymentSignals: readonly PaymentSignal[];
  /** Minutes cumulées de support (coût = minutes × coût/minute). */
  readonly supportMinutes: number;
  /** Coût support par **minute**, en XAF entier. */
  readonly supportCostPerMinuteMinor: bigint;
  /** Coût d'infrastructure cumulé, en XAF entier. */
  readonly infrastructureCostMinor: bigint;
  /** Nombre d'annulations (brut). */
  readonly cancellations: number;
  /** Taxes documentées, en XAF entier. */
  readonly taxesMinor: bigint;
}

export interface UnitEconomicsView {
  readonly exposedMembers: number;
  readonly realPayers: number;
  readonly promisedOnly: number;
  readonly paymentRealPercent: number;
  readonly gateG2Met: boolean;
  readonly supportMinutes: number;
  readonly supportCostMinor: bigint;
  readonly infrastructureCostMinor: bigint;
  readonly cancellations: number;
  readonly taxesMinor: bigint;
  /** Coût total unitaire de service (support + infra + taxes), XAF entier. */
  readonly totalCostMinor: bigint;
}

/**
 * Calcule l'**économie unitaire** du pilote en **XAF entier** : le coût support
 * est `minutes × coût/minute` (produit d'entiers, jamais de flottant), et les
 * montants sont validés par l'oracle monétaire `money()`. Le **taux de paiement
 * réel** et la **porte G2** sont **dérivés** (jamais saisis).
 */
export function computeUnitEconomics(input: UnitEconomicsInput): UnitEconomicsView {
  const exposed = nonNegativeInt(input.exposedMembers, "Membres exposés");
  const minutes = nonNegativeInt(input.supportMinutes, "Minutes de support");
  const cancellations = nonNegativeInt(input.cancellations, "Annulations");
  const supportCostPerMinute = money(input.supportCostPerMinuteMinor);
  const infra = money(input.infrastructureCostMinor);
  const taxes = money(input.taxesMinor);

  const realPayers = countRealPayers(input.paymentSignals);
  const promisedOnly = input.paymentSignals.filter((s) => s.status === "promised").length;
  const paymentRealPercent = ratePercent(realPayers, exposed);

  const supportCost = BigInt(minutes) * supportCostPerMinute;
  const totalCost = money(supportCost + infra + taxes);

  return {
    exposedMembers: exposed,
    realPayers,
    promisedOnly,
    paymentRealPercent,
    gateG2Met: paymentRealPercent >= PILOT_THRESHOLDS.paymentRealPercent,
    supportMinutes: minutes,
    supportCostMinor: supportCost,
    infrastructureCostMinor: infra,
    cancellations,
    taxesMinor: taxes,
    totalCostMinor: totalCost,
  };
}

/**
 * La **complétude** (tours avec toutes les cotisations) n'est **pas** la
 * **solvabilité** (le pot réellement encaissé, hors application). Cet
 * indicateur rend la distinction **explicite** et jamais fusionnée.
 */
export function completenessRatePercent(completeRounds: number, totalRounds: number): number {
  return ratePercent(completeRounds, totalRounds);
}

/* ── 16.3 registre des risques ──────────────────────────────────────────── */

export const RISK_SEVERITIES = ["faible", "moyen", "eleve", "critique"] as const;
export type RiskSeverity = (typeof RISK_SEVERITIES)[number];

export interface Risk {
  readonly riskId: string;
  readonly severity: RiskSeverity;
  /** Probabilité estimée, pourcentage entier [0, 100]. */
  readonly probabilityPercent: number;
  /** Impact estimé, pourcentage entier [0, 100]. */
  readonly impactPercent: number;
  /** Contrôle **effectif** mis en place (vide ⇒ non effectif). */
  readonly control: string;
  /** Référence de **preuve** du contrôle (vide ⇒ non démontré). */
  readonly evidenceRef: string;
  /** **Propriétaire** désigné du risque (vide ⇒ non assigné). */
  readonly owner: string;
  /** Date de **revue mensuelle** ISO (`YYYY-MM-DD`). */
  readonly reviewedAt: string;
  /** **Risque résiduel** documenté après contrôle. */
  readonly residual: string;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Le contrôle d'un risque est-il **effectif** (contrôle + preuve + propriétaire) ? */
export function hasEffectiveControl(risk: Risk): boolean {
  return !blank(risk.control) && !blank(risk.evidenceRef) && !blank(risk.owner);
}

/** Construit/valide un risque (identifiant, sévérité connue, bornes, revue datée). */
export function buildRisk(input: {
  riskId: string;
  severity: string;
  probabilityPercent: number;
  impactPercent: number;
  control: string;
  evidenceRef: string;
  owner: string;
  reviewedAt: string;
  residual: string;
}): Risk {
  if (blank(input.riskId)) {
    throw new DomainError("METRICS_IDENTIFIANT_REQUIS", "Identifiant de risque requis");
  }
  if (!(RISK_SEVERITIES as readonly string[]).includes(input.severity)) {
    throw new DomainError("METRICS_SEVERITE_INCONNUE", "Sévérité de risque inconnue");
  }
  percent0to100(input.probabilityPercent, "Probabilité");
  percent0to100(input.impactPercent, "Impact");
  if (!ISO_DATE_RE.test(input.reviewedAt)) {
    throw new DomainError("METRICS_VALEUR_INVALIDE", "Date de revue AAAA-MM-JJ requise");
  }
  return {
    riskId: input.riskId,
    severity: input.severity as RiskSeverity,
    probabilityPercent: input.probabilityPercent,
    impactPercent: input.impactPercent,
    control: input.control,
    evidenceRef: input.evidenceRef,
    owner: input.owner,
    reviewedAt: input.reviewedAt,
    residual: input.residual,
  };
}

/** Un risque **critique** est-il présent **sans contrôle effectif** ? */
export function hasCriticalRiskWithoutControl(risks: readonly Risk[]): boolean {
  return risks.some((r) => r.severity === "critique" && !hasEffectiveControl(r));
}

/**
 * L'**extension du pilote** est-elle **bloquée** par un risque critique sans
 * contrôle effectif ? (16.3 : un risque « critique » sans contrôle **effectif**
 * bloque **explicitement** l'extension.)
 */
export function blocksPilotExtension(risks: readonly Risk[]): boolean {
  return hasCriticalRiskWithoutControl(risks);
}

/**
 * Garde d'extension : **lève** `METRICS_RISQUE_CRITIQUE_SANS_CONTROLE` si un
 * risque critique n'a pas de contrôle effectif (preuve + propriétaire désignés).
 */
export function assertPilotExtensionAllowed(risks: readonly Risk[]): void {
  if (blocksPilotExtension(risks)) {
    throw new DomainError(
      "METRICS_RISQUE_CRITIQUE_SANS_CONTROLE",
      "Extension bloquée : risque critique sans contrôle effectif",
    );
  }
}
