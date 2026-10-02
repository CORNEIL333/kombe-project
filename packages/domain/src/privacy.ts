/**
 * Données personnelles — notices, registre des traitements, consentement
 * **séparable**, demandes de **droits** avec vérification **proportionnée**,
 * **export filtré**, **purge/tombstones** et **restauration** (C16 ; stories
 * 13.1 → 13.4, 18.10, 18.19 ; loi 2024/017 à faire valider par conseil local).
 *
 * Logique **pure** et **horloge injectée** (`now` en secondes d'époque) : aucune
 * dépendance à la persistance. La durabilité des tombstones, l'index/cache à
 * purger, la RLS et les CHECK de schéma relèvent de `packages/db` (migration
 * 0016) et restent **BLOCKED** sans PostgreSQL. Ici ne vivent que les
 * **décisions**, testables maintenant.
 *
 * Invariants honorés :
 *  - **communication prudente** : aucune notice ni communication ne promet une
 *    garantie des fonds ni une « preuve légale » (13.2) ;
 *  - **fait, non simulé** : une notice ou un enregistrement de traitement publié
 *    ne contient **aucun placeholder** (« bientôt », « TBD », etc.) ni base
 *    juridique non confirmée (13.1, 13.3) ;
 *  - **consentement séparable** : recherche / marketing / IA future sont
 *    distincts du **service cœur** — les refuser ne coupe jamais l'accès
 *    (C16-CONSENT : `core_service_available = true`) ;
 *  - **droits sans fuite** : un export personnel ne divulgue **aucun champ
 *    privé d'un autre membre** (C16-EXPORT : `third_party_private_fields = 0`) ;
 *  - **jamais de refus automatique** : une demande est gelée/restreinte pour un
 *    **motif documenté et daté**, jamais par omission ;
 *  - **purge persistante** : une restauration depuis un point antérieur à un
 *    effacement **réapplique effacements ET révocations** avant réouverture
 *    (C16-RESTORE : `deleted_identity_visible = false`) ; le registre de
 *    tombstones vit **hors** du point de restauration ;
 *  - **pseudonyme ≠ anonyme** : un enregistrement pseudonymisé portant des
 *    quasi-identifiants conserve un **risque de réidentification**.
 */
import { DomainError } from "./errors.js";

/** Mention prudente de tout traitement de données personnelles KÓMBE. */
export const PRIVACY_PRUDENT_NOTICE =
  "KÓMBE est un registre partagé ; les paiements restent hors application et ne sont garantis par KÓMBE. Aucun document ne constitue une preuve légale automatique.";

/**
 * Motifs/formulations **interdits** : promesse de garantie des fonds ou de
 * valeur juridique (13.2). Indépendant des données, testable en pur.
 */
const FORBIDDEN_GUARANTEE_RE =
  /garanti(e)?\s+(des?\s+)?fonds|preuve\s+(l[ée]gale)|rentabilit[ée]|fructifi|sans\s+risque|placement\s+r[ée]muner/i;

/**
 * Marqueurs de **placeholder** : une notice ou un enregistrement « publié » ne
 * doit contenir ni promesse remise à plus tard, ni gabarit non rempli (13.1).
 */
const PLACEHOLDER_RE =
  /bient[ôo]t|à\s+venir|a\s+venir|coming\s+soon|t\.?b\.?d|todo|placeholder|lorem\s+ipsum|xxx+|<[^>]+>|\[\s*\]|\{\s*\}|_{3,}/i;

/** Une chaîne est-elle vide/espaces uniquement ? */
function blank(s: string): boolean {
  return typeof s !== "string" || s.trim().length === 0;
}

/** Contient un marqueur de placeholder (gabarit non rempli, « bientôt », etc.). */
export function containsPlaceholder(text: string): boolean {
  return typeof text === "string" && PLACEHOLDER_RE.test(text);
}

/** Une communication respecte-t-elle la prudence (aucune garantie/preuve) ? */
export function isCommunicationPrudente(text: string): boolean {
  return typeof text === "string" && !FORBIDDEN_GUARANTEE_RE.test(text);
}

/* ------------------------------------------------------------------------- *
 * 13.1 — Pages légales versionnées (aucune mention « bientôt »)             *
 * ------------------------------------------------------------------------- */

export const LEGAL_NOTICE_KINDS = [
  "cgu",
  "privacy",
  "cookies",
  "contact",
  "complaint",
] as const;
export type LegalNoticeKind = (typeof LEGAL_NOTICE_KINDS[number])[number];

export interface LegalNotice {
  readonly noticeId: string;
  readonly kind: LegalNoticeKind;
  readonly version: string;
  /** Date ISO (YYYY-MM-DD) de dernière mise à jour, affichée sur la page. */
  readonly lastUpdatedAt: string;
  readonly body: string;
}

/**
 * Construit une notice légale **publiable** : identifiant, version et date
 * (AAAA-MM-JJ) obligatoires ; le corps ne doit être ni vide, ni porteur d'un
 * placeholder (« bientôt », « TBD »…), ni promettre une garantie des fonds ou
 * une valeur juridique (13.1, 13.2). Une notice non conforme est refusée,
 * jamais publiée partiellement.
 */
export function buildLegalNotice(input: {
  noticeId: string;
  kind: string;
  version: string;
  lastUpdatedAt: string;
  body: string;
}): LegalNotice {
  if (blank(input.noticeId)) {
    throw new DomainError("PRIVACY_IDENTIFIANT_REQUIS", "Identifiant de notice requis");
  }
  if (!(LEGAL_NOTICE_KINDS as readonly string[]).includes(input.kind)) {
    throw new DomainError("PRIVACY_CONTENU_PLACEHOLDER", "Type de notice inconnu");
  }
  if (blank(input.version) || containsPlaceholder(input.version)) {
    throw new DomainError("PRIVACY_CONTENU_PLACEHOLDER", "Version de notice invalide");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.lastUpdatedAt)) {
    throw new DomainError("PRIVACY_CONTENU_PLACEHOLDER", "Date de mise à jour invalide");
  }
  if (blank(input.body) || containsPlaceholder(input.body)) {
    throw new DomainError("PRIVACY_CONTENU_PLACEHOLDER", "Notice à contenu placeholder");
  }
  if (!isCommunicationPrudente(input.body)) {
    throw new DomainError("PRIVACY_CONTENU_PLACEHOLDER", "Notice contenant une promesse interdite");
  }
  return {
    noticeId: input.noticeId,
    kind: input.kind as LegalNoticeKind,
    version: input.version,
    lastUpdatedAt: input.lastUpdatedAt,
    body: input.body,
  };
}

/* ------------------------------------------------------------------------- *
 * 13.3 — Registre des traitements (factuel, base à confirmer)               *
 * ------------------------------------------------------------------------- */

export const PROCESSING_BASES = [
  "contract",
  "consent",
  "legal_obligation",
  "vital_interest",
  "public_task",
  "legitimate_interest",
] as const;
export type ProcessingBasis = (typeof PROCESSING_BASES[number])[number];

export interface ProcessingRecord {
  readonly purpose: string;
  readonly dataCategories: readonly string[];
  readonly legalBasis: ProcessingBasis;
  readonly recipients: readonly string[];
  readonly country: string;
  readonly retentionDays: number;
}

/**
 * Enregistre un traitement **factuel** : finalité et pays renseignés (aucun
 * placeholder), catégories non vides, base juridique parmi l'ensemble connu,
 * durée de conservation **entière positive** (aucun délai légal supposé — une
 * durée absente ou négative est refusée). Le champ « base à confirmer par
 * conseil local » est porté par l'appelant ; ici on n'invente ni éditeur ni
 * durée.
 */
export function buildProcessingRecord(input: {
  purpose: string;
  dataCategories: readonly string[];
  legalBasis: string;
  recipients: readonly string[];
  country: string;
  retentionDays: number;
}): ProcessingRecord {
  if (blank(input.purpose) || containsPlaceholder(input.purpose)) {
    throw new DomainError("PRIVACY_CONTENU_PLACEHOLDER", "Finalité de traitement placeholder");
  }
  if (blank(input.country) || containsPlaceholder(input.country)) {
    throw new DomainError("PRIVACY_CONTENU_PLACEHOLDER", "Pays de traitement placeholder");
  }
  if (input.dataCategories.length === 0) {
    throw new DomainError("PRIVACY_CONTENU_PLACEHOLDER", "Catégories de données requises");
  }
  if (!(PROCESSING_BASES as readonly string[]).includes(input.legalBasis)) {
    throw new DomainError("PRIVACY_CONTENU_PLACEHOLDER", "Base juridique inconnue");
  }
  if (!Number.isInteger(input.retentionDays) || input.retentionDays < 1) {
    throw new DomainError("PRIVACY_CONTENU_PLACEHOLDER", "Durée de conservation invalide");
  }
  return {
    purpose: input.purpose,
    dataCategories: [...input.dataCategories],
    legalBasis: input.legalBasis as ProcessingBasis,
    recipients: [...input.recipients],
    country: input.country,
    retentionDays: input.retentionDays,
  };
}

/* ------------------------------------------------------------------------- *
 * 13.4 — Consentement recherche/marketing/IA, séparé du service cœur         *
 * ------------------------------------------------------------------------- */

export const CONSENT_CATEGORIES = ["research", "marketing", "future_ai"] as const;
export type ConsentCategory = (typeof CONSENT_CATEGORIES[number])[number];

export interface ConsentState {
  readonly identityId: string;
  readonly research: boolean;
  readonly marketing: boolean;
  readonly futureAi: boolean;
  readonly updatedAt: number;
}

/** État de consentement initial : **tout refusé** (consentement explicite, 13.4). */
export function initialConsent(identityId: string, now: number): ConsentState {
  if (blank(identityId)) {
    throw new DomainError("PRIVACY_IDENTIFIANT_REQUIS", "Identité requise");
  }
  return { identityId, research: false, marketing: false, futureAi: false, updatedAt: now };
}

/**
 * Accord/retrait d'une catégorie de consentement **facultative**. La catégorie
 * doit appartenir à l'ensemble connu (on n'ajoute pas une catégorie non maîtrisée).
 * Le **service cœur** n'est jamais une catégorie : son accès ne transite pas ici.
 */
export function setConsent(
  state: ConsentState,
  category: string,
  granted: boolean,
  now: number,
): ConsentState {
  if (!(CONSENT_CATEGORIES as readonly string[]).includes(category)) {
    throw new DomainError("PRIVACY_CONSENTEMENT_CATEGORIE_INCONNUE", "Catégorie de consentement inconnue");
  }
  const key = category as ConsentCategory;
  return {
    ...state,
    research: key === "research" ? granted : state.research,
    marketing: key === "marketing" ? granted : state.marketing,
    futureAi: key === "future_ai" ? granted : state.futureAi,
    updatedAt: now,
  };
}

/**
 * Le **service cœur** (participer au registre en tant que membre actif) ne
 * dépend d'**aucun** consentement facultatif : un membre actif conserve son
 * accès même en refusant recherche/marketing/IA (C16-CONSENT ; 13.4 « droit de
 * retrait sans perte d'accès aux données personnelles »).
 */
export function coreServiceAvailable(
  _state: ConsentState,
  isActiveMember: boolean,
): boolean {
  return isActiveMember;
}

/**
 * Éligibilité à la compensation de recherche (13.4) : **bornée au temps** passé
 * à la recherche, **jamais** liée aux cotisations. Retourne le nombre d'heures
 * indemnisables, plafonné ; ne touche aucun montant de tontine.
 */
export function researchCompensationHours(
  consentedToResearch: boolean,
  hoursParticipated: number,
  maxHours: number,
): number {
  if (!consentedToResearch) return 0;
  if (!Number.isInteger(hoursParticipated) || hoursParticipated < 0) return 0;
  return Math.min(hoursParticipated, maxHours);
}

/* ------------------------------------------------------------------------- *
 * 18.19 — Export personnel FILTRÉ (aucun champ privé d'autrui)               *
 * ------------------------------------------------------------------------- */

export const FIELD_VISIBILITIES = ["private", "shared", "public"] as const;
export type FieldVisibility = (typeof FIELD_VISIBILITIES[number])[number];

export interface PersonalField {
  readonly key: string;
  /** Identité propriétaire du champ (le sujet, ou un tiers). */
  readonly ownerIdentityId: string;
  readonly visibility: FieldVisibility;
  readonly value: string;
}

/**
 * Extrait l'export personnel du **sujet** : ses propres champs (quelle que soit
 * leur visibilité) plus les champs **non privés** (partagés/publics) qui le
 * concernent ; **jamais** un champ `private` d'un autre membre. Le filtrage est
 * structurel, pas un compteur décoratif (C16-EXPORT).
 */
export function extractPersonalDataExport(
  subjectIdentityId: string,
  fields: readonly PersonalField[],
): PersonalField[] {
  if (blank(subjectIdentityId)) {
    throw new DomainError("PRIVACY_IDENTIFIANT_REQUIS", "Sujet d'export requis");
  }
  return fields.filter(
    (f) => f.ownerIdentityId === subjectIdentityId || f.visibility !== "private",
  );
}

/**
 * Sonde d'observation : combien de champs privés **d'autrui** ont fuité dans un
 * export. Par construction de `extractPersonalDataExport`, toujours `0`
 * (C16-EXPORT : `third_party_private_fields = 0`).
 */
export function countThirdPartyPrivateFields(
  entries: readonly PersonalField[],
  subjectIdentityId: string,
): number {
  return entries.filter(
    (e) => e.ownerIdentityId !== subjectIdentityId && e.visibility === "private",
  ).length;
}

/* ------------------------------------------------------------------------- *
 * 18.19 — Demandes de droits, vérification proportionnée, gel motivé         *
 * ------------------------------------------------------------------------- */

export const RIGHTS_KINDS = [
  "access",
  "export",
  "erasure",
  "rectification",
  "objection",
] as const;
export type RightsKind = (typeof RIGHTS_KINDS[number])[number];

/**
 * Niveau de **vérification proportionnée** requis avant exécution : une lecture
 * simple (accès) demande moins de certitude qu'un acte irréversible (effacement)
 * ou communicant (export). Vérification **insuffisante** ⇒ la demande reste en
 * attente d'informations, **jamais** refusée d'office (18.19).
 */
export function requiredVerificationFor(kind: RightsKind): number {
  switch (kind) {
    case "access":
      return 1;
    case "erasure":
      return 3;
    default:
      return 2;
  }
}

export const RIGHTS_REQUEST_STATES = [
  "received",
  "requires_more_info",
  "ready",
  "fulfilled",
  "frozen",
] as const;
export type RightsRequestState = (typeof RIGHTS_REQUEST_STATES[number])[number];

export interface RightsRequest {
  readonly requestId: string;
  readonly subjectIdentityId: string;
  readonly kind: RightsKind;
  readonly status: RightsRequestState;
  readonly verificationLevel: number;
  readonly requiredVerification: number;
  readonly openedAt: number;
  readonly updatedAt: number;
  readonly restrictionReason: string | null;
}

/** Ouvre une demande de droit (ticket de suivi). Kind connu, identifiants requis. */
export function createRightsRequest(input: {
  requestId: string;
  subjectIdentityId: string;
  kind: string;
  now: number;
}): RightsRequest {
  if (blank(input.requestId) || blank(input.subjectIdentityId)) {
    throw new DomainError("PRIVACY_IDENTIFIANT_REQUIS", "Identifiants de demande requis");
  }
  if (!(RIGHTS_KINDS as readonly string[]).includes(input.kind)) {
    throw new DomainError("PRIVACY_CONTENU_PLACEHOLDER", "Type de droit inconnu");
  }
  const kind = input.kind as RightsKind;
  return {
    requestId: input.requestId,
    subjectIdentityId: input.subjectIdentityId,
    kind,
    status: "received",
    verificationLevel: 0,
    requiredVerification: requiredVerificationFor(kind),
    openedAt: input.now,
    updatedAt: input.now,
    restrictionReason: null,
  };
}

/**
 * Enregistre un niveau de vérification **proportionnée** atteint. Au seuil
 * requis pour le type de droit, la demande passe `ready` ; en dessous, elle
 * reste `requires_more_info` — **jamais** refusée (18.19). Une demande gelée ne
 * se réactive pas d'elle-même.
 */
export function recordVerification(
  request: RightsRequest,
  level: number,
  now: number,
): RightsRequest {
  if (request.status === "frozen" || request.status === "fulfilled") return request;
  if (!Number.isInteger(level) || level < 0) {
    throw new DomainError("PRIVACY_CONTENU_PLACEHOLDER", "Niveau de vérification invalide");
  }
  const verificationLevel = Math.max(request.verificationLevel, level);
  const ready = verificationLevel >= request.requiredVerification;
  return {
    ...request,
    verificationLevel,
    status: ready ? "ready" : "requires_more_info",
    updatedAt: now,
  };
}

/**
 * Gèle/restreint une demande pour un **motif documenté** (18.19 : « motif de
 * restriction ou gel documenté, pas de refus automatique »). Un motif vide est
 * refusé : on ne gèle jamais par omission.
 */
export function restrictRightsRequest(
  request: RightsRequest,
  reason: string,
  now: number,
): RightsRequest {
  if (blank(reason)) {
    throw new DomainError("PRIVACY_MOTIF_GEL_REQUIS", "Motif de gel requis");
  }
  return {
    ...request,
    status: "frozen",
    restrictionReason: reason,
    updatedAt: now,
  };
}

/**
 * Marque une demande comme exécutée. Refusé (`PRIVACY_VERIFICATION_INSUFFISANTE`)
 * si la vérification proportionnée n'a pas atteint le seuil du type de droit, ou
 * si la demande est gelée — un acte sur données personnelles ne se fait pas à la
 * légère.
 */
export function fulfillRightsRequest(request: RightsRequest, now: number): RightsRequest {
  if (request.status === "frozen") {
    throw new DomainError("PRIVACY_VERIFICATION_INSUFFISANTE", "Demande gelée");
  }
  if (request.verificationLevel < request.requiredVerification) {
    throw new DomainError("PRIVACY_VERIFICATION_INSUFFISANTE", "Vérification insuffisante");
  }
  return { ...request, status: "fulfilled", updatedAt: now };
}

/* ------------------------------------------------------------------------- *
 * 18.10 — Purge / tombstones / restauration (effacements + révocations)      *
 * ------------------------------------------------------------------------- */

export interface Tombstone {
  readonly identityId: string;
  readonly erasedAt: number;
}

/**
 * Applique un effacement (droit à l'effacement) : pose un **tombstone** et
 * propage l'effacement. **Idempotent** — ré-effacer une identité déjà effacée ne
 * duplique pas le tombstone. Le registre de tombstones vit **hors** du point de
 * restauration (18.10).
 */
export function eraseIdentity(
  tombstones: readonly Tombstone[],
  identityId: string,
  now: number,
): Tombstone[] {
  if (blank(identityId)) {
    throw new DomainError("PRIVACY_IDENTIFIANT_REQUIS", "Identité à effacer requise");
  }
  if (tombstones.some((t) => t.identityId === identityId)) return [...tombstones];
  return [...tombstones, { identityId, erasedAt: now }];
}

export function isErased(tombstones: readonly Tombstone[], identityId: string): boolean {
  return tombstones.some((t) => t.identityId === identityId);
}

/**
 * Un **point de restauration** est une copie des identités visibles à un instant
 * donné — potentiellement **antérieure** à un effacement. Il ne porte volontairement
 * **pas** les tombstones (registre externe), pour qu'une restauration ne puisse
 * pas, par elle-même, ressusciter une identité effacée.
 */
export interface RestorePoint {
  readonly takenAt: number;
  readonly identities: readonly string[];
}

/**
 * Restaure depuis un point **en réappliquant** les effacements (tombstones) et
 * les **révocations** postérieurs au point, **avant** réouverture (18.10). Une
 * identité effacée après la prise du point reste **invisible** après restauration
 * (C16-RESTORE : `deleted_identity_visible = false`).
 */
export function restoreFromPoint(
  point: RestorePoint,
  tombstones: readonly Tombstone[],
  revokedIdentityIds: readonly string[],
): {
  readonly visible: readonly string[];
  readonly reAppliedErasures: number;
  readonly reAppliedRevocations: readonly string[];
} {
  const erased = new Set(tombstones.map((t) => t.identityId));
  const revoked = new Set(revokedIdentityIds);
  const visible = point.identities.filter((id) => !erased.has(id));
  const reAppliedErasures = point.identities.filter((id) => erased.has(id)).length;
  const reAppliedRevocations = point.identities.filter((id) => revoked.has(id));
  return { visible, reAppliedErasures, reAppliedRevocations };
}

/** Observation C16-RESTORE : une identité effacée reste-t-elle visible après reprise ? */
export function deletedIdentityVisible(
  point: RestorePoint,
  tombstones: readonly Tombstone[],
  identityId: string,
): boolean {
  return point.identities.includes(identityId) && !isErased(tombstones, identityId);
}

/**
 * Le **pseudonymisé n'est pas l'anonyme** : un enregistrement pseudonymisé qui
 * conserve des quasi-identifiants (groupe + rôle + montant + date uniques) garde
 * un risque de **réidentification** — il ne peut pas être traité comme anonymisé
 * pour la conservation (13.3, 18.10).
 */
export function assessReidentification(entry: {
  readonly pseudonym: string;
  readonly quasiIdentifiers: readonly string[];
}): boolean {
  const present = entry.quasiIdentifiers.filter((k) => !blank(k)).length;
  return present > 0;
}
