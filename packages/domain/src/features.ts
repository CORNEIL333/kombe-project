/**
 * Registre de fonctionnalités et barrières serveur du pilote (G0).
 *
 * Le pilote n'effectue AUCUN transfert du pot, et aucune fonction future
 * (wallet, prêt, scoring, assurance, IA) n'est activable : chaque module
 * futur reste un flag serveur FERMÉ avec condition de décision séparée
 * (00_PROMPT_MAITRE ; STACK.md §Contraintes). Masquer l'UI ne suffit pas :
 * le serveur refuse. Ce module est la source de vérité de ce refus.
 */
import { DomainError } from "./errors.js";

export type ForbiddenFeature =
  | "wallet"
  | "loan"
  | "scoring"
  | "insurance"
  | "potAutoTransfer"
  | "aiModel";

export const FORBIDDEN_FEATURES: readonly ForbiddenFeature[] = [
  "wallet",
  "loan",
  "scoring",
  "insurance",
  "potAutoTransfer",
  "aiModel",
];

/** État des barrières : toutes fermées par défaut pour le socle G0. */
export type FeatureGates = { readonly [K in ForbiddenFeature]: boolean };

export const PILOT_FEATURE_GATES: FeatureGates = Object.freeze({
  wallet: false,
  loan: false,
  scoring: false,
  insurance: false,
  potAutoTransfer: false,
  aiModel: false,
});

export function featureEnabled(gates: FeatureGates, feature: ForbiddenFeature): boolean {
  return gates[feature] === true;
}

/**
 * Refus serveur d'une fonction interdite au pilote. Lève si une feature
 * prohibée est ouverte. Utilisé par l'adaptateur C00-SCOPE pour prouver
 * `pilot_forbidden_feature_enabled = false` sur un montage qui la demande.
 */
export function assertNoForbiddenFeatureEnabled(gates: FeatureGates): void {
  const opened = FORBIDDEN_FEATURES.filter((f) => featureEnabled(gates, f));
  if (opened.length > 0) {
    throw new DomainError(
      "FEATURE_PILOT_FORBIDDEN",
      `Fonctionnalité interdite au pilote demandée : ${opened.join(",")}`,
    );
  }
}

/** Le serveur refuse une demande qui réclame une feature fermée. */
export function requestFeature(
  gates: FeatureGates,
  feature: ForbiddenFeature,
): { readonly enabled: boolean; readonly rejected: boolean } {
  const enabled = featureEnabled(gates, feature);
  return { enabled, rejected: !enabled };
}
