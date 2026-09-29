/**
 * Store FICTIF en mémoire pour la recette C07 — validations et corrections de
 * cotisations. Il délègue TOUTE décision aux fonctions pures de
 * `@kombe/domain` (`validation.ts`) : machine à états, indépendance
 * (anti-collusion), compensation unique, contestation (fenêtre et gel).
 *
 * Comme les autres stores, il ne prétend NI persister, NI verrouiller, NI
 * rendre l'atomicité réelle : la **sérialisation concurrente sous verrou**
 * (SELECT … FOR UPDATE sur la cotisation), la **contre-écriture atomique**
 * événement `compensated` + projection + outbox, et l'**append-only** du
 * journal sont le contrat `0009_contribution_validation.sql` — preuve base
 * réelle **BLOCKED** sans PostgreSQL (ADR-0007 / ADR-0016 / ADR-0017). La boucle
 * d'événements réutilise la chaîne scellée C00/C11 (`sealEventV1`, genèse 64
 * zéros) ; la contre-écriture réduit le validé net au replay (C11).
 */
import {
  DomainError,
  GENESIS_HASH,
  assertAllowed,
  assertValidationNotBlocked,
  assertDependentOperationsNotBlocked,
  compensateContribution,
  confirmContribution,
  controlContribution,
  isCrossGroupAccess,
  newContribution,
  raiseDispute,
  rejectContribution,
  sealEventV1,
  type ContributionRecord,
  type ContributionState,
  type Dispute,
  type JournalEventV1,
  type RaiseDisputeInput,
  type Role,
} from "@kombe/domain";

export interface ValidationContext {
  readonly actorIdentityId: string;
  readonly actorRole: Role;
  readonly actorGroupIds: readonly string[];
  readonly serverDate: string;
  readonly commandId: string;
  readonly expectedVersion: number;
}

interface HeldContribution {
  record: ContributionRecord;
  version: number;
}

export interface ActReceipt {
  readonly validationAccepted: boolean;
  readonly validationCompleted: boolean;
  readonly contributionId: string;
  readonly state: ContributionState;
  readonly version: number;
  readonly reason?: string;
  readonly eventHash?: string;
}

export interface CompensationReceipt {
  readonly reversalAccepted: boolean;
  readonly reversalCount: number;
  readonly contributionId: string;
  readonly reversalContributionId: string;
  readonly state: ContributionState;
  readonly version: number;
  readonly eventHash: string;
}

export interface ContributionView {
  readonly contributionId: string;
  readonly obligationId: string;
  readonly groupId: string;
  readonly amount: string;
  readonly declarantIdentityId: string;
  readonly state: ContributionState;
  readonly requiredControllers: number;
  readonly confirmerIdentityId: string | null;
  readonly controllerIdentityIds: readonly string[];
  readonly compensated: boolean;
  readonly reversalCount: number;
  readonly version: number;
}

export class FictitiousValidationStore {
  private readonly held = new Map<string, HeldContribution>();
  private readonly disputes: Dispute[] = [];
  private readonly journals = new Map<string, JournalEventV1[]>();
  /** Nombre de compensations réellement appliquées par original (C07-REVERSE). */
  private readonly reversals = new Map<string, number>();

  seedContribution(
    contributionId: string,
    groupId: string,
    obligationId: string,
    amountMinor: bigint,
    declarantIdentityId: string,
    requiredControllers = 0,
  ): void {
    this.held.set(contributionId, {
      record: newContribution({
        contributionId,
        obligationId,
        groupId,
        amountMinor,
        declarantIdentityId,
        requiredControllers,
      }),
      version: 1,
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
    ctx: ValidationContext,
    groupId: string,
    type: "contribution.validated" | "contribution.compensated",
    obligationId: string,
    amountMinor: bigint,
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
      body: { obligationId, amount: amountMinor },
    });
    chain.push(event);
    return event;
  }

  /** Garde commune : acteur authentifié, permission objet, anti-IDOR, version. */
  private gate(ctx: ValidationContext, held: HeldContribution): void {
    if (!ctx.actorIdentityId) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    }
    assertAllowed(ctx.actorRole, "contribution.validate");
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

  private require(contributionId: string): HeldContribution {
    const held = this.held.get(contributionId);
    if (!held) {
      // Non-divulgation : une cotisation inconnue répond comme une erreur de
      // réservation (404), sans révéler son existence ni son groupe.
      throw new DomainError("RESERVATION_INCOHERENTE", "Cotisation introuvable");
    }
    return held;
  }

  /**
   * Confirmation (6.3, 6.4). Permission et version d'abord, puis la règle
   * d'**indépendance** (le déclarant ne se confirme pas lui-même ⇒
   * `validationAccepted = false`, **aucune écriture**). Si l'acte parachève la
   * validation, un **litige ouvert bloque** la validation (6.5) avant mutation.
   */
  confirm(ctx: ValidationContext, contributionId: string): ActReceipt {
    const held = this.require(contributionId);
    this.gate(ctx, held);
    const result = confirmContribution(held.record, ctx.actorIdentityId);
    if (!result.validationAccepted) {
      return {
        validationAccepted: false,
        validationCompleted: false,
        contributionId,
        state: held.record.state,
        version: held.version,
        ...(result.reason !== undefined ? { reason: result.reason } : {}),
      };
    }
    if (result.validationCompleted) {
      assertValidationNotBlocked(this.disputes, held.record.obligationId, held.record.state);
    }
    held.record = result.record;
    held.version += 1;
    let eventHash: string | undefined;
    if (result.validationCompleted) {
      eventHash = this.appendEvent(
        ctx,
        held.record.groupId,
        "contribution.validated",
        held.record.obligationId,
        held.record.amountMinor,
      ).hash;
    }
    return {
      validationAccepted: true,
      validationCompleted: result.validationCompleted,
      contributionId,
      state: result.record.state,
      version: held.version,
      ...(result.reason !== undefined ? { reason: result.reason } : {}),
      ...(eventHash !== undefined ? { eventHash } : {}),
    };
  }

  /** Contrôle par un tiers distinct (6.3, 6.4). Même garde, seuil de validateurs. */
  control(ctx: ValidationContext, contributionId: string): ActReceipt {
    const held = this.require(contributionId);
    this.gate(ctx, held);
    const result = controlContribution(held.record, ctx.actorIdentityId);
    if (!result.validationAccepted) {
      return {
        validationAccepted: false,
        validationCompleted: false,
        contributionId,
        state: held.record.state,
        version: held.version,
        ...(result.reason !== undefined ? { reason: result.reason } : {}),
      };
    }
    if (result.validationCompleted) {
      assertValidationNotBlocked(this.disputes, held.record.obligationId, held.record.state);
    }
    held.record = result.record;
    held.version += 1;
    let eventHash: string | undefined;
    if (result.validationCompleted) {
      eventHash = this.appendEvent(
        ctx,
        held.record.groupId,
        "contribution.validated",
        held.record.obligationId,
        held.record.amountMinor,
      ).hash;
    }
    return {
      validationAccepted: true,
      validationCompleted: result.validationCompleted,
      contributionId,
      state: result.record.state,
      version: held.version,
      ...(result.reason !== undefined ? { reason: result.reason } : {}),
      ...(eventHash !== undefined ? { eventHash } : {}),
    };
  }

  /** Rejet **avant validation seulement** (6.2). Refus d'un mutation passé clé. */
  reject(ctx: ValidationContext, contributionId: string): ActReceipt {
    const held = this.require(contributionId);
    this.gate(ctx, held);
    held.record = rejectContribution(held.record);
    held.version += 1;
    return {
      validationAccepted: true,
      validationCompleted: false,
      contributionId,
      state: held.record.state,
      version: held.version,
    };
  }

  /**
   * Compensation d'un original validé (6.2, 6.6, C07-REVERSE). La garde
   * « au plus une fois » du domaine borne `reversalCount` à 1 : une seconde
   * course sur le même original lève `CONTRIBUTION_ALREADY_COMPENSATED` (409)
   * **sans** seconde contre-écriture. La sérialisation réelle sous verrou reste
   * une preuve base réelle (BLOCKED).
   */
  compensate(
    ctx: ValidationContext,
    contributionId: string,
    reversalContributionId: string,
  ): CompensationReceipt {
    const held = this.require(contributionId);
    this.gate(ctx, held);
    const { original, reversal } = compensateContribution(held.record, reversalContributionId);
    held.record = original;
    held.version += 1;
    // La contre-écriture rejoint le stock, soumise au même circuit de validation.
    this.held.set(reversal.contributionId, { record: reversal, version: 1 });
    const count = (this.reversals.get(contributionId) ?? 0) + 1;
    this.reversals.set(contributionId, count);
    const eventHash = this.appendEvent(
      ctx,
      original.groupId,
      "contribution.compensated",
      original.obligationId,
      original.amountMinor,
    ).hash;
    return {
      reversalAccepted: true,
      reversalCount: count,
      contributionId,
      reversalContributionId: reversal.contributionId,
      state: original.state,
      version: held.version,
      eventHash,
    };
  }

  /** Ouverture d'un litige (6.5) — permission `dispute.raise`, fenêtre et motif. */
  raise(ctx: ValidationContext, input: RaiseDisputeInput): Dispute {
    if (!ctx.actorIdentityId) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    }
    assertAllowed(ctx.actorRole, "dispute.raise");
    if (isCrossGroupAccess(ctx.actorGroupIds, input.groupId)) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Objet hors portée");
    }
    const d = raiseDispute(input);
    this.disputes.push(d);
    return d;
  }

  /** Sonde de clôture gelée par un litige ouvert (6.5, sans effacer l'écriture). */
  attemptDependentOperation(obligationId: string): { readonly blocked: false } {
    assertDependentOperationsNotBlocked(this.disputes, obligationId);
    return { blocked: false };
  }

  view(contributionId: string): ContributionView {
    const held = this.require(contributionId);
    return {
      contributionId: held.record.contributionId,
      obligationId: held.record.obligationId,
      groupId: held.record.groupId,
      amount: held.record.amountMinor.toString(),
      declarantIdentityId: held.record.declarantIdentityId,
      state: held.record.state,
      requiredControllers: held.record.requiredControllers,
      confirmerIdentityId: held.record.confirmerIdentityId,
      controllerIdentityIds: held.record.controllerIdentityIds,
      compensated: held.record.compensatedById !== null,
      reversalCount: this.reversals.get(contributionId) ?? 0,
      version: held.version,
    };
  }

  validatedEventCount(groupId: string): number {
    return this.journalFor(groupId).filter((e) => e.type === "contribution.validated").length;
  }

  /** Hash de tête de chaîne (sonde d'intégrité — C10-RESOLVE : doit rester invariant). */
  journalTailHash(groupId: string): string | null {
    const chain = this.journalFor(groupId);
    return chain.length ? (chain[chain.length - 1] as JournalEventV1).hash : null;
  }

  compensatedEventCount(groupId: string): number {
    return this.journalFor(groupId).filter((e) => e.type === "contribution.compensated").length;
  }
}
