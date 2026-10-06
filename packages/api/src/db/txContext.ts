/**
 * KÓMBE @kombe/api — contexte transactionnel RLS par requête (Piste A2).
 * Reproduit EXACTEMENT le schéma déjà prouvé par
 * `packages/worker/src/pgWorker.ts` (méthode `transaction()` ; H07 PASS sur
 * Neon réel) : BEGIN, `set_config('kombe.group_id', $1, true)`
 * (transaction-local via le 3e argument `true` — jamais un `SET` global qui
 * fuirait sur une connexion rendue au pool), délais bornés, COMMIT/ROLLBACK.
 * Le rôle `kombe_app` est déjà assumé au niveau de connexion (voir
 * `pgPool.ts`) : aucun `SET ROLE` ici.
 */
import type pg from "pg";
import { DomainError } from "@kombe/domain";

/** Transaction scopée à un groupe : les politiques RLS `tenant_isolation`
 *  (obligation/contribution/journal/…) filtrent sur `kombe.group_id`. */
export async function withGroupTx<T>(
  pool: pg.Pool,
  groupId: string,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  if (!groupId || groupId.length > 200) {
    throw new DomainError("RESERVATION_INCOHERENTE", "Groupe invalide");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('kombe.group_id', $1, true)", [groupId]);
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '10s'");
    await client.query("SET LOCAL lock_timeout = '2s'");
    await client.query("SET LOCAL statement_timeout = '10s'");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* Connexion perdue : rien à faire, le pool la recréera. */
    }
    if (error instanceof DomainError) throw error;
    if (process.env.KOMBE_DEBUG_PG === "1") {
      const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
      process.stderr.write(`[withGroupTx debug] ${detail}\n`);
    }
    // Jamais de message pg brut renvoyé au client (fuite de schéma/contraintes).
    throw new DomainError("RESERVATION_INCOHERENTE", "Opération non confirmée");
  } finally {
    client.release();
  }
}

/**
 * Verrou group-level transaction-scopé (`pg_advisory_xact_lock`, libéré
 * automatiquement au COMMIT/ROLLBACK). Nécessaire quand une transaction
 * doit assigner un `seq` séquentiel dans `journal` (PK `(group_id, seq)`) :
 * le `FOR UPDATE` sur UNE ligne d'obligation ne protège PAS deux obligations
 * DIFFÉRENTES du même groupe qui écriraient dans le même groupe en
 * parallèle. Appelé explicitement par les stores qui écrivent au journal —
 * jamais dans `withGroupTx` lui-même, pour ne pas sérialiser les lectures
 * pures (`view`, `declaredEventCount`) contre les écritures.
 */
export async function lockGroupForJournalWrite(client: pg.PoolClient, groupId: string): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [groupId]);
}
