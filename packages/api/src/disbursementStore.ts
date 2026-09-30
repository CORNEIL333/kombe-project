/**
 * Store FICTIF en mémoire pour la recette C08 — décaissements, corrections,
 * rapprochement et clôture. Il délègue TOUTE décision aux fonctions pures de
 * `@kombe/domain` (`disbursement.ts`) : machine à états, **séparation des
 * pouvoirs** (le bénéficiaire ne déclare pas le sien), indépendance du contrôle,
 * **contre-écriture unique** d'une correction, décision de clôture adossée à
 * l'**oracle indépendant** `reconciliation`.
 *
 * Comme les autres stores, il ne prétend NI persister, NI verrouiller, NI rendre
 * l'atomicité réelle : la **sérialisation concurrente sous verrou**
 * (SELECT … FOR UPDATE sur le décaissement), la **contre-écriture atomique**
 * (événement `disbursement.reversed` + projection + outbox) et l'**append-only**
 * du journal sont le contrat SQL de la migration `disbursement` — preuve base
 * réelle **BLOCKED** sans PostgreSQL (ADR-0007 / ADR-0016 / ADR-0018). La boucle
 * d'événements réutilise la chaîne scellée C00/C11 (`sealEventV1`, genèse 64
 * zéros) ; l'horodatage est une date SERVEUR INJECTÉE dans le contexte (en-tête
 * fictif `x-server-date`, résolu en C01 depuis session + horloge serveur — le
 * client n'en décide pas au production). KÓMBE **ne transfère aucun fonds** : le
 * décaissement est une sortie externe documentée, et `refundedExternally` reste
 * structurellement `false`.
 */
import {
  DomainError,
  GENESIS_HASH,
  approveDisbursementReversal,
  assertAllowed,
  confirmDisbursement,
  controlDisbursement,
  declareDisbursement,
  isCrossGroupAccess,
  reconcileRound,
  requestDisbursementReversal,
  sealEventV1,
  sumGroupFees,
  sumNetDisbursed,
  type DisbursementRecord,
  type DisbursementState,
  type JournalEventV1,
  type Role,
  type RoundReconciliationResult,
} from "@kombe/domain";

export interface DisbursementContext {
  readonly actorIdentityId: string;
  readonly actorRole: Role;
  readonly actorGroupIds: readonly string[];
  readonly serverDate: string;
  readonly commandId: string;
  readonly expectedVersion: number;
}

interface HeldDisbursement {
  record: DisbursementRecord;
  version: number;
}

export interface DeclareInput {
  readonly disbursementId: string;
  readonly roundId: string;
  readonly obligationId: string;
  readonly beneficiaryIdentityId: string;
  readonly netAmount: bigint;
  readonly groupFees: bigint;
  readonly personalFeesOutOfPot?: bigint;
  readonly requiredControllers: number;
  readonly allegedDate: number;
}

export interface DisbursementActReceipt {
  readonly actAccepted: boolean;
  readonly completed: boolean;
  readonly disbursementId: string;
  readonly state: DisbursementState;
  readonly version: number;
  readonly reason?: string;
  readonly eventHash?: string;
}

export interface ReversalReceipt {
  readonly disbursementId: string;
  readonly state: DisbursementState;
  readonly reversalCount: number;
  readonly refundedExternally: false;
  readonly version: number;
  readonly eventHash?: string;
}

export interface DisbursementView {
  readonly disbursementId: string;
  readonly groupId: string;
  readonly roundId: string;
  readonly obligationId: string;
  readonly beneficiaryIdentityId: string;
  readonly declarantIdentityId: string;
  readonly netAmount: string;
  readonly groupFees: string;
  readonly personalFeesOutOfPot: string;
  readonly state: DisbursementState;
  readonly requiredControllers: number;
  readonly beneficiaryConfirmedBy: string | null;
  readonly controllerIdentityIds: readonly string[];
  readonly reversalCount: number;
  readonly refundedExternally: false;
  readonly version: number;
}

export class FictitiousDisbursementStore {
  private readonly held = new Map<string, HeldDisbursement>();
  private readonly journals = new Map<string, JournalEventV1[]>();
  /**
   * État de rapprochement d'un tour, **détenu et décidé côté serveur** :
   * total validé net, présence d'un litige bloquant ou d'un impayé affectant
   * le pot. Posé par les flux serveur (ou les tests de recette), JAMAIS par une
   * requête cliente — la décision de clôture ne peut être forcée du client.
   */
  private readonly roundStates = new Map<
    string,
    { validatedNetTotal: bigint; hasBlockingDispute: boolean; hasUnpaidAffectingPot: boolean }
  >();

  private static roundKey(groupId: string, roundId: string): string {
    return `${groupId}/${roundId}`;
  }

  /** Horloge SERVEUR → millisecondes epoch ; une date illisible est refusée, pas réduite à 0. */
  private static epochOf(serverDate: string): number {
    const ms = Date.parse(serverDate);
    if (Number.isNaN(ms)) {
      throw new DomainError("DISBURSEMENT_SERVER_DATE_INVALID", "Date serveur illisible");
    }
    return ms;
  }

  /** Setter SERVEUR (flux interne/recette) : jamais exposé comme entrée client. */
  setRoundValidatedNet(groupId: string, roundId: string, validatedNetTotal: bigint): void {
    const key = FictitiousDisbursementStore.roundKey(groupId, roundId);
    const cur = this.roundStates.get(key) ?? {
      validatedNetTotal: 0n,
      hasBlockingDispute: false,
      hasUnpaidAffectingPot: false,
    };
    this.roundStates.set(key, { ...cur, validatedNetTotal });
  }

  /** Setter SERVEUR des bloqueurs de clôture (litige/impayé) — jamais une entrée client. */
  setRoundBlockers(
    groupId: string,
    roundId: string,
    blockers: { hasBlockingDispute?: boolean; hasUnpaidAffectingPot?: boolean },
  ): void {
    const key = FictitiousDisbursementStore.roundKey(groupId, roundId);
    const cur = this.roundStates.get(key) ?? {
      validatedNetTotal: 0n,
      hasBlockingDispute: false,
      hasUnpaidAffectingPot: false,
    };
    this.roundStates.set(key, {
      validatedNetTotal: cur.validatedNetTotal,
      hasBlockingDispute: blockers.hasBlockingDispute ?? cur.hasBlockingDispute,
      hasUnpaidAffectingPot: blockers.hasUnpaidAffectingPot ?? cur.hasUnpaidAffectingPot,
    });
  }

  private journalFor(groupId: string): JournalEventV1[] {
    let chain = this.journals.get(groupId);
    if (!chain) {
      chain = [];
      this.journals.set(groupId, chain);
    }
    return chain;
  }

  private appendEvent(
    ctx: DisbursementContext,
    groupId: string,
    type: "disbursement.requested" | "disbursement.completed" | "disbursement.reversed",
    body: Readonly<Record<string, unknown>>,
  ): JournalEventV1 {
    const chain = this.journalFor(groupId);
    const previousHash = chain.length
      ? (chain[chain.length - 1] as JournalEventV1).hash
      : GENESIS_HASH;
    const event = sealEventV1({
      groupId,
      seq: chain.length + 1,
      type,
      version: 1,
      previousHash,
      actorIdentityId: ctx.actorIdentityId,
      actorRole: ctx.actorRole,
      serverDate: ctx.serverDate,
      commandId: ctx.commandId,
      body,
    });
    chain.push(event);
    return event;
  }

  /** Garde d'authentification + anti-IDOR + version (sans action de rôle). */
  private gateAccess(ctx: DisbursementContext, held: HeldDisbursement): void {
    if (!ctx.actorIdentityId) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    }
    if (isCrossGroupAccess(ctx.actorGroupIds, held.record.groupId)) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Objet hors portée");
    }
    if (
      !Number.isInteger(ctx.expectedVersion) ||
      ctx.expectedVersion < 1 ||
      ctx.expectedVersion !== held.version
    ) {
      throw new DomainError("EVENT_CHAIN_BREAK", "Version d'objet dépassée (conflit)");
    }
  }

  /**
   * Garde de LECTURE : authentification + anti-IDOR (groupe revendiqué vs groupe
   * possédé), SANS version d'objet. Une lecture ne mute rien ; la version n'a
   * rien à y faire. Le groupe du chemin doit correspondre au groupe réel de
   * l'objet, sinon non-divulgation (`RESERVATION_INCOHERENTE`, 404).
   */
  private gateRead(ctx: DisbursementContext, groupId: string, held: HeldDisbursement): void {
    if (!ctx.actorIdentityId) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    }
    if (isCrossGroupAccess(ctx.actorGroupIds, groupId)) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Objet hors portée");
    }
    if (held.record.groupId !== groupId) {
      throw new DomainError("RESERVATION_INCOHERENTE", "Décaissement introuvable");
    }
  }

  private require(disbursementId: string): HeldDisbursement {
    const held = this.held.get(disbursementId);
    if (!held) {
      // Non-divulgation : un décaissement inconnu répond comme une réservation
      // absente (404), sans révéler son existence ni son groupe.
      throw new DomainError("RESERVATION_INCOHERENTE", "Décaissement introuvable");
    }
    return held;
  }

  /**
   * Déclaration d'un décaissement externe (6.10). Permission objet d'abord
   * (`disbursement.request` ⇒ un member sans droit reçoit 403), anti-IDOR, puis
   * la règle de **séparation des pouvoirs** du domaine (le déclarant ne peut
   * être le bénéficiaire ⇒ `DISBURSEMENT_SUBSTITUTE_REQUIRED`, 422, aucune
   * écriture). L'objet naît en `requested`, version 1, un événement scellé.
   */
  declare(ctx: DisbursementContext, groupId: string, input: DeclareInput): DisbursementView {
    if (!ctx.actorIdentityId) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    }
    assertAllowed(ctx.actorRole, "disbursement.request");
    if (isCrossGroupAccess(ctx.actorGroupIds, groupId)) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Objet hors portée");
    }
    if (this.held.has(input.disbursementId)) {
      throw new DomainError("EVENT_CHAIN_BREAK", "Décaissement déjà déclaré");
    }
    const record = declareDisbursement({
      disbursementId: input.disbursementId,
      groupId,
      roundId: input.roundId,
      obligationId: input.obligationId,
      beneficiaryIdentityId: input.beneficiaryIdentityId,
      declarantIdentityId: ctx.actorIdentityId,
      netAmount: input.netAmount,
      groupFees: input.groupFees,
      ...(input.personalFeesOutOfPot !== undefined
        ? { personalFeesOutOfPot: input.personalFeesOutOfPot }
        : {}),
      requiredControllers: input.requiredControllers,
      allegedDate: input.allegedDate,
      // Date SERVEUR en millisecondes epoch ; `Date.parse` sur l'horloge
      // injectée (une valeur non datable est une erreur de flux, pas un 0 silencieur).
      serverDate: FictitiousDisbursementStore.epochOf(ctx.serverDate),
    });
    this.held.set(input.disbursementId, { record, version: 1 });
    this.appendEvent(ctx, groupId, "disbursement.requested", {
      disbursementId: record.disbursementId,
      obligationId: record.obligationId,
      netAmount: record.netAmount,
      groupFees: record.groupFees,
    });
    return this.view(ctx, groupId, input.disbursementId);
  }

  /**
   * Confirmation par le **bénéficiaire** (6.10). La porte est ouverte par
   * l'appartenance au groupe (anti-IDOR) et la version ; c'est le **domaine**
   * qui ferme l'objet (seul le bénéficiaire confirme ⇒ `NOT_BENEFICIARY`, refus
   * **sans écriture**). Si l'acte parachève (aucun contrôleur requis), un
   * événement `disbursement.completed` est scellé.
   */
  confirm(ctx: DisbursementContext, disbursementId: string): DisbursementActReceipt {
    const held = this.require(disbursementId);
    this.gateAccess(ctx, held);
    const result = confirmDisbursement(held.record, ctx.actorIdentityId);
    if (!result.actAccepted) {
      return {
        actAccepted: false,
        completed: false,
        disbursementId,
        state: held.record.state,
        version: held.version,
        ...(result.reason !== undefined ? { reason: result.reason } : {}),
      };
    }
    held.record = result.record;
    held.version += 1;
    let eventHash: string | undefined;
    if (result.completed) {
      eventHash = this.appendEvent(ctx, held.record.groupId, "disbursement.completed", {
        disbursementId,
        obligationId: held.record.obligationId,
        netAmount: held.record.netAmount,
      }).hash;
    }
    return {
      actAccepted: true,
      completed: result.completed,
      disbursementId,
      state: result.record.state,
      version: held.version,
      ...(result.reason !== undefined ? { reason: result.reason } : {}),
      ...(eventHash !== undefined ? { eventHash } : {}),
    };
  }

  /** Contrôle **distinct et indépendant** (6.10). Même garde ; le domaine refuse
   *  le déclarant/le bénéficiaire (`NOT_INDEPENDENT`) et le cumul (`ACTOR_ALREADY_ACTED`)
   *  sans écriture ; au seuil, l'objet s'achève et un événement est scellé. */
  control(ctx: DisbursementContext, disbursementId: string): DisbursementActReceipt {
    const held = this.require(disbursementId);
    this.gateAccess(ctx, held);
    const result = controlDisbursement(held.record, ctx.actorIdentityId);
    if (!result.actAccepted) {
      return {
        actAccepted: false,
        completed: false,
        disbursementId,
        state: held.record.state,
        version: held.version,
        ...(result.reason !== undefined ? { reason: result.reason } : {}),
      };
    }
    held.record = result.record;
    held.version += 1;
    let eventHash: string | undefined;
    if (result.completed) {
      eventHash = this.appendEvent(ctx, held.record.groupId, "disbursement.completed", {
        disbursementId,
        obligationId: held.record.obligationId,
        netAmount: held.record.netAmount,
      }).hash;
    }
    return {
      actAccepted: true,
      completed: result.completed,
      disbursementId,
      state: result.record.state,
      version: held.version,
      ...(result.reason !== undefined ? { reason: result.reason } : {}),
      ...(eventHash !== undefined ? { eventHash } : {}),
    };
  }

  /**
   * **Demande** de correction d'un décaissement achevé (6.10, 18.9). Permission
   * objet `disbursement.reverse` ; le domaine exige l'état `completed` et un
   * motif non vide. L'objet passe en `reversal_requested` ; **aucun
   * remboursement externe** (`refundedExternally` figé à `false`).
   */
  requestReversal(
    ctx: DisbursementContext,
    disbursementId: string,
    reason: string,
  ): ReversalReceipt {
    const held = this.require(disbursementId);
    if (!ctx.actorIdentityId) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    }
    assertAllowed(ctx.actorRole, "disbursement.reverse");
    this.gateAccess(ctx, held);
    held.record = requestDisbursementReversal(held.record, ctx.actorIdentityId, reason);
    held.version += 1;
    return {
      disbursementId,
      state: held.record.state,
      reversalCount: held.record.reversalCount,
      refundedExternally: false,
      version: held.version,
    };
  }

  /**
   * **Approbation indépendante → contre-écriture unique** (C08, 6.10). Permission
   * `disbursement.reverse` ; le domaine refuse l'approbateur non indépendant
   * (`DISBURSEMENT_REVERSAL_NOT_INDEPENDENT`, 403) et un original **déjà reversé**
   * (`DISBURSEMENT_ALREADY_REVERSED`, 409) — la garde qui borne `reversalCount`
   * à 1 sous deux courses (C08-CORRECTION). Un seul événement `disbursement.reversed`.
   * La sérialisation réelle sous verrou reste une preuve base réelle (BLOCKED).
   */
  approveReversal(ctx: DisbursementContext, disbursementId: string): ReversalReceipt {
    const held = this.require(disbursementId);
    if (!ctx.actorIdentityId) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    }
    assertAllowed(ctx.actorRole, "disbursement.reverse");
    this.gateAccess(ctx, held);
    const wasReversed = held.record.reversedById !== null;
    held.record = approveDisbursementReversal(held.record, ctx.actorIdentityId);
    held.version += 1;
    let eventHash: string | undefined;
    if (!wasReversed && held.record.state === "reversed") {
      eventHash = this.appendEvent(ctx, held.record.groupId, "disbursement.reversed", {
        disbursementId,
        obligationId: held.record.obligationId,
        netAmount: held.record.netAmount,
      }).hash;
    }
    return {
      disbursementId,
      state: held.record.state,
      reversalCount: held.record.reversalCount,
      refundedExternally: false,
      version: held.version,
      ...(eventHash !== undefined ? { eventHash } : {}),
    };
  }

  /**
   * Rapprochement d'un tour et décision de **clôture normale** (18.4, 18.9) via
   * l'**oracle indépendant** `reconciliation`. TOUTES les entrées de décision
   * sont SERVEUR : totaux décaissements/frais recalculés depuis les écritures
   * réellement stockées, total validé net et bloqueurs (litige/impayé) lus dans
   * l'état serveur `roundStates` — AUCUN paramètre de décision n'est accepté du
   * client (un client ne peut ni forcer `normalCloseAccepted` ni cacher un
   * écart). Lecture authentifiée et scopée par groupe comme une vue.
   */
  reconcile(
    ctx: DisbursementContext,
    groupId: string,
    roundId: string,
  ): RoundReconciliationResult & { readonly netDisbursed: string; readonly groupFees: string } {
    if (!ctx.actorIdentityId) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    }
    if (isCrossGroupAccess(ctx.actorGroupIds, groupId)) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Objet hors portée");
    }
    const records: DisbursementRecord[] = [];
    for (const held of this.held.values()) {
      if (held.record.groupId === groupId && held.record.roundId === roundId) {
        records.push(held.record);
      }
    }
    const knownRound = this.roundStates.get(
      FictitiousDisbursementStore.roundKey(groupId, roundId),
    );
    // Non-divulgation honnête : un tour sans AUCUNE écriture serveur (ni état
    // de rapprochement posé, ni décaissement) n'est pas « équilibré par défaut »
    // — il est inconnu. Répondre `normalCloseAccepted: true` ici laisserait
    // valider une clôture sur un tour fantôme ; on renvoie 404 comme un objet
    // absent (jamais on n'invente un solde).
    if (knownRound === undefined && records.length === 0) {
      throw new DomainError("RESERVATION_INCOHERENTE", "Tour introuvable pour ce groupe");
    }
    const netDisbursed = sumNetDisbursed(records);
    const groupFees = sumGroupFees(records);
    const roundState = knownRound ?? {
      validatedNetTotal: 0n,
      hasBlockingDispute: false,
      hasUnpaidAffectingPot: false,
    };
    const result = reconcileRound({
      validatedNetTotal: roundState.validatedNetTotal,
      netDisbursedTotal: netDisbursed,
      groupFeesTotal: groupFees,
      hasBlockingDispute: roundState.hasBlockingDispute,
      hasUnpaidAffectingPot: roundState.hasUnpaidAffectingPot,
    });
    return { ...result, netDisbursed: netDisbursed.toString(), groupFees: groupFees.toString() };
  }

  /** Vue SCOPEE et authentifiée : le groupe du chemin doit être le groupe réel de l'objet. */
  view(ctx: DisbursementContext, groupId: string, disbursementId: string): DisbursementView {
    const held = this.require(disbursementId);
    this.gateRead(ctx, groupId, held);
    const r = held.record;
    return {
      disbursementId: r.disbursementId,
      groupId: r.groupId,
      roundId: r.roundId,
      obligationId: r.obligationId,
      beneficiaryIdentityId: r.beneficiaryIdentityId,
      declarantIdentityId: r.declarantIdentityId,
      netAmount: r.netAmount.toString(),
      groupFees: r.groupFees.toString(),
      personalFeesOutOfPot: r.personalFeesOutOfPot.toString(),
      state: r.state,
      requiredControllers: r.requiredControllers,
      beneficiaryConfirmedBy: r.beneficiaryConfirmedBy,
      controllerIdentityIds: r.controllerIdentityIds,
      reversalCount: r.reversalCount,
      refundedExternally: false,
      version: held.version,
    };
  }

  eventCount(groupId: string, type: "disbursement.requested" | "disbursement.completed" | "disbursement.reversed"): number {
    return this.journalFor(groupId).filter((e) => e.type === type).length;
  }

  /** Hash de tête de chaîne (sonde d'intégrité — une contre-écriture unique ne la rompt pas). */
  journalTailHash(groupId: string): string | null {
    const chain = this.journalFor(groupId);
    return chain.length ? (chain[chain.length - 1] as JournalEventV1).hash : null;
  }
}
