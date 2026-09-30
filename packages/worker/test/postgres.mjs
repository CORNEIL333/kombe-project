// Recette en base RÉELLE exclusivement. Fixtures fictives, aucune connexion externe.
import assert from 'node:assert/strict';
import { PgOutboxWorker } from '../dist/pgWorker.js';
import { Simulator } from '../dist/simulator.js';
import { GENESIS_HASH, sealEventV1, replayJournal } from '../../domain/dist/index.js';

export async function runC13(pg, migrator, url) {
  const group = 'c13_fictif';
  const who = 'c13_destinataire_fictif';
  let now = Date.now();
  const pool = new pg.Pool({ connectionString: url, options: '-c role=kombe_worker', max: 4 });
  const provider = new Simulator('unavailable');
  const workerA = new PgOutboxWorker(pool, provider, () => now, () => 0, 'worker_fictif_A');
  const workerB = new PgOutboxWorker(pool, provider, () => now, () => 0, 'worker_fictif_B');
  const observations = {};
  const q = (sql, values) => migrator.query(sql, values);
  let seq = 0;
  let prev = GENESIS_HASH;
  const events = [];
  async function append(type = 'contribution.validated', transaction = false) {
    const event = sealEventV1({ groupId: group, seq: seq + 1, type, version: 1, previousHash: prev,
      actorIdentityId: who, actorRole: 'member', serverDate: new Date(now).toISOString(), commandId: `c13_fixture_${seq+1}`,
      body: { obligationId: 'c13_obligation_fictive', amount: 50000 } });
    if (transaction) await q('BEGIN');
    await q(`INSERT INTO journal(group_id,seq,event_type,previous_hash,hash,payload) VALUES($1,$2,$3,$4,$5,$6)`,
      [group,event.seq,event.type,event.previousHash,event.hash,event.payload]);
    if (!transaction) { seq++; prev=event.hash; events.push(event); }
    return event;
  }
  async function count(table) { return Number((await q(`SELECT count(*) AS n FROM ${table} WHERE group_id=$1`,[group])).rows[0].n); }
  async function drain(worker = workerA) {
    for (let i=0;i<30;i++) {
      const pending = Number((await q(`SELECT count(*) AS n FROM outbox WHERE group_id=$1 AND state IN ('pending','retry','ambiguous') AND available_at<=$2`,[group,new Date(now)])).rows[0].n);
      if (!pending) return;
      await worker.runOnce(group);
    }
    throw new Error('Budget de recette dépassé');
  }
  try {
    await q(`INSERT INTO identity(identity_id) VALUES($1)`,[who]);
    await q(`INSERT INTO identity_access(identity_id,state,channel_verified) VALUES($1,'active',true)`,[who]);
    await q(`INSERT INTO "group"(group_id,state) VALUES($1,'active')`,[group]);
    await q(`INSERT INTO membership(membership_id,group_id,identity_id,state) VALUES('c13_membre_fictif',$1,$2,'active')`,[group,who]);
    await q(`INSERT INTO notification_preference VALUES($1,$2,false)`,[group,who]);
    await q(`INSERT INTO notification_channel VALUES($1,false)`,[group]);
    // Défaut de référence : deux INSERT sans conflit sur la même alerte => UNIQUE refuse le second.
    const event = await append('contribution.declared');
    const before = await count('internal_notification');
    await assert.rejects(q(`INSERT INTO internal_notification SELECT * FROM internal_notification WHERE group_id=$1`,[group]), {code:'23505'});
    assert.equal(await count('internal_notification'),before);
    await Promise.all([workerA.runOnce(group),workerB.runOnce(group)]);
    await drain();
    const after = Number((await q(`SELECT count(*) AS n FROM internal_notification WHERE event_ref=$1 AND recipient=$2`,[event.hash,who])).rows[0].n);
    assert.equal(after,1);
    observations.C13_WORKERS={internal_notification_count:after};
    await q(`UPDATE notification_preference SET external_enabled=true WHERE group_id=$1`,[group]);
    const validation = await append();
    await drain();
    assert.equal(replayJournal(events).obligations.get('c13_obligation_fictive').validatedNet,50000n);
    assert.equal((await q(`SELECT count(*) AS n FROM journal WHERE group_id=$1 AND seq=$2`,[group,validation.seq])).rows[0].n,'1');
    assert.equal(provider.acceptedCount,0);
    observations.C13_FAIL={financial_validation_preserved:true,external_accepted_count:provider.acceptedCount};
    // Crash avant commit : aucune écriture journal/outbox/interne ni commande ne survit.
    const snapshot = [await count('journal'),await count('outbox'),await count('internal_notification')];
    await append('contribution.validated',true);
    await q('ROLLBACK');
    assert.deepEqual([await count('journal'),await count('outbox'),await count('internal_notification')],snapshot);
    observations.C13_ROLLBACK={partial_commit_count:0};
    // Opt-out retiré APRÈS enqueue, relu par le worker.
    provider.mode='accept';
    const opted = await append();
    await q(`UPDATE notification_preference SET external_enabled=false WHERE group_id=$1`,[group]);
    await drain();
    assert.equal(provider.acceptedCount,0);
    const state = (await q(`SELECT state FROM outbox WHERE event_ref=$1 AND channel='push'`,[opted.hash])).rows[0].state;
    assert.equal(state,'suppressed');
    observations.C13_OPT_OUT={external_sent:false};
    now+=60_000; await drain();
    // Crash après prise, puis reprise et ancien token refusé sans écriture.
    const crashEvent = await append();
    const leased = await workerA.claim(group);
    assert.ok(leased);
    now+=31_000;
    const replacement = await workerB.claim(group);
    assert.ok(replacement);
    const traces = await count('notification_delivery');
    assert.equal(await workerA.dispatch(group,leased),'stale');
    assert.equal(await count('notification_delivery'),traces);
    await workerB.dispatch(group,replacement);
    await drain();
    assert.equal(Number((await q(`SELECT count(*) AS n FROM internal_notification WHERE event_ref=$1`,[crashEvent.hash])).rows[0].n),1);
    observations.C13_LEASE={stale_write_count:0};
    // Prestataire accepte puis perd sa réponse ; la reprise utilise le même hash canonique.
    await q(`UPDATE notification_preference SET external_enabled=true WHERE group_id=$1`,[group]);
    provider.mode='accepted_then_crash';
    const ambiguousEvent=await append();
    await drain();
    const accepted=provider.acceptedCount;
    assert.ok(accepted>0);
    assert.equal((await q(`SELECT state FROM outbox WHERE event_ref=$1 AND channel='push'`,[ambiguousEvent.hash])).rows[0].state,'ambiguous');
    provider.mode='accept'; now+=60_000; await drain();
    assert.equal(provider.acceptedCount,accepted);
    observations.C13_AMBIGUOUS={durable_consumer_acceptance_count:1};
    // Tentatives bornées et trace dead-letter, puis relecture autorisée et quota.
    provider.mode='unavailable';
    const failed=await append();
    for(let i=0;i<6;i++) { await drain(); now+=60_000; }
    const dead=(await q(`SELECT * FROM outbox WHERE event_ref=$1 AND channel='push'`,[failed.hash])).rows[0];
    assert.equal(dead.state,'dead'); assert.equal(dead.attempts,5);
    const beforeDenied=await count('notification_delivery');
    await assert.rejects(workerA.replay(group,String(dead.outbox_id),who),{code:'PRIVILEGE_NOT_GRANTED'});
    assert.equal(await count('notification_delivery'),beforeDenied);
    await q(`INSERT INTO role_assignment(role_assignment_id,group_id,membership_id,role,accepted_at) VALUES('c13_auditeur',$1,'c13_membre_fictif','auditor',now())`,[group]);
    for(let n=0;n<3;n++) {
      await workerA.replay(group,String(dead.outbox_id),who);
      for(let i=0;i<6;i++) { await drain(); now+=60_000; }
    }
    const beforeQuota=await count('notification_delivery');
    await assert.rejects(workerA.replay(group,String(dead.outbox_id),who),{code:'RESERVATION_INCOHERENTE'});
    assert.equal(await count('notification_delivery'),beforeQuota);
    observations.C13_DEAD={attempts:dead.attempts,replay_quota:3};
    // Droits révoqués : synchronisation vide, aucun effet d'écriture à la lecture.
    await q(`UPDATE membership SET state='revoked' WHERE membership_id='c13_membre_fictif'`);
    const readCount=await count('notification_delivery');
    assert.deepEqual(await workerA.readInternal(group,who),[]);
    assert.equal(await count('notification_delivery'),readCount);
    assert.deepEqual(await workerA.readInternal('grpB',who),[]);
    observations.C13_REVOKED={visible_notifications:0};
    return observations;
  } finally { await pool.end(); }
}
