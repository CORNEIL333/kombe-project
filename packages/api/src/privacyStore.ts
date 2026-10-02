/**
 * Store FICTIF en mémoire pour la recette C16 — données personnelles : notices
 * légales, registre des traitements, consentement **séparable**, demandes de
 * **droits** à vérification **proportionnée**, **export filtré**, purge par
 * **tombstones** et **restauration**. Il délègue TOUTE décision aux fonctions
 * pures de `@kombe/domain` (`privacy.ts`) : une notice à placeholder est refusée
 * à la publication, un refus de consentement recherche ne coupe **jamais** le
 * service cœur (résolu serveur depuis l'appartenance active), une demande de
 * droit non assez vérifiée reste en attente (jamais refusée d'office), un export
 * personnel **exclut structurellement** tout champ privé d'autrui
 * (C16-EXPORT : `third_party_private_fields = 0`), et une restauration depuis un
 * point antérieur **réapplique effacements ET révocations** avant réouverture
 * (C16-RESTORE : `deleted_identity_visible = false`).
 *
 * Comme les autres stores, il ne prétend NI persister, NI authentifier une
 * session réelle, NI purger un vrai cache/index/backup : la durabilité des
 * tombstones, la propagation aux index/caches/fichiers, la RLS et les CHECK de
 * cycle de vie sont le contrat SQL de la migration `0016_privacy_law` — preuve
 * base réelle **BLOCKED** sans PostgreSQL (ADR-0006 / ADR-0007). L'identité du
 * sujet et son **appartenance active** (service cœur) sont résolues **côté
 * serveur** (jamais déclarées par le client, ADR-0005) ; l'horodatage est une
 * date SERVEUR injectée. Le store ne fait aucune promesse juridique : cf.
 * `PRIVACY_PRUDENT_NOTICE`.
 */
import {
  DomainError,
  PRIVACY_PRUDENT_NOTICE,
  buildLegalNotice,
  buildProcessingRecord,
  coreServiceAvailable,
  countThirdPartyPrivateFields,
  createRightsRequest,
  deletedIdentityVisible,
  eraseIdentity,
  extractPersonalDataExport,
  fulfillRightsRequest,
  initialConsent,
  isErased,
  recordVerification,
  restrictRightsRequest,
  restoreFromPoint,
  setConsent,
  type ConsentState,
  type LegalNotice,
  type PersonalField,
  type ProcessingRecord,
  type RestorePoint,
  type RightsRequest,
  type Tombstone,
} from "@kombe/domain";

export interface PrivacyContext {
  readonly actorIdentityId: string;
  readonly actorRole: string;
  /** Horloge SERVEUR en secondes d'époque (injectée ; jamais fournie par le client). */
  readonly serverNow: number;
}

export interface NoticeInput {
  readonly noticeId: string;
  readonly kind: string;
  readonly version: string;
  readonly lastUpdatedAt: string;
  readonly body: string;
}

export interface RightsRequestView {
  readonly requestId: string;
  readonly subjectIdentityId: string;
  readonly kind: string;
  readonly status: string;
  readonly verificationLevel: number;
  readonly requiredVerification: number;
  readonly restrictionReason: string | null;
  readonly version: number;
}

export interface ConsentView {
  readonly identityId: string;
  readonly research: boolean;
  readonly marketing: boolean;
  readonly futureAi: boolean;
  readonly coreServiceAvailable: boolean;
}

export interface PersonalExportReceipt {
  readonly subjectIdentityId: string;
  readonly entries: readonly PersonalField[];
  readonly thirdPartyPrivateFields: number;
  readonly prudentNotice: string;
}

export interface RestoreReceipt {
  readonly visible: readonly string[];
  readonly reAppliedErasures: number;
  readonly reAppliedRevocations: readonly string[];
  readonly deletedIdentityVisible: boolean;
}

interface HeldRequest {
  request: RightsRequest;
  version: number;
}

export class FictitiousPrivacyStore {
  private readonly notices = new Map<string, LegalNotice>();
  private readonly processingRecords: ProcessingRecord[] = [];
  private readonly consents = new Map<string, ConsentState>();
  private readonly requests = new Map<string, HeldRequest>();
  /** Réservoir fictif des champs personnels de TOUS les sujets (marqués par owner). */
  private readonly personalFields: PersonalField[] = [];
  private readonly tombstones: Tombstone[] = [];
  private readonly revoked = new Set<string>();
  private readonly activeMembers = new Set<string>();
  private readonly restorePoints: RestorePoint[] = [];

  /* --- amorçage de recette --- */

  seedActiveMember(identityId: string): void {
    this.activeMembers.add(identityId);
  }

  removeActiveMember(identityId: string): void {
    this.activeMembers.delete(identityId);
  }

  /** Marque une révocation d'accès distincte d'un effacement (pour C16-RESTORE). */
  revokeAccess(identityId: string): void {
    this.revoked.add(identityId);
  }

  seedPersonalField(field: PersonalField): void {
    this.personalFields.push(field);
  }

  /* --- gardes --- */

  private gateAuth(ctx: PrivacyContext): void {
    if (!ctx.actorIdentityId) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    }
  }

  /** Appartenance **active** résolue SERVEUR (le client ne déclare rien). */
  private isActiveMember(identityId: string): boolean {
    return this.activeMembers.has(identityId) && !isErased(this.tombstones, identityId);
  }

  private requireRequest(requestId: string): HeldRequest {
    const held = this.requests.get(requestId);
    if (!held) {
      // Non-divulgation : une demande inconnue répond comme une réservation absente.
      throw new DomainError("RESERVATION_INCOHERENTE", "Demande de droit introuvable");
    }
    return held;
  }

  /** Le sujet d'une demande est résolu à l'ouverture ; un acteur tiers ne peut
   *  pas exercer le droit d'un autre (anti-IDOR → 404, non divulgation). */
  private requireOwnRequest(ctx: PrivacyContext, requestId: string): HeldRequest {
    const held = this.requireRequest(requestId);
    if (held.request.subjectIdentityId !== ctx.actorIdentityId) {
      throw new DomainError("RESERVATION_INCOHERENTE", "Demande de droit introuvable");
    }
    return held;
  }

  private static toView(held: HeldRequest): RightsRequestView {
    const r = held.request;
    return {
      requestId: r.requestId,
      subjectIdentityId: r.subjectIdentityId,
      kind: r.kind,
      status: r.status,
      verificationLevel: r.verificationLevel,
      requiredVerification: r.requiredVerification,
      restrictionReason: r.restrictionReason,
      version: held.version,
    };
  }

  private consentOf(identityId: string, now: number): ConsentState {
    let c = this.consents.get(identityId);
    if (!c) {
      c = initialConsent(identityId, now);
      this.consents.set(identityId, c);
    }
    return c;
  }

  private consentView(state: ConsentState): ConsentView {
    return {
      identityId: state.identityId,
      research: state.research,
      marketing: state.marketing,
      futureAi: state.futureAi,
      coreServiceAvailable: coreServiceAvailable(state, this.isActiveMember(state.identityId)),
    };
  }

  /* --- 13.1/13.2 notices --- */

  publishNotice(ctx: PrivacyContext, input: NoticeInput): LegalNotice {
    this.gateAuth(ctx);
    const notice = buildLegalNotice(input);
    this.notices.set(notice.noticeId, notice);
    return notice;
  }

  getNotice(noticeId: string): LegalNotice {
    const n = this.notices.get(noticeId);
    if (!n) throw new DomainError("RESERVATION_INCOHERENTE", "Notice introuvable");
    return n;
  }

  /* --- 13.3 registre des traitements --- */

  registerProcessing(ctx: PrivacyContext, input: {
    purpose: string;
    dataCategories: readonly string[];
    legalBasis: string;
    recipients: readonly string[];
    country: string;
    retentionDays: number;
  }): ProcessingRecord {
    this.gateAuth(ctx);
    const record = buildProcessingRecord(input);
    this.processingRecords.push(record);
    return record;
  }

  processingRegistry(): readonly ProcessingRecord[] {
    return this.processingRecords;
  }

  /* --- 13.4 consentement séparable --- */

  setConsentFor(ctx: PrivacyContext, category: string, granted: boolean): ConsentView {
    this.gateAuth(ctx);
    const current = this.consentOf(ctx.actorIdentityId, ctx.serverNow);
    const next = setConsent(current, category, granted, ctx.serverNow);
    this.consents.set(next.identityId, next);
    return this.consentView(next);
  }

  getConsent(ctx: PrivacyContext): ConsentView {
    this.gateAuth(ctx);
    return this.consentView(this.consentOf(ctx.actorIdentityId, ctx.serverNow));
  }

  /* --- 18.19 demandes de droits --- */

  openRequest(ctx: PrivacyContext, requestId: string, kind: string): RightsRequestView {
    this.gateAuth(ctx);
    if (this.requests.has(requestId)) {
      throw new DomainError("EVENT_CHAIN_BREAK", "Demande déjà enregistrée");
    }
    const request = createRightsRequest({
      requestId,
      subjectIdentityId: ctx.actorIdentityId,
      kind,
      now: ctx.serverNow,
    });
    this.requests.set(requestId, { request, version: 1 });
    return FictitiousPrivacyStore.toView(this.requireRequest(requestId));
  }

  verifyRequest(ctx: PrivacyContext, requestId: string, level: number): RightsRequestView {
    const held = this.requireOwnRequest(ctx, requestId);
    held.request = recordVerification(held.request, level, ctx.serverNow);
    held.version += 1;
    return FictitiousPrivacyStore.toView(held);
  }

  restrictRequest(ctx: PrivacyContext, requestId: string, reason: string): RightsRequestView {
    const held = this.requireOwnRequest(ctx, requestId);
    held.request = restrictRightsRequest(held.request, reason, ctx.serverNow);
    held.version += 1;
    return FictitiousPrivacyStore.toView(held);
  }

  /**
   * Exécute un **export personnel filtré** (C16-EXPORT) : la demande doit
   * appartenir au caller (anti-IDOR) et atteindre le seuil de vérification
   * proportionnée (sinon `PRIVACY_VERIFICATION_INSUFFISANTE`, 403). L'extraction
   * **exclut structurellement** tout champ privé d'un autre membre ; le reçu
   * porte le compte `thirdPartyPrivateFields`, qui doit être `0`.
   */
  executeExport(ctx: PrivacyContext, requestId: string): PersonalExportReceipt {
    const held = this.requireOwnRequest(ctx, requestId);
    const done = fulfillRightsRequest(held.request, ctx.serverNow);
    held.request = done;
    held.version += 1;
    const entries = extractPersonalDataExport(done.subjectIdentityId, this.personalFields);
    return {
      subjectIdentityId: done.subjectIdentityId,
      entries,
      thirdPartyPrivateFields: countThirdPartyPrivateFields(entries, done.subjectIdentityId),
      prudentNotice: PRIVACY_PRUDENT_NOTICE,
    };
  }

  /**
   * Exécute un **effacement** (droit à l'effacement, 18.10) après vérification
   * proportionnée : pose un **tombstone** et retire l'identité du service cœur.
   * Idempotent (un second effacement ne duplique pas). Le registre de tombstones
   * vit hors de tout point de restauration.
   */
  executeErasure(ctx: PrivacyContext, requestId: string): RightsRequestView {
    const held = this.requireOwnRequest(ctx, requestId);
    held.request = fulfillRightsRequest(held.request, ctx.serverNow);
    held.version += 1;
    const subject = held.request.subjectIdentityId;
    const next = eraseIdentity(this.tombstones, subject, ctx.serverNow);
    this.tombstones.length = 0;
    this.tombstones.push(...next);
    this.activeMembers.delete(subject);
    return FictitiousPrivacyStore.toView(held);
  }

  /* --- 18.10 restauration (réapplique effacements ET révocations) --- */

  snapshotRestorePoint(ctx: PrivacyContext): RestorePoint {
    this.gateAuth(ctx);
    const identities = [...this.activeMembers].filter((id) => !isErased(this.tombstones, id));
    const point: RestorePoint = { takenAt: ctx.serverNow, identities };
    this.restorePoints.push(point);
    return point;
  }

  /**
   * Restaure depuis un point (potentiellement antérieur à un effacement) en
   * **réappliquant** les effacements (tombstones) et les révocations postérieurs
   * avant réouverture (C16-RESTORE). Une identité effacée après le point reste
   * **invisible** : `deletedIdentityVisible = false`.
   */
  restoreLatest(ctx: PrivacyContext, probeIdentityId: string): RestoreReceipt {
    this.gateAuth(ctx);
    if (this.restorePoints.length === 0) {
      throw new DomainError("RESERVATION_INCOHERENTE", "Aucun point de restauration");
    }
    const point = this.restorePoints[this.restorePoints.length - 1]!;
    const out = restoreFromPoint(point, this.tombstones, [...this.revoked]);
    return {
      visible: out.visible,
      reAppliedErasures: out.reAppliedErasures,
      reAppliedRevocations: out.reAppliedRevocations,
      deletedIdentityVisible: deletedIdentityVisible(point, this.tombstones, probeIdentityId),
    };
  }

  /** Sonde d'observation : une identité est-elle effacée (tombstone) ? */
  isErasedProbe(identityId: string): boolean {
    return isErased(this.tombstones, identityId);
  }
}
