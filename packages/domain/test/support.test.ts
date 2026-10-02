/**
 * Tests C17 — console support : accès JIT à double approbation (COM05),
 * expiration automatique, séparation stricte du pouvoir financier, et journal
 * de sécurité expurgé (logique pure, horloge injectée). La persistance durable
 * (migrations 0014, alerte temps réel, MFA) reste BLOCKED sans PostgreSQL.
 */
import { describe, expect, it } from "vitest";
import {
  DomainError,
  createSupportAccessRequest,
  approveSupportAccess,
  revokeSupportAccess,
  assertSupportActionAllowed,
  supportAccessAllowed,
  isFinancialAction,
  REQUIRED_APPROVALS,
  redactSensitiveText,
  recordSecurityEvent,
  redactProviderError,
  type SupportAccessRequest,
} from "../src/index.js";

const codes = (fn: () => unknown): string | null => {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof DomainError ? e.code : "NOT_DOMAIN";
  }
};

const T0 = 1_700_000_000;
const TTL = 1800; // 30 min fictives

const demande = (over: Partial<SupportAccessRequest> = {}): SupportAccessRequest => ({
  requestId: "req_1",
  applicantIdentityId: "idn_support",
  targetGroupId: "grpA",
  motif: "aide rétablissement accès",
  permissions: ["restore_access"],
  requestedAt: T0,
  expiresAt: null,
  approverIds: [],
  revokedAt: null,
  status: "pending_approval",
  ...over,
});

describe("C17 création de demande — motif requis (9.6)", () => {
  it("refuse un motif vide", () => {
    expect(
      codes(() =>
        createSupportAccessRequest({
          requestId: "r", applicantIdentityId: "a", targetGroupId: "grpA",
          motif: "   ", permissions: ["view_trace"], now: T0, ttlSeconds: TTL,
        }),
      ),
    ).toBe("SUPPORT_MOTIF_REQUIRED");
  });

  it("refuse une permission financière dès la création", () => {
    expect(
      codes(() =>
        createSupportAccessRequest({
          requestId: "r", applicantIdentityId: "a", targetGroupId: "grpA",
          motif: "x", permissions: ["validate_contribution"], now: T0, ttlSeconds: TTL,
        }),
      ),
    ).toBe("PRIVILEGE_NOT_GRANTED");
  });

  it("accepte des permissions support et reste en attente d'approbation", () => {
    const r = createSupportAccessRequest({
      requestId: "r", applicantIdentityId: "a", targetGroupId: "grpA",
      motif: "justifié", permissions: ["view_trace", "restore_access"], now: T0, ttlSeconds: TTL,
    });
    expect(r.status).toBe("pending_approval");
    expect(r.approverIds).toHaveLength(0);
  });
});

describe("C17 double approbation COM05", () => {
  it("un seul approbateur ne suffit pas : pas d'accès", () => {
    const base = demande();
    const one = approveSupportAccess(base, "idn_appr1", T0, TTL);
    expect(one.status).toBe("pending_approval");
    // Tentative d'action alors qu'un seul approbateur → accès refusé.
    expect(supportAccessAllowed(one, "restore_access", "grpA", T0 + 1)).toBe(false);
  });

  it("l'approbateur ne peut pas être le demandeur", () => {
    expect(codes(() => approveSupportAccess(demande(), "idn_support", T0, TTL))).toBe(
      "APPROVER_NOT_DISTINCT",
    );
  });

  it("deux approbateurs identiques ne comptent pas deux fois", () => {
    const one = approveSupportAccess(demande(), "idn_appr1", T0, TTL);
    expect(codes(() => approveSupportAccess(one, "idn_appr1", T0, TTL))).toBe("APPROVER_NOT_DISTINCT");
  });

  it("deux approbateurs distincts → granted avec expiration posée", () => {
    const one = approveSupportAccess(demande(), "idn_appr1", T0, TTL);
    const two = approveSupportAccess(one, "idn_appr2", T0 + 10, TTL);
    expect(two.status).toBe("granted");
    expect(two.approverIds).toHaveLength(REQUIRED_APPROVALS);
    expect(two.expiresAt).toBe(T0 + 10 + TTL);
    expect(supportAccessAllowed(two, "restore_access", "grpA", T0 + 11)).toBe(true);
  });
});

describe("C17-JIT expiration et périmètre", () => {
  const granted = () => {
    const one = approveSupportAccess(demande(), "idn_appr1", T0, TTL);
    return approveSupportAccess(one, "idn_appr2", T0, TTL);
  };

  it("accès expiré → access_allowed = false", () => {
    const g = granted();
    expect(supportAccessAllowed(g, "restore_access", "grpA", (g.expiresAt ?? 0) + 1)).toBe(false);
    expect(
      codes(() => assertSupportActionAllowed(g, "restore_access", "grpA", (g.expiresAt ?? 0) + 1)),
    ).toBe("SUPPORT_ACCESS_EXPIRED");
  });

  it("action hors du groupe visé → refus sans divulgation (anti-IDOR)", () => {
    expect(supportAccessAllowed(granted(), "restore_access", "grpB", T0 + 1)).toBe(false);
    expect(codes(() => assertSupportActionAllowed(granted(), "restore_access", "grpB", T0 + 1))).toBe(
      "PRIVILEGE_NOT_GRANTED",
    );
  });

  it("permission non accordée → refus", () => {
    // granted n'a que "restore_access" (demande par défaut).
    expect(supportAccessAllowed(granted(), "explain_journal", "grpA", T0 + 1)).toBe(false);
  });

  it("révocation immédiate coupe l'accès", () => {
    const g = revokeSupportAccess(granted(), T0 + 5);
    expect(g.status).toBe("revoked");
    expect(supportAccessAllowed(g, "restore_access", "grpA", T0 + 6)).toBe(false);
  });
});

describe("C17-FINANCE : aucun pouvoir financier pour le support", () => {
  it("toute action financière est interdite, même sur accès granted", () => {
    const one = approveSupportAccess(demande(), "idn_appr1", T0, TTL);
    const g = approveSupportAccess(one, "idn_appr2", T0, TTL);
    for (const fin of ["validate_contribution", "correct_contribution", "reverse_disbursement"]) {
      expect(isFinancialAction(fin)).toBe(true);
      expect(supportAccessAllowed(g, fin, "grpA", T0 + 1)).toBe(false);
      expect(codes(() => assertSupportActionAllowed(g, fin, "grpA", T0 + 1))).toBe(
        "SUPPORT_FINANCIAL_FORBIDDEN",
      );
    }
    // validation_accepted = false : absence d'effet (la décision lève avant exécution).
    expect(codes(() => assertSupportActionAllowed(g, "validate_contribution", "grpA", T0 + 1))).toBe(
      "SUPPORT_FINANCIAL_FORBIDDEN",
    );
  });
});

describe("C17-LOGS : journal de sécurité expurgé", () => {
  const tel = "+241 01 23 45 67";
  const ref = "TXN-AB12CD34";

  it("redactSensitiveText masque téléphone et référence de paiement", () => {
    const out = redactSensitiveText(`client ${tel} paiement ${ref} réglé`);
    expect(out).not.toContain(tel);
    expect(out).not.toContain("TXN-AB12CD34");
    expect(out).not.toContain("01 23 45 67");
    expect(out).toContain("[tél masqué]");
    expect(out).toContain("[réf masquée]");
  });

  it("la rédaction est idempotente", () => {
    const once = redactSensitiveText(`appel ${tel} réf ${ref}`);
    expect(redactSensitiveText(once)).toBe(once);
  });

  it("recordSecurityEvent ne consigne jamais la canary sensible", () => {
    const ev = recordSecurityEvent({
      eventType: "support_financial_action_refused",
      actorIdentityId: "idn_support",
      groupId: "grpA",
      occurredAt: T0,
      detail: `refus sur compte ${tel} référence ${ref}`,
    });
    expect(ev.detail).not.toContain(tel);
    expect(ev.detail).not.toContain(ref);
    expect(ev.eventType).toBe("support_financial_action_refused");
  });

  it("un type d'événement inconnu n'est pas ajouté au flux sensible", () => {
    const ev = recordSecurityEvent({
      eventType: "truffe", actorIdentityId: "a", groupId: "grpA", occurredAt: T0, detail: "x",
    });
    expect(ev.eventType).toBe("support_access_denied");
  });

  it("redactProviderError expurge le message brut d'un prestataire", () => {
    const raw = `Gateway error for ${tel} ref ${ref} amount 12345678`;
    const safe = redactProviderError(raw);
    expect(safe).not.toContain(tel);
    expect(safe).not.toContain(ref);
    expect(safe).not.toContain("12345678");
  });
});
