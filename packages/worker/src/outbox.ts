/**
 * KÓMBE @kombe/worker — contrat de message d'outbox (SQUELETTE, non exécuté).
 *
 * Le worker lit la table `outbox` dans la MÊME base PostgreSQL que l'API
 * (pattern outbox transactionnel, STACK.md) et publie vers des canaux
 * externes. Il N'EFFECTUE AUCUN TRANSFERT DU POT (le pilote n'échange pas
 * d'argent — 00_PROMPT_MAITRE). Sa mise en service réelle (permissions
 * réduites, rejeu idempotent, absence d'effet externe pendant les tests)
 * est un lot ultérieur et reste BLOCKED sans base ni canal sandbox.
 */
import type { JournalEvent } from "@kombe/domain";

export interface OutboxMessage {
  readonly outboxId: string;
  readonly commandId: string;
  readonly topic: string;
  /** L'agent effectif (idempotence) est dérivé du hash canonique de l'événement. */
  readonly idempotencyRef: JournalEvent["hash"];
  readonly payload: Readonly<Record<string, unknown>>;
}

export type PublishResult =
  | { readonly status: "published" }
  | { readonly status: "blocked"; readonly reason: string };

/**
 * Squelette : le traitement réel est Branché sur PostgreSQL + un simulateur
 * de canal sandbox. Ici, il refuse toute exécution tant que l'environnement
 * n'est pas raccordé — aucun succès simulé.
 */
export function processOutbox(_message: OutboxMessage): PublishResult {
  return {
    status: "blocked",
    reason: "Worker non raccordé à une base réelle ni à un canal sandbox (lot ultérieur).",
  };
}
