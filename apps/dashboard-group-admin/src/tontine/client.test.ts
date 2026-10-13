// @vitest-environment jsdom
/**
 * Client des routes « tontine réelle » : chaque méthode est vérifiée contre le
 * contrat de packages/api/src/tontine/routes.ts (verbe, chemin /v1, corps
 * attendu par le schéma zod), avec fetch simulé — aucun serveur requis.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError } from '@kombe/dashboard-core';
import { TontineApi } from './client';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function stubFetch(respond: (c: Call) => { status?: number; body?: unknown } = () => ({})) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const headers = init.headers instanceof Headers ? Object.fromEntries(init.headers.entries()) : {};
      const call: Call = { url: String(url), method: init.method ?? 'GET', headers, body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined };
      calls.push(call);
      const r = respond(call);
      const status = r.status ?? 200;
      return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: (k: string) => (k === 'content-type' && status !== 204 ? 'application/json' : null) },
        json: async () => r.body ?? {},
        text: async () => JSON.stringify(r.body ?? {}),
      } as unknown as Response;
    }),
  );
  return calls;
}

const BASE = 'https://api.example.invalid';
function client(token: string | null = 'sess_abc') {
  return new TontineApi(new ApiClient({ baseUrl: BASE, getSessionToken: () => token }));
}

afterEach(() => vi.unstubAllGlobals());

describe('TontineApi — session et identité', () => {
  it('porte la session en Bearer, jamais x-actor', async () => {
    const calls = stubFetch(() => ({ body: [] }));
    await client().myGroups();
    expect(calls[0]).toMatchObject({ url: `${BASE}/v1/me/groups`, method: 'GET' });
    expect(calls[0]?.headers['authorization']).toBe('Bearer sess_abc');
    expect(calls[0]?.headers['x-actor']).toBeUndefined();
  });

  it('profil : identifiant normalisé par le serveur', async () => {
    const calls = stubFetch(() => ({ body: { identityId: '+237690000001', displayName: null, language: 'fr' } }));
    await expect(client().profile()).resolves.toMatchObject({ identityId: '+237690000001' });
    expect(calls[0]).toMatchObject({ url: `${BASE}/v1/me/profile`, method: 'GET' });
  });

  it('remonte le refus serveur (403 TONTINE_FORBIDDEN) en ApiError typée', async () => {
    stubFetch(() => ({ status: 403, body: { code: 'TONTINE_FORBIDDEN', message: 'Action réservée à une autre fonction du bureau' } }));
    const err = await client().createInvitation('grpA', { maxUses: 10, ttlHours: 48, channel: 'whatsapp' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(403);
    expect((err as ApiError).code).toBe('TONTINE_FORBIDDEN');
  });

  it('accepte une réponse 204 sans corps', async () => {
    stubFetch(() => ({ status: 204 }));
    await expect(client().acceptRole('grpA', 'ra_1')).resolves.toBeNull();
  });
});

describe('TontineApi — routes du groupe', () => {
  it('lectures : chemins /v1/groups/:groupId/…', async () => {
    const calls = stubFetch(() => ({ body: [] }));
    const api = client();
    await api.overview('grp A');
    await api.members('g1');
    await api.invitations('g1');
    await api.roles('g1');
    await api.schedule('g1');
    await api.orderChanges('g1');
    await api.pendingValidations('g1');
    await api.funds('g1');
    await api.meetings('g1');
    await api.meeting('g1', 'mtg_1');
    await api.shareText('g1', 'mtg_1');
    await api.fines('g1');
    await api.aids('g1');
    await api.debts('g1');
    await api.regularity('g1');
    await api.statutes('g1');
    await api.history('g1');
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
    expect(calls.map((c) => c.url.replace(BASE, ''))).toEqual([
      '/v1/groups/grp%20A/overview',
      '/v1/groups/g1/members',
      '/v1/groups/g1/invitations',
      '/v1/groups/g1/roles',
      '/v1/groups/g1/tontine-schedule',
      '/v1/groups/g1/order-changes',
      '/v1/groups/g1/pending-validations',
      '/v1/groups/g1/funds',
      '/v1/groups/g1/meetings',
      '/v1/groups/g1/meetings/mtg_1',
      '/v1/groups/g1/meetings/mtg_1/share-text',
      '/v1/groups/g1/fines',
      '/v1/groups/g1/aids',
      '/v1/groups/g1/debts',
      '/v1/groups/g1/regularity',
      '/v1/groups/g1/statutes',
      '/v1/groups/g1/history',
    ]);
  });

  it('mouvements : filtres en query string, absents si non demandés', async () => {
    const calls = stubFetch(() => ({ body: [] }));
    await client().movements('g1', { meetingId: 'mtg_1', state: 'declared', mine: false });
    await client().movements('g1');
    const u = new URL(calls[0]?.url ?? '');
    expect(u.pathname).toBe('/v1/groups/g1/movements');
    expect(Object.fromEntries(u.searchParams)).toEqual({ meetingId: 'mtg_1', state: 'declared', mine: 'false' });
    expect(new URL(calls[1]?.url ?? '').search).toBe('');
  });

  it('membres, invitations, bureau : corps conformes au schéma', async () => {
    const calls = stubFetch(() => ({ body: {} }));
    const api = client();
    await api.decideMembership('g1', 'mb_1', 'admit');
    await api.createInvitation('g1', { maxUses: 10, ttlHours: 48, channel: 'whatsapp' });
    await api.revokeInvitation('g1', 'inv_1');
    await api.proposeRole('g1', { membershipId: 'mb_2', role: 'treasurer', mandateStart: '2026-10-13', mandateEnd: '2027-10-13' });
    await api.endRole('g1', 'ra_1', 'Fin de mandat');
    await api.actOnOrderChange('g1', 'chg_1', 'approve');
    expect(calls.map((c) => [c.method, c.url.replace(BASE, ''), c.body])).toEqual([
      ['POST', '/v1/groups/g1/memberships/mb_1/decisions', { decision: 'admit' }],
      ['POST', '/v1/groups/g1/invitations', { maxUses: 10, ttlHours: 48, channel: 'whatsapp' }],
      ['POST', '/v1/groups/g1/invitations/inv_1/revocations', undefined],
      ['POST', '/v1/groups/g1/roles', { membershipId: 'mb_2', role: 'treasurer', mandateStart: '2026-10-13', mandateEnd: '2027-10-13' }],
      ['POST', '/v1/groups/g1/roles/ra_1/end', { reason: 'Fin de mandat' }],
      ['POST', '/v1/groups/g1/order-changes/chg_1/approve', undefined],
    ]);
  });

  it('validation : confirmer, contrôler, rejeter, confirmer par lot', async () => {
    const calls = stubFetch(() => ({ body: { state: 'confirmed' } }));
    const api = client();
    await api.confirmMovement('g1', 'mv_1');
    await api.controlMovement('g1', 'mv_1');
    await api.rejectMovement('g1', 'mv_2', 'Référence introuvable');
    await api.confirmMovements('g1', ['mv_3', 'mv_4']);
    expect(calls.map((c) => [c.method, c.url.replace(BASE, ''), c.body])).toEqual([
      ['POST', '/v1/groups/g1/movements/mv_1/confirmations', undefined],
      ['POST', '/v1/groups/g1/movements/mv_1/controls', undefined],
      ['POST', '/v1/groups/g1/movements/mv_2/rejections', { reason: 'Référence introuvable' }],
      ['POST', '/v1/groups/g1/movements/confirmations', { movementIds: ['mv_3', 'mv_4'] }],
    ]);
  });

  it('séance : ouverture, appel (PUT), collecte (montants en chaînes), remise avec témoins, clôture, PV', async () => {
    const calls = stubFetch(() => ({ body: {} }));
    const api = client();
    await api.openMeeting('g1', 'm1');
    await api.recordAttendance('g1', 'm1', [
      { membershipId: 'a', status: 'present' },
      { membershipId: 'b', status: 'represented', representedByMembershipId: 'a' },
    ]);
    await api.collect('g1', 'm1', [{ membershipId: 'a', amount: '10000', channel: 'cash', reference: null }]);
    await api.recordPayout('g1', 'm1', { channel: 'orange_money', reference: 'OM-2611-4471', witnessMembershipIds: ['c', 'd'] });
    await api.closeMeeting('g1', 'm1', { decisions: ['Prochaine séance chez Tata Esther'], notes: null, autoFines: true });
    await api.approveMinutes('g1', 'm1', 'f'.repeat(64), 'm2');
    await api.cancelMeeting('g1', 'm3', 'Deuil dans le quartier');
    expect(calls.map((c) => [c.method, c.url.replace(BASE, ''), c.body])).toEqual([
      ['POST', '/v1/groups/g1/meetings/m1/open', undefined],
      ['PUT', '/v1/groups/g1/meetings/m1/attendance', { entries: [{ membershipId: 'a', status: 'present' }, { membershipId: 'b', status: 'represented', representedByMembershipId: 'a' }] }],
      ['POST', '/v1/groups/g1/meetings/m1/collections', { items: [{ membershipId: 'a', amount: '10000', channel: 'cash', reference: null }] }],
      ['POST', '/v1/groups/g1/meetings/m1/payouts', { channel: 'orange_money', reference: 'OM-2611-4471', witnessMembershipIds: ['c', 'd'] }],
      ['POST', '/v1/groups/g1/meetings/m1/close', { decisions: ['Prochaine séance chez Tata Esther'], notes: null, autoFines: true }],
      ['POST', '/v1/groups/g1/meetings/m1/minutes-approval', { hash: 'f'.repeat(64), inMeetingId: 'm2' }],
      ['POST', '/v1/groups/g1/meetings/m3/cancel', { reason: 'Deuil dans le quartier' }],
    ]);
    expect(calls[1]?.headers['content-type']).toBe('application/json');
  });

  it('amendes, secours, dettes', async () => {
    const calls = stubFetch(() => ({ body: {} }));
    const api = client();
    await api.issueFine('g1', { membershipId: 'b', kind: 'indiscipline', amount: '500', reason: 'Téléphone en pleine séance' });
    await api.actOnFine('g1', 'fine_1', 'uphold', 'Règlement clair');
    await api.actOnFine('g1', 'fine_2', 'cancel', 'Erreur de saisie');
    await api.requestAid('g1', { beneficiaryMembershipId: 'b', event: 'birth', eventDate: '2026-11-20', note: null });
    await api.decideAid('g1', 'aid_1', { decision: 'approve' });
    await api.payAid('g1', 'aid_1', { channel: 'cash' });
    await api.openDebt('g1', { debtorMembershipId: 'b', origin: 'unpaid_obligation', amount: '10000' });
    await api.writeOffDebt('g1', 'debt_1', "Décision de l'assemblée du 12/12");
    expect(calls.map((c) => [c.method, c.url.replace(BASE, ''), c.body])).toEqual([
      ['POST', '/v1/groups/g1/fines', { membershipId: 'b', kind: 'indiscipline', amount: '500', reason: 'Téléphone en pleine séance' }],
      ['POST', '/v1/groups/g1/fines/fine_1/uphold', { reason: 'Règlement clair' }],
      ['POST', '/v1/groups/g1/fines/fine_2/cancel', { reason: 'Erreur de saisie' }],
      ['POST', '/v1/groups/g1/aids', { beneficiaryMembershipId: 'b', event: 'birth', eventDate: '2026-11-20', note: null }],
      ['POST', '/v1/groups/g1/aids/aid_1/decisions', { decision: 'approve' }],
      ['POST', '/v1/groups/g1/aids/aid_1/payments', { channel: 'cash' }],
      ['POST', '/v1/groups/g1/debts', { debtorMembershipId: 'b', origin: 'unpaid_obligation', amount: '10000' }],
      ['POST', '/v1/groups/g1/debts/debt_1/write-off', { reason: "Décision de l'assemblée du 12/12" }],
    ]);
  });

  it('statuts et reprise d’historique', async () => {
    const calls = stubFetch(() => ({ body: {} }));
    const api = client();
    const hash = 'a'.repeat(64);
    await api.publishStatutes('g1');
    await api.acceptStatutes('g1', 2, hash);
    const njangi = { id: 'fb-1', name: 'Ancien njangi', members: [{ uid: 'u1', name: 'Brice' }], contributions: [{ id: 'c1', uid: 'u1', amount: 10000, date: '2025-03-08' }] };
    await api.importHistory('g1', njangi);
    expect(calls.map((c) => [c.method, c.url.replace(BASE, ''), c.body])).toEqual([
      ['POST', '/v1/groups/g1/statutes', undefined],
      ['POST', '/v1/groups/g1/statutes/2/acceptances', { hash }],
      ['POST', '/v1/groups/g1/history-imports', { njangi }],
    ]);
  });

  it('n’envoie aucun montant en nombre flottant', async () => {
    const calls = stubFetch(() => ({ body: {} }));
    await client().collect('g1', 'm1', [{ membershipId: 'a', amount: '10000', channel: 'mtn_momo', reference: 'MOMO-1' }]);
    const items = (calls[0]?.body as { items: { amount: unknown }[] }).items;
    expect(typeof items[0]?.amount).toBe('string');
    expect(items[0]?.amount).toMatch(/^\d{1,10}$/);
  });
});
