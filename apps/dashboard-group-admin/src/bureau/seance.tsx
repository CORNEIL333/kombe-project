import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { DataTable, Field, PageHeader, Panel, RemoteState, SelectField, SubmitButton, TextAreaField, useRemote } from '@kombe/dashboard-core';
import { Chip, FeedbackLine, Note, ShareBox, Spacer, ValidationRing, useAction, useBureau } from './common';
import {
  ATTENDANCE_LABELS,
  CHANNEL_LABELS,
  MEETING_STATE_LABELS,
  MOVEMENT_KIND_LABELS,
  formatDay,
  formatFcfa,
  label,
  parseXafInput,
  remainingXaf,
  shortHash,
} from '../tontine/format';
import { ATTENDANCE_STATUSES, PAYMENT_CHANNELS, type AttendanceStatus, type MeetingDetail, type MeetingRow, type Movement, type PaymentChannel } from '../tontine/types';

const PRESENT: readonly AttendanceStatus[] = ['present', 'late', 'represented'];

function pickDefault(rows: readonly MeetingRow[]): string {
  return (rows.find((m) => m.state === 'open') ?? rows.find((m) => m.state === 'planned') ?? rows[rows.length - 1])?.meeting_id ?? '';
}

export function Seance() {
  const { api, groupId, reloadOverview } = useBureau();
  const meetings = useRemote((s) => api.meetings(groupId, s), [api, groupId]);
  const [selected, setSelected] = useState('');
  useEffect(() => {
    if (!selected && meetings.state.kind === 'ready') setSelected(pickDefault(meetings.state.data));
  }, [meetings.state, selected]);
  const detail = useRemote((s) => api.meeting(groupId, selected, s), [api, groupId, selected], { enabled: !!selected });
  const movements = useRemote((s) => api.movements(groupId, { meetingId: selected }, s), [api, groupId, selected], { enabled: !!selected, isEmpty: () => false });
  const refresh = () => {
    meetings.reload();
    detail.reload();
    movements.reload();
    reloadOverview();
  };
  const rows = meetings.state.kind === 'ready' ? meetings.state.data : [];
  return (
    <>
      <PageHeader title="Séance" description="Bureau de séance : ouverture, appel, collecte, remise devant témoins, clôture et procès-verbal." />
      <RemoteState state={meetings.state} onRetry={meetings.reload} emptyTitle="Aucune séance" emptyBody="Les séances sont créées au démarrage du calendrier.">
        {() => (
          <Panel>
            <SelectField label="Séance" selectProps={{ value: selected, onChange: (e) => setSelected(e.target.value) }}>
              {rows.map((m) => (
                <option key={m.meeting_id} value={m.meeting_id}>
                  {`Séance n° ${m.seq} — ${formatDay(m.scheduled_date)} — ${label(MEETING_STATE_LABELS, m.state)}`}
                </option>
              ))}
            </SelectField>
          </Panel>
        )}
      </RemoteState>
      <Spacer />
      {selected && (
        <RemoteState state={detail.state} onRetry={detail.reload}>
          {(d) => <MeetingDesk key={`${d.meetingId}:${d.state}`} detail={d} meetings={rows} movements={movements.state.kind === 'ready' || movements.state.kind === 'empty' ? movements.state.data : []} onChanged={refresh} onSelect={setSelected} />}
        </RemoteState>
      )}
    </>
  );
}

function MeetingDesk(p: { detail: MeetingDetail; meetings: readonly MeetingRow[]; movements: readonly Movement[]; onChanged: () => void; onSelect: (id: string) => void }) {
  const { api, groupId, abilities: ab } = useBureau();
  const d = p.detail;
  const act = useAction();
  const [cancelReason, setCancelReason] = useState('');
  const holders = d.round?.holders ?? [];
  return (
    <>
      <Panel title={`Séance n° ${d.seq} du ${formatDay(d.scheduledDate)}`} action={<Chip tone={d.state === 'open' ? 'ok' : d.state === 'cancelled' ? 'danger' : 'neutral'}>{label(MEETING_STATE_LABELS, d.state)}</Chip>}>
        <div className="b-kv-row">
          <div><span>Lieu</span><strong>{d.location ?? '—'}</strong></div>
          <div><span>Remise prévue pour</span><strong>{holders.map((h) => h.name ?? 'Membre').join(' + ') || '—'}</strong></div>
          <div><span>Cagnotte du tour</span><strong>{formatFcfa(d.pot)}</strong></div>
        </div>
        <FeedbackLine feedback={act.feedback} />
        {d.state === 'planned' && (
          ab.can('meeting.manage') ? (
            <div className="k-actionbar">
              <button type="button" className="k-button k-button-primary" disabled={act.busy !== null} onClick={() => void act.run('open', () => api.openMeeting(groupId, d.meetingId), 'Séance ouverte. L’appel est pré-rempli « absent » : corrigez-le.', p.onChanged)}>
                Ouvrir la séance
              </button>
              <form
                className="b-inline"
                onSubmit={(e) => {
                  e.preventDefault();
                  void act.run('cancel', () => api.cancelMeeting(groupId, d.meetingId, cancelReason.trim()), 'Séance annulée.', p.onChanged);
                }}
              >
                <Field label="Motif d’annulation" inputProps={{ value: cancelReason, minLength: 3, maxLength: 300, required: true, onChange: (e) => setCancelReason(e.target.value) }} />
                <SubmitButton busy={act.busy === 'cancel'} danger>Annuler la séance</SubmitButton>
              </form>
            </div>
          ) : (
            <Note>La séance sera ouverte par le Président, le Vice-président ou le Secrétaire général.</Note>
          )
        )}
        {d.state === 'cancelled' && <Note>Séance annulée.</Note>}
      </Panel>
      {d.state === 'open' && (
        <>
          <Spacer />
          <AttendanceGrid key={d.attendance.map((a) => `${a.membership_id}:${a.status}`).join('|')} detail={d} onChanged={p.onChanged} />
          <Spacer />
          <Collection key={d.dues.map((x) => `${x.membershipId}:${x.declared}`).join('|')} detail={d} onChanged={p.onChanged} />
          <Spacer />
          <MeetingMovements movements={p.movements} onChanged={p.onChanged} />
          <Spacer />
          <Payout detail={d} movements={p.movements} onChanged={p.onChanged} />
          <Spacer />
          <PreviousMinutes current={d} meetings={p.meetings} onChanged={p.onChanged} onSelect={p.onSelect} />
          <Spacer />
          <CloseMeeting detail={d} onChanged={p.onChanged} />
        </>
      )}
      {d.state === 'closed' && (
        <>
          <Spacer />
          <Minutes detail={d} meetings={p.meetings} onChanged={p.onChanged} />
          <Spacer />
          <MeetingMovements movements={p.movements} onChanged={p.onChanged} />
        </>
      )}
      {(d.state === 'closed' || d.state === 'open') && (
        <>
          <Spacer />
          <ShareSummary meetingId={d.meetingId} />
        </>
      )}
    </>
  );
}

function AttendanceGrid(p: { detail: MeetingDetail; onChanged: () => void }) {
  const { api, groupId, abilities: ab } = useBureau();
  const act = useAction();
  const editable = ab.can('meeting.attendance');
  const [rows, setRows] = useState(() =>
    p.detail.attendance.map((a) => ({ membershipId: a.membership_id, name: a.display_name ?? 'Membre', status: a.status, rep: a.represented_by_membership_id ?? '' })),
  );
  const set = (id: string, patch: Partial<{ status: AttendanceStatus; rep: string }>) => setRows((rs) => rs.map((r) => (r.membershipId === id ? { ...r, ...patch } : r)));
  const presentCount = rows.filter((r) => PRESENT.includes(r.status)).length;
  function save() {
    void act.run(
      'att',
      () => api.recordAttendance(groupId, p.detail.meetingId, rows.map((r) => ({ membershipId: r.membershipId, status: r.status, ...(r.status === 'represented' ? { representedByMembershipId: r.rep || null } : {}) }))),
      (t) => `Appel enregistré : ${t.present} présent(s), ${t.absent} absent(s), ${t.excused} excusé(s).`,
      p.onChanged,
    );
  }
  return (
    <Panel title={`Appel (${presentCount}/${rows.length} présents)`} action={editable ? <button type="button" className="k-button k-button-secondary" onClick={() => setRows((rs) => rs.map((r) => ({ ...r, status: 'present' })))}>Tous présents</button> : undefined}>
      {!editable && <Note>L’appel est tenu par le Président, le Vice-président, le Secrétaire général ou le Censeur.</Note>}
      <div className="b-attendance" role="table" aria-label="Appel">
        {rows.map((r) => (
          <div className="b-attendance-row" role="row" key={r.membershipId}>
            <span role="cell" className="b-attendance-name">{r.name}</span>
            <div role="cell" className="b-segmented" aria-label={`Présence de ${r.name}`}>
              {ATTENDANCE_STATUSES.map((s) => (
                <button key={s} type="button" disabled={!editable} aria-pressed={r.status === s} className={r.status === s ? `on b-att-${s}` : ''} onClick={() => set(r.membershipId, { status: s })}>
                  {ATTENDANCE_LABELS[s]}
                </button>
              ))}
            </div>
            {r.status === 'represented' && (
              <select role="cell" aria-label={`Représentant de ${r.name}`} value={r.rep} disabled={!editable} onChange={(e) => set(r.membershipId, { rep: e.target.value })}>
                <option value="">Représenté par…</option>
                {rows.filter((o) => o.membershipId !== r.membershipId).map((o) => (
                  <option key={o.membershipId} value={o.membershipId}>{o.name}</option>
                ))}
              </select>
            )}
          </div>
        ))}
      </div>
      {editable && (
        <div className="k-actionbar">
          <button type="button" className="k-button k-button-primary" disabled={act.busy !== null} onClick={save}>Enregistrer l’appel</button>
        </div>
      )}
      <FeedbackLine feedback={act.feedback} />
    </Panel>
  );
}

function Collection(p: { detail: MeetingDetail; onChanged: () => void }) {
  const { api, groupId, abilities: ab } = useBureau();
  const act = useAction();
  const initial = useMemo(
    () =>
      p.detail.dues.map((d) => {
        const rest = remainingXaf(d.due, d.declared);
        return { membershipId: d.membershipId, name: d.name ?? 'Membre', due: d.due, declared: d.declared, include: rest !== '0', amount: rest, channel: 'cash' as PaymentChannel, reference: '' };
      }),
    [p.detail.dues],
  );
  const [rows, setRows] = useState(initial);
  const set = (id: string, patch: Partial<(typeof rows)[number]>) => setRows((rs) => rs.map((r) => (r.membershipId === id ? { ...r, ...patch } : r)));
  if (!ab.collect) return <Panel title="Collecte"><Note>La collecte en séance est saisie par la trésorerie ou le secrétariat de séance.</Note></Panel>;
  if (rows.length === 0) return <Panel title="Collecte"><Note>Cette séance n’a pas d’échéance de cotisation.</Note></Panel>;
  const chosen = rows.filter((r) => r.include);
  const invalid = chosen.filter((r) => parseXafInput(r.amount) === null);
  const total = chosen.reduce((sum, r) => sum + BigInt(parseXafInput(r.amount) ?? '0'), 0n);
  function submit(e: FormEvent) {
    e.preventDefault();
    if (invalid.length > 0 || chosen.length === 0) return;
    void act.run(
      'collect',
      () => api.collect(groupId, p.detail.meetingId, chosen.map((r) => ({ membershipId: r.membershipId, amount: parseXafInput(r.amount) ?? '0', channel: r.channel, reference: r.reference.trim() || null }))),
      (r) => `${r.movementIds.length} cotisation(s) déclarée(s). Elles attendent la confirmation du trésorier.`,
      p.onChanged,
    );
  }
  return (
    <Panel title="Collecte des cotisations">
      <Note>Chaque ligne cochée devient une cotisation « Déclarée ». Pour Orange Money, MTN MoMo ou la banque, indiquez la référence de la transaction.</Note>
      <form onSubmit={submit}>
        <DataTable
          rows={rows}
          rowKey={(r) => r.membershipId}
          columns={[
            { header: '', width: '40px', render: (r) => <input type="checkbox" aria-label={`Inclure ${r.name}`} checked={r.include} onChange={(e) => set(r.membershipId, { include: e.target.checked })} /> },
            { header: 'Membre', render: (r) => r.name },
            { header: 'Dû / déjà déclaré', render: (r) => `${formatFcfa(r.due)} / ${formatFcfa(r.declared)}` },
            { header: 'Montant (FCFA)', render: (r) => <input className="b-input" inputMode="numeric" aria-label={`Montant ${r.name}`} value={r.amount} disabled={!r.include} onChange={(e) => set(r.membershipId, { amount: e.target.value })} /> },
            {
              header: 'Moyen',
              render: (r) => (
                <select className="b-input" aria-label={`Moyen ${r.name}`} value={r.channel} disabled={!r.include} onChange={(e) => set(r.membershipId, { channel: e.target.value as PaymentChannel })}>
                  {PAYMENT_CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABELS[c]}</option>)}
                </select>
              ),
            },
            { header: 'Référence', render: (r) => <input className="b-input" aria-label={`Référence ${r.name}`} value={r.reference} maxLength={64} disabled={!r.include || r.channel === 'cash'} onChange={(e) => set(r.membershipId, { reference: e.target.value })} /> },
          ]}
        />
        {invalid.length > 0 && <p className="b-feedback b-feedback-error" role="alert">Montant invalide pour : {invalid.map((r) => r.name).join(', ')}.</p>}
        <div className="k-actionbar">
          <SubmitButton busy={act.busy === 'collect'}>{`Déclarer ${chosen.length} cotisation(s) — ${formatFcfa(total)}`}</SubmitButton>
        </div>
      </form>
      <FeedbackLine feedback={act.feedback} />
    </Panel>
  );
}

function MeetingMovements(p: { movements: readonly Movement[]; onChanged: () => void }) {
  const { api, groupId, abilities: ab } = useBureau();
  const act = useAction();
  const confirmable = p.movements.filter((m) => m.state === 'declared' && m.kind !== 'payout' && !m.declaredByMe);
  return (
    <Panel
      title="Opérations de la séance"
      action={
        ab.can('movement.confirm') && confirmable.length > 0 ? (
          <button
            type="button"
            className="k-button k-button-primary"
            disabled={act.busy !== null}
            onClick={() =>
              void act.run(
                'confirmAll',
                () => api.confirmMovements(groupId, confirmable.map((m) => m.movementId)),
                (r) => `${Object.keys(r).length} opération(s) confirmée(s) par le trésorier.`,
                p.onChanged,
              )
            }
          >
            {`Tout confirmer (${confirmable.length})`}
          </button>
        ) : undefined
      }
    >
      <FeedbackLine feedback={act.feedback} />
      {p.movements.length === 0 ? (
        <Note>Aucune opération déclarée pour cette séance.</Note>
      ) : (
        <DataTable
          rows={p.movements}
          rowKey={(m) => m.movementId}
          columns={[
            { header: 'Opération', render: (m) => label(MOVEMENT_KIND_LABELS, m.kind) },
            { header: 'Membre', render: (m) => m.memberName ?? '—' },
            { header: 'Montant', render: (m) => formatFcfa(m.amount) },
            { header: 'Moyen', render: (m) => `${CHANNEL_LABELS[m.channel] ?? m.channel}${m.reference ? ` · ${m.reference}` : ''}` },
            { header: 'Étape', render: (m) => <ValidationRing state={m.state} kind={m.kind} /> },
          ]}
        />
      )}
      {ab.can('movement.confirm') && p.movements.some((m) => m.state === 'declared' && m.declaredByMe && m.kind !== 'payout') && (
        <Note>Les opérations que vous avez déclarées vous-même doivent être confirmées par une autre personne de la trésorerie.</Note>
      )}
    </Panel>
  );
}

function Payout(p: { detail: MeetingDetail; movements: readonly Movement[]; onChanged: () => void }) {
  const { api, groupId, overview, abilities: ab } = useBureau();
  const act = useAction();
  const [witnesses, setWitnesses] = useState<string[]>([]);
  const [channel, setChannel] = useState<PaymentChannel>('cash');
  const [reference, setReference] = useState('');
  const [justification, setJustification] = useState('');
  const holders = p.detail.round?.holders ?? [];
  const existing = p.movements.filter((m) => m.kind === 'payout' && m.relatedKind === 'payout' && m.state !== 'rejected');
  const minimum = overview.settings.minimumWitnesses;
  const candidates = p.detail.attendance.filter(
    (a) => PRESENT.includes(a.status) && !holders.some((h) => h.membershipId === a.membership_id) && a.membership_id !== overview.me.membershipId,
  );
  if (holders.length === 0) return <Panel title="Remise de la cagnotte"><Note>Ce tour n’a pas de titulaire.</Note></Panel>;
  if (existing.length > 0) {
    return (
      <Panel title="Remise de la cagnotte">
        {existing.map((m) => (
          <div key={m.movementId} className="b-kv-row">
            <div><span>Bénéficiaire</span><strong>{m.memberName ?? '—'}</strong></div>
            <div><span>Montant</span><strong>{formatFcfa(m.amount)}</strong></div>
            <div><span>Étape</span><strong><ValidationRing state={m.state} kind={m.kind} /></strong></div>
          </div>
        ))}
        <Note>La réception est confirmée par le bénéficiaire lui-même, puis contrôlée par le commissaire aux comptes.</Note>
      </Panel>
    );
  }
  if (!ab.treasury) return <Panel title="Remise de la cagnotte"><Note>La remise est déclarée par le Trésorier ou le Trésorier adjoint, devant témoins.</Note></Panel>;
  const toggle = (id: string) => setWitnesses((w) => (w.includes(id) ? w.filter((x) => x !== id) : [...w, id]));
  function submit(e: FormEvent) {
    e.preventDefault();
    void act.run(
      'payout',
      () => api.recordPayout(groupId, p.detail.meetingId, { channel, reference: reference.trim() || null, justification: justification.trim() || null, witnessMembershipIds: witnesses }),
      'Remise déclarée. Le bénéficiaire doit confirmer la réception.',
      p.onChanged,
    );
  }
  return (
    <Panel title="Remise de la cagnotte devant témoins">
      <p>
        Remise prévue : <strong>{formatFcfa(p.detail.pot)}</strong> à <strong>{holders.map((h) => h.name ?? 'Membre').join(' + ')}</strong>.
      </p>
      <form onSubmit={submit}>
        <fieldset className="b-fieldset">
          <legend>{`Témoins présents (au moins ${minimum}) — d’après l’appel enregistré`}</legend>
          {candidates.length === 0 && <Note>Aucun témoin possible : enregistrez d’abord l’appel. Le bénéficiaire et vous-même ne pouvez pas être témoins.</Note>}
          <div className="b-checks">
            {candidates.map((a) => (
              <label key={a.membership_id} className="b-check">
                <input type="checkbox" checked={witnesses.includes(a.membership_id)} onChange={() => toggle(a.membership_id)} />
                {a.display_name ?? 'Membre'}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="k-grid">
          <div className="k-span-4">
            <SelectField label="Moyen" selectProps={{ value: channel, onChange: (e) => setChannel(e.target.value as PaymentChannel) }}>
              {PAYMENT_CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABELS[c]}</option>)}
            </SelectField>
          </div>
          <div className="k-span-4">
            <Field label="Référence de transaction" inputProps={{ value: reference, maxLength: 64, disabled: channel === 'cash', onChange: (e) => setReference(e.target.value) }} />
          </div>
          <div className="k-span-4">
            <Field label="Justification (si pas de référence)" inputProps={{ value: justification, maxLength: 500, onChange: (e) => setJustification(e.target.value) }} />
          </div>
        </div>
        <SubmitButton busy={act.busy === 'payout'}>{`Déclarer la remise (${witnesses.length} témoin(s))`}</SubmitButton>
      </form>
      <FeedbackLine feedback={act.feedback} />
    </Panel>
  );
}

function PreviousMinutes(p: { current: MeetingDetail; meetings: readonly MeetingRow[]; onChanged: () => void; onSelect: (id: string) => void }) {
  const { api, groupId, abilities: ab } = useBureau();
  const act = useAction();
  const waiting = p.meetings.filter((m) => m.state === 'closed' && m.minutes_hash && !m.minutes_approved_at && m.meeting_id !== p.current.meetingId);
  if (waiting.length === 0) return null;
  return (
    <Panel title="Procès-verbaux à approuver">
      <Note>Relisez le procès-verbal en séance, puis approuvez-le : l’empreinte garantit que le texte approuvé est celui qui a été scellé à la clôture.</Note>
      <FeedbackLine feedback={act.feedback} />
      <DataTable
        rows={waiting}
        rowKey={(m) => m.meeting_id}
        columns={[
          { header: 'Séance', render: (m) => `n° ${m.seq} du ${formatDay(m.scheduled_date)}` },
          { header: 'Empreinte', render: (m) => <code className="b-code">{shortHash(m.minutes_hash)}</code> },
          {
            header: '',
            render: (m) => (
              <div className="k-actionbar">
                <button type="button" className="k-button k-button-secondary" onClick={() => p.onSelect(m.meeting_id)}>Lire</button>
                {ab.can('meeting.manage') && (
                  <button
                    type="button"
                    className="k-button k-button-primary"
                    disabled={act.busy !== null}
                    onClick={() => void act.run(m.meeting_id, () => api.approveMinutes(groupId, m.meeting_id, m.minutes_hash ?? '', p.current.meetingId), `Procès-verbal de la séance n° ${m.seq} approuvé en séance.`, p.onChanged)}
                  >
                    Approuver en séance
                  </button>
                )}
              </div>
            ),
          },
        ]}
      />
    </Panel>
  );
}

function CloseMeeting(p: { detail: MeetingDetail; onChanged: () => void }) {
  const { api, groupId, abilities: ab } = useBureau();
  const act = useAction();
  const [decisions, setDecisions] = useState('');
  const [notes, setNotes] = useState(p.detail.notes ?? '');
  const [autoFines, setAutoFines] = useState(true);
  if (!ab.can('meeting.manage')) return null;
  function submit(e: FormEvent) {
    e.preventDefault();
    void act.run(
      'close',
      () => api.closeMeeting(groupId, p.detail.meetingId, { decisions: decisions.split('\n').map((s) => s.trim()).filter(Boolean), notes: notes.trim() || null, autoFines }),
      (r) => `Séance close. Procès-verbal scellé (empreinte ${shortHash(r.minutesHash)}) ; ${r.finesIssued} amende(s) automatique(s).`,
      p.onChanged,
    );
  }
  return (
    <Panel title="Clôturer la séance">
      <Note>À la clôture, le procès-verbal est rédigé à partir de l’appel et des opérations, puis scellé par une empreinte. Il ne pourra plus être modifié.</Note>
      <form onSubmit={submit}>
        <TextAreaField label="Décisions (une par ligne)" textareaProps={{ value: decisions, rows: 4, onChange: (e) => setDecisions(e.target.value) }} />
        <TextAreaField label="Notes" textareaProps={{ value: notes, rows: 3, maxLength: 4000, onChange: (e) => setNotes(e.target.value) }} />
        <label className="b-check">
          <input type="checkbox" checked={autoFines} onChange={(e) => setAutoFines(e.target.checked)} />
          Infliger les amendes du règlement pour les absences et retards
        </label>
        <div className="k-actionbar">
          <SubmitButton busy={act.busy === 'close'}>Clôturer et sceller le procès-verbal</SubmitButton>
        </div>
      </form>
      <FeedbackLine feedback={act.feedback} />
    </Panel>
  );
}

function Minutes(p: { detail: MeetingDetail; meetings: readonly MeetingRow[]; onChanged: () => void }) {
  const { api, groupId, abilities: ab } = useBureau();
  const act = useAction();
  const d = p.detail;
  const openMeeting = p.meetings.find((m) => m.state === 'open');
  return (
    <Panel title="Procès-verbal" action={d.minutesApprovedAt ? <Chip tone="ok">Approuvé</Chip> : <Chip tone="warn">À approuver</Chip>}>
      <div className="b-kv-row">
        <div><span>Empreinte (SHA-256)</span><strong><code className="b-hash">{d.minutesHash ?? '—'}</code></strong></div>
      </div>
      <pre className="b-minutes">{d.minutesText ?? 'Procès-verbal indisponible.'}</pre>
      {!d.minutesApprovedAt && d.minutesHash && ab.can('meeting.manage') && (
        <div className="k-actionbar">
          <button
            type="button"
            className="k-button k-button-primary"
            disabled={act.busy !== null}
            onClick={() => void act.run('approve', () => api.approveMinutes(groupId, d.meetingId, d.minutesHash ?? '', openMeeting?.meeting_id ?? null), 'Procès-verbal approuvé.', p.onChanged)}
          >
            {openMeeting ? `Approuver lors de la séance n° ${openMeeting.seq}` : 'Approuver le procès-verbal'}
          </button>
        </div>
      )}
      <FeedbackLine feedback={act.feedback} />
    </Panel>
  );
}

function ShareSummary(p: { meetingId: string }) {
  const { api, groupId } = useBureau();
  const [asked, setAsked] = useState(false);
  const q = useRemote((s) => api.shareText(groupId, p.meetingId, s), [api, groupId, p.meetingId], { enabled: asked });
  return (
    <Panel title="Résumé pour le groupe WhatsApp">
      {!asked ? (
        <button type="button" className="k-button k-button-secondary" onClick={() => setAsked(true)}>Préparer le résumé</button>
      ) : (
        <RemoteState state={q.state} onRetry={q.reload}>
          {(r) => <ShareBox title="Résumé de séance" text={r.text} />}
        </RemoteState>
      )}
    </Panel>
  );
}
