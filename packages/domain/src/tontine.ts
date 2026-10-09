/**
 * Amorçage KÓMBE — concepts du parcours de création/rejoindre une tontine,
 * dérivés des lots C03/C05 et de la story C21 §2.5, réalignés après la dérive
 * produit (l'UI ne proposait que « rejoindre », jamais « créer » ; pas de type,
 * pas de modèle, pas de parrainage, pas de hiérarchie).
 *
 * Logique **pure**, horloge/paramètres injectés, sans persistance : la
 * décision est testable maintenant ; la persistance (RLS, unicité, FK) relève
 * de `packages/db` et des preuves base réelle.
 *
 * Périmètre et barrières (garde-fous produit, jamais contournables via API) :
 *  - 2.1 : groupe créé en `configuration`, devise XAF, fuseau Africa/Douala.
 *  - 2.2 : modèles préconfigurés (famille, collègues, fêtes, construction,
 *    étudiant, personnalisé) ; ils **pré-remplissent** des règles par défaut
 *    modifiables avant validation — ce ne sont pas des invariants.
 *  - 2.3 : typologie de rotation. P0 = rotation fermée, cotisation égale, une
 *    part par membre, ordre fixé avant cycle. `tirage`/`négocié` = P1 : le
 *    mécanisme est modélisé mais le **démarrage échoue fermé** tant que la
 *    recette dédiée n'existe pas. Enchères, prêts, accumulation, multi-parts :
 *    hors périmètre (2.4), refusés.
 *  - C21 : hiérarchie parent/enfant (une association supervise un portefeuille
 *    de tontines) et multi-adhésion (un membre est dans plusieurs tontines) ;
 *    la supervision ne donne JAMAIS de droit financier automatique.
 */
import { DomainError } from "./errors.js";
import { CURRENCY } from "./money.js";
import type { GroupState } from "./group.js";

/** Fuseau métier du pilote (dates affichées ; instants persistés en UTC). */
export const PILOT_TIMEZONE = "Africa/Douala" as const;

/* ------------------------------------------------------------------ *
 * 2.2 — Modèles de tontine préconfigurés
 * ------------------------------------------------------------------ */

export const TONTINE_MODELS = [
  "famille",
  "collegues",
  "fetes",
  "construction",
  "etudiant",
  "personnalise",
] as const;
export type TontineModel = (typeof TONTINE_MODELS)[number];

/**
 * Présélecteur de règles par défaut fourni par un modèle. Uniquement des
 * paramètres OPÉRATIONNELS (cadence, jour d'échéance, grâce, pénalité,
 * quorum) — JAMAIS un montant : la cotisation reste choisie par le fondateur.
 * Ces valeurs sont des suggestions éditables avant validation (2.2).
 */
export interface ModelPreset {
  readonly model: TontineModel;
  readonly frequency: "monthly" | "weekly";
  readonly dueDay: number;
  readonly gracePeriodDays: number;
  readonly penaltyEnabled: boolean;
  readonly quorumNumerator: number;
  readonly quorumDenominator: number;
  /** Le fondateur part d'une page vierge : rien n'est pré-rempli. */
  readonly blank: boolean;
}

const PRESETS: Readonly<Record<TontineModel, ModelPreset>> = {
  famille: { model: "famille", frequency: "monthly", dueDay: 5, gracePeriodDays: 3, penaltyEnabled: false, quorumNumerator: 2, quorumDenominator: 3, blank: false },
  collegues: { model: "collegues", frequency: "monthly", dueDay: 10, gracePeriodDays: 5, penaltyEnabled: false, quorumNumerator: 1, quorumDenominator: 2, blank: false },
  fetes: { model: "fetes", frequency: "weekly", dueDay: 1, gracePeriodDays: 2, penaltyEnabled: true, quorumNumerator: 2, quorumDenominator: 3, blank: false },
  construction: { model: "construction", frequency: "monthly", dueDay: 1, gracePeriodDays: 7, penaltyEnabled: true, quorumNumerator: 2, quorumDenominator: 3, blank: false },
  etudiant: { model: "etudiant", frequency: "weekly", dueDay: 3, gracePeriodDays: 2, penaltyEnabled: false, quorumNumerator: 1, quorumDenominator: 2, blank: false },
  personnalise: { model: "personnalise", frequency: "monthly", dueDay: 5, gracePeriodDays: 2, penaltyEnabled: false, quorumNumerator: 1, quorumDenominator: 2, blank: true },
};

export function isTontineModel(value: string): value is TontineModel {
  return (TONTINE_MODELS as readonly string[]).includes(value);
}

/** Renvoie le pré-remplissage d'un modèle ; erreur stable si inconnu. */
export function modelPreset(model: string): ModelPreset {
  if (!isTontineModel(model)) {
    throw new DomainError("TONTINE_MODEL_UNKNOWN", "Modèle de tontine inconnu");
  }
  return PRESETS[model];
}

/* ------------------------------------------------------------------ *
 * 2.3 — Typologies de rotation (P0 atteste, P1 en garde fermée)
 * ------------------------------------------------------------------ */

export const ROTATION_TYPES = ["rotative_fermee", "tirage", "negocie"] as const;
export type RotationType = (typeof ROTATION_TYPES)[number];

/**
 * Typologies dont le cycle peut DÉMARRER au pilote (G0/P0). `rotative_fermee`
 * = rotation égale, une part par membre, ordre fixé avant cycle — c'est
 * l'unique typologie attestée par l'oracle `rotation.ts`. `tirage` et
 * `negocie` sont modélisés (P1) mais leur démarrage échoue fermé tant que la
 * recette dédiée (C05 §5.3, C03 ligne 73) n'existe pas.
 */
export const P0_ROTATION_TYPES: readonly RotationType[] = ["rotative_fermee"];

export function isRotationType(value: string): value is RotationType {
  return (ROTATION_TYPES as readonly string[]).includes(value);
}

export function rotationTypeSupportedAtPilot(type: string): boolean {
  return isRotationType(type) && P0_ROTATION_TYPES.includes(type as RotationType);
}

/**
 * Garde de CRÉATION : la devise et le fuseau doivent être ceux attestés au
 * pilote. La typologie de rotation doit être CONNUE (le fondateur peut choisir
 * un type P1 à la création, mais pas le démarrer — voir
 * `assertRotationTypeStartable`). Erreurs stables, non contournables.
 */
export function assertGroupDefaults(input: { currency: string; timezone: string }): void {
  if (input.currency !== CURRENCY) {
    throw new DomainError("GROUP_CURRENCY_UNSUPPORTED", "Devise non prise en charge au pilote");
  }
  if (input.timezone !== PILOT_TIMEZONE) {
    throw new DomainError("GROUP_TIMEZONE_UNSUPPORTED", "Fuseau non pris en charge au pilote");
  }
}

/** À la création, la typologie demandée doit exister dans le catalogue. */
export function assertRotationTypeKnown(type: string): void {
  if (!isRotationType(type)) {
    throw new DomainError("ROTATION_TYPE_UNKNOWN", "Typologie de rotation inconnue");
  }
}

/**
 * Garde de DÉMARRAGE du cycle : seule une typologie attestée au pilote (P0)
 * peut démarrer. `tirage`/`négocié` (P1) échouent fermé tant que la recette
 * dédiée n'existe pas (C05 §5.3, C03 ligne 73) — mécanise le refus serveur,
 * jamais seulement le masquage UI.
 */
export function assertRotationTypeStartable(type: string): void {
  assertRotationTypeKnown(type);
  if (!rotationTypeSupportedAtPilot(type)) {
    throw new DomainError(
      "ROTATION_TYPE_NOT_READY",
      "Typologie reconnue mais non activable au pilote (P1, recette dédiée requise)",
    );
  }
}

/* ------------------------------------------------------------------ *
 * C21 — Hiérarchie parent / enfant (portefeuille supervisé)
 * ------------------------------------------------------------------ */

/**
 * Profondeur maximale d'une chaîne de supervision. C21 mentionne la gestion
 * d'un portefeuille (jusqu'à 50 groupes) ; la hiérarchie reste peu profonde
 * (une association faîtière au-dessus de ses tontines). Garde-fou anti-cycle.
 */
export const MAX_PARENT_DEPTH = 5;

/**
 * Garde d'affectation d'un parent : le parent ne peut pas être le groupe
 * lui-même, ni exister dans sa propre ascendance (cycle), et la chaîne ne
 * doit pas dépasser `MAX_PARENT_DEPTH`. `ancestorIds` = parents déjà en
 * place, du plus proche au plus lointain ; `groupId` absent de la chaîne =
 * nouveau groupe enraciné (profondeur 1).
 */
export function assertParentAssignable(input: {
  groupId: string;
  parentId: string;
  ancestorIds: readonly string[];
}): void {
  if (input.parentId === input.groupId) {
    throw new DomainError("GROUP_PARENT_SELF_FORBIDDEN", "Un groupe ne peut se donner pour parent");
  }
  if (input.ancestorIds.includes(input.parentId)) {
    throw new DomainError("GROUP_PARENT_CYCLE", "Cycle de supervision détecté");
  }
  const depth = input.ancestorIds.length + 2; // parent + sa propre chaîne + soi
  if (depth > MAX_PARENT_DEPTH) {
    throw new DomainError("GROUP_PARENT_DEPTH_EXCEEDED", "Chaîne de supervision trop profonde");
  }
}

/**
 * Limite de groupes supervisable par un parent (C21 : jusqu'à 50). Un parent
 * au-delà de `MAX_CHILD_GROUPS` refuse un enfant supplémentaire.
 */
export const MAX_CHILD_GROUPS = 50;
export function assertChildCapacity(currentChildren: number): void {
  if (currentChildren >= MAX_CHILD_GROUPS) {
    throw new DomainError("GROUP_PARENT_DEPTH_EXCEEDED", "Portefeuille de supervision plein");
  }
}

/**
 * La supervision (rôle faîtier hérité du parent) ne constitue JAMAIS, à elle
 * seule, un privilège financier : lire des agrégats oui, valider une
 * cotisation ou voter non. Ce garde s'appelle quand la SEULE justification
 * d'un acte financier est la relation de supervision ; il refuse toujours.
 * L'autorisation financière réelle relève des rôles du groupe (C03 §4.5).
 */
export function assertSupervisionIsNotFinancialRight(): void {
  throw new DomainError(
    "SUPERVISOR_FINANCIAL_FORBIDDEN",
    "La supervision ne confère aucun droit financier",
  );
}

/* ------------------------------------------------------------------ *
 * Parrainage / cooptation (rejoint via un membre parrain)
 * ------------------------------------------------------------------ */

export const SPONSORSHIP_STATES = ["requested", "endorsed", "rejected", "withdrawn"] as const;
export type SponsorshipState = (typeof SPONSORSHIP_STATES)[number];

export interface Sponsorship {
  readonly sponsorshipId: string;
  readonly groupId: string;
  readonly candidateId: string;
  readonly sponsorId: string;
  readonly state: SponsorshipState;
  readonly createdAt: number;
  readonly decidedAt: number | null;
}

/**
 * Ouvre un parrainage : le parrain doit être membre ACTIF du groupe (fait
 * serveur, jamais revendiqué par le client), et ne peut pas se parrainer
 * lui-même. Une seule demande ouverte par candidat/groupe.
 */
export function requestSponsorship(input: {
  sponsorshipId: string;
  groupId: string;
  candidateId: string;
  sponsorId: string;
  sponsorIsActiveMember: boolean;
  now: number;
}): Sponsorship {
  if (input.candidateId === input.sponsorId) {
    throw new DomainError("SPONSOR_SELF_FORBIDDEN", "Un candidat ne peut se parrainer lui-même");
  }
  if (!input.sponsorIsActiveMember) {
    throw new DomainError("SPONSOR_NOT_ACTIVE_MEMBER", "Le parrain doit être un membre actif du groupe");
  }
  return {
    sponsorshipId: input.sponsorshipId,
    groupId: input.groupId,
    candidateId: input.candidateId,
    sponsorId: input.sponsorId,
    state: "requested",
    createdAt: input.now,
    decidedAt: null,
  };
}

/** Transition d'une demande de parrainage ; refus des états terminaux. */
export function decideSponsorship(
  s: Sponsorship,
  decision: "endorsed" | "rejected",
  now: number,
): Sponsorship {
  if (s.state !== "requested") {
    throw new DomainError("SPONSORSHIP_STATE_INVALID", "Demande de parrainage déjà tranchée");
  }
  return { ...s, state: decision, decidedAt: now };
}

export function withdrawSponsorship(s: Sponsorship, now: number): Sponsorship {
  if (s.state !== "requested") {
    throw new DomainError("SPONSORSHIP_STATE_INVALID", "Demande de parrainage déjà tranchée");
  }
  return { ...s, state: "withdrawn", decidedAt: now };
}

/* ------------------------------------------------------------------ *
 * C21 §2.5 — Multi-adhésion : vue consolidée des engagements d'un membre
 * ------------------------------------------------------------------ */

/**
 * Une adhésion active du membre dans un groupe, avec sa prochaine échéance
 * (instant UTC) et son montant dû. Fourni par le serveur (projections) ; ici
 * on ne fait que le consolider.
 */
export interface MemberCommitment {
  readonly groupId: string;
  readonly groupName: string;
  readonly nextDueAtUtc: number;
  readonly amountDue: bigint;
}

/**
 * Consolide les engagements multi-groupes d'un membre : total dû (addition
 * exacte en bigint, sans float) et prochaine échéance la plus proche. Un
 * membre peut être dans plusieurs tontines : aucune unicité n'est supposée.
 */
export function consolidateCommitments(
  commitments: readonly MemberCommitment[],
): { readonly totalDue: bigint; readonly nextDueAtUtc: number | null; readonly groupCount: number } {
  let totalDue = 0n;
  let nextDueAtUtc: number | null = null;
  for (const c of commitments) {
    totalDue += c.amountDue;
    if (nextDueAtUtc === null || c.nextDueAtUtc < nextDueAtUtc) {
      nextDueAtUtc = c.nextDueAtUtc;
    }
  }
  return { totalDue, nextDueAtUtc, groupCount: commitments.length };
}

/**
 * Vue consolidée C21 §2.5 (surface légère) : le RÉSUMÉ d'une tontine dont le
 * membre fait partie. Fourni par le serveur (projection membership ⨝ group) ;
 * ne porte AUCUN pouvoir financier ni décision — la supervision parent/enfant
 * est purement informative ici. `parentGroupId` révèle la hiérarchie (une
 * grande tontine qui en supervise plusieurs), `membershipState` distingue
 * l'adhésion active d'une demande en cours.
 */
export interface MemberGroupSummary {
  readonly groupId: string;
  readonly displayName: string;
  readonly tontineModel: TontineModel;
  readonly rotationType: RotationType;
  readonly groupState: GroupState;
  readonly parentGroupId: string | null;
  readonly membershipState: "pending" | "active" | "departed" | "revoked";
}
