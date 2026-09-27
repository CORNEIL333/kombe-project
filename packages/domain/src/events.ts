/**
 * Journal d'événements append-only et sa chaîne de hash.
 *
 * Schéma d'événement figé par C00/ADR05 : { groupId, seq, type, version,
 * previousHash, payload }. Le hash d'un événement est SHA-256 sur la forme
 * canonique RFC 8785 de l'événement SANS son propre champ `hash` (règle :
 * « exclure seulement le champ de son propre hash »). La chaîne relie chaque
 * événement au hash du précédent ; le premier hérite du hash de genèse.
 *
 * Les projections sont reconstruisibles à partir du journal ; ce module ne
 * fait que définir la structure et la vérification d'intégrité, pas la
 * persistance (celle-ci est PostgreSQL réel, hors du socle testable ici).
 */
import { canonicalHash, GENESIS_HASH } from "./canonical.js";
import { DomainError } from "./errors.js";

export interface JournalEvent {
  readonly groupId: string;
  readonly seq: number;
  readonly type: string;
  readonly version: number;
  readonly previousHash: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly hash: string;
}

/** Calcule le hash canonique d'un événement, champ `hash` exclu. */
export function computeEventHash(
  event: Omit<JournalEvent, "hash">,
): string {
  return canonicalHash({
    groupId: event.groupId,
    seq: event.seq,
    type: event.type,
    version: event.version,
    previousHash: event.previousHash,
    payload: event.payload,
  });
}

/** Scelle un événement en lui adjoignant son hash canonique. */
export function sealEvent(event: Omit<JournalEvent, "hash">): JournalEvent {
  return { ...event, hash: computeEventHash(event) };
}

/** Vérifie que le hash stocké correspond bien au contenu (sans le champ hash). */
export function verifyEventIntegrity(event: JournalEvent): void {
  const recomputed = computeEventHash({
    groupId: event.groupId,
    seq: event.seq,
    type: event.type,
    version: event.version,
    previousHash: event.previousHash,
    payload: event.payload,
  });
  if (recomputed !== event.hash) {
    throw new DomainError("EVENT_HASH_MISMATCH", "Hash d'événement non conforme");
  }
}

/**
 * Vérifie la continuité d'une chaîne : genèse en tête, chaque previousHash
 * égal au hash du prédécesseur, séquence incrémentée d'un pas, intégrité de
 * chaque événement. Toute rupture lève une erreur stable.
 */
export function verifyChain(events: readonly JournalEvent[]): void {
  let expectedPrev = GENESIS_HASH;
  let expectedSeq = 1;
  for (const ev of events) {
    verifyEventIntegrity(ev);
    if (ev.previousHash !== expectedPrev) {
      throw new DomainError("EVENT_CHAIN_BREAK", "Rupture de chaîne du journal");
    }
    if (ev.seq !== expectedSeq) {
      throw new DomainError("EVENT_CHAIN_BREAK", "Séquence du journal discontinue");
    }
    expectedPrev = ev.hash;
    expectedSeq += 1;
  }
}
