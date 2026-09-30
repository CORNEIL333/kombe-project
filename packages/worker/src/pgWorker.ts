/** C13 : adaptateur pour un Pool pg réel. Aucun faux store PostgreSQL. */
import { randomUUID } from 'node:crypto';
import { DomainError } from '@kombe/domain';
import { LEASE_MS, LOCK_SCREEN_TEXT, PROVIDER_TIMEOUT_MS, REPLAY_MAX, decideDispatch, deliveryRef, retryDecision, validClock, type Channel, type DispatchRights, type Provider } from './outbox.js';

/** Interface structurelle compatible pg ; aucune nouvelle dépendance du dépôt. */
export interface SqlClient {
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
  release(): void;
}
export interface SqlPool { connect(): Promise<SqlClient>; }
interface Task {
  id: string; eventRef: string; recipient: string; channel: Channel;
  type: string; attempts: number; max: number; expiresAt: number; token: string;
}
export class PgOutboxWorker {
  constructor(private readonly pool: SqlPool, private readonly provider: Provider,
    private readonly clock: () => number = Date.now, private readonly jitter: () => number = Math.random,
    private readonly workerId: string = randomUUID()) {}

  private async transaction<T>(group: string, fn: (client: SqlClient) => Promise<T>): Promise<T> {
    if (!group || group.length > 200) throw new DomainError('RESERVATION_INCOHERENTE', 'Groupe invalide');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('kombe.group_id',$1,true)", [group]);
      await client.query("SET LOCAL idle_in_transaction_session_timeout = '10s'");
      await client.query("SET LOCAL lock_timeout = '2s'");
      await client.query("SET LOCAL statement_timeout = '10s'");
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* Connexion perdue, reprise par lease. */ }
      if (error instanceof DomainError) throw error;
      throw new DomainError('RESERVATION_INCOHERENTE', 'Opération de notification non confirmée');
    } finally { client.release(); }
  }
  private now(): number { const now = this.clock(); validClock(now); return now; }

  private async trace(client: SqlClient, group: string, task: Task, state: string, code: string, now: number, actor = this.workerId): Promise<void> {
    await client.query(`INSERT INTO notification_delivery(group_id,outbox_id,attempt,state,actor,recorded_at,code)
      VALUES($1,$2,$3,$4,$5,$6,$7)`, [group, task.id, task.attempts, state, actor, new Date(now), code]);
  }
  async claim(group: string): Promise<Task | null> {
    const now = this.now();
    return this.transaction(group, async (client) => {
      // Reprise : une émission commencée sans acquittement est explicitement ambiguë.
      const stale = await client.query(`SELECT * FROM outbox WHERE group_id=$1 AND state='leased'
        AND locked_until <= $2 ORDER BY outbox_id FOR UPDATE SKIP LOCKED LIMIT 100`, [group, new Date(now)]);
      for (const row of stale.rows) {
        const task = this.task(row);
        const state = task.attempts >= task.max ? 'dead' : 'ambiguous';
        await client.query(`UPDATE outbox SET state=$2,locked_by=NULL,locked_until=NULL,lease_token=NULL WHERE outbox_id=$1`, [task.id, state]);
        await this.trace(client, group, task, 'ambiguous', 'CHANNEL_NOT_VERIFIED', now);
        if (state === 'dead') await this.trace(client, group, task, 'dead', 'CHANNEL_NOT_VERIFIED', now);
      }
      // Les tâches en suspension consomment elles aussi un budget borné de prises.
      const selected = await client.query(`SELECT * FROM outbox WHERE group_id=$1
        AND state IN ('pending','retry','ambiguous') AND available_at <= $2
        ORDER BY available_at,outbox_id FOR UPDATE SKIP LOCKED LIMIT 1`, [group, new Date(now)]);
      const row = selected.rows[0];
      if (!row) return null;
      const task = this.task(row);
      if (task.attempts >= task.max || now >= task.expiresAt) {
        const state = now >= task.expiresAt ? 'expired' : 'dead';
        await client.query('UPDATE outbox SET state=$2 WHERE outbox_id=$1', [task.id, state]);
        await this.trace(client, group, task, state, state === 'expired' ? 'TOKEN_EXPIRED' : 'CHANNEL_NOT_VERIFIED', now);
        return null;
      }
      const token = randomUUID();
      await client.query(`UPDATE outbox SET state='leased',attempts=attempts+1,locked_by=$2,locked_until=$3,lease_token=$4
        WHERE outbox_id=$1`, [task.id, this.workerId, new Date(now + LEASE_MS), token]);
      return { ...task, attempts: task.attempts + 1, token };
    });
  }
  private task(row: Record<string, unknown>): Task {
    return { id: String(row['outbox_id']), eventRef: String(row['event_ref']), recipient: String(row['recipient']),
      channel: row['channel'] as Channel, type: String(row['notification_type']), attempts: Number(row['attempts']),
      max: Number(row['attempts_max']), expiresAt: new Date(row['expires_at'] as string).getTime(), token: String(row['lease_token'] ?? '') };
  }

  /** Une unité bornée ; l'ordonnanceur fournit les groupes depuis sa config serveur. */
  async runOnce(group: string): Promise<'idle' | 'processed' | 'stale'> {
    const task = await this.claim(group);
    if (!task) return 'idle';
    return this.dispatch(group, task);
  }
  async dispatch(group: string, leasedTask: Task): Promise<'processed' | 'stale'> {
    return this.transaction(group, async (client) => {
      const now = this.now();
      const owned = await client.query(`SELECT * FROM outbox WHERE group_id=$1 AND outbox_id=$2
        AND state='leased' AND lease_token=$3 AND locked_until>$4 FOR UPDATE`, [group, leasedTask.id, leasedTask.token, new Date(now)]);
      if (!owned.rows[0]) return 'stale';
      const task = this.task(owned.rows[0]);
      // Droits/préférences relus ET verrouillés jusqu'à décision/émission.
      const rightsResult = await client.query('SELECT * FROM kombe_c13_dispatch_rights($1,$2)', [group, task.recipient]);
      const r = rightsResult.rows[0];
      const rights: DispatchRights = { active: r?.['active'] === true, externalEnabled: r?.['external_enabled'] === true, suspended: r?.['suspended'] !== false };
      const decision = decideDispatch(rights, task.channel, now, task.expiresAt);
      let state: string = decision;
      let code = 'OK';
      let nextAt = now;
      if (decision === 'deliver' && task.channel === 'internal') {
        // Persistance indépendante déjà réalisée dans la transaction métier.
        await client.query(`INSERT INTO internal_notification(group_id,event_seq,event_ref,recipient,notification_type,label)
          SELECT group_id,event_seq,event_ref,recipient,notification_type,$2 FROM outbox WHERE outbox_id=$1
          ON CONFLICT(event_ref,recipient,notification_type) DO NOTHING`, [task.id, LOCK_SCREEN_TEXT]);
        state = 'delivered';
      } else if (decision === 'deliver') {
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const result = await Promise.race([
            this.provider.send({ idempotencyRef: deliveryRef({ eventRef: task.eventRef, recipient: task.recipient, channel: task.channel, type: task.type }), recipient: task.recipient, text: LOCK_SCREEN_TEXT }, controller.signal),
            new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, PROVIDER_TIMEOUT_MS); }),
          ]);
          if (result.status === 'accepted') state = 'delivered';
          else { const retry = retryDecision(task.attempts, task.max, this.now(), this.jitter()); state = retry.state; nextAt = retry.nextAt; code = 'CHANNEL_NOT_VERIFIED'; }
        } catch {
          // Réseau coupé / acceptation suivie d'un crash : on ne sait PAS si envoyé.
          const retry = retryDecision(task.attempts, task.max, this.now(), this.jitter());
          state = retry.state === 'dead' ? 'dead' : 'ambiguous'; nextAt = retry.nextAt; code = 'CHANNEL_NOT_VERIFIED';
          await this.trace(client, group, task, 'ambiguous', code, this.now());
        } finally { if (timer !== undefined) clearTimeout(timer); }
      } else if (decision === 'deferred') {
        const retry = retryDecision(task.attempts, task.max, now, this.jitter());
        state = retry.state; nextAt = retry.nextAt; code = 'CHANNEL_NOT_VERIFIED';
        await this.trace(client, group, task, 'deferred', code, now);
      } else { code = decision === 'expired' ? 'TOKEN_EXPIRED' : 'PRIVILEGE_NOT_GRANTED'; }
      const finished = this.now();
      if (finished >= now + LEASE_MS) throw new DomainError('TOKEN_EXPIRED', 'Lease expiré');
      const updated = await client.query(`UPDATE outbox SET state=$3,available_at=$4,locked_by=NULL,locked_until=NULL,
        lease_token=NULL,processed_at=CASE WHEN $3='delivered' THEN $5 ELSE processed_at END
        WHERE outbox_id=$1 AND lease_token=$2 AND locked_until>$5`, [task.id, task.token, state, new Date(nextAt), new Date(finished)]);
      if (updated.rowCount !== 1) throw new DomainError('TOKEN_EXPIRED', 'Lease expiré');
      await this.trace(client, group, task, state, code, finished);
      return 'processed';
    });
  }
  /** Relecture réservée aux auditeurs/secrétaires actifs, trois reprises maximum. */
  async replay(group: string, outboxId: string, actorIdentityId: string): Promise<void> {
    const now = this.now();
    await this.transaction(group, async (client) => {
      const authorized = await client.query('SELECT kombe_c13_replay_rights($1,$2) AS allowed', [group, actorIdentityId]);
      if (authorized.rows[0]?.['allowed'] !== true) throw new DomainError('PRIVILEGE_NOT_GRANTED', 'Accès refusé');
      const selected = await client.query(`SELECT * FROM outbox WHERE group_id=$1 AND outbox_id=$2
        AND state='dead' AND replay_count<$3 AND expires_at>$4 FOR UPDATE`, [group, outboxId, REPLAY_MAX, new Date(now)]);
      if (!selected.rows[0]) throw new DomainError('RESERVATION_INCOHERENTE', 'Notification indisponible');
      const task = this.task(selected.rows[0]);
      await client.query(`UPDATE outbox SET state='pending',attempts=0,replay_count=replay_count+1,available_at=$2
        WHERE outbox_id=$1`, [task.id, new Date(now)]);
      await this.trace(client, group, task, 'replayed', 'OK', now, actorIdentityId);
    });
  }
  /** Synchronisation interne : identité résolue par le serveur, pas par le corps client. */
  async readInternal(group: string, actorIdentityId: string, afterEventRef?: string): Promise<Record<string, unknown>[]> {
    return this.transaction(group, async (client) => {
      const rights = await client.query('SELECT * FROM kombe_c13_dispatch_rights($1,$2)', [group, actorIdentityId]);
      if (rights.rows[0]?.['active'] !== true) return [];
      let afterDate: unknown = null;
      if (afterEventRef !== undefined) {
        const anchor = await client.query(`SELECT created_at FROM internal_notification
          WHERE group_id=$1 AND recipient=$2 AND event_ref=$3`, [group, actorIdentityId, afterEventRef]);
        if (!anchor.rows[0]) throw new DomainError('RESERVATION_INCOHERENTE', 'Notification indisponible');
        afterDate = anchor.rows[0]['created_at'];
      }
      return (await client.query(`SELECT n.event_ref,n.label,n.created_at FROM internal_notification n
        WHERE n.group_id=$1 AND n.recipient=$2 AND ($3::timestamptz IS NULL OR (n.created_at,n.event_ref)>($3::timestamptz,$4::text))
        ORDER BY n.created_at,n.event_ref LIMIT 100`, [group, actorIdentityId, afterDate, afterEventRef ?? null])).rows;
    });
  }
  /** Journal administratif minimal ; aucune donnée de prestataire ni contenu métier. */
  async readDelivery(group: string, actorIdentityId: string): Promise<Record<string, unknown>[]> {
    return this.transaction(group, async (client) => {
      const rights = await client.query('SELECT kombe_c13_replay_rights($1,$2) AS allowed', [group, actorIdentityId]);
      if (rights.rows[0]?.['allowed'] !== true) throw new DomainError('PRIVILEGE_NOT_GRANTED', 'Accès refusé');
      return (await client.query(`SELECT outbox_id,attempt,state,recorded_at,code FROM notification_delivery
        WHERE group_id=$1 ORDER BY delivery_id DESC LIMIT 100`, [group])).rows;
    });
  }
}
