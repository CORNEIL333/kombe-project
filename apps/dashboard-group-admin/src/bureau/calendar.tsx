import { useState } from 'react';
import { ActionBar, DataTable, Field, PageHeader, Panel, RemoteState, useRemote } from '@kombe/dashboard-core';
import { Chip, FeedbackLine, Note, Spacer, useAction, useBureau } from './common';
import { formatDateTime, formatDay, formatFcfa, label, ORDER_CHANGE_STATE_LABELS, SCHEDULE_STATE_LABELS } from '../tontine/format';

export function Calendar() {
  const { api, groupId, overview, abilities: ab } = useBureau();
  const sched = useRemote((s) => api.schedule(groupId, s), [api, groupId]);
  const changes = useRemote((s) => api.orderChanges(groupId, s), [api, groupId]);
  const profile = useRemote((s) => api.profile(s), [api]);
  const myIdentity = profile.state.kind === 'ready' ? profile.state.data.identityId : null;
  const act = useAction();
  const nextMeetingId = overview.nextMeeting?.meeting_id ?? null;
  const [renewal, setRenewal] = useState({ startDate: '', contribution: '' });
  const renew = (cadence: unknown) =>
    void act.run(
      'renew',
      () => api.renewSchedule(groupId, { cadence, startDate: renewal.startDate, contributionPerShare: renewal.contribution, order: { mode: 'join_order' } }),
      (r) => `Cycle n° ${r.cycleNo ?? ''} ouvert : ${r.rounds.length} tours planifiés.`,
      () => sched.reload(),
    );
  const decide = (changeId: string, verb: 'accept' | 'approve' | 'reject') =>
    void act.run(
      changeId,
      () => api.actOnOrderChange(groupId, changeId, verb),
      (r) => (r.state === 'applied' ? 'Échange appliqué au calendrier.' : r.state === 'rejected' ? 'Échange refusé.' : 'Accord enregistré ; l’échange attend encore les autres accords.'),
      () => {
        changes.reload();
        sched.reload();
      },
    );
  return (
    <>
      <PageHeader title="Calendrier des tours" description="Ordre de passage, titulaires de chaque part et demandes d’échange de tours." />
      <FeedbackLine feedback={act.feedback} />
      <Panel title="Tours">
        <RemoteState state={sched.state} onRetry={sched.reload}>
          {(d) =>
            d.state === 'none' || d.rounds.length === 0 ? (
              <Note>Aucun calendrier n’a été construit.</Note>
            ) : (
              <>
                <div className="b-kv-row">
                  <div><span>Cycle</span><strong>{`n° ${d.cycleNo ?? 1}`}</strong></div>
                  <div><span>État</span><strong>{label(SCHEDULE_STATE_LABELS, d.state)}</strong></div>
                  <div><span>Rythme</span><strong>{d.cadenceLabel ?? '—'}</strong></div>
                  <div><span>Cotisation par part</span><strong>{formatFcfa(d.contributionPerShare)}</strong></div>
                  <div><span>Cagnotte par tour</span><strong>{formatFcfa(d.potPerRound)}</strong></div>
                </div>
                <DataTable
                  rows={d.rounds}
                  rowKey={(r) => r.roundId}
                  columns={[
                    { header: 'Tour', render: (r) => <span className="b-seq">{r.seq}</span>, width: '70px' },
                    { header: 'Date', render: (r) => formatDay(r.date) },
                    {
                      header: 'Remise prévue pour',
                      render: (r) => (
                        <>
                          {r.holders.map((h) => `${h.name ?? 'Membre'}${r.holders.length > 1 ? ` (${h.weight})` : ''}`).join(' + ') || '—'}
                          {r.meetingId && r.meetingId === nextMeetingId && <> <Chip tone="warn">Prochaine séance</Chip></>}
                        </>
                      ),
                    },
                    { header: 'État', render: (r) => (r.state === 'closed' ? <Chip tone="ok">Remis</Chip> : 'À venir') },
                  ]}
                />
                {d.cycleComplete && ab.can('schedule.manage') && (
                  <form
                    className="b-renewal"
                    onSubmit={(e) => {
                      e.preventDefault();
                      renew(d.cadence);
                    }}
                  >
                    <Note>Tous les tours de ce cycle sont remis. Vous pouvez enchaîner un nouveau cycle avec le même rythme ; l’ordre suit l’adhésion des membres actifs.</Note>
                    <div className="k-grid">
                      <div className="k-span-6">
                        <Field label="Début du nouveau cycle" inputProps={{ type: 'date', required: true, value: renewal.startDate, onChange: (e) => setRenewal({ ...renewal, startDate: e.target.value }) }} />
                      </div>
                      <div className="k-span-6">
                        <Field label="Cotisation par part (FCFA)" inputProps={{ inputMode: 'numeric', pattern: '[0-9]+', required: true, value: renewal.contribution, onChange: (e) => setRenewal({ ...renewal, contribution: e.target.value.replace(/\D/g, '') }) }} />
                      </div>
                    </div>
                    <ActionBar>
                      <button type="submit" className="k-button k-button-primary" disabled={act.busy !== null}>Renouveler le cycle</button>
                    </ActionBar>
                  </form>
                )}
              </>
            )
          }
        </RemoteState>
      </Panel>
      <Spacer />
      <Panel title="Demandes d’échange de tours">
        {!ab.can('order.manage') && <Note>L’approbation d’un échange revient au Président, au Vice-président ou au Secrétaire général.</Note>}
        <RemoteState state={changes.state} onRetry={changes.reload} emptyTitle="Aucune demande d’échange">
          {(rows) => (
            <DataTable
              rows={rows}
              rowKey={(r) => r.change_id}
              columns={[
                { header: 'Tours', render: (r) => `${r.seq_a} ↔ ${r.seq_b}` },
                { header: 'Motif', render: (r) => r.reason ?? '—' },
                { header: 'Accords des titulaires', render: (r) => `${r.accepted_identity_ids.length} / ${r.required_identity_ids.length}` },
                { header: 'Bureau', render: (r) => (r.approved ? 'Approuvé' : 'À approuver') },
                { header: 'Demandé le', render: (r) => formatDateTime(r.created_at) },
                { header: 'État', render: (r) => <Chip tone={r.state === 'applied' ? 'ok' : r.state === 'rejected' ? 'danger' : 'warn'}>{label(ORDER_CHANGE_STATE_LABELS, r.state)}</Chip> },
                {
                  header: '',
                  render: (r) => {
                    if (r.state !== 'requested') return null;
                    const holder = myIdentity !== null && r.required_identity_ids.includes(myIdentity);
                    const accepted = myIdentity !== null && r.accepted_identity_ids.includes(myIdentity);
                    if (!holder && !ab.can('order.manage')) return null;
                    return (
                      <div className="k-actionbar">
                        {holder && !accepted && (
                          <button type="button" className="k-button k-button-primary" disabled={act.busy !== null} onClick={() => decide(r.change_id, 'accept')}>Donner mon accord</button>
                        )}
                        {!holder && ab.can('order.manage') && !r.approved && (
                          <button type="button" className="k-button k-button-primary" disabled={act.busy !== null} onClick={() => decide(r.change_id, 'approve')}>Approuver</button>
                        )}
                        <button type="button" className="k-button k-button-secondary" disabled={act.busy !== null} onClick={() => decide(r.change_id, 'reject')}>Refuser</button>
                      </div>
                    );
                  },
                },
              ]}
            />
          )}
        </RemoteState>
      </Panel>
    </>
  );
}
