/**
 * Store FICTIF en mémoire pour la recette C10 — litiges et recours. Il délègue
 * TOUTE décision aux fonctions pures de `@kombe/domain` (`disputes.ts`) : vue
 * commune vs détail privé (8.1), désignation indépendante des résolveurs (8.2),
 * résolution sans aucun effet monétaire + recours lié à l'original (8.3), gel
 * de clôture multi-obligations (8.4).
 *
 * Comme les autres stores, il ne prétend NI persister, NI verrouiller :
 * l'unicité des désignations, l'append-only du dossier et le RLS sont le
 * contrat `0010_dispute_cases.sql` — preuve base réelle **BLOCKED** sans
 * PostgreSQL (ADR-0007 / ADR-0016). Le point d'ancrage C10-RESOLVE est
 * **structurel** : ce store n'émet **jamais** d'événement monétaire — il ne
 * reçoit même pas de chaîne de journal ; `validated_total_delta = 0` n'est
 * pas une promesse vérifiée, c'est l'absence totale de canal d'écriture.
 */
import {
  DomainError,
  assertAllowed,
  assertRoundCloseNotFrozen,
  designateResolvers,
  disputeCommonView,
  disputeDetailView,
  isCrossGroupAccess,
  isDisputeParty,
  openDisputeCase,
  reopenDispute,
  resolveDispute,
  type DisputeCommonView,
  type DisputeRecord,
  type OpenDisputeCaseInput,
  type Role,
} from "@kombe/domain";

export interface DisputeActor {
  readonly identityId: string;
  readonly role: Role;
  readonly groupIds: readonly string[];
}

interface HeldDispute {
  record: DisputeRecord;
  version: number;
}

export class FictitiousDisputeStore {
  private readonly held = new Map<string, HeldDispute>();

  /** Nombre d'événements monétaires émis — toujours 0 par construction (C10-RESOLVE). */
  readonly monetaryEventsEmitted = 0;

  private gateActor(actor: DisputeActor, groupId: string): void {
    if (!actor.identityId) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    }
    if (isCrossGroupAccess(actor.groupIds, groupId)) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Objet hors portée");
    }
  }

  private require(disputeId: string): HeldDispute {
    const held = this.held.get(disputeId);
    if (!held) {
      // Non-divulgation : un dossier inconnu répond comme une erreur de
      // réservation (404), sans révéler son existence ni son groupe.
      throw new DomainError("RESERVATION_INCOHERENTE", "Dossier de litige introuvable");
    }
    return held;
  }

  private expectVersion(held: HeldDispute, expectedVersion: number): void {
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1 || expectedVersion !== held.version) {
      throw new DomainError("EVENT_CHAIN_BREAK", "Version d'objet dépassée (conflit)");
    }
  }

  /** Ouverture du dossier (8.1) — `dispute.raise`, motif ET correction demandée. */
  open(
    actor: DisputeActor,
    input: OpenDisputeCaseInput,
    expectedVersion = 1,
  ): DisputeRecord {
    assertAllowed(actor.role, "dispute.raise");
    this.gateActor(actor, input.groupId);
    const record = openDisputeCase(input);
    // Version 2 : le dossier est créé à la version 1, l'écriture le porte à 2
    // comme toute commande mutante (cohérent avec C07 : création ⇒ version posée).
    void expectedVersion;
    this.held.set(record.disputeId, { record, version: 1 });
    return record;
  }

  /** Désignation des résolveurs (8.2) — `dispute.resolve`, jamais un impliqué. */
  assignResolvers(
    actor: DisputeActor,
    disputeId: string,
    resolverIdentityIds: readonly string[],
    expectedVersion: number,
  ): { record: DisputeRecord; version: number } {
    const held = this.require(disputeId);
    assertAllowed(actor.role, "dispute.resolve");
    this.gateActor(actor, held.record.groupId);
    this.expectVersion(held, expectedVersion);
    held.record = designateResolvers(held.record, resolverIdentityIds);
    held.version += 1;
    return { record: held.record, version: held.version };
  }

  /**
   * Résolution (8.3, C10-RESOLVE). Permission RÔLE d'abord (`dispute.resolve`),
   * puis l'indépendance PAR OBJET dans le domaine. **Aucun** événement
   * monétaire n'est possible ici : le store ne possède aucune chaîne de
   * journal — `validated_total_delta = 0` est structurel.
   */
  resolve(
    actor: DisputeActor,
    disputeId: string,
    outcome: string,
    resolvedAt: number,
    expectedVersion: number,
    correctionContributionIds: readonly string[] = [],
  ): { record: DisputeRecord; version: number } {
    const held = this.require(disputeId);
    assertAllowed(actor.role, "dispute.resolve");
    this.gateActor(actor, held.record.groupId);
    this.expectVersion(held, expectedVersion);
    held.record = resolveDispute(held.record, {
      actorIdentityId: actor.identityId,
      outcome,
      resolvedAt,
      correctionContributionIds,
    });
    held.version += 1;
    return { record: held.record, version: held.version };
  }

  /** Recours (8.3) : le levant rouvre son dossier résolu, lié à l'original. */
  appeal(
    actor: DisputeActor,
    disputeId: string,
    expectedVersion: number,
  ): { record: DisputeRecord; version: number } {
    const held = this.require(disputeId);
    assertAllowed(actor.role, "dispute.raise");
    this.gateActor(actor, held.record.groupId);
    this.expectVersion(held, expectedVersion);
    if (actor.identityId !== held.record.raisedBy) {
      // Non-divulgation : un recours d'un non-levant répond comme un refus de
      // permission, sans révéler l'identité du levant.
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Seul le levant fait recours");
    }
    held.record = reopenDispute(held.record);
    held.version += 1;
    return { record: held.record, version: held.version };
  }

  /**
   * Vue d'un dossier (C10-PRIVACY) : tout membre du groupe obtient la vue
   * **commune** (existence/statut/issue utile) ; seules les **parties**
   * (levant, impliqués, résolveurs désignés) obtiennent le **détail privé**.
   * Lecture seule — aucune mutation, aucune version incrémentée.
   */
  view(actor: DisputeActor, disputeId: string): DisputeCommonView | DisputeRecord {
    const held = this.require(disputeId);
    this.gateActor(actor, held.record.groupId);
    return isDisputeParty(held.record, actor.identityId)
      ? disputeDetailView(held.record)
      : disputeCommonView(held.record);
  }

  /** Liste des vues communes du groupe (le détail privé ne transite jamais ici). */
  listCommon(actor: DisputeActor, groupId: string): DisputeCommonView[] {
    this.gateActor(actor, groupId);
    return [...this.held.values()]
      .filter((h) => h.record.groupId === groupId)
      .map((h) => disputeCommonView(h.record));
  }

  /**
   * Sonde de clôture normale d'un tour (C10-FREEZE) : gelée si une obligation
   * du tour porte un litige ouvert. Lecture de décision — sans écriture.
   */
  attemptRoundClose(
    actor: DisputeActor,
    groupId: string,
    obligationIds: readonly string[],
  ): { readonly normalCloseAccepted: true } {
    assertAllowed(actor.role, "round.close");
    this.gateActor(actor, groupId);
    const disputes = [...this.held.values()].map((h) => h.record);
    assertRoundCloseNotFrozen(disputes, obligationIds);
    return { normalCloseAccepted: true };
  }

  /** Nombre de dossiers — sonde d'absence d'effet (aucun dossier créé en lecture). */
  get caseCount(): number {
    return this.held.size;
  }
}
