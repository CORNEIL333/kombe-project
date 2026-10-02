/**
 * Console support — accès **just-in-time**, **double approbation** et
 * **séparation du pouvoir financier** (C17 ; stories 8.5, 9.6, 18.17 ; règle
 * COM05).
 *
 * Logique **pure** et **horloge injectée** (`now` en secondes d'époque) :
 * aucune dépendance à la persistance. Le stockage durable des demandes, la
 * vérification MFA réelle et l'expiration pilotée en base relèvent de
 * `packages/db` (migration 0014) et restent **BLOCKED** sans PostgreSQL. Ici ne
 * vivent que les **décisions** — approbation, périmètre, expiration, refus
 * financier — testables maintenant.
 *
 * Invariants honorés :
 *  - un accès sensible n'est accordé qu'après **deux approbateurs distincts**
 *    de l'applicant et entre eux (COM05) ; sinon `denied`/`pending` jamais d'accès ;
 *  - l'accès est **temporellement borné** (expire automatiquement) ;
 *  - **aucune permission financière** n'existe pour le support : valider,
 *    corriger ou reverser un mouvement financier est structurellement refusé
 *    (18.17 ; C17-FINANCE) ;
 *  - le périmètre est **par groupe** : une action hors du groupe visé est
 *    refusée sans divulgation (anti-IDOR, ADR-0006).
 */
import { DomainError } from "./errors.js";

/**
 * Permissions qu'une console support peut demander. **Volontairement aucune**
 * permission financière : valider une cotisation, corriger un montant ou
 * reverser un décaissement n'est PAS dans cet ensemble (C17-FINANCE).
 */
export const SUPPORT_PERMISSIONS = [
  "view_trace",
  "restore_access",
  "explain_journal",
] as const;
export type SupportPermission = (typeof SUPPORT_PERMISSIONS[number])[number];

/**
 * Actions financières que le support ne peut **jamais** effectuer. Liste
 * explicite pour refus stable ; elle est disjointe de SUPPORT_PERMISSIONS.
 */
export const FINANCIAL_ACTIONS = [
  "validate_contribution",
  "correct_contribution",
  "reverse_disbursement",
] as const;
export type FinancialAction = (typeof FINANCIAL_ACTIONS[number])[number];

/** Nombre minimal d'approbateurs **distincts** pour un accès sensible (COM05). */
export const REQUIRED_APPROVALS = 2;

export const SUPPORT_ACCESS_STATES = [
  "pending_approval",
  "granted",
  "expired",
  "revoked",
] as const;
export type SupportAccessState = (typeof SUPPORT_ACCESS_STATES[number])[number];

export interface SupportAccessRequest {
  readonly requestId: string;
  readonly applicantIdentityId: string;
  readonly targetGroupId: string;
  readonly motif: string;
  readonly permissions: readonly SupportPermission[];
  readonly requestedAt: number;
  readonly expiresAt: number | null;
  readonly approverIds: readonly string[];
  readonly revokedAt: number | null;
  readonly status: SupportAccessState;
}

function isSupportPermission(p: string): p is SupportPermission {
  return (SUPPORT_PERMISSIONS as readonly string[]).includes(p);
}

/**
 * Crée une demande d'accès support en attente d'approbation. Le **motif est
 * obligatoire** (justification de l'accès, 9.6) ; toute permission demandée
 * doit être une permission support connue (une permission financière ou inconnue
 * est refusée à la création, jamais accordée par omission).
 */
export function createSupportAccessRequest(input: {
  requestId: string;
  applicantIdentityId: string;
  targetGroupId: string;
  motif: string;
  permissions: readonly string[];
  now: number;
  ttlSeconds: number;
}): SupportAccessRequest {
  if (typeof input.motif !== "string" || input.motif.trim().length === 0) {
    throw new DomainError("SUPPORT_MOTIF_REQUIRED", "Motif d'accès requis");
  }
  if (!Number.isInteger(input.ttlSeconds) || input.ttlSeconds < 1) {
    throw new DomainError("SUPPORT_ACCESS_EXPIRED", "Durée d'accès invalide");
  }
  const permissions: SupportPermission[] = [];
  for (const p of input.permissions) {
    if (!isSupportPermission(p)) {
      // Permission financière ou inconnue : le support ne peut pas la demander.
      throw new DomainError("PRIVILEGE_NOT_GRANTED", "Permission hors support");
    }
    if (!permissions.includes(p)) permissions.push(p);
  }
  return {
    requestId: input.requestId,
    applicantIdentityId: input.applicantIdentityId,
    targetGroupId: input.targetGroupId,
    motif: input.motif,
    permissions,
    requestedAt: input.now,
    expiresAt: null,
    approverIds: [],
    revokedAt: null,
    status: "pending_approval",
  };
}

/**
 * Enregistre une approbation (COM05). L'approbateur doit être **distinct de
 * l'applicant** et **distinct des approbateurs déjà comptés** (un même compte
 * ne vaut pas deux signatures). À partir de `REQUIRED_APPROVALS` approbateurs
 * distincts, l'accès passe à `granted` et son expiration est posée à compter de
 * cette approbation finale (`now + ttl`). En dessous, la demande reste
 * `pending_approval` : **aucun accès sensible**.
 */
export function approveSupportAccess(
  request: SupportAccessRequest,
  approverIdentityId: string,
  now: number,
  ttlSeconds: number,
): SupportAccessRequest {
  if (request.status !== "pending_approval") {
    // Une demande déjà expirée/révoquée ne se réactive pas par une relance.
    throw new DomainError("SUPPORT_ACCESS_EXPIRED", "Demande non approuvable");
  }
  if (approverIdentityId === request.applicantIdentityId) {
    throw new DomainError("APPROVER_NOT_DISTINCT", "Approbateur = demandeur");
  }
  if (request.approverIds.includes(approverIdentityId)) {
    throw new DomainError("APPROVER_NOT_DISTINCT", "Approbateur déjà compté");
  }
  const approverIds = [...request.approverIds, approverIdentityId];
  const granted = approverIds.length >= REQUIRED_APPROVALS;
  return {
    ...request,
    approverIds,
    status: granted ? "granted" : "pending_approval",
    expiresAt: granted ? now + ttlSeconds : request.expiresAt,
  };
}

/** Révoque immédiatement un accès (fin d'assistance, incident). */
export function revokeSupportAccess(
  request: SupportAccessRequest,
  now: number,
): SupportAccessRequest {
  return { ...request, status: "revoked", revokedAt: now, expiresAt: request.expiresAt };
}

/** Une action financière demandée par le support ? (Liste explicite, disjointe des permissions support.) */
export function isFinancialAction(action: string): action is FinancialAction {
  return (FINANCIAL_ACTIONS as readonly string[]).includes(action);
}

/**
 * Vérifie qu'une action est autorisée par l'accès support courant. Lève une
 * erreur **stable** et **non divulguante** sinon :
 *  - action financière ⇒ `SUPPORT_FINANCIAL_FORBIDDEN` (jamais exécutée, jamais
 *    enregistrée comme permission : C17-FINANCE) ;
 *  - demande non `granted` ou hors de sa fenêtre ⇒ `SUPPORT_ACCESS_EXPIRED` ;
 *  - groupe hors du périmètre accordé ⇒ `PRIVILEGE_NOT_GRANTED` (anti-IDOR) ;
 *  - permission absente de l'octroi ⇒ `PRIVILEGE_NOT_GRANTED`.
 */
export function assertSupportActionAllowed(
  request: SupportAccessRequest,
  action: string,
  groupId: string,
  now: number,
): void {
  if (isFinancialAction(action)) {
    throw new DomainError("SUPPORT_FINANCIAL_FORBIDDEN", "Pouvoir financier interdit au support");
  }
  if (request.status !== "granted") {
    throw new DomainError("SUPPORT_ACCESS_EXPIRED", "Accès non accordé");
  }
  if (request.expiresAt !== null && now >= request.expiresAt) {
    throw new DomainError("SUPPORT_ACCESS_EXPIRED", "Accès expiré");
  }
  if (groupId !== request.targetGroupId) {
    throw new DomainError("PRIVILEGE_NOT_GRANTED", "Hors périmètre");
  }
  if (!isSupportPermission(action) || !request.permissions.includes(action)) {
    throw new DomainError("PRIVILEGE_NOT_GRANTED", "Permission non accordée");
  }
}

/** Décision booléenne (sans lever) pour l'observation `access_allowed` (C17-JIT). */
export function supportAccessAllowed(
  request: SupportAccessRequest,
  action: string,
  groupId: string,
  now: number,
): boolean {
  try {
    assertSupportActionAllowed(request, action, groupId, now);
    return true;
  } catch (e) {
    if (e instanceof DomainError) return false;
    throw e;
  }
}
