/**
 * Store FICTIF en mémoire pour la recette C12 — exports du relevé. Il délègue
 * TOUTE décision aux fonctions pures de `@kombe/domain` (`export.ts`,
 * `csv.ts`) : figer l'état au `cutoff_sequence` SERVEUR (jamais fourni par le
 * client), rendre un CSV neutralisé et un PDF imprimable, calculer l'empreinte
 * SHA-256 SUR LES OCTETS FINALISÉS consignée dans un manifeste séparé, et
 * recontrôler l'accès au téléchargement à l'acheminement (un membre sortant
 * reçoit un 404 non-divulguant, pas ses données — C12-DOWNLOAD). La
 * vérification est INDÉPENDANTE : le client soumet les octets qu'il détient,
 * le store recalcule l'empreinte et compare (C12-HASH), sans jamais renvoyer
 * une constante lue dans le scénario.
 *
 * Comme les autres stores, il ne prétend NI persister, NI servir un vrai binaire
 * signé : la table `export_manifest` (append-only, RLS) et l'acheminement privé
 * expirant sont le contrat SQL de la migration `0015_export_manifest` — preuve
 * base réelle **BLOCKED** sans PostgreSQL (ADR-0004 / ADR-0016). L'horodatage de
 * capture est une date SERVEUR injectée (`x-server-date`) ; l'appartenance au
 * groupe est résolue côté serveur, jamais déclarée par le client (ADR-0005/0006).
 */
import {
  DomainError,
  buildExportEventPayload,
  buildExportManifest,
  captureStatementSnapshot,
  isDownloadAllowed,
  renderStatementCsv,
  renderStatementPdf,
  verifyExport,
  type ExportManifest,
  type ExportGrant,
  type StatementEventInput,
  type VerificationResult,
} from "@kombe/domain";

export interface ExportContext {
  readonly actorIdentityId: string;
  readonly actorRole: string;
  /** Date SERVEUR injectée (ISO 8601) ; devient `capturedAt` du relevé. */
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

interface ExportRecord {
  readonly manifest: ExportManifest;
  readonly pdfBytes: Uint8Array;
  readonly csvBody: string;
  readonly grant: ExportGrant;
}

export class FictitiousExportStore {
  private readonly groups = new Map<string, { members: Set<string>; events: StatementEventInput[] }>();
  private readonly records = new Map<string, ExportRecord>();
  /** Journal (fictif) des exports produits — la durabilité est en base (0015). */
  private readonly exportEvents: Record<string, unknown>[] = [];

  /** Amorçage de recette : membres et événements d'un groupe. */
  seedGroup(groupId: string, members: readonly string[], events: readonly StatementEventInput[]): void {
    this.groups.set(groupId, { members: new Set(members), events: [...events] });
  }

  /** Sortie d'un membre (simule l'évolution post-export pour C12-DOWNLOAD). */
  removeMember(groupId: string, identityId: string): void {
    this.groups.get(groupId)?.members.delete(identityId);
  }

  private membersOf(groupId: string): string[] {
    const g = this.groups.get(groupId);
    return g ? [...g.members] : [];
  }

  private gateAuth(ctx: ExportContext): void {
    if (!ctx.actorIdentityId) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    }
  }

  private static toView(manifest: ExportManifest): ExportManifestView {
    return {
      manifestId: manifest.manifestId,
      groupId: manifest.groupId,
      cutoffSequence: manifest.cutoffSequence,
      generatorVersion: manifest.generatorVersion,
      capturedAt: manifest.capturedAt,
      pdfSha256: manifest.pdfSha256,
      csvSha256: manifest.csvSha256,
      prudentNotice: manifest.prudentNotice,
      downloadPath: `/v1/exports/${manifest.manifestId}/download`,
    };
  }

  /**
   * Génère un relevé exporté au `cutoff_sequence` courant (ou à une coupure
   * antérieure demandée, jamais au-delà de l'état réel). Le demandeur doit être
   * membre du groupe ; sinon 404 non-divulguant. Empreinte sur octets finalisés
   * consignée dans un manifeste séparé ; l'événement d'export est produit.
   */
  create(ctx: ExportContext, groupId: string, cutoff?: number): ExportManifestView {
    this.gateAuth(ctx);
    const group = this.groups.get(groupId);
    if (!group || !group.members.has(ctx.actorIdentityId)) {
      // Non-divulgation : un non-membre ne découvre pas qu'un relevé existe.
      throw new DomainError("RESERVATION_INCOHERENTE", "Groupe ou accès introuvable");
    }
    const maxSeq = group.events.reduce((m, e) => Math.max(m, e.seq), 0);
    const cutoffSequence = cutoff ?? maxSeq;
    if (!Number.isInteger(cutoffSequence) || cutoffSequence < 0 || cutoffSequence > maxSeq) {
      // On ne peut exporter un état postérieur au journal courant.
      throw new DomainError("EXPORT_CUTOPE_INVALID", "Séquence de coupure hors de l'état courant");
    }
    const snapshot = captureStatementSnapshot({
      groupId,
      cutoffSequence,
      capturedAt: ctx.serverDate,
      events: group.events,
    });
    const pdfBytes = renderStatementPdf(snapshot);
    const csvBody = renderStatementCsv(snapshot);
    const manifestId = `exp-${groupId}-${cutoffSequence}`;
    const manifest = buildExportManifest({ manifestId, snapshot, pdfBytes, csvBody });
    const grant: ExportGrant = {
      manifestId,
      groupId,
      requesterIdentityId: ctx.actorIdentityId,
      objectGroupId: groupId,
    };
    this.records.set(manifestId, { manifest, pdfBytes, csvBody, grant });
    this.exportEvents.push(buildExportEventPayload(manifest));
    return FictitiousExportStore.toView(manifest);
  }

  /** Recontrôle d'accès à l'acheminement ; renvoie les octets si autorisé. */
  private requireAccessible(ctx: ExportContext, manifestId: string): ExportRecord {
    this.gateAuth(ctx);
    const rec = this.records.get(manifestId);
    if (!rec) {
      throw new DomainError("RESERVATION_INCOHERENTE", "Export introuvable");
    }
    const allowed = isDownloadAllowed(rec.grant, {
      requesterIdentityId: ctx.actorIdentityId,
      groupMembersAtDownload: this.membersOf(rec.grant.groupId),
    });
    if (!allowed) {
      // Membre sortant ou demandeur différent → 404, aucune divulgation.
      throw new DomainError("RESERVATION_INCOHERENTE", "Export introuvable");
    }
    return rec;
  }

  download(ctx: ExportContext, manifestId: string): ExportDownload {
    const rec = this.requireAccessible(ctx, manifestId);
    return {
      contentType: "application/pdf",
      fileName: `${manifestId}.pdf`,
      bytes: rec.pdfBytes,
      manifest: FictitiousExportStore.toView(rec.manifest),
    };
  }

  csv(ctx: ExportContext, manifestId: string): { contentType: string; fileName: string; body: string } {
    const rec = this.requireAccessible(ctx, manifestId);
    return { contentType: "text/csv", fileName: `${manifestId}.csv`, body: rec.csvBody };
  }

  /** Vue du manifeste (empreintes, coupure, mention prudente) si accessible. */
  view(ctx: ExportContext, manifestId: string): ExportManifestView {
    const rec = this.requireAccessible(ctx, manifestId);
    return FictitiousExportStore.toView(rec.manifest);
  }

  /**
   * Vérification INDÉPENDANTE (C12-HASH) : le client soumet, en base64, les
   * octets du fichier qu'il détient ; on recalcule l'empreinte et on la compare
   * à celle du manifeste. Un octet altéré → `verification_passed = false`.
   */
  verify(ctx: ExportContext, manifestId: string, bytesBase64: string): VerificationResult {
    const rec = this.requireAccessible(ctx, manifestId);
    const candidate = new Uint8Array(Buffer.from(bytesBase64, "base64"));
    return verifyExport(rec.manifest, candidate);
  }

  exportEventCount(): number {
    return this.exportEvents.length;
  }

  exportEventsPayloads(): readonly Record<string, unknown>[] {
    return this.exportEvents;
  }
}
