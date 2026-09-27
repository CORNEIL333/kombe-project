/**
 * Squelette du pipeline de commande KÓMBE (ordre de ARCHITECTURE_CIBLE
 * §Commande) : authentification → droits courants → registre d'idempotence →
 * verrous → préconditions → événement/projection/outbox atomiques → commit →
 * réponse.
 *
 * VOLONTAIREMENT EN MÉMOIRE, SUR DONNÉES FICTIVES. Ce store ne prouve NI le
 * verrouillage, NI l'isolation, NI l'atomicité réels : ces preuves exigent
 * PostgreSQL (C01) et sont marquées BLOCKED tant qu'aucune base réelle n'est
 * raccordée. Le squelette démontre la CHAÎNE de décision (RBAC, barrières,
 * idempotence, version, invariants de montant) et le chaînage du journal.
 */
import {
  DomainError,
  GENESIS_HASH,
  PILOT_FEATURE_GATES,
  assertExpectedVersion,
  assertNoForbiddenFeatureEnabled,
  can,
  isCrossGroupAccess,
  perAmount,
  requestFeature,
  sealEvent,
  type Action,
  type FeatureGates,
  type ForbiddenFeature,
  type JournalEvent,
  type Role,
} from "@kombe/domain";

export interface Actor {
  readonly handle: string;
  readonly role: Role;
  /** Groupes où l'acteur a une adhésion ACTIVE (source de vérité anti-IDOR). */
  readonly groupIds: readonly string[];
}

export interface CommandContext {
  readonly actor: Actor;
  readonly idempotencyKey: string;
  readonly expectedVersion: number;
  /** Feature explicitement demandée ; refusée si interdite au pilote. */
  readonly requestedFeature?: ForbiddenFeature;
  readonly gates?: FeatureGates;
}

export interface CommandReceipt {
  readonly commandId: string;
  readonly status: "applied" | "duplicate";
  readonly resultVersion: number;
  readonly journalEventHash: string;
}

interface ObligationRecord {
  readonly groupId: string;
  version: number;
  declared: bigint;
}

export class FictitiousCommandStore {
  private readonly obligations = new Map<string, ObligationRecord>();
  private readonly idempotency = new Map<string, CommandReceipt>();
  private readonly journal = new Map<string, JournalEvent[]>();
  private commandCounter = 0;

  seedObligation(obligationId: string, groupId: string, version = 1): void {
    this.obligations.set(obligationId, { groupId, version, declared: 0n });
  }

  private journalFor(groupId: string): JournalEvent[] {
    let chain = this.journal.get(groupId);
    if (!chain) {
      chain = [];
      this.journal.set(groupId, chain);
    }
    return chain;
  }

  private appendEvent(
    groupId: string,
    type: string,
    payload: Record<string, unknown>,
  ): JournalEvent {
    const chain = this.journalFor(groupId);
    const previousHash = chain.length ? (chain[chain.length - 1] as JournalEvent).hash : GENESIS_HASH;
    const event = sealEvent({
      groupId,
      seq: chain.length + 1,
      type,
      version: 1,
      previousHash,
      payload,
    });
    chain.push(event);
    return event;
  }

  /**
   * Déclarer une cotisation. Chemin négatif : ne DOIT écrire aucun effet si
   * une précondition échoue (vérifié par l'absence de mutation d'état).
   */
  declareContribution(
    ctx: CommandContext,
    obligationId: string,
    amount: bigint,
  ): CommandReceipt {
    return this.run(ctx, "contribution.declare", obligationId, () => {
      const obligation = this.obligations.get(obligationId);
      if (!obligation) {
        // Non-divulgation : un objet inexistant ou hors portée répond pareil.
        throw new DomainError("RESERVATION_INCOHERENTE", "Obligation introuvable");
      }
      // Préconditions de montant (plafond unitaire + entier sûr).
      perAmount(amount, { positive: true });
      // Concurrence optimiste : version attendue de l'objet existant.
      assertExpectedVersion(obligation.version, ctx.expectedVersion);
      obligation.declared += amount;
      obligation.version += 1;
      const event = this.appendEvent(obligation.groupId, "contribution.declared", {
        obligationId,
        amount,
      });
      return { resultVersion: obligation.version, event };
    });
  }

  private run(
    ctx: CommandContext,
    action: Action,
    scopeId: string,
    mutate: () => { resultVersion: number; event: JournalEvent },
  ): CommandReceipt {
    // 1. Authentification (le squelette fait confiance à l'acteur transmis ;
    //    la résolution réelle de session viendra de C01).
    if (!ctx.actor.handle) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    }
    // 2. Droits courants RBAC (14.1).
    if (!can(ctx.actor.role, action)) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Action non autorisée");
    }
    // 2b. Barrière serveur anti-IDOR : l'objet doit être dans un groupe actif.
    const obligation = this.obligations.get(scopeId);
    if (obligation && isCrossGroupAccess(ctx.actor.groupIds, obligation.groupId)) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Objet hors portée");
    }
    // 3. Barrières de fonctionnalité (pilote) + feature explicitement demandée.
    const gates = ctx.gates ?? PILOT_FEATURE_GATES;
    if (ctx.requestedFeature) {
      const r = requestFeature(gates, ctx.requestedFeature);
      if (r.rejected) {
        throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Fonctionnalité fermée au pilote");
      }
    }
    assertNoForbiddenFeatureEnabled(gates);
    // 4. Registre d'idempotence : rejeu renvoie le résultat d'origine.
    const seen = this.idempotency.get(ctx.idempotencyKey);
    if (seen) return { ...seen, status: "duplicate" };
    // 5-7. Verrous (DB réelle, hors squelette) puis préconditions + mutation.
    const { resultVersion, event } = mutate();
    // 8. Commit (dans la vraie DB : événement + projection + outbox atomiques).
    const receipt: CommandReceipt = {
      commandId: `cmd_${(this.commandCounter += 1)}`,
      status: "applied",
      resultVersion,
      journalEventHash: event.hash,
    };
    this.idempotency.set(ctx.idempotencyKey, receipt);
    return receipt;
  }
}
