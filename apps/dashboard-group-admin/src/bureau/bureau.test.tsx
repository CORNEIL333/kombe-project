// @vitest-environment jsdom
/**
 * Rendu des écrans du Bureau avec un client simulé : les actions qu'une
 * fonction ne peut pas tenter sont masquées, les montants s'affichent en
 * « FCFA », le texte d'invitation est exact.
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TontineApi } from '../tontine/client';
import type { GroupOverview, GroupRole, MeetingDetail, MeetingRow, Movement } from '../tontine/types';
import { BureauProvider } from './common';
import { Funds, Validations, rowActions } from './money';
import { Seance } from './seance';
import { Invitations } from './people';
import { Calendar } from './calendar';
import { parseLegacyExport } from './records';
import { Login } from '../App';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

async function render(ui: ReactNode): Promise<HTMLDivElement> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(ui);
  });
  await flush();
  return host;
}
async function flush() {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

function overview(roles: GroupRole[], membershipId = 'mb_me'): GroupOverview {
  return {
    groupId: 'g1',
    name: 'Njangi des Bamenda de Bonabéri',
    state: 'active',
    settings: {
      transparency: 'all_members',
      feeBearer: 'beneficiary',
      guarantorRequired: false,
      newcomersLast: true,
      minMembers: 2,
      maxMembers: 60,
      fines: { lateContributionFixed: '1000', lateContributionPerDay: '100', lateContributionCap: '3000', meetingLate: '200', meetingAbsence: '500', indisciplineCap: '1000', graceDays: 3 },
      aidScale: [],
      seat: null,
      purpose: null,
      meetingPlace: 'Chez le président',
      minimumWitnesses: 2,
    },
    me: { membershipId, roles, displayName: 'Moi' },
    members: { active: 5, pending: 0 },
    schedule: { state: 'started', cadence: null, cadenceLabel: '2e samedi du mois' },
    nextMeeting: null,
    pendingValidations: 0,
  };
}

function mv(over: Partial<Movement>): Movement {
  return {
    movementId: 'mv_x',
    fundId: 'fund_rot',
    fundName: 'Tontine',
    fundKind: 'rotation',
    kind: 'contribution',
    amount: '10000',
    state: 'declared',
    channel: 'cash',
    reference: null,
    allegedDate: '2026-11-14',
    declaredAt: '2026-11-14T10:00:00Z',
    membershipId: 'mb_brice',
    memberName: 'Brice',
    meetingId: 'm1',
    relatedKind: null,
    relatedId: null,
    declaredByMe: false,
    rejectedReason: null,
    ...over,
  };
}

function withBureau(api: Partial<TontineApi>, roles: GroupRole[], ui: ReactNode, membershipId = 'mb_me') {
  return (
    <BureauProvider value={{ api: api as TontineApi, groupId: 'g1', overview: overview(roles, membershipId), reloadOverview: () => {}, navigate: () => {} }}>
      {ui}
    </BureauProvider>
  );
}

const buttons = (el: HTMLElement) => [...el.querySelectorAll('button')].map((b) => b.textContent ?? '');

describe('rowActions — ce que la file propose selon la fonction', () => {
  const treasurer = { membershipId: 'mb_t', canConfirm: true, canControl: false };
  const auditor = { membershipId: 'mb_a', canConfirm: false, canControl: true };
  it('trésorier : confirme une déclaration d’autrui, jamais la sienne ni une remise', () => {
    expect(rowActions(mv({}), treasurer)).toEqual({ confirm: true, control: false, reject: true });
    expect(rowActions(mv({ declaredByMe: true }), treasurer)).toEqual({ confirm: false, control: false, reject: false });
    expect(rowActions(mv({ kind: 'payout', membershipId: 'mb_brice' }), treasurer).confirm).toBe(false);
  });
  it('commissaire : contrôle une opération confirmée', () => {
    expect(rowActions(mv({ state: 'confirmed' }), auditor)).toEqual({ confirm: false, control: true, reject: true });
    expect(rowActions(mv({ state: 'declared' }), auditor).confirm).toBe(false);
  });
  it('bénéficiaire : confirme la réception de SA remise', () => {
    const me = { membershipId: 'mb_brice', canConfirm: false, canControl: false };
    expect(rowActions(mv({ kind: 'payout' }), me)).toEqual({ confirm: true, control: false, reject: true });
  });
});

describe('File à valider', () => {
  it('trésorier : boutons de confirmation et lot, aucun contrôle', async () => {
    const rows = [mv({ movementId: 'mv_1' }), mv({ movementId: 'mv_2', memberName: 'Clarisse', amount: '50000' })];
    const confirmMovements = vi.fn(async () => ({ mv_1: 'confirmed', mv_2: 'confirmed' }) as const);
    const el = await render(withBureau({ pendingValidations: async () => rows, confirmMovements }, ['treasurer'], <Validations />));
    const b = buttons(el);
    expect(b.filter((t) => t === 'Confirmer')).toHaveLength(2);
    expect(b).toContain('Confirmer les 2 déclarations');
    expect(b.some((t) => t.includes('Contrôler'))).toBe(false);
    expect(el.textContent).toContain('50 000 FCFA');
    expect(el.textContent).toContain('Déclarée');
    const batch = [...el.querySelectorAll('button')].find((x) => x.textContent === 'Confirmer les 2 déclarations');
    await act(async () => batch?.click());
    await flush();
    expect(confirmMovements).toHaveBeenCalledWith('g1', ['mv_1', 'mv_2']);
    expect(el.textContent).toContain('2 opération(s) confirmée(s).');
  });

  it('commissaire : seulement « Contrôler et valider » sur les opérations confirmées', async () => {
    const rows = [mv({ movementId: 'mv_1', state: 'confirmed' })];
    const el = await render(withBureau({ pendingValidations: async () => rows }, ['auditor'], <Validations />));
    const b = buttons(el);
    expect(b).toContain('Contrôler et valider');
    expect(b).not.toContain('Confirmer');
    expect(el.textContent).toContain('Confirmée par le trésorier');
  });

  it('affiche le refus du serveur tel quel', async () => {
    const { ApiError } = await import('@kombe/dashboard-core');
    const rows = [mv({ movementId: 'mv_1' })];
    const confirmMovement = vi.fn(async () => {
      throw new ApiError('Le déclarant ne confirme pas sa propre opération', 403, {}, 'MOVEMENT_NOT_INDEPENDENT', null);
    });
    const el = await render(withBureau({ pendingValidations: async () => rows, confirmMovement }, ['treasurer'], <Validations />));
    const btn = [...el.querySelectorAll('button')].find((x) => x.textContent === 'Confirmer');
    await act(async () => btn?.click());
    await flush();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('MOVEMENT_NOT_INDEPENDENT');
  });
});

describe('Bureau de séance', () => {
  const meetings: MeetingRow[] = [
    { meeting_id: 'm0', seq: 1, scheduled_date: '2026-10-10', state: 'closed', location: null, host_membership_id: null, host_name: null, round_seq: 1, minutes_hash: 'b'.repeat(64), minutes_approved_at: null },
    { meeting_id: 'm1', seq: 2, scheduled_date: '2026-11-14', state: 'open', location: 'Bonabéri', host_membership_id: null, host_name: null, round_seq: 2, minutes_hash: null, minutes_approved_at: null },
  ];
  const detail: MeetingDetail = {
    meetingId: 'm1',
    seq: 2,
    scheduledDate: '2026-11-14',
    state: 'open',
    location: 'Bonabéri',
    hostMembershipId: null,
    notes: null,
    minutesText: null,
    minutesHash: null,
    minutesApprovedAt: null,
    attendance: [
      { membership_id: 'mb_me', display_name: 'Tata Esther', status: 'present', represented_by_membership_id: null },
      { membership_id: 'mb_brice', display_name: 'Brice', status: 'present', represented_by_membership_id: null },
      { membership_id: 'mb_fon', display_name: 'Papa Fon', status: 'late', represented_by_membership_id: null },
      { membership_id: 'mb_cla', display_name: 'Clarisse', status: 'present', represented_by_membership_id: null },
      { membership_id: 'mb_abs', display_name: 'Absent Jean', status: 'absent', represented_by_membership_id: null },
    ],
    round: { round_id: 'r2', seq: 2, share_id: 's2', holders: [{ membershipId: 'mb_brice', name: 'Brice', weight: 1 }] },
    pot: '50000',
    dues: [{ obligationId: 'o1', membershipId: 'mb_cla', name: 'Clarisse', due: '10000', declared: '0', validated: '0' }],
  };
  const api = {
    meetings: async () => meetings,
    meeting: async () => detail,
    movements: async () => [],
  } satisfies Partial<TontineApi>;

  it('trésorière : témoins = présents hors bénéficiaire et hors déclarante ; cagnotte en FCFA', async () => {
    const recordPayout = vi.fn(async () => ({ movementIds: ['mv_p'] }));
    const el = await render(withBureau({ ...api, recordPayout }, ['treasurer'], <Seance />));
    const witnessLabels = [...el.querySelectorAll('.b-fieldset label')].map((l) => l.textContent);
    expect(witnessLabels).toEqual(['Papa Fon', 'Clarisse']);
    expect(el.textContent).toContain('Remise prévue : 50 000 FCFA à Brice');
    expect(buttons(el).some((t) => t.startsWith('Déclarer la remise'))).toBe(true);
    expect(el.textContent).not.toContain('Clôturer et sceller');
    expect(buttons(el)).not.toContain('Enregistrer l’appel');
    for (const input of el.querySelectorAll<HTMLInputElement>('.b-fieldset input')) await act(async () => input.click());
    const form = el.querySelector('.b-fieldset')?.closest('form');
    await act(async () => form?.requestSubmit());
    await flush();
    expect(recordPayout).toHaveBeenCalledWith('g1', 'm1', { channel: 'cash', reference: null, justification: null, witnessMembershipIds: ['mb_fon', 'mb_cla'] });
  });

  it('secrétaire : appel, collecte, approbation du PV précédent et clôture ; pas de remise', async () => {
    const approveMinutes = vi.fn(async () => null);
    const el = await render(withBureau({ ...api, approveMinutes }, ['secretary'], <Seance />));
    const b = buttons(el);
    expect(b).toContain('Enregistrer l’appel');
    expect(b.some((t) => t.startsWith('Déclarer 1 cotisation(s) — 10 000 FCFA'))).toBe(true);
    expect(b).toContain('Clôturer et sceller le procès-verbal');
    expect(b.some((t) => t.startsWith('Déclarer la remise'))).toBe(false);
    expect(el.textContent).toContain('La remise est déclarée par le Trésorier');
    const approve = [...el.querySelectorAll('button')].find((x) => x.textContent === 'Approuver en séance');
    await act(async () => approve?.click());
    await flush();
    expect(approveMinutes).toHaveBeenCalledWith('g1', 'm0', 'b'.repeat(64), 'm1');
  });

  it('simple membre : lecture seule', async () => {
    const el = await render(withBureau(api, ['member'], <Seance />));
    const b = buttons(el);
    expect(b).not.toContain('Enregistrer l’appel');
    expect(b).not.toContain('Clôturer et sceller le procès-verbal');
    expect(b).not.toContain('Approuver en séance');
    expect(b.some((t) => t.startsWith('Déclarer'))).toBe(false);
  });
});

describe('Invitations', () => {
  it('crée un code et propose le texte WhatsApp exact', async () => {
    const createInvitation = vi.fn(async () => ({ invitationId: 'inv_1', code: 'K7M2QX9P', expiresAt: '2026-10-20T10:00:00Z' }));
    const el = await render(withBureau({ invitations: async () => [], createInvitation }, ['secretary'], <Invitations />));
    const form = el.querySelector('form');
    await act(async () => form?.requestSubmit());
    await flush();
    expect(createInvitation).toHaveBeenCalledWith('g1', { maxUses: 20, ttlHours: 168, channel: 'whatsapp' });
    expect(el.querySelector('.b-share-text')?.textContent).toBe('Rejoignez Njangi des Bamenda de Bonabéri sur KÓMBE avec le code K7M2QX9P');
  });
  it('masqué pour le Trésorier', async () => {
    const invitations = vi.fn(async () => []);
    const el = await render(withBureau({ invitations }, ['treasurer'], <Invitations />));
    expect(el.querySelector('form')).toBeNull();
    expect(invitations).not.toHaveBeenCalled();
  });
});

describe('Calendrier — échanges de tours', () => {
  const change = {
    change_id: 'chg_1', kind: 'swap', seq_a: 2, seq_b: 3, reason: 'Rentrée scolaire',
    required_identity_ids: ['+237690000002', '+237677000003'], accepted_identity_ids: ['+237690000002'],
    approved: false, state: 'requested', created_at: '2026-11-20T10:00:00Z',
  };
  const base = {
    schedule: async () => ({ state: 'started', rounds: [], cadenceLabel: null }),
    orderChanges: async () => [change],
  } satisfies Partial<TontineApi>;
  it('titulaire concerné : donne son accord, n’approuve pas pour le bureau', async () => {
    const el = await render(withBureau({ ...base, profile: async () => ({ identityId: '+237677000003', displayName: null, language: 'fr' as const }) }, ['secretary'], <Calendar />));
    const b = buttons(el);
    expect(b).toContain('Donner mon accord');
    expect(b).not.toContain('Approuver');
  });
  it('secrétaire non concernée : approuve ou refuse', async () => {
    const actOnOrderChange = vi.fn(async () => ({ state: 'requested' }));
    const el = await render(withBureau({ ...base, actOnOrderChange, profile: async () => ({ identityId: '+237699999999', displayName: null, language: 'fr' as const }) }, ['secretary'], <Calendar />));
    const approve = [...el.querySelectorAll('button')].find((x) => x.textContent === 'Approuver');
    await act(async () => approve?.click());
    await flush();
    expect(actOnOrderChange).toHaveBeenCalledWith('g1', 'chg_1', 'approve');
  });
  it('trésorier non concerné : aucune action', async () => {
    const el = await render(withBureau({ ...base, profile: async () => ({ identityId: '+237699999999', displayName: null, language: 'fr' as const }) }, ['treasurer'], <Calendar />));
    expect(buttons(el).filter((t) => ['Approuver', 'Refuser', 'Donner mon accord'].includes(t))).toEqual([]);
  });
});

function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('Calendrier — renouvellement du cycle', () => {
  const round = (seq: number) => ({ seq, roundId: `r${seq}`, state: 'closed', date: '2026-11-14', shareId: `s${seq}`, holders: [{ membershipId: `mb${seq}`, name: `M${seq}`, weight: 1 }], meetingId: `m${seq}` });
  const done = {
    schedule: async () => ({ state: 'started', cycleNo: 1, cycleComplete: true, cadence: { kind: 'monthly_nth_weekday', nth: 2, weekday: 6 }, cadenceLabel: 'Le 2e samedi du mois', rounds: [round(1), round(2)] }),
    orderChanges: async () => [],
    profile: async () => ({ identityId: '+237690000001', displayName: null, language: 'fr' as const }),
  } satisfies Partial<TontineApi>;
  it('présidence : cycle remis, renouvelle avec le même rythme', async () => {
    const renewSchedule = vi.fn(async () => ({ state: 'started', cycleNo: 2, rounds: [round(3), round(4)] }));
    const el = await render(withBureau({ ...done, renewSchedule }, ['animator'], <Calendar />));
    expect(el.textContent).toContain('n° 1');
    const [date, amount] = [...el.querySelectorAll('form.b-renewal input')] as HTMLInputElement[];
    await act(async () => {
      typeInto(date as HTMLInputElement, '2027-04-01');
      typeInto(amount as HTMLInputElement, '15000');
    });
    const form = el.querySelector('form.b-renewal') as HTMLFormElement;
    await act(async () => form.requestSubmit());
    await flush();
    expect(renewSchedule).toHaveBeenCalledWith('g1', { cadence: { kind: 'monthly_nth_weekday', nth: 2, weekday: 6 }, startDate: '2027-04-01', contributionPerShare: '15000', order: { mode: 'join_order' } });
    expect(el.textContent).toContain('Cycle n° 2 ouvert');
  });
  it('trésorier ou cycle en cours : pas de renouvellement', async () => {
    const el = await render(withBureau(done, ['treasurer'], <Calendar />));
    expect(el.querySelector('form.b-renewal')).toBeNull();
  });
});

describe('Caisses — réserve de fin d’année', () => {
  const base = {
    funds: async () => [{ fundId: 'f_res', kind: 'year_end_reserve', name: 'Réserve de fin d’année', registerBalance: '15000', inProgressIn: '0', inProgressOut: '0' }],
    movements: async () => [],
  } as unknown as Partial<TontineApi>;
  it('trésorière : redistribue et annonce le nombre de remises', async () => {
    const distributeYearEndReserve = vi.fn(async () => ({ distributions: [{ membershipId: 'a', amount: '10000', movementId: 'mv1' }, { membershipId: 'b', amount: '5000', movementId: 'mv2' }] }));
    const el = await render(withBureau({ ...base, distributeYearEndReserve }, ['treasurer'], <Funds />));
    const btn = [...el.querySelectorAll('button')].find((x) => x.textContent === 'Redistribuer la réserve');
    await act(async () => btn?.click());
    await flush();
    expect(distributeYearEndReserve).toHaveBeenCalledWith('g1', { channel: 'cash' });
    expect(el.textContent).toContain('2 remise(s) déclarée(s)');
  });
  it('simple membre : pas de redistribution', async () => {
    const el = await render(withBureau(base, ['member'], <Funds />));
    expect(buttons(el)).not.toContain('Redistribuer la réserve');
  });
});

describe('Connexion', () => {
  it('par téléphone ou e-mail, code hors-bande', async () => {
    const begin = vi.fn(async () => {});
    const session = { phase: { kind: 'anonymous' as const }, busy: false, error: null, token: null, begin, confirm: async () => {}, logout: () => {}, dismissError: () => {} };
    const el = await render(<Login session={session} />);
    expect(el.textContent).toContain('Téléphone ou e-mail');
    const input = el.querySelector('input');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, '6 90 00 00 01');
      input?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => el.querySelector('form')?.requestSubmit());
    expect(begin).toHaveBeenCalledWith('6 90 00 00 01');
  });
});

describe('Reprise d’historique — lecture du fichier', () => {
  it('accepte { njangi } ou l’objet seul, refuse le reste', () => {
    const n = { id: 'a', name: 'b', members: [], contributions: [] };
    expect(parseLegacyExport(JSON.stringify({ njangi: n }))).toEqual({ ok: true, njangi: n });
    expect(parseLegacyExport(JSON.stringify(n))).toEqual({ ok: true, njangi: n });
    expect(parseLegacyExport('pas du json').ok).toBe(false);
    expect(parseLegacyExport(JSON.stringify({ id: 'a' })).ok).toBe(false);
  });
});
