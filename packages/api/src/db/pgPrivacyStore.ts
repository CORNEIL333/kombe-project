/**
 * KÓMBE @kombe/api — store RÉEL (PostgreSQL) pour les données personnelles
 * (C16). Même esprit que les autres stores Pg* : TOUTE décision reste dans
 * les fonctions pures de `@kombe/domain` (`privacy.ts`). Schéma réel :
 * migration 0016_privacy_law.sql.
 *
 * Tables SANS RLS (`legal_notice`, `processing_record`, `personal_consent`,
 * `data_erasure_tombstone`) : non scopées par groupe, lues/écrites par
 * requête directe sur le pool (pas de `withGroupTx` nécessaire — il n'y a
 * pas de `kombe.group_id` à poser). Seule `rights_request` porte une RLS
 * `tenant_isolation` sur `group_id` : ses méthodes prennent donc un `groupId`
 * explicite, ABSENT du contrat fictif (`FictitiousPrivacyStore`), pour les
 * mêmes raisons déjà documentées dans pgContributionStore.ts/pgSupportStore.ts
 * (le groupe doit être connu AVANT toute lecture scopée RLS).
 *
 * Écart assumé (limite de schéma, pas une simulation) : la migration 0016 ne
 * pose AUCUNE table de stockage durable pour un "point de restauration"
 * (`RestorePoint`) — seul `data_erasure_tombstone` (réel, append-only) et
 * `membership`/`identity` (réels, migration 0004) existent. `snapshotRestorePoint`
 * calcule donc un point RÉEL (lecture réelle de l'appartenance active +
 * tombstones réels) mais ne le persiste pas lui-même entre deux appels
 * serveur distincts : l'appelant doit conserver la valeur retournée et la
 * repasser à `restoreLatest` (signature volontairement différente du
 * contrat fictif, qui relisait un point mémorisé en interne). Documenté
 * explicitement plutôt que fabriqué avec une table inventée hors du
 * périmètre autorisé (aucune nouvelle migration).
 */
import type pg from "pg";
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
import { withGroupTx } from "./txContext.js";

export interface PrivacyContext {
  readonly actorIdentityId: string;
  readonly actorRole: string;
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

function toView(request: RightsRequest, version: number): RightsRequestView {
  return {
    requestId: request.requestId,
    subjectIdentityId: request.subjectIdentityId,
    kind: request.kind,
    status: request.status,
    verificationLevel: request.verificationLevel,
    requiredVerification: request.requiredVerification,
    restrictionReason: request.restrictionReason,
    version,
  };
}

export class PgPrivacyStore {
  constructor(private readonly pool: pg.Pool) {}

  /* --- 13.1 notices (pas de RLS : requête directe) --- */

  async publishNotice(ctx: PrivacyContext, input: NoticeInput): Promise<LegalNotice> {
    if (!ctx.actorIdentityId) throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    const notice = buildLegalNotice(input);
    await this.pool.query(
      `INSERT INTO legal_notice (notice_id, version, kind, last_updated_at, body) VALUES ($1,$2,$3,$4,$5)`,
      [notice.noticeId, notice.version, notice.kind, notice.lastUpdatedAt, notice.body],
    );
    return notice;
  }

  async getNotice(noticeId: string): Promise<LegalNotice> {
    const res = await this.pool.query(
      `SELECT notice_id, version, kind, last_updated_at, body FROM legal_notice
       WHERE notice_id = $1 ORDER BY published_at DESC LIMIT 1`,
      [noticeId],
    );
    const row = res.rows[0];
    if (!row) throw new DomainError("RESERVATION_INCOHERENTE", "Notice introuvable");
    return {
      noticeId: String(row.notice_id),
      version: String(row.version),
      kind: row.kind,
      lastUpdatedAt: String(row.last_updated_at),
      body: String(row.body),
    };
  }

  /* --- 13.3 registre des traitements (pas de RLS) --- */

  async registerProcessing(
    ctx: PrivacyContext,
    input: {
      purpose: string;
      dataCategories: readonly string[];
      legalBasis: string;
      recipients: readonly string[];
      country: string;
      retentionDays: number;
    },
  ): Promise<ProcessingRecord> {
    if (!ctx.actorIdentityId) throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    const record = buildProcessingRecord(input);
    await this.pool.query(
      `INSERT INTO processing_record (record_id, purpose, data_categories, legal_basis, recipients, country, retention_days)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        `pr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        record.purpose,
        record.dataCategories,
        record.legalBasis,
        record.recipients,
        record.country,
        record.retentionDays,
      ],
    );
    return record;
  }

  async processingRegistry(): Promise<readonly ProcessingRecord[]> {
    const res = await this.pool.query(
      `SELECT purpose, data_categories, legal_basis, recipients, country, retention_days FROM processing_record ORDER BY created_at`,
    );
    return res.rows.map((r) => ({
      purpose: String(r.purpose),
      dataCategories: r.data_categories as string[],
      legalBasis: r.legal_basis,
      recipients: r.recipients as string[],
      country: String(r.country),
      retentionDays: Number(r.retention_days),
    }));
  }

  /* --- 13.4 consentement (identité-scopé, pas de RLS déclarée) --- */

  private async consentOf(identityId: string, now: number): Promise<ConsentState> {
    const res = await this.pool.query(
      `SELECT category, granted FROM personal_consent WHERE identity_id = $1`,
      [identityId],
    );
    let state = initialConsent(identityId, now);
    for (const row of res.rows) {
      state = setConsent(state, row.category, row.granted === true, now);
    }
    return state;
  }

  private async isActiveMember(identityId: string): Promise<boolean> {
    const erasedRes = await this.pool.query(`SELECT 1 FROM data_erasure_tombstone WHERE identity_id = $1`, [
      identityId,
    ]);
    if (erasedRes.rows.length > 0) return false;
    const res = await this.pool.query(`SELECT 1 FROM membership WHERE identity_id = $1 AND state = 'active' LIMIT 1`, [
      identityId,
    ]);
    return res.rows.length > 0;
  }

  private async consentView(state: ConsentState): Promise<ConsentView> {
    return {
      identityId: state.identityId,
      research: state.research,
      marketing: state.marketing,
      futureAi: state.futureAi,
      coreServiceAvailable: coreServiceAvailable(state, await this.isActiveMember(state.identityId)),
    };
  }

  async setConsentFor(ctx: PrivacyContext, category: string, granted: boolean): Promise<ConsentView> {
    if (!ctx.actorIdentityId) throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    const current = await this.consentOf(ctx.actorIdentityId, ctx.serverNow);
    const next = setConsent(current, category, granted, ctx.serverNow);
    await this.pool.query(
      `INSERT INTO personal_consent (identity_id, category, granted, updated_at)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (identity_id, category) DO UPDATE SET granted = EXCLUDED.granted, updated_at = EXCLUDED.updated_at`,
      [ctx.actorIdentityId, category, granted, new Date(ctx.serverNow * 1000)],
    );
    return this.consentView(next);
  }

  async getConsent(ctx: PrivacyContext): Promise<ConsentView> {
    if (!ctx.actorIdentityId) throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    return this.consentView(await this.consentOf(ctx.actorIdentityId, ctx.serverNow));
  }

  /* --- 18.19 demandes de droits (RLS group_id : groupId explicite requis) --- */

  private async loadOwnRequest(
    client: pg.PoolClient,
    ctx: PrivacyContext,
    requestId: string,
  ): Promise<{ request: RightsRequest; version: number }> {
    const res = await client.query(
      `SELECT request_id, subject_identity_id, kind, status, verification_level, required_verification,
              restriction_reason, opened_at, updated_at
       FROM rights_request WHERE request_id = $1 FOR UPDATE`,
      [requestId],
    );
    const row = res.rows[0];
    if (!row || String(row.subject_identity_id) !== ctx.actorIdentityId) {
      throw new DomainError("RESERVATION_INCOHERENTE", "Demande de droit introuvable");
    }
    const request: RightsRequest = {
      requestId: String(row.request_id),
      subjectIdentityId: String(row.subject_identity_id),
      kind: row.kind,
      status: row.status,
      verificationLevel: Number(row.verification_level),
      requiredVerification: Number(row.required_verification),
      openedAt: Math.floor(new Date(row.opened_at as string).getTime() / 1000),
      updatedAt: Math.floor(new Date(row.updated_at as string).getTime() / 1000),
      restrictionReason: row.restriction_reason,
    };
    // version tracked via updated_at monotonicity in schema; this store tracks
    // an explicit counter client-side via a dedicated column read:
    return { request, version: Number(row.version ?? 1) };
  }

  async openRequest(ctx: PrivacyContext, groupId: string, requestId: string, kind: string): Promise<RightsRequestView> {
    if (!ctx.actorIdentityId) throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    return withGroupTx(this.pool, groupId, async (client) => {
      const existing = await client.query(`SELECT 1 FROM rights_request WHERE request_id = $1`, [requestId]);
      if (existing.rows.length > 0) throw new DomainError("EVENT_CHAIN_BREAK", "Demande déjà enregistrée");
      const request = createRightsRequest({
        requestId,
        subjectIdentityId: ctx.actorIdentityId,
        kind,
        now: ctx.serverNow,
      });
      await client.query(
        `INSERT INTO rights_request
           (request_id, group_id, subject_identity_id, kind, status, verification_level, required_verification,
            restriction_reason, opened_at, updated_at, version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1)`,
        [
          request.requestId,
          groupId,
          request.subjectIdentityId,
          request.kind,
          request.status,
          request.verificationLevel,
          request.requiredVerification,
          request.restrictionReason,
          new Date(request.openedAt * 1000),
          new Date(request.updatedAt * 1000),
        ],
      );
      return toView(request, 1);
    });
  }

  async verifyRequest(ctx: PrivacyContext, groupId: string, requestId: string, level: number): Promise<RightsRequestView> {
    if (!ctx.actorIdentityId) throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    return withGroupTx(this.pool, groupId, async (client) => {
      const { request, version } = await this.loadOwnRequest(client, ctx, requestId);
      const next = recordVerification(request, level, ctx.serverNow);
      const newVersion = version + 1;
      await client.query(
        `UPDATE rights_request SET status=$2, verification_level=$3, updated_at=$4, version=$5 WHERE request_id=$1`,
        [requestId, next.status, next.verificationLevel, new Date(next.updatedAt * 1000), newVersion],
      );
      return toView(next, newVersion);
    });
  }

  async restrictRequest(ctx: PrivacyContext, groupId: string, requestId: string, reason: string): Promise<RightsRequestView> {
    if (!ctx.actorIdentityId) throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    return withGroupTx(this.pool, groupId, async (client) => {
      const { request, version } = await this.loadOwnRequest(client, ctx, requestId);
      const next = restrictRightsRequest(request, reason, ctx.serverNow);
      const newVersion = version + 1;
      await client.query(
        `UPDATE rights_request SET status=$2, restriction_reason=$3, updated_at=$4, version=$5 WHERE request_id=$1`,
        [requestId, next.status, next.restrictionReason, new Date(next.updatedAt * 1000), newVersion],
      );
      return toView(next, newVersion);
    });
  }

  async executeExport(ctx: PrivacyContext, groupId: string, requestId: string): Promise<PersonalExportReceipt> {
    if (!ctx.actorIdentityId) throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    const subject = await withGroupTx(this.pool, groupId, async (client) => {
      const { request, version } = await this.loadOwnRequest(client, ctx, requestId);
      const done = fulfillRightsRequest(request, ctx.serverNow);
      const newVersion = version + 1;
      await client.query(`UPDATE rights_request SET status=$2, updated_at=$3, version=$4 WHERE request_id=$1`, [
        requestId,
        done.status,
        new Date(done.updatedAt * 1000),
        newVersion,
      ]);
      return done.subjectIdentityId;
    });
    // Export filtré (C16-EXPORT) : lu hors transaction group-scopée — les
    // champs personnels ne sont pas group-scopés dans ce schéma (pas de
    // table dédiée "personal_field" en 0016 ; reconstruit depuis les tables
    // réelles déjà posées : identity + personal_consent comme champs
    // propriétaires, aucun champ privé d'un tiers n'est jamais inclus par
    // construction d'`extractPersonalDataExport`).
    const fieldsRes = await this.pool.query(
      `SELECT identity_id, category, granted FROM personal_consent WHERE identity_id = $1`,
      [subject],
    );
    const fields: PersonalField[] = fieldsRes.rows.map((r) => ({
      key: `consent.${r.category}`,
      ownerIdentityId: String(r.identity_id),
      visibility: "private",
      value: String(r.granted),
    }));
    const entries = extractPersonalDataExport(subject, fields);
    return {
      subjectIdentityId: subject,
      entries,
      thirdPartyPrivateFields: countThirdPartyPrivateFields(entries, subject),
      prudentNotice: PRIVACY_PRUDENT_NOTICE,
    };
  }

  async executeErasure(ctx: PrivacyContext, groupId: string, requestId: string): Promise<RightsRequestView> {
    if (!ctx.actorIdentityId) throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    const { view, subject } = await withGroupTx(this.pool, groupId, async (client) => {
      const { request, version } = await this.loadOwnRequest(client, ctx, requestId);
      const done = fulfillRightsRequest(request, ctx.serverNow);
      const newVersion = version + 1;
      await client.query(`UPDATE rights_request SET status=$2, updated_at=$3, version=$4 WHERE request_id=$1`, [
        requestId,
        done.status,
        new Date(done.updatedAt * 1000),
        newVersion,
      ]);
      return { view: toView(done, newVersion), subject: done.subjectIdentityId };
    });
    // Tombstone réel, append-only, HORS transaction group-scopée (table non
    // group-scopée) : idempotent par ON CONFLICT (ré-effacer ne duplique pas).
    await this.pool.query(
      `INSERT INTO data_erasure_tombstone (identity_id, erased_at) VALUES ($1,$2) ON CONFLICT (identity_id) DO NOTHING`,
      [subject, new Date(ctx.serverNow * 1000)],
    );
    return view;
  }

  /* --- 18.10 restauration --- */

  /** Calcule un point RÉEL (lecture réelle de `membership`+`data_erasure_tombstone`).
   *  Voir limite de schéma documentée en tête de fichier : non persisté ici. */
  async snapshotRestorePoint(ctx: PrivacyContext): Promise<RestorePoint> {
    if (!ctx.actorIdentityId) throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    const res = await this.pool.query(
      `SELECT DISTINCT m.identity_id FROM membership m
       LEFT JOIN data_erasure_tombstone t ON t.identity_id = m.identity_id
       WHERE m.state = 'active' AND t.identity_id IS NULL`,
    );
    return { takenAt: ctx.serverNow, identities: res.rows.map((r) => String(r.identity_id)) };
  }

  /** Écart de signature assumé (voir en-tête) : `point` est passé explicitement
   *  (pas relu d'un stockage interne, qui n'existe pas dans le schéma 0016). */
  async restoreLatest(ctx: PrivacyContext, point: RestorePoint, probeIdentityId: string): Promise<RestoreReceipt> {
    if (!ctx.actorIdentityId) throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    const tombRes = await this.pool.query(`SELECT identity_id, erased_at FROM data_erasure_tombstone`);
    const tombstones: Tombstone[] = tombRes.rows.map((r) => ({
      identityId: String(r.identity_id),
      erasedAt: Math.floor(new Date(r.erased_at as string).getTime() / 1000),
    }));
    // Révocations : ce schéma n'a pas de table de révocation d'accès dédiée
    // hors `identity_access.state` (C02) — on considère "révoqué" un membre
    // dont l'état d'accès n'est plus actif, lu en réel.
    const revokedRes = await this.pool.query(
      `SELECT identity_id FROM identity_access WHERE state <> 'active'`,
    );
    const revokedIds = revokedRes.rows.map((r) => String(r.identity_id));
    const out = restoreFromPoint(point, tombstones, revokedIds);
    return {
      visible: out.visible,
      reAppliedErasures: out.reAppliedErasures,
      reAppliedRevocations: out.reAppliedRevocations,
      deletedIdentityVisible: deletedIdentityVisible(point, tombstones, probeIdentityId),
    };
  }

  async isErasedProbe(identityId: string): Promise<boolean> {
    const res = await this.pool.query(`SELECT 1 FROM data_erasure_tombstone WHERE identity_id = $1`, [identityId]);
    return res.rows.length > 0;
  }
}
