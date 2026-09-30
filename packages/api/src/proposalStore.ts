/**
 * Store FICTIF en mémoire pour la recette C09 — propositions, votes et
 * décisions. Il délègue TOUTE décision aux fonctions pures de `@kombe/domain`
 * (`proposal.ts`) : scellement de l'**électorat** à l'ouverture, bulletin
 * **unique et identifié**, refus **après échéance SERVEUR**, résultat adossé à
 * l'**oracle indépendant** `voteResult`, exécution **idempotente** datée.
 *
 * Comme les autres stores, il ne prétend NI persister, NI verrouiller, NI rendre
 * l'atomicité : la **sérialisation** de deux bulletins simultanés d'un même
 * électeur (contrainte `PRIMARY KEY (proposal_id, identity_id)`), le refus
 * d'**éligibilité** en base, et l'**append-only** des bulletins/actes sont le
 * contrat SQL de la migration `0012_proposal` — preuve base réelle **BLOCKED**
 * sans PostgreSQL (ADR-0007 / ADR-0016). La chaîne d'événements réutilise le
 * sceau C00/C11 (`sealEventV1`, genèse 64 zéros). L'horodatage est une date
 * SERVEUR INJECTÉE (`x-server-date`, fictif ; résolu C01 via session + horloge
 * serveur) : le client ne décide JAMAIS de `actor_id` ni de l'**électorat** —
 * l'électorat provient de l'état serveur (membres actifs du groupe).
 */
import {
  DomainError,
  GENESIS_HASH,
  assertAllowed,
  cancelProposal,
  castBallot,
  closeProposal,
  executeProposal,
  isCrossGroupAccess,
  openProposal,
  sealEventV1,
  type BallotChoice,
  type JournalEventV1,
  type ProposalRecord,
  type ProposalState,
  type Role,
  type VoteTally,
} from "@kombe/domain";

export interface ProposalContext {
  readonly actorIdentityId: string;
  readonly actorRole: Role;
  readonly actorGroupIds: readonly string[];
  readonly serverDate: string;
  readonly commandId: string;
  readonly expectedVersion: number;
}

interface HeldProposal {
  record: ProposalRecord;
  version: number;
}

export interface OpenProposalCommand {
  readonly proposalId: string;
  readonly subjectKind: string;
  readonly subjectRef: string;
  readonly reason: string;
  readonly durationSeconds: number;
}

/**
 * Règles de décision DÉTENUES CÔTÉ SERVEUR (quorum + version des règles).
 * Posées par les flux serveur / la recette (règles versionnées C04/C05),
 * JAMAIS par une requête cliente : à l'ouverture, la proposition scelle ces
 * règles résolues côté serveur (règle 18 / ADR-0005 — le client ne décide ni
 * son quorum ni la version des règles applicables).
 */
export interface GroupDecisionRules {
  readonly quorumNumerator: number;
  readonly quorumDenominator: number;
  readonly rulesVersion: number;
}

export interface ProposalView {
  readonly voteId: string;
  readonly groupId: string;
  readonly electorateSize: number;
  readonly state: ProposalState;
  readonly subjectKind: string;
  readonly subjectRef: string;
  readonly reason: string;
  readonly rulesVersion: number;
  readonly canonicalHash: string;
  readonly quorumNumerator: number;
  readonly quorumDenominator: number;
  readonly openedAt: number;
  readonly deadline: number;
  readonly tally: VoteTally | null;
  readonly closedAt: number | null;
  readonly effectiveAt: number | null;
  readonly executedAt: number | null;
  readonly cancelReason: string | null;
  readonly version: number;
}

export interface BallotReceipt {
  readonly voteAccepted: boolean;
  readonly voteId: string;
  readonly state: ProposalState;
  readonly version: number;
  readonly reason?: string;
  readonly eventHash?: string;
}

export type ProposalEventType =
  | "proposal.opened"
  | "proposal.ballot"
  | "proposal.closed"
  | "proposal.cancelled"
  | "proposal.executed";

export class FictitiousProposalStore {
  private readonly held = new Map<string, HeldProposal>();
  private readonly journals = new Map<string, JournalEventV1[]>();
  /**
   * Électorat **détenu côté serveur** par groupe (membres actifs). Posé par les
   * flux serveur / la recette (adhésion C03), JAMAIS par une requête cliente :
   * à l'ouverture, la proposition **scelle** cet instantané.
   */
  private readonly electorates = new Map<string, string[]>();

  /**
   * Règles de décision **détenues côté serveur** par groupe (quorum + version).
   * Posées par les flux serveur / la recette, JAMAIS par une requête cliente.
   */
  private readonly groupRules = new Map<string, GroupDecisionRules>();

  setGroupElectorate(groupId: string, identityIds: readonly string[]): void {
    this.electorates.set(groupId, [...identityIds]);
  }

  setGroupRules(groupId: string, rules: GroupDecisionRules): void {
    this.groupRules.set(groupId, { ...rules });
  }

  private static epochOf(serverDate: string): number {
    const ms = Date.parse(serverDate);
    if (Number.isNaN(ms)) {
      throw new DomainError("PROPOSAL_SERVER_DATE_INVALID", "Date serveur illisible");
    }
    return ms;
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
    ctx: ProposalContext,
    groupId: string,
    type: ProposalEventType,
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

  /** Garde d'authentification + anti-IDOR + version (mutante, sans action de rôle). */
  private gateAccess(ctx: ProposalContext, held: HeldProposal): void {
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

  /** Garde de LECTURE : authentification + anti-IDOR scopée par groupe, sans version. */
  private gateRead(ctx: ProposalContext, groupId: string, held: HeldProposal): void {
    if (!ctx.actorIdentityId) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    }
    if (isCrossGroupAccess(ctx.actorGroupIds, groupId)) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Objet hors portée");
    }
    if (held.record.groupId !== groupId) {
      throw new DomainError("RESERVATION_INCOHERENTE", "Proposition introuvable");
    }
  }

  private require(proposalId: string): HeldProposal {
    const held = this.held.get(proposalId);
    if (!held) {
      // Non-divulgation : une proposition inconnu répond comme une réservation
      // absente (404), sans révéler son existence ni son groupe.
      throw new DomainError("RESERVATION_INCOHERENTE", "Proposition introuvable");
    }
    return held;
  }

  /**
   * Ouvre une proposition (7.1). Permission objet `vote.open` d'abord (un
   * membre sans droit → 403), anti-IDOR, puis l'électorat est lu dans l'**état
   * serveur** (jamais fourni par le client) et scellé par le domaine. Naît en
   * `open`, version 1, un événement scellé.
   */
  open(ctx: ProposalContext, groupId: string, input: OpenProposalCommand): ProposalView {
    if (!ctx.actorIdentityId) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    }
    assertAllowed(ctx.actorRole, "vote.open");
    if (isCrossGroupAccess(ctx.actorGroupIds, groupId)) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Objet hors portée");
    }
    if (this.held.has(input.proposalId)) {
      throw new DomainError("EVENT_CHAIN_BREAK", "Proposition déjà ouverte");
    }
    const electorate = this.electorates.get(groupId);
    if (!electorate || electorate.length === 0) {
      // Aucun électorat serveur enregistré : on n'invente pas un corps électoral.
      throw new DomainError("ELECTORATE_INVALIDE", "Électorat serveur indisponible pour ce groupe");
    }
    const rules = this.groupRules.get(groupId);
    if (!rules) {
      // Aucune règle versionnée résolue côté serveur : on n'invente ni le quorum
      // ni la version des règles (règle 18 / ADR-0005 — le client ne décide pas).
      throw new DomainError("RULE_INVALID", "Règles de décision serveur indisponibles pour ce groupe");
    }
    const record = openProposal({
      proposalId: input.proposalId,
      groupId,
      subjectKind: input.subjectKind,
      subjectRef: input.subjectRef,
      reason: input.reason,
      rulesVersion: rules.rulesVersion,
      electorate,
      quorumNumerator: rules.quorumNumerator,
      quorumDenominator: rules.quorumDenominator,
      openedAt: FictitiousProposalStore.epochOf(ctx.serverDate),
      durationSeconds: input.durationSeconds,
    });
    this.held.set(input.proposalId, { record, version: 1 });
    this.appendEvent(ctx, groupId, "proposal.opened", {
      proposalId: record.proposalId,
      electorateSize: record.electorate.length,
      canonicalHash: record.canonicalHash,
    });
    return this.view(ctx, groupId, input.proposalId);
  }

  /**
   * Émet un bulletin (7.2) au nom de l'identité **résolue côté serveur**. Le
   * domaine refuse sans écriture (éligibilité, double vote, hors échéance) :
   * `voteAccepted = false`, **aucun** événement. Une acceptation bump la version
   * et scelle un `proposal.ballot`. Permission objet `vote.cast`.
   */
  cast(ctx: ProposalContext, voteId: string, choice: BallotChoice): BallotReceipt {
    const held = this.require(voteId);
    assertAllowed(ctx.actorRole, "vote.cast");
    this.gateAccess(ctx, held);
    const serverNow = FictitiousProposalStore.epochOf(ctx.serverDate);
    const result = castBallot(held.record, ctx.actorIdentityId, choice, serverNow);
    if (!result.voteAccepted) {
      return {
        voteAccepted: false,
        voteId,
        state: held.record.state,
        version: held.version,
        ...(result.reason !== undefined ? { reason: result.reason } : {}),
      };
    }
    held.record = result.record;
    held.version += 1;
    const eventHash = this.appendEvent(ctx, held.record.groupId, "proposal.ballot", {
      proposalId: voteId,
      choice,
    }).hash;
    return {
      voteAccepted: true,
      voteId,
      state: held.record.state,
      version: held.version,
      eventHash,
    };
  }

  /**
   * Clôture (7.3, 7.4) : **seulement** si l'échéance serveur est atteinte ; le
   * résultat est figé via l'oracle indépendant. Permission objet `vote.open`.
   */
  close(ctx: ProposalContext, voteId: string): { state: ProposalState; tally: VoteTally; effectiveAt: number; version: number; eventHash: string } {
    const held = this.require(voteId);
    assertAllowed(ctx.actorRole, "vote.open");
    this.gateAccess(ctx, held);
    const serverNow = FictitiousProposalStore.epochOf(ctx.serverDate);
    held.record = closeProposal(held.record, serverNow);
    held.version += 1;
    const tally = held.record.tally as VoteTally;
    const eventHash = this.appendEvent(ctx, held.record.groupId, "proposal.closed", {
      proposalId: voteId,
      approved: tally.approved,
      electorateSize: held.record.electorate.length,
    }).hash;
    return { state: held.record.state, tally, effectiveAt: held.record.effectiveAt as number, version: held.version, eventHash };
  }

  /** Annulation **motivée** (7.3, 18.5) — la voie légale pour reprendre un électorat. */
  cancel(
    ctx: ProposalContext,
    voteId: string,
    reason: string,
  ): { state: ProposalState; version: number; eventHash: string } {
    const held = this.require(voteId);
    assertAllowed(ctx.actorRole, "vote.open");
    this.gateAccess(ctx, held);
    const serverNow = FictitiousProposalStore.epochOf(ctx.serverDate);
    held.record = cancelProposal(held.record, reason, serverNow);
    held.version += 1;
    const eventHash = this.appendEvent(ctx, held.record.groupId, "proposal.cancelled", {
      proposalId: voteId,
    }).hash;
    return { state: held.record.state, version: held.version, eventHash };
  }

  /**
   * Exécution **idempotente** (7.4) : seulement une décision clôturée et
   * approuvée. Une ré-exécution rend le même état **sans** nouvel événement
   * (aucun double effet, `proposal.executed` scellé une seule fois).
   */
  execute(
    ctx: ProposalContext,
    voteId: string,
  ): { state: ProposalState; executed: boolean; idempotent: boolean; version: number; eventHash?: string } {
    const held = this.require(voteId);
    assertAllowed(ctx.actorRole, "vote.open");
    this.gateAccess(ctx, held);
    const serverNow = FictitiousProposalStore.epochOf(ctx.serverDate);
    const result = executeProposal(held.record, ctx.actorIdentityId, serverNow);
    held.record = result.record;
    if (result.idempotent) {
      return { state: held.record.state, executed: true, idempotent: true, version: held.version };
    }
    held.version += 1;
    const eventHash = this.appendEvent(ctx, held.record.groupId, "proposal.executed", {
      proposalId: voteId,
      effectiveAt: held.record.effectiveAt,
    }).hash;
    return { state: held.record.state, executed: true, idempotent: false, version: held.version, eventHash };
  }

  /** Projette un objet détenu en vue complète (aucune décision, pure projection). */
  private static toView(held: HeldProposal): ProposalView {
    const r = held.record;
    return {
      voteId: r.proposalId,
      groupId: r.groupId,
      electorateSize: r.electorate.length,
      state: r.state,
      subjectKind: r.subjectKind,
      subjectRef: r.subjectRef,
      reason: r.reason,
      rulesVersion: r.rulesVersion,
      canonicalHash: r.canonicalHash,
      quorumNumerator: r.quorumNumerator,
      quorumDenominator: r.quorumDenominator,
      openedAt: r.openedAt,
      deadline: r.deadline,
      tally: r.tally,
      closedAt: r.closedAt,
      effectiveAt: r.effectiveAt,
      executedAt: r.executedAt,
      cancelReason: r.cancelReason,
      version: held.version,
    };
  }

  /** Vue SCOPEE et authentifiée : le groupe du chemin doit être le groupe réel de l'objet. */
  view(ctx: ProposalContext, groupId: string, voteId: string): ProposalView {
    const held = this.require(voteId);
    this.gateRead(ctx, groupId, held);
    return FictitiousProposalStore.toView(held);
  }

  /**
   * Historique des **décisions** d'un groupe (7.5) : propositions closes,
   * exécutées ou annulées (une `open` n'est pas encore une décision). Lecture
   * authentifiée et scopée ; ne divulgue rien d'un autre groupe. Rend des vues
   * complètes (conformes au schéma `Vote`) triées par date de décision
   * chronologique croissante (clôture / exécution / annulation).
   */
  history(ctx: ProposalContext, groupId: string): ProposalView[] {
    if (!ctx.actorIdentityId) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    }
    if (isCrossGroupAccess(ctx.actorGroupIds, groupId)) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Objet hors portée");
    }
    const decided: HeldProposal[] = [];
    for (const held of this.held.values()) {
      if (held.record.groupId !== groupId) continue;
      if (held.record.state === "open") continue;
      decided.push(held);
    }
    // Tri chronologique croissant par instant de décision (exécution > clôture >
    // annulation), le tout résolu sur l'état serveur, jamais sur une entrée cliente.
    const decisionTs = (r: ProposalRecord): number =>
      r.executedAt ?? r.closedAt ?? r.cancelledAt ?? r.deadline;
    decided.sort((a, b) => decisionTs(a.record) - decisionTs(b.record));
    return decided.map((held) => FictitiousProposalStore.toView(held));
  }

  eventCount(groupId: string, type: ProposalEventType): number {
    return this.journalFor(groupId).filter((e) => e.type === type).length;
  }

  journalTailHash(groupId: string): string | null {
    const chain = this.journalFor(groupId);
    return chain.length ? (chain[chain.length - 1] as JournalEventV1).hash : null;
  }
}
