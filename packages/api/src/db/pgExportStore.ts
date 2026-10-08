/**
 * KÓMBE @kombe/api — store RÉEL (PostgreSQL) pour les exports du relevé
 * (C12, Piste A4). Même esprit que `pgContributionStore.ts` : TOUTE décision
 * (empreinte, mention prudente, droit de téléchargement) reste dans les
 * fonctions pures de `@kombe/domain` (`export.ts`) ; ce fichier lit l'état
 * RÉEL du groupe (membership + journal réellement écrits par les autres
 * stores Pg) et persiste le manifeste dans `export_manifest`
 * (migration `0015_export_manifest.sql` : append-only par trigger,
 * empreintes CHECK hexadécimales, RLS tenant_isolation).
 *
 * Limite assumée (non cachée) : le journal réel (colonnes dédiées de
 * `0007_event_journal.sql`) ne porte pas de champ `detail` texte libre par
 * événement — `StatementEventInput.detail` est donc dérivé du `event_type`
 * (ex. "contribution.declared" → "Cotisation déclarée"), jamais inventé au
 * sens d'un contenu métier non présent en base.
 */
import { randomUUID } from "node:crypto";
import type pg from "pg";
import {
  DomainError,
  buildExportEventPayload,
  buildExportManifest,
  captureStatementSnapshot,
  isDownloadAllowed,
  renderStatementCsv,
  renderStatementPdf,
  verifyExport,
  type ExportGrant,
  type StatementEventInput,
  type VerificationResult,
} from "@kombe/domain";
import { withGroupTx } from "./txContext.js";

export interface ExportContext {
  readonly actorIdentityId: string;
  readonly actorRole: string;
  readonly serverDate: string;
}

export interface ExportManifestView {
  readonly manifestId: string;
  readonly groupId: string;
  readonly cutoffSequence: number;
  readonly generatorVersion: string;
  readonly capturedAt: string;
  readonly pdfSha256: string;
  readonly csvSha256: string;
  readonly prudentNotice: string;
  readonly downloadPath: string;
}

export interface ExportDownload {
  readonly contentType: string;
  readonly fileName: string;
  readonly bytes: Uint8Array;
  readonly manifest: ExportManifestView;
}

const EVENT_LABELS: Record<string, string> = {
  "contribution.declared": "Cotisation déclarée",
};

function labelFor(eventType: string): string {
  return EVENT_LABELS[eventType] ?? eventType;
}

function gateAuth(ctx: ExportContext): void {
  if (!ctx.actorIdentityId) {
    throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
  }
}

function toView(row: {
  manifest_id: string;
  group_id: string;
  cutoff_sequence: string | number;
  generator_version: string;
  captured_at: Date;
  pdf_sha256: string;
  csv_sha256: string;
  prudent_notice: string;
}): ExportManifestView {
  return {
    manifestId: row.manifest_id,
    groupId: row.group_id,
    cutoffSequence: Number(row.cutoff_sequence),
    generatorVersion: row.generator_version,
    capturedAt: row.captured_at.toISOString(),
    pdfSha256: row.pdf_sha256,
    csvSha256: row.csv_sha256,
    prudentNotice: row.prudent_notice,
    downloadPath: `/v1/exports/${row.manifest_id}/download`,
  };
}

export class PgExportStore {
  constructor(private readonly pool: pg.Pool) {}

  /** Génère un relevé exporté au `cutoff_sequence` courant (ou une coupure
   *  antérieure demandée). Le demandeur doit être membre ACTIF du groupe ;
   *  sinon 404 non-divulguant — jamais une distinction observable. */
  async create(ctx: ExportContext, groupId: string, cutoff?: number): Promise<ExportManifestView> {
    gateAuth(ctx);
    return withGroupTx(this.pool, groupId, async (client) => {
      const memberRes = await client.query(
        `SELECT 1 FROM membership WHERE group_id = $1 AND identity_id = $2 AND state = 'active'`,
        [groupId, ctx.actorIdentityId],
      );
      if (memberRes.rows.length === 0) {
        throw new DomainError("RESERVATION_INCOHERENTE", "Groupe ou accès introuvable");
      }

      const eventsRes = await client.query(
        `SELECT seq, event_type, actor_identity_id, payload
         FROM journal WHERE group_id = $1 ORDER BY seq ASC`,
        [groupId],
      );
      const events: StatementEventInput[] = eventsRes.rows.map((row) => {
        const stored = row.payload as Record<string, unknown>;
        const inner = (stored["payload"] ?? stored) as Record<string, unknown>;
        const body = (inner["body"] ?? {}) as Record<string, unknown>;
        const amountRaw = body["amount"];
        const amountXaf =
          typeof amountRaw === "number" || typeof amountRaw === "string" ? BigInt(amountRaw as number | string) : null;
        return {
          seq: Number(row.seq),
          type: String(row.event_type),
          actor: String(row.actor_identity_id ?? ""),
          detail: labelFor(String(row.event_type)),
          amountXaf,
        };
      });

      const maxSeq = events.reduce((m, e) => Math.max(m, e.seq), 0);
      const cutoffSequence = cutoff ?? maxSeq;
      if (!Number.isInteger(cutoffSequence) || cutoffSequence < 0 || cutoffSequence > maxSeq) {
        throw new DomainError("EXPORT_CUTOPE_INVALID", "Séquence de coupure hors de l'état courant");
      }

      const snapshot = captureStatementSnapshot({ groupId, cutoffSequence, capturedAt: ctx.serverDate, events });
      const pdfBytes = renderStatementPdf(snapshot);
      const csvBody = renderStatementCsv(snapshot);
      const manifestId = `exp-${groupId}-${cutoffSequence}-${randomUUID().slice(0, 8)}`;
      const manifest = buildExportManifest({ manifestId, snapshot, pdfBytes, csvBody });

      await client.query(
        `INSERT INTO export_manifest
           (manifest_id, group_id, requester_identity_id, cutoff_sequence, generator_version,
            captured_at, pdf_sha256, csv_sha256, prudent_notice)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          manifest.manifestId,
          manifest.groupId,
          ctx.actorIdentityId,
          manifest.cutoffSequence,
          manifest.generatorVersion,
          manifest.capturedAt,
          manifest.pdfSha256,
          manifest.csvSha256,
          manifest.prudentNotice,
        ],
      );

      // L'événement d'export lui-même est scellé dans le journal (18.8) par
      // le même mécanisme que les autres écrivains réels (hors scope ici :
      // nécessiterait lockGroupForJournalWrite + sealEventV1 ; conservé
      // comme limite assumée de cet incrément, documentée dans la preuve).
      void buildExportEventPayload(manifest);

      const row = await client.query(
        `SELECT manifest_id, group_id, cutoff_sequence, generator_version, captured_at, pdf_sha256, csv_sha256, prudent_notice
         FROM export_manifest WHERE manifest_id = $1`,
        [manifestId],
      );
      return toView(row.rows[0]);
    });
  }

  /** Vue du manifeste, SCOPÉE au groupe (le groupId est connu de la route
   *  réelle — contrairement au store fictif, la RLS exige ce scope AVANT la
   *  lecture, jamais un manifestId seul). */
  async viewScoped(ctx: ExportContext, groupId: string, manifestId: string): Promise<ExportManifestView> {
    gateAuth(ctx);
    return withGroupTx(this.pool, groupId, async (client) => {
      const memberRes = await client.query(
        `SELECT 1 FROM membership WHERE group_id = $1 AND identity_id = $2 AND state = 'active'`,
        [groupId, ctx.actorIdentityId],
      );
      const manifestRes = await client.query(
        `SELECT manifest_id, group_id, cutoff_sequence, generator_version, captured_at, pdf_sha256, csv_sha256, prudent_notice
         FROM export_manifest WHERE manifest_id = $1 AND group_id = $2`,
        [manifestId, groupId],
      );
      if (memberRes.rows.length === 0 || manifestRes.rows.length === 0) {
        // Non-divulgation : membre sortant ou manifeste absent répondent pareil.
        throw new DomainError("RESERVATION_INCOHERENTE", "Export introuvable");
      }
      return toView(manifestRes.rows[0]);
    });
  }

  async downloadScoped(ctx: ExportContext, groupId: string, manifestId: string): Promise<ExportDownload> {
    const manifest = await this.viewScoped(ctx, groupId, manifestId);
    const regenerated = await this.regenerateBytes(groupId, manifest);
    return { contentType: "application/pdf", fileName: `${manifestId}.pdf`, bytes: regenerated.pdfBytes, manifest };
  }

  async csvScoped(ctx: ExportContext, groupId: string, manifestId: string): Promise<{ contentType: string; fileName: string; body: string }> {
    const manifest = await this.viewScoped(ctx, groupId, manifestId);
    const regenerated = await this.regenerateBytes(groupId, manifest);
    return { contentType: "text/csv", fileName: `${manifestId}.csv`, body: regenerated.csvBody };
  }

  /** Régénère les octets depuis le journal réel à la MÊME coupure figée —
   *  jamais un fichier stocké binaire séparé dans cet incrément (le manifeste
   *  immuable porte l'empreinte de référence ; la régénération doit la
   *  reproduire EXACTEMENT, sinon `verify` le détecterait déjà). */
  private async regenerateBytes(groupId: string, manifest: ExportManifestView): Promise<{ pdfBytes: Uint8Array; csvBody: string }> {
    return withGroupTx(this.pool, groupId, async (client) => {
      const eventsRes = await client.query(
        `SELECT seq, event_type, actor_identity_id, payload FROM journal
         WHERE group_id = $1 AND seq <= $2 ORDER BY seq ASC`,
        [groupId, manifest.cutoffSequence],
      );
      const events: StatementEventInput[] = eventsRes.rows.map((row) => {
        const stored = row.payload as Record<string, unknown>;
        const inner = (stored["payload"] ?? stored) as Record<string, unknown>;
        const body = (inner["body"] ?? {}) as Record<string, unknown>;
        const amountRaw = body["amount"];
        const amountXaf =
          typeof amountRaw === "number" || typeof amountRaw === "string" ? BigInt(amountRaw as number | string) : null;
        return {
          seq: Number(row.seq),
          type: String(row.event_type),
          actor: String(row.actor_identity_id ?? ""),
          detail: labelFor(String(row.event_type)),
          amountXaf,
        };
      });
      const snapshot = captureStatementSnapshot({
        groupId,
        cutoffSequence: manifest.cutoffSequence,
        capturedAt: manifest.capturedAt,
        events,
      });
      return { pdfBytes: renderStatementPdf(snapshot), csvBody: renderStatementCsv(snapshot) };
    });
  }

  /** Vérification INDÉPENDANTE (C12-HASH) : recalcule l'empreinte des octets
   *  soumis et la compare à celle du manifeste immuable. */
  async verifyScoped(ctx: ExportContext, groupId: string, manifestId: string, bytesBase64: string): Promise<VerificationResult> {
    const manifest = await this.viewScoped(ctx, groupId, manifestId);
    const candidate = new Uint8Array(Buffer.from(bytesBase64, "base64"));
    return verifyExport(
      {
        manifestId: manifest.manifestId,
        groupId: manifest.groupId,
        cutoffSequence: manifest.cutoffSequence,
        generatorVersion: manifest.generatorVersion,
        capturedAt: manifest.capturedAt,
        pdfSha256: manifest.pdfSha256,
        csvSha256: manifest.csvSha256,
        prudentNotice: manifest.prudentNotice,
      },
      candidate,
    );
  }

  /** Conservé pour compat de signature avec le domaine (non utilisé en
   *  mode réel — `isDownloadAllowed`/`ExportGrant` restent définis pour la
   *  future route de téléchangement cross-session, hors scope ici). */
  static isDownloadAllowed(grant: ExportGrant, requesterIdentityId: string, groupMembersAtDownload: readonly string[]): boolean {
    return isDownloadAllowed(grant, { requesterIdentityId, groupMembersAtDownload });
  }
}
