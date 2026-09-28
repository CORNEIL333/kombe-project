/**
 * Store de journal FICTIF en mémoire pour la recette C11. Il conserve une
 * chaîne d'événements scellés par groupe et délègue TOUTE décision aux
 * fonctions pures de `@kombe/domain` (`journal.ts`) : replay versionné,
 * vérification indépendante, checkpoints scellés, timeline filtrée par droits.
 *
 * Comme les stores C00–C05, il ne prétend NI persister, NI verrouiller, NI
 * rendre l'append-only réel : la protection contre UPDATE/DELETE, la table
 * `checkpoint` hors privilèges applicatifs et l'atomicité événement/projection/
 * outbox sont le contrat `0007_event_journal.sql` — preuve base réelle
 * **BLOCKED** sans PostgreSQL. `tamperCopyOf` SIMULE une copie altérée du
 * JOURNAL (scénario C11-TAMPER : le composant doit la DÉTECTER) ; ce n'est
 * pas une écriture du chemin applicatif, qui reste fermé côté DB.
 */
import {
  DomainError,
  GENESIS_HASH,
  assertAllowed,
  buildTimeline,
  replayJournal,
  sealEventV1,
  sealCheckpoint,
  verifyJournal,
  type Checkpoint,
  type JournalEvent,
  type JournalRole,
  type ReplayState,
  type TimelineEntry,
  type VerifyResult,
} from "@kombe/domain";

export class FictitiousJournalStore {
  private readonly journals = new Map<string, JournalEvent[]>();
  private readonly checkpoints = new Map<string, Checkpoint[]>();
  /** Projection de référence stockée, à réconcilier après replay (9.5). */
  private readonly referenceProjections = new Map<string, Map<string, bigint>>();

  private journalFor(groupId: string): JournalEvent[] {
    let chain = this.journals.get(groupId);
    if (!chain) {
      chain = [];
      this.journals.set(groupId, chain);
    }
    return chain;
  }

  /** Ajoute un événement à la chaîne scellée du groupe (append uniquement). */
  append(input: {
    readonly groupId: string;
    readonly type: string;
    readonly actorIdentityId: string;
    readonly actorRole: JournalRole;
    readonly serverDate: string;
    readonly commandId: string;
    readonly body: Readonly<Record<string, unknown>>;
  }): JournalEvent {
    const chain = this.journalFor(input.groupId);
    const previousHash = chain.length ? (chain[chain.length - 1] as JournalEvent).hash : GENESIS_HASH;
    const event = sealEventV1({
      groupId: input.groupId,
      seq: chain.length + 1,
      type: input.type,
      version: 1,
      previousHash,
      actorIdentityId: input.actorIdentityId,
      actorRole: input.actorRole,
      serverDate: input.serverDate,
      commandId: input.commandId,
      body: input.body,
    });
    chain.push(event);
    return event;
  }

  /** Journal brut réservé au vérificateur interne (jamais servi en HTTP). */
  events(groupId: string): JournalEvent[] {
    const chain = this.journals.get(groupId);
    if (!chain || chain.length === 0) {
      throw new DomainError("RESERVATION_INCOHERENTE", "Journal absent");
    }
    return [...chain];
  }

  /** Vérification indépendante de la chaîne + checkpoints (9.2/9.4). */
  verify(groupId: string): VerifyResult {
    return verifyJournal(this.events(groupId), {
      checkpoints: this.checkpoints.get(groupId) ?? [],
    });
  }

  /** Timeline en langage clair, filtrée par les droits du rôle (9.1/9.3). */
  timeline(groupId: string, role: JournalRole): TimelineEntry[] {
    assertAllowed(role, "journal.read");
    return buildTimeline(this.events(groupId), role);
  }

  /** Émet un checkpoint externe scellé sur le hash de tête (9.2). */
  checkpoint(
    groupId: string,
    role: JournalRole,
    issuedBy: string,
    issuedAt: string,
  ): Checkpoint {
    assertAllowed(role, "journal.checkpoint");
    const chain = this.events(groupId);
    const head = chain[chain.length - 1] as JournalEvent;
    const cp = sealCheckpoint({
      groupId,
      seq: head.seq,
      headHash: head.hash,
      issuedAt,
      issuedBy,
    });
    const list = this.checkpoints.get(groupId) ?? [];
    this.checkpoints.set(groupId, [...list, cp]);
    return cp;
  }

  /**
   * Rejoue le journal et réconcilie la projection reconstruite avec la
   * projection de référence stockée (C11-REBUILD : effacer la projection ne
   * doit rien changer — le replay la régénère à l'identique).
   */
  rebuild(groupId: string): { projectionMatches: boolean; throughSeq: number } {
    const state: ReplayState = replayJournal(this.events(groupId));
    const reference = this.referenceProjections.get(groupId) ?? new Map();
    let matches = reference.size === state.obligations.size;
    for (const [obligationId, proj] of state.obligations) {
      if (reference.get(obligationId) !== proj.validatedNet) {
        matches = false;
        break;
      }
    }
    // Après reconciliation, la référence est la projection reconstruite.
    const next = new Map<string, bigint>();
    for (const [obligationId, proj] of state.obligations) {
      next.set(obligationId, proj.validatedNet);
    }
    this.referenceProjections.set(groupId, next);
    return { projectionMatches: matches, throughSeq: state.throughSeq };
  }

  /** Fixe une projection de référence (seed de test ; simule une vue figée). */
  setReferenceProjection(groupId: string, obligationId: string, validatedNet: bigint): void {
    const map = this.referenceProjections.get(groupId) ?? new Map();
    map.set(obligationId, validatedNet);
    this.referenceProjections.set(groupId, map);
  }

  /** Vérifie une COPIE fournie (le vérificateur reste indépendant du stock). */
  verifyCopy(copy: readonly JournalEvent[]): VerifyResult {
    return verifyJournal(copy, { checkpoints: this.checkpoints.get(copy[0]?.groupId ?? "") ?? [] });
  }

  /**
   * C11-TAMPER — altère une COPIE de la chaîne (montant d'un événement),
   * comme le ferait une main-d'oecuvre modifiant un export du journal. La
   * chaîne interne reste intacte ; la détection porte sur la copie fournie.
   */
  tamperCopyOf(groupId: string, seq: number, amount: unknown): JournalEvent[] {
    const chain = this.events(groupId);
    return chain.map((ev) =>
      ev.seq === seq
        ? {
            ...ev,
            payload: {
              ...(ev.payload as Record<string, unknown>),
              body: {
                ...((ev.payload as Record<string, unknown>)["body"] as Record<string, unknown>),
                amount,
              },
            },
          }
        : ev,
    );
  }
}
