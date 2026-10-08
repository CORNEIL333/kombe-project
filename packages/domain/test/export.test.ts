/**
 * Tests C12 — exports du relevé (logique pure) : snapshot figé au cutoff,
 * CSV neutralisé contre l'injection de formule, PDF déterministe, empreinte
 * sur octets finalisés dans un manifeste séparé, vérificateur autonome et
 * recontrôle d'accès au téléchargement. Scénarios C12-HASH / C12-CSV /
 * C12-DOWNLOAD. La persistance durable du manifeste (RLS / append-only) et
 * l'acheminement réel restent BLOCKED sans PostgreSQL / hôte déployé.
 */
import { describe, expect, it } from "vitest";
import {
  DomainError,
  EXPORT_PRUDENT_NOTICE,
  EXPORT_GENERATOR_VERSION,
  captureStatementSnapshot,
  renderStatementCsv,
  renderStatementPdf,
  isFormulaExecutableCell,
  hashBytes,
  buildExportManifest,
  verifyExport,
  verifyExportBytes,
  isDownloadAllowed,
  buildExportEventPayload,
  type StatementEventInput,
} from "../src/index.js";

const CAPTURE = "2026-09-15T10:00:00Z";

function events(extra: readonly StatementEventInput[] = []): StatementEventInput[] {
  return [
    { seq: 1, type: "group_sealed", actor: "membre_a", detail: "Amorcage du groupe" },
    { seq: 2, type: "contribution_validated", actor: "membre_b", detail: "Cotisation", amountXaf: 5000n },
    { seq: 3, type: "disbursement_executed", actor: "membre_c", detail: "Decaissement tour 1", amountXaf: 15000n },
    ...extra,
  ];
}

describe("C12 — snapshot fige au cutoff_sequence", () => {
  it("exclut les evenements posterieurs a la coupure (etat coherent)", () => {
    const snap = captureStatementSnapshot({
      groupId: "group_A",
      cutoffSequence: 2,
      capturedAt: CAPTURE,
      events: events([{ seq: 3, type: "late", actor: "x", detail: "plus tard" }]),
    });
    expect(snap.rows.map((r) => r.seq)).toEqual([1, 2]);
    expect(snap.cutoffSequence).toBe(2);
    expect(snap.generatorVersion).toBe(EXPORT_GENERATOR_VERSION);
  });

  it("refuse une coupure non entiere ou negative", () => {
    expect(() =>
      captureStatementSnapshot({ groupId: "g", cutoffSequence: -1, capturedAt: CAPTURE, events: [] }),
    ).toThrowError(DomainError);
    expect(() =>
      captureStatementSnapshot({ groupId: "g", cutoffSequence: 1.5, capturedAt: CAPTURE, events: [] }),
    ).toThrow(/coupure/i);
  });

  it("refuse un identifiant de groupe vide", () => {
    expect(() =>
      captureStatementSnapshot({ groupId: "   ", cutoffSequence: 1, capturedAt: CAPTURE, events: [] }),
    ).toThrow(/groupe/i);
  });
});

describe("C12-CSV — neutralisation des formules", () => {
  it("neutralise un nom en =HYPERLINK(...) : aucune cellule executeable", () => {
    const snap = captureStatementSnapshot({
      groupId: "group_A",
      cutoffSequence: 9,
      capturedAt: CAPTURE,
      events: [{ seq: 1, type: "membre", actor: '=HYPERLINK("http://evil")', detail: "-@+ texte" }],
    });
    const csv = renderStatementCsv(snap);
    const dataCells = csv
      .split(/\r\n/)
      .filter((l) => l.length > 0 && !l.startsWith("#"))
      .flatMap((l) => l.split(","));
    for (const cell of dataCells) {
      expect(isFormulaExecutableCell(cell)).toBe(false);
    }
    expect(csv).toContain("'=HYPERLINK");
  });

  it("detecte une cellule brute non neutralisee comme executeable", () => {
    expect(isFormulaExecutableCell('"=cmd"')).toBe(true);
    expect(isFormulaExecutableCell('"\'=cmd"')).toBe(false);
    expect(isFormulaExecutableCell('""')).toBe(false);
  });
});

describe("C12 — PDF deterministe et empreinte", () => {
  it("rend un PDF reproductible commencant par %PDF", () => {
    const snap = captureStatementSnapshot({ groupId: "group_A", cutoffSequence: 3, capturedAt: CAPTURE, events: events() });
    const a = renderStatementPdf(snap);
    const b = renderStatementPdf(snap);
    expect(Buffer.from(a).subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(hashBytes(a)).toBe(hashBytes(b));
  });

  it("reporte l'empreinte sur les octets finalises dans le manifeste", () => {
    const snap = captureStatementSnapshot({ groupId: "group_A", cutoffSequence: 3, capturedAt: CAPTURE, events: events() });
    const pdf = renderStatementPdf(snap);
    const csv = renderStatementCsv(snap);
    const manifest = buildExportManifest({ manifestId: "exp_1", snapshot: snap, pdfBytes: pdf, csvBody: csv });
    expect(manifest.pdfSha256).toBe(hashBytes(pdf));
    expect(manifest.csvSha256).toBe(hashBytes(new TextEncoder().encode(csv)));
    expect(manifest.prudentNotice).toBe(EXPORT_PRUDENT_NOTICE);
  });
});

describe("C12-HASH — verification independante", () => {
  it("passe sur les octets originaux et echoue si un octet est altere", () => {
    const snap = captureStatementSnapshot({ groupId: "group_A", cutoffSequence: 3, capturedAt: CAPTURE, events: events() });
    const pdf = renderStatementPdf(snap);
    const manifest = buildExportManifest({ manifestId: "exp_1", snapshot: snap, pdfBytes: pdf, csvBody: renderStatementCsv(snap) });

    expect(verifyExport(manifest, pdf).verification_passed).toBe(true);

    const tampered = Uint8Array.from(pdf);
    tampered[tampered.length - 10] = tampered[tampered.length - 10]! ^ 0x01;
    expect(verifyExport(manifest, tampered).verification_passed).toBe(false);
  });

  it("signale une divergence d'empreinte CSV", () => {
    const res = verifyExportBytes("a".repeat(64), new Uint8Array([1, 2, 3]));
    expect(res.verification_passed).toBe(false);
    expect(res.expectedHash).toBe("a".repeat(64));
  });
});

describe("C12-DOWNLOAD — recontrole d'acces a l'acheminement", () => {
  const grant = { manifestId: "exp_1", groupId: "group_A", requesterIdentityId: "membre_a", objectGroupId: "group_A" };

  it("autorise tant que le demandeur est membre", () => {
    expect(isDownloadAllowed(grant, { requesterIdentityId: "membre_a", groupMembersAtDownload: ["membre_a", "membre_b"] })).toBe(true);
  });

  it("refuse au membre sortant apres generation", () => {
    expect(isDownloadAllowed(grant, { requesterIdentityId: "membre_a", groupMembersAtDownload: ["membre_b"] })).toBe(false);
  });

  it("refuse un demandeur different du titulaire (anti-IDOR)", () => {
    expect(isDownloadAllowed(grant, { requesterIdentityId: "membre_z", groupMembersAtDownload: ["membre_z"] })).toBe(false);
  });

  it("refuse un objet ne rattachant pas au groupe du droit", () => {
    expect(
      isDownloadAllowed(
        { ...grant, objectGroupId: "group_B" },
        { requesterIdentityId: "membre_a", groupMembersAtDownload: ["membre_a"] },
      ),
    ).toBe(false);
  });
});

describe("C12 — evenement d'export et langage prudent", () => {
  it("produit un payload d'evenement avec empreintes, sans promesse juridique", () => {
    const snap = captureStatementSnapshot({ groupId: "group_A", cutoffSequence: 1, capturedAt: CAPTURE, events: events() });
    const manifest = buildExportManifest({ manifestId: "exp_1", snapshot: snap, pdfBytes: renderStatementPdf(snap), csvBody: renderStatementCsv(snap) });
    const payload = buildExportEventPayload(manifest);
    expect(payload.kind).toBe("statement_exported");
    expect(payload.pdfSha256).toBe(manifest.pdfSha256);
    expect(EXPORT_PRUDENT_NOTICE).toMatch(/ne constitue pas un document a valeur juridique/i);
    expect(EXPORT_PRUDENT_NOTICE).not.toMatch(/preuve\s+(l[ée]gale)/i);
  });
});
