/**
 * Tests C18 — mesure du pilote et économie unitaire (logique pure) : funnel
 * analytics en whitelist **pseudonymisée** refusant tout **champ financier
 * individuel** (C18-ANALYTICS : `individual_financial_fields=0`), distinction
 * **tours / cycles / trois cycles** sans annoncer une rétention avant durée
 * observée (C18-COHORT : `eligible_three_cycle_retention=false`), **paiement
 * réel ≠ promesse** avec **dénominateurs** et taux entiers (C18-PAYERS :
 * `gate_g2_met=false` à 2/10), économie unitaire en **XAF entier**, et registre
 * des risques où un **critique sans contrôle effectif bloque l'extension**. La
 * durabilité (RLS d'agrégats, append-only, CHECK) reste BLOCKED sans PostgreSQL.
 */
import { describe, expect, it } from "vitest";
import {
  DomainError,
  ratePercent,
  buildAnalyticsEvent,
  individualFinancialFieldCount,
  findSensitiveKeys,
  exportAnalytics,
  countFinancialFieldsInExport,
  funnelCounts,
  ANALYTICS_STEPS,
  buildCohort,
  completedCycles,
  eligibleThreeCycleRetention,
  countRealPayers,
  gateG2Met,
  computeUnitEconomics,
  completenessRatePercent,
  PILOT_THRESHOLDS,
  buildRisk,
  hasEffectiveControl,
  blocksPilotExtension,
  assertPilotExtensionAllowed,
  type PaymentSignal,
} from "../src/index.js";

const NOW = 1_758_000_000; // horodatage serveur fictif (secondes d'époque)

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof DomainError) return e.code;
    throw e;
  }
  throw new Error("aucune DomainError levée");
}

describe("C18 ratePercent — dénominateurs et calcul entier", () => {
  it("plancher entier, jamais de flottant", () => {
    expect(ratePercent(2, 10)).toBe(20);
    expect(ratePercent(1, 3)).toBe(33); // floor(33.33)
    expect(ratePercent(30, 10)).toBe(300); // taux peuvent dépasser 100 (ratios bruts)
  });
  it("dénominateur nul refusé (jamais de division silencieuse)", () => {
    expect(code(() => ratePercent(1, 0))).toBe("METRICS_DENOMINATEUR_NUL");
  });
  it("valeur négative ou non entière refusée", () => {
    expect(code(() => ratePercent(-1, 10))).toBe("METRICS_VALEUR_INVALIDE");
    expect(code(() => ratePercent(1.5, 10))).toBe("METRICS_VALEUR_INVALIDE");
  });
});

describe("C18 funnel analytics — whitelist + non-divulgation (C18-ANALYTICS)", () => {
  it("accepte une étape connue et conserve les clés propres", () => {
    const ev = buildAnalyticsEvent({
      eventId: "ev1",
      cohortId: "cohort_A",
      step: "premiere_contribution",
      occurredAt: NOW,
      properties: { device: "android", locale: "fr", campaign: "onboarding" },
    });
    expect(ev.step).toBe("premiere_contribution");
    expect(Object.keys(ev.properties).sort()).toEqual(["campaign", "device", "locale"]);
  });
  it("refuse une étape hors whitelist", () => {
    expect(code(() => buildAnalyticsEvent({ eventId: "e", cohortId: "c", step: "retractation", occurredAt: NOW })))
      .toBe("METRICS_ETAPE_ANALYTICS_INCONNUE");
  });
  it("refuse id éventuel/cohort vide", () => {
    expect(code(() => buildAnalyticsEvent({ eventId: "  ", cohortId: "c", step: "visite", occurredAt: NOW })))
      .toBe("METRICS_IDENTIFIANT_REQUIS");
  });
  it("refuse un champ financier individuel (montant)", () => {
    expect(code(() =>
      buildAnalyticsEvent({
        eventId: "e",
        cohortId: "c",
        step: "premiere_contribution",
        occurredAt: NOW,
        properties: { montant: 5000 },
      }),
    )).toBe("METRICS_CHAMPS_FINANCIER_INDIVIDUEL");
  });
  it("refuse une référence ou un commentaire individuel", () => {
    expect(code(() =>
      buildAnalyticsEvent({ eventId: "e", cohortId: "c", step: "visite", occurredAt: NOW, properties: { reference: "TX-9" } }),
    )).toBe("METRICS_CHAMPS_FINANCIER_INDIVIDUEL");
    expect(code(() =>
      buildAnalyticsEvent({ eventId: "e", cohortId: "c", step: "visite", occurredAt: NOW, properties: { commentaire: "secret" } }),
    )).toBe("METRICS_CHAMPS_FINANCIER_INDIVIDUEL");
  });
  it("refuse une identité personnelle (memberId/email) — reste pseudonymisé", () => {
    expect(code(() =>
      buildAnalyticsEvent({ eventId: "e", cohortId: "c", step: "visite", occurredAt: NOW, properties: { memberId: "u1" } }),
    )).toBe("METRICS_CHAMPS_FINANCIER_INDIVIDUEL");
    expect(findSensitiveKeys({ identityId: "x", device: "ios" })).toEqual(["identityId"]);
  });
  it("individualFinancialFieldCount ne compte que le financier", () => {
    expect(individualFinancialFieldCount({ device: "ios", cotisation: 1, balance: 2 })).toBe(2);
  });
  it("C18-ANALYTICS : export => individual_financial_fields = 0", () => {
    const rows = exportAnalytics([
      buildAnalyticsEvent({ eventId: "a", cohortId: "A", step: "visite", occurredAt: NOW, properties: { locale: "fr" } }),
      buildAnalyticsEvent({ eventId: "b", cohortId: "A", step: "demarrage", occurredAt: NOW, properties: { campaign: "pilote" } }),
    ]);
    expect(countFinancialFieldsInExport(rows)).toBe(0);
  });
  it("funnelCounts suit l'ordre des étapes (nombres bruts)", () => {
    const events = [
      buildAnalyticsEvent({ eventId: "a", cohortId: "A", step: "visite", occurredAt: NOW }),
      buildAnalyticsEvent({ eventId: "b", cohortId: "A", step: "visite", occurredAt: NOW }),
      buildAnalyticsEvent({ eventId: "c", cohortId: "A", step: "cycle_termine", occurredAt: NOW }),
    ];
    const counts = funnelCounts(events);
    expect(counts.map((c) => c.step)).toEqual([...ANALYTICS_STEPS]);
    expect(counts.find((c) => c.step === "visite")?.count).toBe(2);
    expect(counts.find((c) => c.step === "cycle_termine")?.count).toBe(1);
  });
});

describe("C18 cohortes — tours / cycles / trois cycles (C18-COHORT)", () => {
  it("un cycle = rotation complète = memberCount tours", () => {
    const c = buildCohort({ groupId: "group_A", memberCount: 10, roundsCompleted: 3 });
    expect(completedCycles(c)).toBe(0); // 3 tours < 10 = pas un cycle complet
    expect(eligibleThreeCycleRetention(c)).toBe(false);
  });
  it("trois cycles = memberCount × 3 tours achevés", () => {
    const c = buildCohort({ groupId: "g", memberCount: 10, roundsCompleted: 30 });
    expect(completedCycles(c)).toBe(3);
    expect(eligibleThreeCycleRetention(c)).toBe(true);
  });
  it("29 tours sur 10 = 2 cycles → non éligible trois cycles", () => {
    const c = buildCohort({ groupId: "g", memberCount: 10, roundsCompleted: 29 });
    expect(completedCycles(c)).toBe(2);
    expect(eligibleThreeCycleRetention(c)).toBe(false);
  });
  it("cohorte invalide refusée", () => {
    expect(code(() => buildCohort({ groupId: "  ", memberCount: 10, roundsCompleted: 3 })))
      .toBe("METRICS_IDENTIFIANT_REQUIS");
    expect(code(() => buildCohort({ groupId: "g", memberCount: 0, roundsCompleted: 3 })))
      .toBe("METRICS_VALEUR_INVALIDE");
    expect(code(() => completedCycles({ groupId: "g", memberCount: 0, roundsCompleted: 3 })))
      .toBe("METRICS_DENOMINATEUR_NUL");
  });
});

describe("C18 économie unitaire — paiement réel ≠ promesse, XAF entier (C18-PAYERS)", () => {
  const sig = (n: number, s: PaymentSignal["status"]): PaymentSignal[] =>
    Array.from({ length: n }, () => ({ status: s }));

  it("countRealPayers exclut les promesses", () => {
    expect(countRealPayers([...sig(2, "paid"), ...sig(8, "promised")])).toBe(2);
  });
  it("C18-PAYERS : 2 payeurs réels / 10 exposés => gate_g2_met = false", () => {
    expect(gateG2Met(10, [...sig(2, "paid"), ...sig(8, "promised")])).toBe(false);
  });
  it("3/10 = 30 % >= seuil => true ; 0 payeur => false", () => {
    expect(gateG2Met(10, sig(3, "paid"))).toBe(true);
    expect(gateG2Met(10, sig(10, "promised"))).toBe(false);
  });
  it("seuil exploratoire documenté (25 %) jamais une promesse", () => {
    expect(PILOT_THRESHOLDS.paymentRealPercent).toBe(25);
  });
  it("computeUnitEconomics : coût support = minutes × coût/minute (entier), totaux cohérents", () => {
    const v = computeUnitEconomics({
      exposedMembers: 10,
      paymentSignals: [...sig(2, "paid"), ...sig(8, "promised")],
      supportMinutes: 120,
      supportCostPerMinuteMinor: 50n,
      infrastructureCostMinor: 10_000n,
      cancellations: 1,
      taxesMinor: 500n,
    });
    expect(v.realPayers).toBe(2);
    expect(v.promisedOnly).toBe(8);
    expect(v.paymentRealPercent).toBe(20);
    expect(v.gateG2Met).toBe(false);
    expect(v.supportCostMinor).toBe(6000n); // 120 × 50
    expect(v.totalCostMinor).toBe(6000n + 10_000n + 500n);
  });
  it("refuse un coût monétaire négatif (oracle money)", () => {
    expect(code(() =>
      computeUnitEconomics({
        exposedMembers: 10,
        paymentSignals: [],
        supportMinutes: 0,
        supportCostPerMinuteMinor: -1n,
        infrastructureCostMinor: 0n,
        cancellations: 0,
        taxesMinor: 0n,
      }),
    )).toBe("MONEY_NEGATIVE");
  });
  it("complétude != solvabilité : taux distinct, dénominateur exigé", () => {
    expect(completenessRatePercent(9, 10)).toBe(90);
    expect(code(() => completenessRatePercent(1, 0))).toBe("METRICS_DENOMINATEUR_NUL");
  });
});

describe("C18 registre des risques — critique sans contrôle bloque l'extension", () => {
  const base = {
    riskId: "r1",
    severity: "eleve",
    probabilityPercent: 40,
    impactPercent: 60,
    control: "double vérification",
    evidenceRef: "docs/PREUVES",
    owner: "lead",
    reviewedAt: "2026-10-01",
    residual: "faible",
  };
  it("risque valide", () => {
    expect(hasEffectiveControl(buildRisk(base))).toBe(true);
  });
  it("sévérité inconnue refusée", () => {
    expect(code(() => buildRisk({ ...base, severity: "catastrophique" }))).toBe("METRICS_SEVERITE_INCONNUE");
  });
  it("bornes et date validées", () => {
    expect(code(() => buildRisk({ ...base, probabilityPercent: 101 }))).toBe("METRICS_VALEUR_INVALIDE");
    expect(code(() => buildRisk({ ...base, reviewedAt: "01/10/2026" }))).toBe("METRICS_VALEUR_INVALIDE");
    expect(code(() => buildRisk({ ...base, riskId: "  " }))).toBe("METRICS_IDENTIFIANT_REQUIS");
  });
  it("contrôle effectif exige preuve + propriétaire + contrôle", () => {
    expect(hasEffectiveControl(buildRisk({ ...base, owner: "   " }))).toBe(false);
    expect(hasEffectiveControl(buildRisk({ ...base, evidenceRef: "" }))).toBe(false);
  });
  it("risque critique sans contrôle effectif bloque l'extension", () => {
    const risky = buildRisk({ ...base, severity: "critique", control: "", evidenceRef: "", owner: "" });
    expect(blocksPilotExtension([risky])).toBe(true);
    expect(code(() => assertPilotExtensionAllowed([risky]))).toBe("METRICS_RISQUE_CRITIQUE_SANS_CONTROLE");
  });
  it("critique AVEC contrôle effectif n bloque pas ; élevé sans contrôle non plus", () => {
    const okCrit = buildRisk({ ...base, severity: "critique" });
    expect(blocksPilotExtension([okCrit])).toBe(false);
    expect(assertPilotExtensionAllowed([okCrit])).toBeUndefined();
    const eleveSans = buildRisk({ ...base, control: "" });
    expect(blocksPilotExtension([eleveSans])).toBe(false); // seul « critique » bloque
  });
});
