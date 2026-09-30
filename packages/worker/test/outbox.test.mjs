import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideDispatch, retryDecision, deliveryRef, LOCK_SCREEN_TEXT } from '../dist/outbox.js';
import { Simulator } from '../dist/simulator.js';

test('C13-OPT_OUT : retrait relu au dispatch', () => {
  assert.equal(decideDispatch({ active: true, externalEnabled: false, suspended: false }, 'push', 10, 100), 'suppressed');
});
test('révocation et TTL refusent la distribution', () => {
  assert.equal(decideDispatch({ active: false, externalEnabled: true, suspended: false }, 'internal', 10, 100), 'suppressed');
  assert.equal(decideDispatch({ active: true, externalEnabled: true, suspended: false }, 'push', 100, 100), 'expired');
});
test('suspension ne supprime pas les notifications internes', () => {
  const rights = { active: true, externalEnabled: true, suspended: true };
  assert.equal(decideDispatch(rights, 'push', 10, 100), 'deferred');
  assert.equal(decideDispatch(rights, 'internal', 10, 100), 'deliver');
});
test('backoff borné, jitter et budget épuisé', () => {
  assert.deepEqual(retryDecision(5, 5, 100, 0), { state: 'dead', nextAt: 100 });
  assert.deepEqual(retryDecision(1, 5, 100, 0), { state: 'retry', nextAt: 600 });
  assert.deepEqual(retryDecision(1, 5, 100, 0.999), { state: 'retry', nextAt: 1100 });
  assert.throws(() => retryDecision(1, 5, 100, NaN), { code: 'RESERVATION_INCOHERENTE' });
});
test('hash canonique stable et distinct par canal/destinataire', () => {
  const key = { eventRef: 'a'.repeat(64), recipient: 'fictif', channel: 'internal', type: 'alert' };
  assert.equal(deliveryRef(key), deliveryRef({ type: 'alert', channel: 'internal', recipient: 'fictif', eventRef: key.eventRef }));
  assert.notEqual(deliveryRef(key), deliveryRef({ ...key, channel: 'push' }));
  assert.match(deliveryRef(key), /^[0-9a-f]{64}$/);
});
test('simulateur : acceptation puis crash et rejeu idempotent', async () => {
  const provider = new Simulator('accepted_then_crash');
  const request = { idempotencyRef: 'b'.repeat(64), recipient: 'fictif', text: LOCK_SCREEN_TEXT };
  await assert.rejects(provider.send(request), { code: 'CHANNEL_NOT_VERIFIED' });
  provider.mode = 'accept';
  assert.equal((await provider.send(request)).status, 'accepted');
  assert.equal(provider.acceptedCount, 1);
});
test('prestataire indisponible : erreur expurgée et aucun envoi', async () => {
  const provider = new Simulator('unavailable');
  await assert.rejects(provider.send({ idempotencyRef: 'c'.repeat(64), recipient: 'fictif', text: LOCK_SCREEN_TEXT }), (e) => {
    assert.equal(e.message.includes('50000'), false);
    return e.code === 'CHANNEL_NOT_VERIFIED';
  });
  assert.equal(provider.acceptedCount, 0);
});

test('simulateur : contenu financier refusé avant acceptation', async () => {
  const provider = new Simulator('accept');
  await assert.rejects(provider.send({ idempotencyRef: 'd'.repeat(64), recipient: 'fictif', text: 'Solde : 50000 XAF' }), { code: 'CHANNEL_NOT_VERIFIED' });
  assert.equal(provider.acceptedCount,0);
});
test('toutes les reprises restent bornées, sans délai négatif', () => {
  for (let attempt=1;attempt<=5;attempt++) {
    for (const jitter of [0,0.5,0.999999]) {
      const result=retryDecision(attempt,5,100,jitter);
      assert.ok(result.nextAt>=100 && result.nextAt<=60100);
      assert.equal(result.state,attempt===5?'dead':'retry');
    }
  }
});
test('horloge invalide et budget hors contrat : erreurs stables', () => {
  const rights = { active: true, externalEnabled: true, suspended: false };
  assert.throws(() => decideDispatch(rights,'internal',NaN,100),{code:'JOUR_INVALIDE'});
  assert.throws(() => decideDispatch(rights,'internal',10,Infinity),{code:'JOUR_INVALIDE'});
  assert.throws(() => retryDecision(0,5,100,0),{code:'RESERVATION_INCOHERENTE'});
  assert.throws(() => retryDecision(1,6,100,0),{code:'RESERVATION_INCOHERENTE'});
});
