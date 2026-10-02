/**
 * Store FICTIF en mémoire pour la recette C17 — console support : demandes
 * d'accès **just-in-time**, **double approbation** (COM05), expiration
 * automatique, **séparation stricte du pouvoir financier** (18.17) et journal
 * de sécurité **expurgé** (9.7, 14.7). Il délègue TOUTE décision aux fonctions
 * pures de `@kombe/domain` (`support.ts`, `securityLog.ts`) : création de la
 * demande (motif obligatoire, permission financière refusée d'emblée),
 * approbation par des identités **distinctes** de l'applicant et entre elles,
 * granted seulement au seuil de deux, expiration jugée sur une **horloge
 * SERVEUR injectée**, action hors périmètre ou non accordée refusée sans
 * divulgation (anti-IDOR), et action financière **structurellement interdite**.
 *
 * Comme les autres stores, il ne prétend NI persister, NI vérifier une session
 * réelle, NI appliquer un MFA : la durabilité des demandes, la contrainte
 * `PRIMARY KEY` d'approbateurs distincts, l'expiration pilotée en base, la
 * `security_log` append-only et la RLS sont le contrat SQL de la migration
 * `0014_support_security` — preuve base réelle **BLOCKED** sans PostgreSQL
 * (ADR-0006 / ADR-0007). Le journal de sécurité n'est PAS le journal métier
 * append-only (C11) : flux **distinct**, sortant minimal, détail **expurgé avant
 * écriture** (`recordSecurityEvent`) — la canary sensible ne pénètre jamais le
 * log (C17-LOGS : `sensitive_canary_in_logs = false`). L'horodatage est une date
 * SERVEUR INJECTÉE (`x-server-date`, fictif ; résolu C01 via session + horloge
 * serveur) : le client ne décide JAMAIS un `actor_id`, une expiration, ni un
 * montant — le support n'a aucun pouvoir financier.
 */
import {
  DomainError,
  approveSupportAccess,
  assertSupportActionAllowed,
  createSupportAccessRequest,
  recordSecurityEvent,
  redactProviderError,
  revokeSupportAccess,
  supportAccessAllowed,
  REQUIRED_APPROVALS,
  type SecurityEvent,
  type SupportAccessRequest,
  type SupportAccessState,
  type SupportPermission,
} from "@kombe/domain";

export interface SupportContext {
  readonly actorIdentityId: string;
  readonly actorRole: string;
  readonly actorGroupIds: readonly string[];
  /** Horloge SERVEUR en secondes d'époque (injectée ; jamais fournie par le client). */
  readonly serverNow: number;
  readonly commandId: string;
}

interface HeldAccess {
  request: SupportAccessRequest;
  version: number;
}

export interface CreateAccessCommand {
  readonly requestId: string;
  readonly targetGroupId: string;
  readonly motif: string;
  readonly permissions: readonly string[];
  readonly ttlSeconds: number;
}

export interface SupportAccessView {
  readonly requestId: string;
  readonly applicantIdentityId: string;
  readonly targetGroupId: string;
  readonly motif: string;
  readonly permissions: readonly SupportPermission[];
  readonly approverCount: number;
  readonly requiredApprovals: number;
  readonly requestedAt: number;
  readonly expiresAt: number | null;
  readonly status: SupportAccessState;
  readonly version: number;
}

export interface ActionReceipt {
  readonly requestId: string;
  readonly action: string;
  readonly groupId: string;
  readonly accessAllowed: boolean;
  readonly version: number;
}

export class FictitiousSupportStore {
  private readonly held = new Map<string, HeldAccess>();
  /** Journal de sécurité séparé (expurgé) — distinct du journal métier C11. */
  private readonly securityLog: SecurityEvent[] = [];

  private log(ctx: SupportContext, groupId: string, eventType: string, detail: string): void {
    // recordSecurityEvent applique la rédaction : le détail sensible ne survit pas.
    this.securityLog.push(
      recordSecurityEvent({
        eventType,
        actorIdentityId: ctx.actorIdentityId,
        groupId,
        occurredAt: ctx.serverNow,
        detail,
      }),
    );
  }

  private require(requestId: string): HeldAccess {
    const held = this.held.get(requestId);
    if (!held) {
      // Non-divulgation : une demande inconnue répond comme une réservation absente
      // (404), sans révéler son existence ni son groupe visé.
      throw new DomainError("RESERVATION_INCOHERENTE", "Demande d'accès introuvable");
    }
    return held;
  }

  /** Garde de LECTURE : authentification uniquement (une lecture ne mute rien). */
  private gateAuth(ctx: SupportContext): void {
    if (!ctx.actorIdentityId) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    }
  }

  private static toView(held: HeldAccess): SupportAccessView {
    const r = held.request;
    return {
      requestId: r.requestId,
      applicantIdentityId: r.applicantIdentityId,
      targetGroupId: r.targetGroupId,
      motif: r.motif,
      permissions: r.permissions,
      approverCount: r.approverIds.length,
      requiredApprovals: REQUIRED_APPROVALS,
      requestedAt: r.requestedAt,
      expiresAt: r.expiresAt,
      status: r.status,
      version: held.version,
    };
  }

  /**
   * Crée une demande d'accès support (9.6). Le demandeur = identité résolue
   * serveur. Le **motif est obligatoire** et toute permission financière ou
   * inconnue est refusée par le domaine à la création (`PRIVILEGE_NOT_GRANTED`) ;
   * la demande naît `pending_approval`, **zéro accès sensible**. Un événement
   * de sécurité **expurgé** est consigné (le motif peut contenir une donnée
   * sensible : elle ne survit pas au log).
   */
  request(ctx: SupportContext, input: CreateAccessCommand): SupportAccessView {
    this.gateAuth(ctx);
    if (this.held.has(input.requestId)) {
      throw new DomainError("EVENT_CHAIN_BREAK", "Demande déjà enregistrée");
    }
    const request = createSupportAccessRequest({
      requestId: input.requestId,
      applicantIdentityId: ctx.actorIdentityId,
      targetGroupId: input.targetGroupId,
      motif: input.motif,
      permissions: input.permissions,
      now: ctx.serverNow,
      ttlSeconds: input.ttlSeconds,
    });
    this.held.set(input.requestId, { request, version: 1 });
    this.log(ctx, input.targetGroupId, "support_access_requested", input.motif);
    return FictitiousSupportStore.toView(this.require(input.requestId));
  }

  /**
   * Enregistre une approbation (COM05) au nom de l'identité **résolue serveur**.
   * Le domaine refuse l'approbateur identique à l'applicant ou déjà compté
   * (`APPROVER_NOT_DISTINCT`). Au seuil de deux approbateurs distincts, l'accès
   * passe `granted` (expiration posée) ; en dessous, reste `pending_approval`.
   */
  approve(ctx: SupportContext, requestId: string, ttlSeconds: number): SupportAccessView {
    this.gateAuth(ctx);
    const held = this.require(requestId);
    const wasPending = held.request.status === "pending_approval";
    held.request = approveSupportAccess(
      held.request,
      ctx.actorIdentityId,
      ctx.serverNow,
      ttlSeconds,
    );
    held.version += 1;
    if (held.request.status === "granted" && wasPending) {
      this.log(ctx, held.request.targetGroupId, "support_access_granted", held.request.requestId);
    } else {
      this.log(ctx, held.request.targetGroupId, "support_access_approved", held.request.requestId);
    }
    return FictitiousSupportStore.toView(held);
  }

  /**
   * Épreuve d'une action sensible (8.5, 18.17, C17-JIT). Le domaine juge : une
   * action financière lève `SUPPORT_FINANCIAL_FORBIDDEN` (jamais exécutée) ; un
   * accès non granted/expiré `SUPPORT_ACCESS_EXPIRED` ; un hors-périmètre ou une
   * permission absente `PRIVILEGE_NOT_GRANTED`. Le refus est consigné (expurgé)
   * puis remonté ; une action financière refusée est consignée sous son type
   * dédié. Une action **autorisée** ne mute pas la demande (version inchangée) et
   * ne crée aucun événement sensible superflu.
   */
  act(ctx: SupportContext, requestId: string, action: string): ActionReceipt {
    this.gateAuth(ctx);
    const held = this.require(requestId);
    const groupId = held.request.targetGroupId;
    try {
      assertSupportActionAllowed(held.request, action, groupId, ctx.serverNow);
    } catch (e) {
      if (e instanceof DomainError) {
        const eventType =
          e.code === "SUPPORT_FINANCIAL_FORBIDDEN"
            ? "support_financial_action_refused"
            : "support_access_denied";
        this.log(ctx, groupId, eventType, `${action} : ${redactProviderError(e.message)}`);
      }
      throw e;
    }
    return { requestId, action, groupId, accessAllowed: true, version: held.version };
  }

  /** Révocation immédiate (fin d'assistance / incident) — coupe l'accès. */
  revoke(ctx: SupportContext, requestId: string): SupportAccessView {
    this.gateAuth(ctx);
    const held = this.require(requestId);
    held.request = revokeSupportAccess(held.request, ctx.serverNow);
    held.version += 1;
    this.log(ctx, held.request.targetGroupId, "support_access_denied", `revoke ${requestId}`);
    return FictitiousSupportStore.toView(held);
  }

  /** Vue authentifiée et SCOPEE : le groupe du chemin doit être le groupe visé. */
  view(ctx: SupportContext, groupId: string, requestId: string): SupportAccessView {
    this.gateAuth(ctx);
    const held = this.require(requestId);
    if (held.request.targetGroupId !== groupId) {
      // Non-divulgation cross-groupe : un objet d'un autre groupe sous un chemin
      // tiers répond 404, jamais ses données (ADR-0006).
      throw new DomainError("RESERVATION_INCOHERENTE", "Demande d'accès introuvable");
    }
    return FictitiousSupportStore.toView(held);
  }

  /** Sonde d'observation `access_allowed` (booléenne, sans lever) pour la recette. */
  probe(ctx: SupportContext, requestId: string, action: string): boolean {
    this.gateAuth(ctx);
    const held = this.require(requestId);
    return supportAccessAllowed(held.request, action, held.request.targetGroupId, ctx.serverNow);
  }

  /** Le log de sécurité ne contient AUCUNE canary sensible (vérifié en test). */
  securityLogEntries(): readonly SecurityEvent[] {
    return this.securityLog;
  }

  securityEventCount(groupId: string, eventType: string): number {
    return this.securityLog.filter(
      (e) => e.groupId === groupId && e.eventType === eventType,
    ).length;
  }
}
