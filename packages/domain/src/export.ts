/**
 * Exports du relevé — C12 (stories 10.1–10.5, 18.8).
 *
 * Principe : figer un état cohérent du journal au `cutoff_sequence` choisi,
 * le rendre en CSV (neutralisé contre l'injection de formule) et en PDF
 * imprimable déterministe, calculer une empreinte SHA-256 SUR LES OCTETS
 * FINALISÉS et l'enregistrer dans un manifeste séparé (le hash ne vit pas
 * dans le fichier exporté). Un vérificateur autonome recalcule l'empreinte
 * et compare ; l'absence de correspondance est un résultat, pas une exception
 * (C12-HASH). L'accès au téléchargement est recontrôlé à l'acheminement :
 * un membre sortant ne peut plus descendre un export (C12-DOWNLOAD), seul
 * l'historique lui reste dû.
 *
 * Langage prudent (10.3) : jamais « preuve légale », jamais de signature
 * simulée. Les montants proviennent de champs typés (bigint), non de textes.
 * Cf. ADR-0002 (XAF entier), ADR-0016 (journal / projections / intégrité).
 */
import { createHash } from "node:crypto";
import { csvText } from "./csv.js";
import { DomainError } from "./errors.js";

/** Version du générateur, gravée dans chaque manifeste pour traçabilité. */
export const EXPORT_GENERATOR_VERSION = "kombe-export/1";

/** Mention prudente obligatoire ; ne promet aucune valeur juridique. */
export const EXPORT_PRUDENT_NOTICE =
  "Historique verifiable genere par KOMBE. Ne constitue pas un document a valeur "
  + "juridique et ne porte aucune signature.";

const FORMULA_LEADERS = ["=", "+", "-", "@"];

/** Une ligne de relevé, issue d'un événement du journal (montant typé). */
export interface StatementRow {
  readonly seq: number;
  readonly type: string;
  readonly actor: string;
  readonly detail: string;
  readonly amountXaf: bigint | null;
}

/** Entrée brute : un événement du journal, seq > 0, montant éventuel. */
export interface StatementEventInput {
  readonly seq: number;
  readonly type: string;
  readonly actor: string;
  readonly detail: string;
  readonly amountXaf?: bigint | null;
}

/** État figé du relevé à une séquence de coupure donnée. */
export interface StatementSnapshot {
  readonly groupId: string;
  readonly cutoffSequence: number;
  readonly capturedAt: string;
  readonly generatorVersion: string;
  readonly rows: readonly StatementRow[];
}

/**
 * Fige l'état du relevé au `cutoffSequence` : ne retient que les événements
 * dont la séquence est comprise entre 1 et `cutoffSequence`, triés. Les
 * mutations postérieures (seq > cutoff) sont exclues — le snapshot reste
 * cohérent quelle que soit l'évolution ultérieure du journal.
 */
export function captureStatementSnapshot(input: {
  readonly groupId: string;
  readonly cutoffSequence: number;
  readonly capturedAt: string;
  readonly events: readonly StatementEventInput[];
}): StatementSnapshot {
  if (input.groupId.trim() === "") {
    throw new DomainError("EXPORT_IDENTIFIANT_REQUIS", "Identifiant de groupe requis");
  }
  if (!Number.isInteger(input.cutoffSequence) || input.cutoffSequence < 0) {
    throw new DomainError("EXPORT_CUTOPE_INVALID", "Séquence de coupure invalide");
  }
  const rows: StatementRow[] = input.events
    .filter((e) => Number.isInteger(e.seq) && e.seq >= 1 && e.seq <= input.cutoffSequence)
    .slice()
    .sort((a, b) => a.seq - b.seq)
    .map((e) => ({
      seq: e.seq,
      type: e.type,
      actor: e.actor,
      detail: e.detail,
      amountXaf: e.amountXaf ?? null,
    }));
  return {
    groupId: input.groupId,
    cutoffSequence: input.cutoffSequence,
    capturedAt: input.capturedAt,
    generatorVersion: EXPORT_GENERATOR_VERSION,
    rows,
  };
}

/** Neutralise puis enveloppe un champ texte en cellule CSV sécurisée. */
function csvCell(value: string): string {
  const neutralized = csvText(value);
  return `"${neutralized.replace(/"/g, '""')}"`;
}

/** Un montant typé s'écrit en nombre nu ; jamais via du texte libre. */
function csvNumber(amountXaf: bigint | null): string {
  return amountXaf === null ? "" : amountXaf.toString();
}

/**
 * Rend le relevé en CSV : en-tête + mention prudente en préambule, puis une
 * ligne par événement. Tout champ texte passe par `csvText` (apostrophe si
 * forme de formule) ; les nombres restent des champs typés.
 */
export function renderStatementCsv(snapshot: StatementSnapshot): string {
  const lines: string[] = [];
  lines.push(`#${EXPORT_PRUDENT_NOTICE}`);
  lines.push(
    `#groupe=${csvText(snapshot.groupId)};coupure=${snapshot.cutoffSequence}`
      + `;generateur=${csvText(snapshot.generatorVersion)};capture=${csvText(snapshot.capturedAt)}`,
  );
  lines.push(["seq", "type", "acteur", "detail", "montant_xaf"].map(csvCell).join(","));
  for (const row of snapshot.rows) {
    lines.push([
      String(row.seq),
      csvCell(row.type),
      csvCell(row.actor),
      csvCell(row.detail),
      csvNumber(row.amountXaf),
    ].join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

/**
 * Détecte si une cellule CSV émise serait exécutable comme formule par un
 * tableur. Une cellule enveloppée de guillemets est déplombée ; une cellule
 * neutralisée par l'apostrophe préfixe n'est jamais exécutable.
 */
export function isFormulaExecutableCell(cell: string): boolean {
  let inner = cell;
  if (inner.startsWith('"') && inner.endsWith('"')) {
    inner = inner.slice(1, -1).replace(/""/g, '"');
  }
  const first = inner.replace(/^[ \t\r\n]+/, "");
  if (first.startsWith("'")) return false;
  return FORMULA_LEADERS.some((c) => first.startsWith(c));
}

/** Échappe un texte pour une chaîne littérale PDF en encodage Latin-1/WinAnsi. */
function pdfEscape(value: string): string {
  let out = "";
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 0x5c) out += "\\\\";
    else if (code === 0x28) out += "\\(";
    else if (code === 0x29) out += "\\)";
    else if (code >= 0x20 && code <= 0x7e) out += ch;
    else if (code >= 0xa0 && code <= 0xff) out += ch;
    else out += "?";
  }
  return out;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, Math.max(0, max - 3))}...` : value;
}

/** Construit le flux de contenu PDF (police chassee Courier, page A4). */
function buildContentStream(lines: readonly string[]): string {
  const top = 842 - 50;
  let stream = `BT\n/F1 9 Tf\n1 0 0 1 48 ${top} Tm\n12 TL\n`;
  for (const line of lines) {
    stream += `(${pdfEscape(line)}) Tj\nT*\n`;
  }
  stream += "ET\n";
  return stream;
}

/** Assemble un PDF minimal mono-page à partir du flux de contenu (octets Latin-1). */
function buildPdfDocument(contentStream: string): Uint8Array {
  const objects: string[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
  objects[3] =
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
    + "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>";
  const contentLength = Buffer.byteLength(contentStream, "latin1");
  objects[4] = `<< /Length ${contentLength} >>\nstream\n${contentStream}endstream`;
  objects[5] =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>";

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let i = 1; i <= 5; i += 1) {
    offsets[i] = Buffer.byteLength(pdf, "latin1");
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefStart = Buffer.byteLength(pdf, "latin1");
  pdf += "xref\n0 6\n";
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= 5; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return new Uint8Array(Buffer.from(pdf, "latin1"));
}

/**
 * Rend le relevé en PDF imprimable déterministe (A4, police chassee). Les
 * octets produits sont finalisés : c'est sur eux que porte l'empreinte.
 */
export function renderStatementPdf(snapshot: StatementSnapshot): Uint8Array {
  const lines: string[] = [];
  lines.push("KOMBE - historique verifiable");
  lines.push("Document sans valeur legale automatique ; aucune signature.");
  lines.push("");
  lines.push(`Releve - groupe ${truncate(snapshot.groupId, 40)}`);
  lines.push(
    `Coupure seq=${snapshot.cutoffSequence}  generateur ${snapshot.generatorVersion}`
      + `  capture ${snapshot.capturedAt}`,
  );
  lines.push("");
  lines.push("seq  type                     acteur              detail                              montant(XAF)");
  lines.push("-".repeat(96));
  for (const row of snapshot.rows) {
    const amount = row.amountXaf === null ? "-" : row.amountXaf.toString();
    lines.push(
      `${String(row.seq).padEnd(4)} ${truncate(row.type, 22).padEnd(22)}`
        + ` ${truncate(row.actor, 17).padEnd(17)} ${truncate(row.detail, 33).padEnd(33)} ${amount}`,
    );
  }
  return buildPdfDocument(buildContentStream(lines));
}

/** Empreinte SHA-256 sur les octets finalisés (hex minuscule). */
export function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Manifeste séparé : porte les empreintes HORS du fichier exporté. */
export interface ExportManifest {
  readonly manifestId: string;
  readonly groupId: string;
  readonly cutoffSequence: number;
  readonly generatorVersion: string;
  readonly capturedAt: string;
  readonly pdfSha256: string;
  readonly csvSha256: string;
  readonly prudentNotice: string;
}

/** Calcule les empreintes sur les octets finalisés et produit le manifeste. */
export function buildExportManifest(input: {
  readonly manifestId: string;
  readonly snapshot: StatementSnapshot;
  readonly pdfBytes: Uint8Array;
  readonly csvBody: string;
}): ExportManifest {
  if (input.manifestId.trim() === "") {
    throw new DomainError("EXPORT_IDENTIFIANT_REQUIS", "Identifiant de manifeste requis");
  }
  const csvBytes = new TextEncoder().encode(input.csvBody);
  return {
    manifestId: input.manifestId,
    groupId: input.snapshot.groupId,
    cutoffSequence: input.snapshot.cutoffSequence,
    generatorVersion: input.snapshot.generatorVersion,
    capturedAt: input.snapshot.capturedAt,
    pdfSha256: hashBytes(input.pdfBytes),
    csvSha256: hashBytes(csvBytes),
    prudentNotice: EXPORT_PRUDENT_NOTICE,
  };
}

/** Résultat de vérification ; une divergence est un état, pas une exception. */
export interface VerificationResult {
  readonly verification_passed: boolean;
  readonly checkedHash: string;
  readonly expectedHash: string;
}

/** Recalcule l'empreinte des octets fournis et la compare à l'empreinte attendue. */
export function verifyExportBytes(expectedSha256: string, bytes: Uint8Array): VerificationResult {
  const recomputed = hashBytes(bytes);
  return {
    verification_passed: recomputed === expectedSha256,
    checkedHash: recomputed,
    expectedHash: expectedSha256,
  };
}

/** Vérification autonome d'un PDF contre son manifeste (C12-HASH). */
export function verifyExport(manifest: ExportManifest, pdfBytes: Uint8Array): VerificationResult {
  return verifyExportBytes(manifest.pdfSha256, pdfBytes);
}

/** Droit de téléchargement accordé à l'émission, rattaché à un objet et un groupe. */
export interface ExportGrant {
  readonly manifestId: string;
  readonly groupId: string;
  readonly requesterIdentityId: string;
  readonly objectGroupId: string;
}

/** Contexte ré-évalué au moment du téléchargement (droits courants). */
export interface DownloadContext {
  readonly requesterIdentityId: string;
  readonly groupMembersAtDownload: readonly string[];
}

/**
 * Recontrôle d'accès à l'acheminement : le demandeur doit rester le titulaire
 * du droit, l'objet doit appartenir au même groupe (anti-IDOR), et le demandeur
 * doit encore figurer parmi les membres du groupe au moment du téléchargement.
 * Un membre sortant voit son accès refusé (C12-DOWNLOAD) ; l'historique exporté
 * reste consultable par les membres encore habilités.
 */
export function isDownloadAllowed(grant: ExportGrant, ctx: DownloadContext): boolean {
  if (grant.requesterIdentityId !== ctx.requesterIdentityId) return false;
  if (grant.objectGroupId !== grant.groupId) return false;
  return ctx.groupMembersAtDownload.includes(ctx.requesterIdentityId);
}

/** Payload de l'événement « relevé exporté » scellé dans le journal (18.8). */
export function buildExportEventPayload(manifest: ExportManifest): Record<string, unknown> {
  return {
    kind: "statement_exported",
    manifestId: manifest.manifestId,
    groupId: manifest.groupId,
    cutoffSequence: manifest.cutoffSequence,
    generatorVersion: manifest.generatorVersion,
    pdfSha256: manifest.pdfSha256,
    csvSha256: manifest.csvSha256,
    prudentNotice: manifest.prudentNotice,
  };
}
