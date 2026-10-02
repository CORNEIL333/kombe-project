/**
 * Recette C12 via l'application Fastify (fastify.inject, sans base). Prouve les
 * DÉCISIONS serveur de l'export du relevé : coupure résolue SERVEUR (jamais
 * au-delà de l'état réel), génération réservée aux membres (anti-IDOR), PDF
 * imprimable dont l'empreinte recalculée correspond au manifeste séparé, CSV
 * neutralisé contre l'injection de formule, ACL recontrôlée à l'acheminement
 * (C12-DOWNLOAD : membre sortant ou demandeur distinct → 404 non-divulguant),
 * et vérification INDÉPENDANTE sur octets soumis (C12-HASH : un octet altéré →
 * verification_passed = false). Ne prétend PAS persister le manifeste ni servir
 * un vrai fichier signé : contrat `0015_export_manifest` (append-only, RLS),
 * **BLOCKED** sans PostgreSQL (ADR-0004 / ADR-0016).
 */
import { describe, expect, it } from "vitest";
import { hashBytes } from "@kombe/domain";
import { buildApp } from "../src/server.js";
import { FictitiousExportStore, type ExportContext } from "../src/exportStore.js";

const json = { "content-type": "application/json" };

function h(identityId: string, groupIds: readonly string[] = ["grpA"]) {
  return {
    ...json,
    "x-actor": JSON.stringify({ handle: identityId, role: "member", identityId, groupIds }),
    "x-server-date": "2026-09-15T10:00:00Z",
  };
}

const EVENTS = [
  { seq: 1, type: "group_sealed", actor: "membre_a", detail: "Amorcage du groupe" },
  { seq: 2, type: "contribution_validated", actor: '=HYPERLINK("http://evil")', detail: "Cotisation tour 1", amountXaf: 5000n },
  { seq: 3, type: "disbursement_executed", actor: "membre_b", detail: "Decaissement tour 1", amountXaf: 15000n },
];

function fresh(): { app: ReturnType<typeof buildApp>; store: FictitiousExportStore } {
  const store = new FictitiousExportStore();
  store.seedGroup("grpA", ["membre_a", "membre_b"], EVENTS);
  return { app: buildApp({ exports: store }), store };
}

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

describe("C12 — génération d'un export relevé", () => {
  it("crée un manifeste avec empreinte et mention prudente (201)", async () => {
    const { app } = fresh();
    const res = await app.inject({ method: "POST", url: "/v1/groups/grpA/exports", headers: h("membre_a"), payload: {} });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.cutoffSequence).toBe(3); // coupure = état courant (résolu serveur)
    expect(body.pdfSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(body.csvSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(body.prudentNotice).toMatch(/pas une preuve legale/i);
    expect(body.downloadPath).toBe("/v1/exports/exp-grpA-3/download");
  });

  it("refuse un non-membre sans divulguer l'existence du relevé (404)", async () => {
    const { app } = fresh();
    const res = await app.inject({ method: "POST", url: "/v1/groups/grpA/exports", headers: h("membre_z"), payload: {} });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("RESERVATION_INCOHERENTE");
  });

  it("refuse une coupure postérieure à l'état courant (422)", async () => {
    const { app } = fresh();
    const res = await app.inject({ method: "POST", url: "/v1/groups/grpA/exports", headers: h("membre_a"), payload: { cutoffSequence: 99 } });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("EXPORT_CUTOPE_INVALID");
  });

  it("exporte un etat fige : la coupure antérieure exclut les lignes plus tardives", async () => {
    const { app } = fresh();
    const res = await app.inject({ method: "POST", url: "/v1/groups/grpA/exports", headers: h("membre_a"), payload: { cutoffSequence: 1 } });
    expect(res.statusCode).toBe(201);
    const manifest = res.json();
    const csv = await app.inject({ method: "GET", url: "/v1/exports/exp-grpA-1/csv", headers: h("membre_a") });
    expect(csv.statusCode).toBe(200);
    expect(csv.body).toContain("Amorcage");
    expect(csv.body).not.toContain("Decaissement"); // seq 3 > coupure 1
    expect(manifest.cutoffSequence).toBe(1);
  });
});

describe("C12 — téléchargement et intgrité", () => {
  it("sert un PDF dont les octets correspondent à l'empreinte du manifeste", async () => {
    const { app } = fresh();
    const created = await app.inject({ method: "POST", url: "/v1/groups/grpA/exports", headers: h("membre_a"), payload: {} });
    const manifest = created.json();
    const dl = await app.inject({ method: "GET", url: manifest.downloadPath, headers: h("membre_a") });
    expect(dl.statusCode).toBe(200);
    expect(dl.headers["content-type"]).toBe("application/pdf");
    expect(dl.rawPayload.subarray(0, 4).toString("latin1")).toBe("%PDF");
    expect(hashBytes(new Uint8Array(dl.rawPayload))).toBe(manifest.pdfSha256);
  });

  it("neutralise la formule dans le CSV émis", async () => {
    const { app } = fresh();
    await app.inject({ method: "POST", url: "/v1/groups/grpA/exports", headers: h("membre_a"), payload: {} });
    const csv = await app.inject({ method: "GET", url: "/v1/exports/exp-grpA-3/csv", headers: h("membre_a") });
    expect(csv.statusCode).toBe(200);
    expect(csv.body).toContain("'=HYPERLINK");
    expect(csv.headers["content-type"]).toContain("text/csv");
  });
});

describe("C12-DOWNLOAD — recontrole d'acces a l'acheminement", () => {
  async function createAsMember(app: ReturnType<typeof buildApp>) {
    const created = await app.inject({ method: "POST", url: "/v1/groups/grpA/exports", headers: h("membre_a"), payload: {} });
    return created.json();
  }

  it("refuse le téléchargement au membre sorti après génération (404)", async () => {
    const { app, store } = fresh();
    const manifest = await createAsMember(app);
    store.removeMember("grpA", "membre_a"); // perte d'accès après génération
    const dl = await app.inject({ method: "GET", url: manifest.downloadPath, headers: h("membre_a") });
    expect(dl.statusCode).toBe(404);
    expect(dl.json().code).toBe("RESERVATION_INCOHERENTE");
  });

  it("refuse un téléchargement par un demandeur autre que le titulaire (anti-IDOR)", async () => {
    const { app } = fresh();
    const manifest = await createAsMember(app); // grant titulaire = membre_a
    const dl = await app.inject({ method: "GET", url: manifest.downloadPath, headers: h("membre_b") });
    expect(dl.statusCode).toBe(404);
  });
});

describe("C12-HASH — vérification indépendante", () => {
  async function createAndFetch(app: ReturnType<typeof buildApp>) {
    const created = await app.inject({ method: "POST", url: "/v1/groups/grpA/exports", headers: h("membre_a"), payload: {} });
    const manifest = created.json();
    const dl = await app.inject({ method: "GET", url: manifest.downloadPath, headers: h("membre_a") });
    return { manifest, bytes: new Uint8Array(dl.rawPayload) };
  }

  it("confirme un fichier intact puis rejette un octet altéré", async () => {
    const { app } = fresh();
    const { manifest, bytes } = await createAndFetch(app);

    const ok = await app.inject({
      method: "POST", url: `/v1/exports/${manifest.manifestId}/verifications`, headers: h("membre_a"), payload: { bytesBase64: base64(bytes) },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().verification_passed).toBe(true);

    const tampered = Uint8Array.from(bytes);
    tampered[tampered.length - 5] = tampered[tampered.length - 5]! ^ 0x01;
    const bad = await app.inject({
      method: "POST", url: `/v1/exports/${manifest.manifestId}/verifications`, headers: h("membre_a"), payload: { bytesBase64: base64(tampered) },
    });
    expect(bad.statusCode).toBe(200);
    expect(bad.json().verification_passed).toBe(false);
  });

  it("exige l'accès pour vérifier (membre sortant → 404)", async () => {
    const { app, store } = fresh();
    const { manifest, bytes } = await createAndFetch(app);
    store.removeMember("grpA", "membre_a");
    const res = await app.inject({
      method: "POST", url: `/v1/exports/${manifest.manifestId}/verifications`, headers: h("membre_a"), payload: { bytesBase64: base64(bytes) },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("C12 — événement d'export consigné", () => {
  it("produit un événement d'export portant les empreintes", async () => {
    const store = new FictitiousExportStore();
    store.seedGroup("grpA", ["membre_a"], EVENTS);
    const ctx: ExportContext = { actorIdentityId: "membre_a", actorRole: "member", serverDate: "2026-09-15T10:00:00Z" };
    const view = store.create(ctx, "grpA");
    expect(store.exportEventCount()).toBe(1);
    const payload = store.exportEventsPayloads()[0] as Record<string, unknown>;
    expect(payload.kind).toBe("statement_exported");
    expect(payload.pdfSha256).toBe(view.pdfSha256);
  });
});
