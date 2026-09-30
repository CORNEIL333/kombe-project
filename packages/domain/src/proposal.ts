/**
 * Propositions, votes et décisions (C09 — stories 7.1 → 7.5, 18.5).
 * Logique **PURE**, horloge **SERVEUR injectée**, sans persistance.
 *
 * Objectif : rendre tout résultat de vote **reproductible** et son exécution
 * **contrôlée**. Les invariants structurants :
 *  - **électorat figé à l'ouverture** : le dénominateur du quorum est scellé
 *    dans l'instantané ; une arrivée ou un départ APRÈS ouverture ne l'altère
 *    pas. Changer le dénominateur exige **annuler** (motivé) puis **rouvrir**
 *    une nouvelle proposition (jamais retaire l'électorat en cours de volée) ;
 *  - bulletin **unique** par électeur **identifié** (pas de vote anonyme, pas
 *    de double vote) ;
 *  - **aucune réception après l'échéance SERVEUR** : la latence est jugée sur
 *    l'horloge serveur injectée, jamais sur une date client ;
 *  - **quorum/majorité** délégués à l'**oracle indépendant** `voteResult`
 *    (arithmétique entière, ceil(2N/3), abstentions comptent au seul quorum,
 *    zéro suffrage exprimé rejette, égalité rejette) ;
 *  - **exécution idempotente** après clôture, portant résultat, date d'effet
 *    SERVEUR **jamais rétroactive** ; une ré-exécution ne duplique aucun effet.
 *
 * Le **calcul du résultat** ne vit PAS ici sous une forme re-faisable par le
 * client : ce module ne prend jamais `actor_id` ni `electorat` « fournis
 * librement » — l'appelant (store/routeur, puis C01 session + RLS) résout
 * l'identité côté serveur et lui passe un électorat déjà validé.
 */
import { DomainError } from "./errors.js";
import { canonicalHash } from "./canonical.js";
import { voteResult } from "./vote.js";

export const BALLOT_CHOICES = ["yes", "no", "abstain"] as const;
export type BallotChoice = (typeof BALLOT_CHOICES)[number];

export type ProposalState = "open" | "closed" | "executed" | "cancelled";

/** Résultat figé à la clôture, recalculable depuis les bulletins + l'électorat scellé. */
export interface VoteTally {
  readonly yes: number;
  readonly no: number;
  readonly abstain: number;
  readonly turnout: number;
  readonly quorum: number;
  readonly approved: boolean;
}

export interface ProposalRecord {
  readonly proposalId: string;
  readonly groupId: string;
  readonly subjectKind: string;
  readonly subjectRef: string;
  readonly reason: string;
  readonly canonicalHash: string;
  readonly rulesVersion: number;
  /** Instantané **figé** des identités éligibles (dénominateur du quorum). */
  readonly electorate: readonly string[];
  readonly quorumNumerator: number;
  readonly quorumDenominator: number;
  readonly openedAt: number;
  /** Échéance **SERVEUR** = `openedAt + durée` (le client n'en décide pas). */
  readonly deadline: number;
  state: ProposalState;
  ballots: Readonly<Record<string, BallotChoice>>;
  tally: VoteTally | null;
  closedAt: number | null;
  effectiveAt: number | null;
  executedAt: number | null;
  executedByIdentityId: string | null;
  cancelReason: string | null;
  cancelledAt: number | null;
}

export interface OpenProposalInput {
  readonly proposalId: string;
  readonly groupId: string;
  readonly subjectKind: string;
  readonly subjectRef: string;
  readonly reason: string;
  readonly rulesVersion: number;
  readonly electorate: readonly string[];
  readonly quorumNumerator: number;
  readonly quorumDenominator: number;
  readonly openedAt: number;
  readonly durationSeconds: number;
}

export interface BallotResult {
  readonly voteAccepted: boolean;
  readonly record: ProposalRecord;
  readonly reason?: string;
}

export interface ExecuteResult {
  readonly record: ProposalRecord;
  readonly executed: boolean;
  /** `true` si la proposition était **déjà** exécutée : aucun nouvel effet. */
  readonly idempotent: boolean;
}

/**
 * Ouvre une proposition. L'électorat est passé **déjà résolu côté serveur** ;
 * ici on le **scelle** (instantané figé, sans doublon, non vide) et on calcule
 * l'échéance serveur. Aucune décision de résultat n'est encodable ici.
 */
export function openProposal(input: OpenProposalInput): ProposalRecord {
  if (input.reason.trim() === "") {
    throw new DomainError("PROPOSAL_REASON_REQUIRED", "Motif de proposition requis");
  }
  if (input.subjectKind.trim() === "" || input.subjectRef.trim() === "") {
    throw new DomainError("PROPOSAL_REASON_REQUIRED", "Objet de proposition requis");
  }
  if (input.electorate.length === 0) {
    throw new DomainError("ELECTORATE_INVALIDE", "Électorat vide à l'ouverture");
  }
  const seen = new Set<string>();
  for (const id of input.electorate) {
    if (seen.has(id)) {
      throw new DomainError("ELECTORATE_INVALIDE", "Électorat contient un doublon");
    }
    seen.add(id);
  }
  if (
    !Number.isInteger(input.quorumNumerator) ||
    input.quorumNumerator < 1 ||
    !Number.isInteger(input.quorumDenominator) ||
    input.quorumDenominator < 1 ||
    input.quorumNumerator > input.quorumDenominator
  ) {
    // Le numérateur d'un quorum ne peut être nul : un quorum 0/N serait
    // incompressible et ferait approuver une décision collective par un seul oui.
    throw new DomainError("VOTE_HORS_LIMITES", "Quorum hors limites");
  }
  if (!Number.isInteger(input.openedAt) || input.openedAt < 0) {
    throw new DomainError("PROPOSAL_DEADLINE_INVALID", "Heure d'ouverture serveur invalide");
  }
  if (!Number.isInteger(input.durationSeconds) || input.durationSeconds < 1) {
    throw new DomainError("PROPOSAL_DEADLINE_INVALID", "Durée de volée invalide");
  }
  const deadline = input.openedAt + input.durationSeconds * 1000;
  if (deadline <= input.openedAt) {
    throw new DomainError("PROPOSAL_DEADLINE_INVALID", "Échéance serveur non postérieure à l'ouverture");
  }
  const hash = canonicalHash({
    proposalId: input.proposalId,
    groupId: input.groupId,
    subjectKind: input.subjectKind,
    subjectRef: input.subjectRef,
    reason: input.reason,
    rulesVersion: input.rulesVersion,
    electorate: [...input.electorate],
    quorumNumerator: input.quorumNumerator,
    quorumDenominator: input.quorumDenominator,
    openedAt: input.openedAt,
    deadline,
  });
  return {
    proposalId: input.proposalId,
    groupId: input.groupId,
    subjectKind: input.subjectKind,
    subjectRef: input.subjectRef,
    reason: input.reason,
    canonicalHash: hash,
    rulesVersion: input.rulesVersion,
    electorate: [...input.electorate],
    quorumNumerator: input.quorumNumerator,
    quorumDenominator: input.quorumDenominator,
    openedAt: input.openedAt,
    deadline,
    state: "open",
    ballots: {},
    tally: null,
    closedAt: null,
    effectiveAt: null,
    executedAt: null,
    executedByIdentityId: null,
    cancelReason: null,
    cancelledAt: null,
  };
}

/** Compte les bulletins. Le dénominateur reste l'**électorat scellé**, pas le nombre de votants. */
function tallyOf(record: ProposalRecord): { yes: number; no: number; abstain: number } {
  let yes = 0;
  let no = 0;
  let abstain = 0;
  for (const choice of Object.values(record.ballots)) {
    if (choice === "yes") yes += 1;
    else if (choice === "no") no += 1;
    else abstain += 1;
  }
  return { yes, no, abstain };
}

/**
 * Émet un bulletin pour une identité **résolue côté serveur**. Refus d'affaire
 * (`voteAccepted = false`, **aucune mutation**) : hors électorat, après échéance
 * serveur, proposition non ouverte, ou double vote. Une valeur de choix hors
 * enum est une anomalie de flux → erreur stable.
 */
export function castBallot(
  record: ProposalRecord,
  identityId: string,
  choice: BallotChoice,
  serverNow: number,
): BallotResult {
  if (!BALLOT_CHOICES.includes(choice)) {
    throw new DomainError("VOTE_HORS_LIMITES", "Choix de bulletin invalide");
  }
  if (record.state !== "open") {
    return { voteAccepted: false, record, reason: "NOT_OPEN" };
  }
  if (!record.electorate.includes(identityId)) {
    return { voteAccepted: false, record, reason: "NOT_ELIGIBLE" };
  }
  if (serverNow > record.deadline) {
    return { voteAccepted: false, record, reason: "LATE" };
  }
  if (Object.prototype.hasOwnProperty.call(record.ballots, identityId)) {
    return { voteAccepted: false, record, reason: "ALREADY_VOTED" };
  }
  const ballots = { ...record.ballots, [identityId]: choice };
  return { voteAccepted: true, record: { ...record, ballots } };
}

/**
 * Clôture une proposition et **fige le résultat** via l'oracle indépendant.
 * N'exécute rien. Exigences : état `open`, échéance serveur dépassée (la
 * volée est gouvernée par l'horloge serveur, non par le client). La **date
 * d'effet** est posée à la valeur serveur (jamais rétroactive).
 */
export function closeProposal(
  record: ProposalRecord,
  serverNow: number,
): ProposalRecord {
  if (record.state !== "open") {
    throw new DomainError("PROPOSAL_STATE_INVALID", "Seule une proposition ouverte se clôture");
  }
  if (serverNow < record.deadline) {
    throw new DomainError("PROPOSAL_NOT_DUE", "Échéance serveur non atteinte");
  }
  const { yes, no, abstain } = tallyOf(record);
  const electorateSize = record.electorate.length;
  const { quorum, approved } = voteResult(
    electorateSize,
    yes,
    no,
    abstain,
    record.quorumNumerator,
    record.quorumDenominator,
  );
  const tally: VoteTally = { yes, no, abstain, turnout: yes + no + abstain, quorum, approved };
  return {
    ...record,
    state: "closed",
    tally,
    closedAt: serverNow,
    effectiveAt: serverNow,
  };
}

/**
 * Annule **motivée** une proposition (avant exécution). C'est la voie légale
 * pour changer un électorat en cours de volée : on annule, puis on rouvre une
 * nouvelle proposition (7.3, 18.5). Une décision exécutée n'est jamais annulable.
 */
export function cancelProposal(
  record: ProposalRecord,
  reason: string,
  serverNow: number,
): ProposalRecord {
  if (reason.trim() === "") {
    throw new DomainError("PROPOSAL_CANCEL_REASON_REQUIRED", "Motif d'annulation requis");
  }
  if (record.state === "executed") {
    throw new DomainError("PROPOSAL_STATE_INVALID", "Une décision exécutée ne s'annule pas");
  }
  if (record.state === "cancelled") {
    throw new DomainError("PROPOSAL_STATE_INVALID", "Proposition déjà annulée");
  }
  return {
    ...record,
    state: "cancelled",
    cancelReason: reason,
    cancelledAt: serverNow,
  };
}

/**
 * **Exécution contrôlée et idempotente** (7.4) : seulement une proposition
 * **clôturée ET approuvée collectivement**. Une ré-exécution rend le même état
 * sans nouvel effet (`idempotent = true`) — jamais de double application.
 * `actorIdentityId` est résolu côté serveur.
 */
export function executeProposal(
  record: ProposalRecord,
  actorIdentityId: string,
  serverNow: number,
): ExecuteResult {
  if (record.state === "executed") {
    return { record, executed: true, idempotent: true };
  }
  if (record.state !== "closed") {
    throw new DomainError("PROPOSAL_STATE_INVALID", "Seule une proposition clôturée s'exécute");
  }
  if (record.tally === null || !record.tally.approved) {
    throw new DomainError("PROPOSAL_NOT_APPROVED", "Aucune approbation collective à exécuter");
  }
  return {
    record: {
      ...record,
      state: "executed",
      executedAt: serverNow,
      executedByIdentityId: actorIdentityId,
    },
    executed: true,
    idempotent: false,
  };
}
