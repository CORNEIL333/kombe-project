import { PageHeader, Panel, QuickActions, RemoteState, StatCard, useRemote } from '@kombe/dashboard-core';
import { Chip, Note, Spacer, useBureau } from './common';
import { formatDay, formatFcfa, label, GROUP_STATE_LABELS, MEETING_STATE_LABELS, SCHEDULE_STATE_LABELS } from '../tontine/format';
import { roleList } from '../tontine/roles';

export function Overview() {
  const { api, groupId, overview: o, abilities: ab, navigate } = useBureau();
  const schedule = useRemote((s) => api.schedule(groupId, s), [api, groupId]);
  const next = o.nextMeeting;
  const actions = [
    ...(o.pendingValidations > 0 ? [{ key: 'val', label: `File à valider (${o.pendingValidations})`, icon: '✓', tone: 'primary' as const, onClick: () => navigate('/validations') }] : []),
    ...(next && (ab.can('meeting.manage') || ab.can('meeting.attendance') || ab.treasury)
      ? [{ key: 'seance', label: next.state === 'open' ? 'Reprendre la séance ouverte' : 'Préparer la prochaine séance', icon: '◉', onClick: () => navigate('/seance') }]
      : []),
    ...(o.members.pending > 0 && ab.can('member.admit') ? [{ key: 'adm', label: `Admissions en attente (${o.members.pending})`, icon: '◎', onClick: () => navigate('/members') }] : []),
    ...(ab.can('member.invite') ? [{ key: 'inv', label: 'Inviter par code', icon: '＋', onClick: () => navigate('/invitations') }] : []),
    { key: 'cal', label: 'Calendrier des tours', icon: '◌', onClick: () => navigate('/calendar') },
  ];
  return (
    <>
      <PageHeader
        title={o.name}
        description={`Vous êtes ${roleList(o.me.roles)}${o.me.displayName ? ` (${o.me.displayName})` : ''}. KÓMBE tient le registre du groupe ; il ne garde pas son argent.`}
      />
      <div className="k-stats">
        <StatCard icon="◎" label="Membres actifs" value={String(o.members.active)} hint={o.members.pending > 0 ? `${o.members.pending} demande(s) en attente` : 'Aucune demande en attente'} />
        <StatCard
          icon="◉"
          label="Prochaine séance"
          value={next ? formatDay(next.scheduled_date) : '—'}
          hint={next ? `Séance n° ${next.seq} · ${label(MEETING_STATE_LABELS, next.state)}${next.location ? ` · ${next.location}` : ''}` : 'Aucune séance prévue'}
        />
        <StatCard icon="✓" label="Opérations à valider" value={String(o.pendingValidations)} hint="Déclarées ou confirmées, pas encore validées" />
        <StatCard icon="◌" label="État du groupe" value={label(GROUP_STATE_LABELS, o.state)} hint={o.schedule ? `${label(SCHEDULE_STATE_LABELS, o.schedule.state)}${o.schedule.cadenceLabel ? ` · ${o.schedule.cadenceLabel}` : ''}` : 'Calendrier non construit'} />
      </div>
      <Spacer />
      <div className="k-grid">
        <div className="k-span-7">
          <Panel title="Le cycle">
            <RemoteState state={schedule.state} onRetry={schedule.reload}>
              {(d) => {
                if (d.state === 'none' || d.rounds.length === 0) return <Note>Aucun calendrier n’a encore été construit pour ce groupe.</Note>;
                const nextSeq = next ? d.rounds.find((r) => r.meetingId === next.meeting_id)?.seq : undefined;
                return (
                  <>
                    <div className="b-kv-row">
                      <div><span>Cotisation par part</span><strong>{formatFcfa(d.contributionPerShare)}</strong></div>
                      <div><span>Cagnotte par tour</span><strong>{formatFcfa(d.potPerRound)}</strong></div>
                      <div><span>Tours</span><strong>{d.rounds.length}</strong></div>
                    </div>
                    <ol className="b-orbit-list" aria-label="Tours du cycle">
                      {d.rounds.map((r) => (
                        <li key={r.roundId} className={r.seq === nextSeq ? 'b-current' : ''}>
                          <span className="b-seq">{r.seq}</span>
                          <span>{r.holders.map((h) => h.name ?? 'Membre').join(' + ') || '—'}</span>
                          <small>{formatDay(r.date)}</small>
                          {r.seq === nextSeq && <Chip tone="warn">Prochain tour</Chip>}
                        </li>
                      ))}
                    </ol>
                  </>
                );
              }}
            </RemoteState>
          </Panel>
        </div>
        <div className="k-span-5">
          <Panel>
            <QuickActions title="À faire maintenant" actions={actions} />
          </Panel>
          <Spacer />
          <Panel title="Règlement en vigueur">
            <div className="b-kv-col">
              <div><span>Témoins pour une remise</span><strong>{o.settings.minimumWitnesses}</strong></div>
              <div><span>Amende d’absence</span><strong>{formatFcfa(o.settings.fines.meetingAbsence)}</strong></div>
              <div><span>Amende de retard en séance</span><strong>{formatFcfa(o.settings.fines.meetingLate)}</strong></div>
              <div><span>Délai de grâce</span><strong>{o.settings.fines.graceDays} jour(s)</strong></div>
              <div><span>Lieu habituel</span><strong>{o.settings.meetingPlace ?? '—'}</strong></div>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
