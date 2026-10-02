/**
 * Journal de sécurité **séparé** et **expurgé** (C17 ; stories 9.7, 14.7).
 *
 * Deux règles structurantes :
 *  - **aucun contenu financier individuel** (montant, solde, référence de
 *    paiement) n'est consigné en clair (story 14.7, ADR-0002) ;
 *  - toute **donnée sensible** (numéro de téléphone, référence de transaction)
 *    est **masquée avant écriture**, y compris dans le message brut d'une erreur
 *    de prestataire (C17-LOGS : `sensitive_canary_in_logs = false`).
 *
 * Logique **pure** : la persistance durable et l'alerte temps réel relèvent de
 * `packages/db` (migration 0014, table `security_log`) et de l'infrastructure
 * d'observabilité, **BLOCKED** sans hôte déployé. Ici vit la **décision** de
 * rédaction, testable maintenant. Le journal de sécurité n'est PAS le journal
 * métier append-only (C11) : flux distinct, sortant minimal.
 */

/** Masque les suites chiffrées de type téléphone (avec séparateurs tolérés). */
const PHONE_RE = /\+?\d[\d\s().-]{6,}\d/g;
/** Masque les références de paiement/canal (TXN/REF/MTN/ORANGE/CANAL + jeton). */
const PAY_REF_RE = /\b(?:TXN|REF|MTN|ORANGE|CANAL)[- _]?[A-Z0-9]{4,}\b/gi;
/** Masque toute longue suite résiduelle de chiffres (filets de sécurité). */
const DIGIT_RUN_RE = /\b\d{6,}\b/g;

/**
 * Expurge les données sensibles d'une chaîne : téléphones, références de
 * paiement, puis suites numériques résiduelles. Idempotent : re-appliqué sur une
 * sortie déjà masquée ne change rien. N'altère pas le texte non sensible.
 */
export function redactSensitiveText(input: string): string {
  if (typeof input !== "string") return "";
  return input
    .replace(PHONE_RE, "[tél masqué]")
    .replace(PAY_REF_RE, "[réf masquée]")
    .replace(DIGIT_RUN_RE, "[chiffré masqué]");
}

/** Types d'événements de sécurité consignables (whitelist, pas de payload libre). */
export const SECURITY_EVENT_TYPES = [
  "support_access_requested",
  "support_access_approved",
  "support_access_granted",
  "support_access_denied",
  "support_financial_action_refused",
  "role_change",
  "otp_failure",
  "mass_account_creation",
] as const;
export type SecurityEventType = (typeof SECURITY_EVENT_TYPES[number])[number];

export interface SecurityEvent {
  readonly eventType: SecurityEventType;
  readonly actorIdentityId: string;
  readonly groupId: string;
  readonly occurredAt: number;
  /** Détail **expurgé** ; ne contient jamais de donnée sensible en clair. */
  readonly detail: string;
}

/**
 * Construit une entrée de journal de sécurité en **appliquant la rédaction** au
 * détail fourni. Le type doit être dans la whitelist (un type inconnu est refusé
 * — on n'ajoute pas de catégorie non maîtrisée au flux sensible).
 */
export function recordSecurityEvent(input: {
  eventType: string;
  actorIdentityId: string;
  groupId: string;
  occurredAt: number;
  detail: string;
}): SecurityEvent {
  if (!(SECURITY_EVENT_TYPES as readonly string[]).includes(input.eventType)) {
    // Type non reconnu : journalisé comme refus, jamais comme événement arbitraire.
    return {
      eventType: "support_access_denied",
      actorIdentityId: input.actorIdentityId,
      groupId: input.groupId,
      occurredAt: input.occurredAt,
      detail: "[type non reconnu]",
    };
  }
  return {
    eventType: input.eventType as SecurityEventType,
    actorIdentityId: input.actorIdentityId,
    groupId: input.groupId,
    occurredAt: input.occurredAt,
    detail: redactSensitiveText(input.detail),
  };
}

/**
 * Prêt pour le chemin d'erreur (C17-LOGS) : le message **brut** d'un prestataire
 * (peut contenir téléphone/référence) est expurgé avant toute consignation.
 * Retourne une string sans donnée sensible ; l'appelant l'insère dans un
 * `recordSecurityEvent`.
 */
export function redactProviderError(rawMessage: string): string {
  return redactSensitiveText(rawMessage);
}
