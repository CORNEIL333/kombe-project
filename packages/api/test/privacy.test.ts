/**
 * Recette C16 via l'application Fastify (fastify.inject, sans base). Prouve les
 * DÉCISIONS serveur des données personnelles : notice légale refusée si à
 * placeholder ou promettant une garantie (422), consentement **séparable** (un
 * refus de recherche ne coupe pas le service cœur résolu serveur — C16-CONSENT),
 * demande de droits à vérification **proportionnée** (insuffisante → reste en
 * attente puis 403 à l'exécution, jamais refusée d'office ; gel **motivé**),
 * export personnel **filtré** sans aucun champ privé d'autrui (C16-EXPORT :
 * `third_party_private_fields = 0`) et anti-IDOR (le droit d'autrui → 404), et
 * restauration réappliquant effacements ET révocations (C16-RESTORE :
 * `deleted_identity_visible = false`). Ne prétend PAS purger un vrai cache/index
 * ni persister les tombstones : contrat `0016_privacy_law` (append-only, RLS,
 * CHECK de cycle de vie), **BLOCKED** sans PostgreSQL (ADR-0006 / ADR-0007).
 */
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/server.js";
import { FictitiousPrivacyStore } from "../src/privacyStore.js";

const json = { "content-type": "application/json" };

function h(identityId: string) {
  return {
    ...json,
    "x-actor": JSON.stringify({ handle: identityId, role: "member", identityId, groupIds: ["grpA"] }),
    "x-server-date": "2026-09-15T10:00:00Z",
  };
}

function fresh(): { app: ReturnType<typeof buildApp>; store: FictitiousPrivacyStore } {
  const store = new FictitiousPrivacyStore();
  // Champs personnels de DEUX membres dans un réservoir commun (C16-EXPORT).
  store.seedPersonalField({ key: "tel_a", ownerIdentityId: "membre_a", visibility: "private", value: "+241000000" });
  store.seedPersonalField({ key: "note_a", ownerIdentityId: "membre_a", visibility: "shared", value: "visible-groupe" });
  store.seedPersonalField({ key: "tel_b", ownerIdentityId: "membre_b", visibility: "private", value: "+241999999" });
  store.seedPersonalField({ key: "pseudo_b", ownerIdentityId: "membre_b", visibility: "public", value: "membre-B" });
  return { app: buildApp({ privacy: store }), store };
}

async function openAndVerify(
  app: ReturnType<typeof buildApp>,
  who: string,
  requestId: string,
  kind: string,
  level: number,
) {
  const opened = await app.inject({
    method: "POST",
    url: "/v1/privacy/rights-requests",
    headers: h(who),
    payload: { requestId, kind },
  });
  expect(opened.statusCode).toBe(201);
  const verified = await app.inject({
    method: "POST",
    url: `/v1/privacy/rights-requests/${requestId}/verifications`,
    headers: h(who),
    payload: { level },
  });
  expect(verified.statusCode).toBe(200);
  return { opened, verified };
}

describe("C16 — notices légales (13.1, 13.2)", () => {
  it("publie une notice conforme (201)", async () => {
    const { app } = fresh();
    const res = await app.inject({
      method: "POST",
      url: "/v1/privacy/notices",
      headers: h("membre_a"),
      payload: {
        noticeId: "notice-privacy",
        kind: "privacy",
        version: "1.0",
        lastUpdatedAt: "2026-09-01",
        body: "Registre partagé ; paiements hors application.",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().noticeId).toBe("notice-privacy");
  });

  it("refuse une mention « bientôt » (422 stable)", async () => {
    const { app } = fresh();
    const res = await app.inject({
      method: "POST",
      url: "/v1/privacy/notices",
      headers: h("membre_a"),
      payload: {
        noticeId: "n",
        kind: "complaint",
        version: "1.0",
        lastUpdatedAt: "2026-09-01",
        body: "La procédure de plainte arrivera bientôt.",
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("PRIVACY_CONTENU_PLACEHOLDER");
  });

  it("refuse une promesse de garantie des fonds (422)", async () => {
    const { app } = fresh();
    const res = await app.inject({
      method: "POST",
      url: "/v1/privacy/notices",
      headers: h("membre_a"),
      payload: {
        noticeId: "n",
        kind: "cgu",
        version: "1.0",
        lastUpdatedAt: "2026-09-01",
        body: "KÓMBE garantit et fait fructifier vos fonds.",
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("PRIVACY_CONTENU_PLACEHOLDER");
  });

  it("notice inconnue → 404 non-divulguant", async () => {
    const { app } = fresh();
    const res = await app.inject({ method: "GET", url: "/v1/privacy/notices/absente", headers: h("membre_a") });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("RESERVATION_INCOHERENTE");
  });
});

describe("C16 — registre des traitements (13.3)", () => {
  it("enregistre un traitement factuel (201)", async () => {
    const { app, store } = fresh();
    const res = await app.inject({
      method: "POST",
      url: "/v1/privacy/processing-records",
      headers: h("membre_a"),
      payload: {
        purpose: "Tenable du registre de cotisations",
        dataCategories: ["identifiant", "nom"],
        legalBasis: "contract",
        recipients: ["membres"],
        country: "GA",
        retentionDays: 1825,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(store.processingRegistry().length).toBe(1);
  });
});

describe("C16 — consentement séparé (13.4, C16-CONSENT)", () => {
  it("refuser la recherche laisse le service cœur disponible (membre actif)", async () => {
    const { app, store } = fresh();
    store.seedActiveMember("membre_a");
    const res = await app.inject({
      method: "POST",
      url: "/v1/privacy/consents",
      headers: h("membre_a"),
      payload: { category: "research", granted: false },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.research).toBe(false);
    expect(body.coreServiceAvailable).toBe(true); // C16-CONSENT
  });

  it("un non-membre actif n'a pas le service cœur (résolu serveur)", async () => {
    const { app } = fresh();
    const res = await app.inject({ method: "GET", url: "/v1/privacy/consents", headers: h("membre_z") });
    expect(res.statusCode).toBe(200);
    expect(res.json().coreServiceAvailable).toBe(false);
  });

  it("catégorie de consent inconnue → 422 (schéma enum)", async () => {
    const { app } = fresh();
    const res = await app.inject({
      method: "POST",
      url: "/v1/privacy/consents",
      headers: h("membre_a"),
      payload: { category: "vendre_mes_donnees", granted: true },
    });
    expect(res.statusCode).toBe(422);
  });
});

describe("C16 — export personnel filtré (C16-EXPORT, 18.19)", () => {
  it("export exécuté ne contient AUCUN champ privé d'autrui (third_party_private_fields = 0)", async () => {
    const { app } = fresh();
    await openAndVerify(app, "membre_a", "rr-export", "export", 2);
    const res = await app.inject({
      method: "POST",
      url: "/v1/privacy/rights-requests/rr-export/export",
      headers: h("membre_a"),
      payload: {},
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.thirdPartyPrivateFields).toBe(0);
    const keys = body.entries.map((e: { key: string }) => e.key);
    expect(keys).toContain("tel_a"); // son propre champ privé
    expect(keys).toContain("pseudo_b"); // public → admis
    expect(keys).not.toContain("tel_b"); // privé d'autrui → exclu
    expect(body.prudentNotice).toMatch(/hors application/i);
  });

  it("vérification insuffisante → exécution refusée 403 (jamais exécutée)", async () => {
    const { app } = fresh();
    await openAndVerify(app, "membre_a", "rr-e2", "export", 1); // seuil export = 2
    const res = await app.inject({
      method: "POST",
      url: "/v1/privacy/rights-requests/rr-e2/export",
      headers: h("membre_a"),
      payload: {},
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("PRIVACY_VERIFICATION_INSUFFISANTE");
  });

  it("anti-IDOR : le droit d'un autre membre → 404 non-divulguant", async () => {
    const { app } = fresh();
    await openAndVerify(app, "membre_a", "rr-a", "export", 2);
    const res = await app.inject({
      method: "POST",
      url: "/v1/privacy/rights-requests/rr-a/export",
      headers: h("membre_b"), // B tente d'exécuter la demande de A
      payload: {},
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("RESERVATION_INCOHERENTE");
  });
});

describe("C16 — gel motivé d'une demande (18.19)", () => {
  it("gel sans motif → 422 ; gel motivé puis exécution impossible", async () => {
    const { app } = fresh();
    await openAndVerify(app, "membre_a", "rr-gel", "export", 2);
    const blankReason = await app.inject({
      method: "POST",
      url: "/v1/privacy/rights-requests/rr-gel/restrictions",
      headers: h("membre_a"),
      payload: { reason: "   " },
    });
    expect(blankReason.statusCode).toBe(422);
    expect(blankReason.json().code).toBe("PRIVACY_MOTIF_GEL_REQUIS");

    const frozen = await app.inject({
      method: "POST",
      url: "/v1/privacy/rights-requests/rr-gel/restrictions",
      headers: h("membre_a"),
      payload: { reason: "examen antifraude en cours" },
    });
    expect(frozen.statusCode).toBe(200);
    expect(frozen.json().status).toBe("frozen");

    const exec = await app.inject({
      method: "POST",
      url: "/v1/privacy/rights-requests/rr-gel/export",
      headers: h("membre_a"),
      payload: {},
    });
    expect(exec.statusCode).toBe(403);
  });
});

describe("C16 — purge / restauration (C16-RESTORE, 18.10)", () => {
  it("restaurer un point antérieur à un effacement laisse l'identité effacée invisible", async () => {
    const { app, store } = fresh();
    store.seedActiveMember("membre_a");
    store.seedActiveMember("membre_b");
    store.seedActiveMember("membre_c");
    // Point pris quand A,B,C sont visibles (avant effacement).
    const snap = await app.inject({ method: "POST", url: "/v1/privacy/restore-points", headers: h("membre_a"), payload: {} });
    expect(snap.statusCode).toBe(201);
    expect(snap.json().identities).toEqual(expect.arrayContaining(["membre_a", "membre_b", "membre_c"]));

    // B exerce son droit à l'effacement APRÈS le point.
    await openAndVerify(app, "membre_b", "rr-del", "erasure", 3);
    await app.inject({ method: "POST", url: "/v1/privacy/rights-requests/rr-del/erasure", headers: h("membre_b"), payload: {} });
    expect(store.isErasedProbe("membre_b")).toBe(true);

    const restore = await app.inject({
      method: "POST",
      url: "/v1/privacy/restorations",
      headers: h("membre_a"),
      payload: { probeIdentityId: "membre_b" },
    });
    expect(restore.statusCode).toBe(200);
    const body = restore.json();
    expect(body.deletedIdentityVisible).toBe(false); // C16-RESTORE
    expect(body.reAppliedErasures).toBe(1);
    expect(body.visible).not.toContain("membre_b");
    expect(body.visible).toEqual(expect.arrayContaining(["membre_a", "membre_c"]));
  });

  it("réapplique aussi les révocations (révocation ≠ effacement)", async () => {
    const { app, store } = fresh();
    store.seedActiveMember("membre_a");
    store.seedActiveMember("membre_c");
    store.revokeAccess("membre_c");
    await app.inject({ method: "POST", url: "/v1/privacy/restore-points", headers: h("membre_a"), payload: {} });
    const restore = await app.inject({
      method: "POST",
      url: "/v1/privacy/restorations",
      headers: h("membre_a"),
      payload: { probeIdentityId: "membre_c" },
    });
    const body = restore.json();
    expect(body.reAppliedRevocations).toContain("membre_c");
    expect(body.visible).toContain("membre_c"); // révocation, pas effacement
    expect(body.reAppliedErasures).toBe(0); // rien n'a été effacé
  });

  it("aucun point de restauration → 404 non-divulguant", async () => {
    const { app } = fresh();
    const res = await app.inject({
      method: "POST",
      url: "/v1/privacy/restorations",
      headers: h("membre_a"),
      payload: { probeIdentityId: "membre_a" },
    });
    expect(res.statusCode).toBe(404);
  });
});
