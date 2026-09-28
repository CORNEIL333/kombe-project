/**
 * Store FICTIF en mémoire pour la recette C06 — déclarations partielles et
 * idempotence. Il délègue TOUTE décision aux fonctions pures de
 * `@kombe/domain` (`contribution.ts`) : hash de corps, décision de rejeu /
 * conflit, validation canal/référence/motif, réservation sous la capacité.
 *
 * Comme les autres stores, il ne prétend NI persister, NI verrouiller, NI
 * rendre l'atomicité réelle : la **sérialisation concurrente sous verrou**
 * (SELECT … FOR UPDATE), le **registre d'idempotence durable** et l'écriture
 * **événement + projection + outbox dans une seule transaction** sont le
 * contrat `0008_contribution_idempotency.sql` — preuve base réelle **BLOCKED**
 * sans PostgreSQL (ADR-0007 / ADR-0016). La boucle d'événements réutilise la
 * chaîne scellée C00/C11 (`sealEventV1`, genèse 64 zéros).
 */
import {
  DomainError,
  GENESIS_HASH,
  assertAllowed,
  can,
  contributionBodyHash,
  decideIdempotency,
  isCrossGroupAccess,
  reserveObligation,
  sealEventV1,
  validateDeclaration,
  type ContributionDeclaration,
  type IdempotencyEntry,
  type JournalEventV1,
  type Role,
  type StoredCommandResult,
} from "@kombe/domain";

interface ObligationState {
  readonly obligationId: string;
  readonly groupId: string;
  readonly due: bigint;
  validatedNet: bigint;
  activeReserved: bigint;
  version: number;
}

export interface DeclareContext {
  readonly actorIdentityId: string;
  readonly actorRole: Role;
  readonly actorGroupIds: readonly string[];
  readonly idempotencyKey: string;
  readonly expectedVersion: number;
  /** Date SERVEUR injectée (distincte de la date alléguée du client). */
  readonly serverDate: string;
  readonly commandId: string;
  readonly rulesVersion?: number;
}

export interface DeclareReceipt extends Omit<StoredCommandResult, "status"> {
  readonly status: "applied" | "duplicate";
  readonly obligationId: string;
  readonly remainingDue: bigint;
  readonly availableToDeclare: bigint;
}

export interface ObligationView {
  readonly obligationId: string;
  readonly groupId: string;
  readonly due: string;
  readonly validatedNet: string;
  readonly activeReserved: string;
  readonly remainingDue: string;
  readonly availableToDeclare: string;
  readonly contributionCount: number;
  readonly version: number;
}

export class FictitiousContributionStore {
  private readonly obligations = new Map<string, ObligationState>();
  private readonly registry = new Map<string, IdempotencyEntry>();
  private readonly journals = new Map<string, JournalEventV1[]>();
  /** Nombre d'événements `contribution.declared` réellement appliqués. */
  private readonly declaredCount = new Map<string, number>();

  seedObligation(
    obligationId: string,
    groupId: string,
    due: bigint,
    opts?: { validatedNet?: bigint; activeReserved?: bigint; version?: number },
  ): void {
    this.obligations.set(obligationId, {
      obligationId,
      groupId,
      due,
      validatedNet: opts?.validatedNet ?? 0n,
      activeReserved: opts?.activeReserved ?? 0n,
      version: opts?.version ?? 1,
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
    ctx: DeclareContext,
    decl: ContributionDeclaration,
    groupId: string,
    reserved: bigint,
  ): JournalEventV1 {
    const chain = this.journalFor(groupId);
    const previousHash = chain.length ? (chain[chain.length - 1] as JournalEventV1).hash : GENESIS_HASH;
    const event = sealEventV1({
      groupId,
      seq: chain.length + 1,
      type: "contribution.declared",
      version: 1,
      previousHash,
      actorIdentityId: ctx.actorIdentityId,
      actorRole: ctx.actorRole,
      serverDate: ctx.serverDate,
      commandId: ctx.commandId,
      ...(ctx.rulesVersion !== undefined ? { rulesVersion: ctx.rulesVersion } : {}),
      body: {
        obligationId: decl.obligationId,
        amount: decl.amountMinor,
        channel: decl.channel,
        allegedDate: decl.allegedDate,
        reserved,
      },
    });
    chain.push(event);
    return event;
  }

  /**
   * Déclaration idempotente d'une cotisation partielle. Ordre de décision :
   * acteur → RBAC objet → anti-IDOR → rejeu/conflit (avec relecture des
   * droits AVANT de servir un rejeu) → validation → réservation sous capacité
   * → mutation + événement atomiques → registre durable. Tout refus AVANT la
   * mutation ne laisse AUCUN effet (compteur, version, chaîne inchangés).
   */
  declare(ctx: DeclareContext, decl: ContributionDeclaration): DeclareReceipt {
    if (!ctx.actorIdentityId) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    }
    const ob = this.obligations.get(decl.obligationId);
    // Non-divulgation : une obligation inconnue répond comme une erreur interne
    // de réservation (404), sans révéler son existence ni son groupe.
    if (!ob) {
      throw new DomainError("RESERVATION_INCOHERENTE", "Obligation introuvable");
    }
    // Barrière anti-IDOR : l'objet doit être dans un groupe ACTIF de l'acteur.
    if (isCrossGroupAccess(ctx.actorGroupIds, ob.groupId)) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Objet hors portée");
    }

    const scopedKey =
      `${ctx.actorIdentityId}|${ob.groupId}|contribution.declare|${ctx.idempotencyKey}`;
    const bodyHash = contributionBodyHash(decl);
    const decision = decideIdempotency(this.registry.get(scopedKey), bodyHash);

    if (decision.kind === "conflict") {
      throw new DomainError(
        "IDEMPOTENCY_BODY_CONFLICT",
        "Même clé, corps différent : conflit d'idempotence",
      );
    }

    if (decision.kind === "replay") {
      // Droits RELUS avant de servir un rejeu : identité révoquée ou sortie du
      // groupe refuse le rejeu (jamais le résultat d'un tiers ni un rejeu dû).
      assertAllowed(ctx.actorRole, "contribution.declare");
      if (isCrossGroupAccess(ctx.actorGroupIds, ob.groupId)) {
        throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Objet hors portée");
      }
      return {
        ...decision.result,
        status: "duplicate",
        obligationId: ob.obligationId,
        remainingDue: ob.due - ob.validatedNet,
        availableToDeclare: ob.due - ob.activeReserved,
      };
    }

    // execute (première fois) : droits, préconditions, puis mutation.
    assertAllowed(ctx.actorRole, "contribution.declare");
    if (!can(ctx.actorRole, "contribution.declare")) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Action non autorisée");
    }
    validateDeclaration(decl);
    if (
      !Number.isInteger(ctx.expectedVersion) ||
      ctx.expectedVersion < 1 ||
      ctx.expectedVersion !== ob.version
    ) {
      throw new DomainError("EVENT_CHAIN_BREAK", "Version d'objet dépassée (conflit)");
    }

    // Réservation sous verrou : excédent bloqué AVANT toute écriture.
    const res = reserveObligation(
      { due: ob.due, validatedNet: ob.validatedNet, activeReserved: ob.activeReserved },
      decl.amountMinor,
    );

    // Écriture atomique (DB réelle : événement + projection + outbox en une
    // transaction) : n'intervient qu'après succès de toutes les préconditions.
    ob.activeReserved = res.activeReserved;
    ob.version += 1;
    const event = this.appendEvent(ctx, decl, ob.groupId, res.activeReserved);
    this.declaredCount.set(ob.obligationId, (this.declaredCount.get(ob.obligationId) ?? 0) + 1);

    const result: StoredCommandResult = {
      commandId: ctx.commandId,
      status: "applied",
      resultVersion: ob.version,
      eventHash: event.hash,
    };
    this.registry.set(scopedKey, {
      actorIdentityId: ctx.actorIdentityId,
      groupId: ob.groupId,
      commandType: "contribution.declare",
      idempotencyKey: ctx.idempotencyKey,
      bodyHash,
      result,
    });
    return {
      ...result,
      status: "applied",
      obligationId: ob.obligationId,
      remainingDue: res.remainingDue,
      availableToDeclare: res.availableToDeclare,
    };
  }

  /**
   * Brouillon local (6.9) : action explicite, DISTINCTE de la soumission. Il
   * n'écrit NI événement, NI réservation, NI registre — absence d'effet prouvée.
   */
  saveDraft(
    actorIdentityId: string,
    obligationId: string,
    draft: ContributionDeclaration,
  ): { readonly draftSaved: true; readonly submitted: false; readonly obligationId: string } {
    // Aucune mutation d'état : le brouillon vit côté client ; le serveur accuse
    // réception sans créer de déclaration ni réserver de capacité.
    void actorIdentityId;
    void draft;
    return { draftSaved: true, submitted: false, obligationId };
  }

  view(obligationId: string): ObligationView {
    const ob = this.obligations.get(obligationId);
    if (!ob) throw new DomainError("RESERVATION_INCOHERENTE", "Obligation introuvable");
    return {
      obligationId: ob.obligationId,
      groupId: ob.groupId,
      due: ob.due.toString(),
      validatedNet: ob.validatedNet.toString(),
      activeReserved: ob.activeReserved.toString(),
      remainingDue: (ob.due - ob.validatedNet).toString(),
      availableToDeclare: (ob.due - ob.activeReserved).toString(),
      contributionCount: this.declaredCount.get(obligationId) ?? 0,
      version: ob.version,
    };
  }

  /** Vérifie que la chaîne du groupe reste intacte (aucun effet fantôme). */
  declaredEventCount(groupId: string): number {
    return this.journalFor(groupId).filter((e) => e.type === "contribution.declared").length;
  }
}
