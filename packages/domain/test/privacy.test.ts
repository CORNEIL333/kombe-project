/**
 * Tests C16 — données personnelles (logique pure) : notices légales sans
 * placeholder ni promesse de garantie, registre des traitements factuel,
 * consentement **séparable** du service cœur, export personnel **filtré**
 * (aucun champ privé d'autrui), demandes de droits à vérification
 * **proportionnée** (jamais de refus automatique, gel **motivé**), purge /
 * tombstones et **restauration** réappliquant effacements ET révocations, et
 * écart pseudonymisé ≠ anonyme. Scénarios C16-EXPORT / C16-RESTORE /
 * C16-CONSENT. La durabilité (tombstones append-only, RLS, CHECK) reste
 * BLOCKED sans PostgreSQL.
 */
import { describe, expect, it } from "vitest";
import {
  DomainError,
  PRIVACY_PRUDENT_NOTICE,
  buildLegalNotice,
  containsPlaceholder,
  isCommunicationPrudente,
  buildProcessingRecord,
  initialConsent,
  setConsent,
  coreServiceAvailable,
  researchCompensationHours,
  extractPersonalDataExport,
  countThirdPartyPrivateFields,
  createRightsRequest,
  recordVerification,
  restrictRightsRequest,
  fulfillRightsRequest,
  requiredVerificationFor,
  eraseIdentity,
  isErased,
  restoreFromPoint,
  deletedIdentityVisible,
  assessReidentification,
  type PersonalField,
  type RestorePoint,
  type Tombstone,
} from "../src/index.js";

const NOW = Math.floor(Date.parse("2026-09-15T10:00:00Z") / 1000);

describe("C16 — notices légales (13.1, 13.2)", () => {
  it("publie une notice conforme versionnée", () => {
    const n = buildLegalNotice({
      noticeId: "notice-privacy",
      kind: "privacy",
      version: "1.0",
      lastUpdatedAt: "2026-09-01",
      body: "Vos données alimentent un registre partagé ; les paiements restent hors application.",
    });
    expect(n.kind).toBe("privacy");
    expect(n.version).toBe("1.0");
  });

  it("refuse une mention « bientôt » (placeholder)", () => {
    expect(() =>
      buildLegalNotice({
        noticeId: "notice-cgu",
        kind: "cgu",
        version: "1.0",
        lastUpdatedAt: "2026-09-01",
        body: "La procédure de plainte arrivera bientôt.",
      }),
    ).toThrow(/placeholder/i);
  });

  it("refuse une promesse de garantie des fonds (communication prudente)", () => {
    expect(() =>
      buildLegalNotice({
        noticeId: "notice-cgu",
        kind: "cgu",
        version: "1.0",
        lastUpdatedAt: "2026-09-01",
        body: "KÓMBE garantit la sécurité et la rentabilité de vos fonds.",
      }),
    ).toThrow(/promesse/i);
  });

  it("refuse une date de mise à jour absente et un identifiant vide", () => {
    expect(() =>
      buildLegalNotice({ noticeId: "x", kind: "cgu", version: "1", lastUpdatedAt: "01/09/2026", body: "ok" }),
    ).toThrow(DomainError);
    expect(() =>
      buildLegalNotice({ noticeId: "  ", kind: "cgu", version: "1", lastUpdatedAt: "2026-09-01", body: "ok" }),
    ).toThrow(/identifiant/i);
  });

  it("les sondes prudentes sont cohérentes avec la mention", () => {
    expect(containsPlaceholder("À venir : détails")).toBe(true);
    expect(containsPlaceholder("Registre de tontines fermé.")).toBe(false);
    expect(isCommunicationPrudente("Aucune garantie du pot.")).toBe(true);
    expect(isCommunicationPrudente("Ceci constitue une preuve légale.")).toBe(false);
    expect(PRIVACY_PRUDENT_NOTICE).toMatch(/ne sont garantis|registre partagé/i);
  });
});

describe("C16 — registre des traitements (13.3)", () => {
  it("accepte un enregistrement factuel complet", () => {
    const r = buildProcessingRecord({
      purpose: "Tenable du registre de cotisations",
      dataCategories: ["identifiant", "nom"],
      legalBasis: "contract",
      recipients: ["membres du groupe"],
      country: "GA",
      retentionDays: 1825,
    });
    expect(r.legalBasis).toBe("contract");
    expect(r.retentionDays).toBe(1825);
  });

  it("refuse catégories vides, base inconnue, durée non entière ou placeholder", () => {
    const base = {
      purpose: "Tenable du registre",
      dataCategories: ["nom"],
      legalBasis: "contract",
      recipients: [],
      country: "GA",
      retentionDays: 10,
    };
    expect(() => buildProcessingRecord({ ...base, dataCategories: [] })).toThrow(/Catégories/i);
    expect(() => buildProcessingRecord({ ...base, legalBasis: "on-prend-ce-qu-on-veut" })).toThrow(/Base/i);
    expect(() => buildProcessingRecord({ ...base, retentionDays: 2.5 })).toThrow(/Durée/i);
    expect(() => buildProcessingRecord({ ...base, retentionDays: -1 })).toThrow(/Durée/i);
    expect(() => buildProcessingRecord({ ...base, purpose: "TBD" })).toThrow(/Finalité/i);
  });
});

describe("C16 — consentement séparé (13.4, C16-CONSENT)", () => {
  it("le refus de recherche ne coupe pas le service cœur d'un membre actif", () => {
    let state = initialConsent("membre_a", NOW);
    state = setConsent(state, "research", false, NOW);
    expect(state.research).toBe(false);
    expect(coreServiceAvailable(state, true)).toBe(true);
  });

  it("un non-membre n'a pas le service cœur, quel que soit son consentement", () => {
    const state = setConsent(initialConsent("membre_b", NOW), "research", true, NOW);
    expect(state.research).toBe(true);
    expect(coreServiceAvailable(state, false)).toBe(false);
  });

  it("catégorie de consentement inconnue refusée ; compensation bornée au temps", () => {
    expect(() => setConsent(initialConsent("m", NOW), "vendre_mes_donnees", true, NOW)).toThrow(
      /cat/i,
    );
    expect(researchCompensationHours(true, 6, 4)).toBe(4);
    expect(researchCompensationHours(false, 6, 4)).toBe(0);
  });
});

describe("C16 — export personnel filtré (18.19, C16-EXPORT)", () => {
  const fields: PersonalField[] = [
    { key: "tel", ownerIdentityId: "A", visibility: "private", value: "+241000000" },
    { key: "note", ownerIdentityId: "A", visibility: "shared", value: "publique-pour-groupe" },
    { key: "telB", ownerIdentityId: "B", visibility: "private", value: "+241999999" },
    { key: "pseudoB", ownerIdentityId: "B", visibility: "public", value: "membre-B" },
  ];

  it("exclut tout champ privé d'autrui (third_party_private_fields = 0)", () => {
    const exported = extractPersonalDataExport("A", fields);
    expect(exported.map((e) => e.key)).toEqual(["tel", "note", "pseudoB"]);
    expect(countThirdPartyPrivateFields(exported, "A")).toBe(0);
  });

  it("sujet vide refusé", () => {
    expect(() => extractPersonalDataExport("", fields)).toThrow(/sujet/i);
  });
});

describe("C16 — demandes de droits, vérification proportionnée (18.19)", () => {
  it("accès et effacement n'exigent pas le même seuil", () => {
    expect(requiredVerificationFor("access")).toBe(1);
    expect(requiredVerificationFor("erasure")).toBe(3);
  });

  it("vérification insuffisante ⇒ en attente, jamais refus ; puis ready au seuil", () => {
    let req = createRightsRequest({ requestId: "rr1", subjectIdentityId: "A", kind: "erasure", now: NOW });
    expect(req.status).toBe("received");
    req = recordVerification(req, 2, NOW);
    expect(req.status).toBe("requires_more_info");
    req = recordVerification(req, 3, NOW);
    expect(req.status).toBe("ready");
    req = fulfillRightsRequest(req, NOW);
    expect(req.status).toBe("fulfilled");
  });

  it("exécution sans seuil atteint ⇒ VERIFICATION_INSUFFISANTE", () => {
    const req = createRightsRequest({ requestId: "rr2", subjectIdentityId: "A", kind: "erasure", now: NOW });
    expect(() => fulfillRightsRequest(req, NOW)).toThrow(/insuffisante/i);
  });

  it("gel sans motif refusé ; gel motivé daté puis exécution impossible", () => {
    let req = createRightsRequest({ requestId: "rr3", subjectIdentityId: "A", kind: "export", now: NOW });
    expect(() => restrictRightsRequest(req, "   ", NOW)).toThrow(/motif/i);
    req = restrictRightsRequest(req, "suspicion de fraude en cours d'examen", NOW);
    expect(req.status).toBe("frozen");
    expect(req.restrictionReason).toMatch(/fraude/i);
    expect(() => fulfillRightsRequest(req, NOW)).toThrow(/gelée/i);
  });

  it("type de droit inconnu et identifiants manquants refusés", () => {
    expect(() =>
      createRightsRequest({ requestId: "rr4", subjectIdentityId: "A", kind: "efface-tout", now: NOW }),
    ).toThrow(/droit/i);
    expect(() =>
      createRightsRequest({ requestId: "", subjectIdentityId: "A", kind: "access", now: NOW }),
    ).toThrow(/identifiants/i);
  });
});

describe("C16 — purge / tombstones / restauration (18.10, C16-RESTORE)", () => {
  const point: RestorePoint = { takenAt: NOW, identities: ["A", "B", "C"] };

  it("effacement idempotent ; restauration réapplique l'effacement", () => {
    let tombs: Tombstone[] = eraseIdentity([], "B", NOW + 100);
    tombs = eraseIdentity(tombs, "B", NOW + 200);
    expect(tombs.length).toBe(1);
    expect(isErased(tombs, "B")).toBe(true);

    const restored = restoreFromPoint(point, tombs, []);
    expect(restored.visible).toEqual(["A", "C"]);
    expect(restored.reAppliedErasures).toBe(1);
    expect(deletedIdentityVisible(point, tombs, "B")).toBe(false);
  });

  it("réapplique aussi les révocations avant réouverture", () => {
    const restored = restoreFromPoint(point, [], ["C"]);
    expect(restored.reAppliedRevocations).toEqual(["C"]);
    expect(restored.visible).toContain("C"); // révocation ≠ effacement
  });

  it("sans effacement, l'identité reste visible", () => {
    expect(deletedIdentityVisible(point, [], "A")).toBe(true);
  });
});

describe("C16 — pseudonymisé n'est pas anonyme", () => {
  it("quasi-identifiants ⇒ risque de réidentification", () => {
    expect(
      assessReidentification({ pseudonym: "p-1", quasiIdentifiers: ["group_A", "treasurer", "5000", "2026-09"] }),
    ).toBe(true);
    expect(assessReidentification({ pseudonym: "p-1", quasiIdentifiers: [] })).toBe(false);
    expect(assessReidentification({ pseudonym: "p-1", quasiIdentifiers: ["", "  "] })).toBe(false);
  });
});
