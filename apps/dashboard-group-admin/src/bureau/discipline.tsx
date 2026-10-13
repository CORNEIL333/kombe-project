import { useState, type FormEvent } from 'react';
import { DataTable, Field, PageHeader, Panel, RemoteState, SelectField, SubmitButton, TextAreaField, useRemote } from '@kombe/dashboard-core';
import { Chip, FeedbackLine, Gate, Note, Spacer, useAction, useBureau } from './common';
import {
  AID_EVENT_LABELS,
  AID_STATE_LABELS,
  CHANNEL_LABELS,
  DEBT_ORIGIN_LABELS,
  DEBT_STATE_LABELS,
  FINE_KIND_LABELS,
  FINE_STATE_LABELS,
  formatDay,
  formatFcfa,
  label,
  parseXafInput,
  todayDouala,
} from '../tontine/format';
import { AID_EVENTS, DEBT_ORIGINS, FINE_KINDS, PAYMENT_CHANNELS, type AidEvent, type DebtOrigin, type FineKind, type Member, type PaymentChannel } from '../tontine/types';

function useActiveMembers() {
  const { api, groupId } = useBureau();
  const q = useRemote((s) => api.members(groupId, s), [api, groupId]);
  const list: readonly Member[] = q.state.kind === 'ready' ? q.state.data.filter((m) => m.state === 'active') : [];
  return list;
}

function MemberSelect(p: { label: string; value: string; onChange: (v: string) => void; members: readonly Member[]; exclude?: string }) {
  return (
    <SelectField label={p.label} selectProps={{ value: p.value, required: true, onChange: (e) => p.onChange(e.target.value) }}>
      <option value="">Choisir…</option>
      {p.members.filter((m) => m.membershipId !== p.exclude).map((m) => (
        <option key={m.membershipId} value={m.membershipId}>{m.displayName}</option>
      ))}
    </SelectField>
  );
}

const fineTone = (s: string) => (s === 'paid' ? 'ok' : s === 'contested' ? 'danger' : s === 'cancelled' ? 'neutral' : 'warn');

export function Fines() {
  const { api, groupId, overview, abilities: ab } = useBureau();
  const fines = useRemote((s) => api.fines(groupId, s), [api, groupId]);
  const meetings = useRemote((s) => api.meetings(groupId, s), [api, groupId]);
  const members = useActiveMembers();
  const act = useAction();
  const [form, setForm] = useState({ membershipId: '', kind: 'indiscipline' as FineKind, amount: '', reason: '', meetingId: '' });
  const lateDetail = useRemote((s) => api.meeting(groupId, form.meetingId, s), [api, groupId, form.meetingId], { enabled: form.kind === 'late_contribution' && !!form.meetingId });
  const [arbitrate, setArbitrate] = useState<{ id: string; act: 'uphold' | 'cancel'; reason: string } | null>(null);
  const obligationId = lateDetail.state.kind === 'ready' ? lateDetail.state.data.dues.find((d) => d.membershipId === form.membershipId)?.obligationId ?? null : null;
  const amountOk = form.kind !== 'indiscipline' || parseXafInput(form.amount) !== null;
  function issue(e: FormEvent) {
    e.preventDefault();
    if (!amountOk) return;
    void act.run(
      'issue',
      () =>
        api.issueFine(groupId, {
          membershipId: form.membershipId,
          kind: form.kind,
          reason: form.reason.trim(),
          ...(form.kind === 'indiscipline' ? { amount: parseXafInput(form.amount) } : {}),
          ...(form.meetingId ? { meetingId: form.meetingId } : {}),
          ...(form.kind === 'late_contribution' ? { obligationId } : {}),
        }),
      (r) => `Amende infligée : ${formatFcfa(r.amount)}. Le membre est prévenu et peut la contester.`,
      () => {
        setForm({ ...form, amount: '', reason: '' });
        fines.reload();
      },
    );
  }
  const scale = overview.settings.fines;
  return (
    <>
      <PageHeader title="Amendes" description="Amendes du règlement intérieur. Un membre peut contester ; la présidence maintient ou annule, jamais pour sa propre amende." />
      <FeedbackLine feedback={act.feedback} />
      <div className="k-grid">
        <div className="k-span-8">
          <Panel title="Amendes">
            <RemoteState state={fines.state} onRetry={fines.reload} emptyTitle="Aucune amende">
              {(rows) => (
                <DataTable
                  rows={rows}
                  rowKey={(f) => f.fine_id}
                  columns={[
                    { header: 'Membre', render: (f) => f.display_name ?? 'Membre' },
                    { header: 'Motif', render: (f) => <>{label(FINE_KIND_LABELS, f.kind)}<br /><small className="b-muted">{f.reason}</small></> },
                    { header: 'Montant', render: (f) => formatFcfa(f.amount) },
                    { header: 'Date', render: (f) => formatDay(f.issued_at) },
                    { header: 'État', render: (f) => <Chip tone={fineTone(f.state)}>{label(FINE_STATE_LABELS, f.state)}</Chip> },
                    {
                      header: '',
                      render: (f) =>
                        ab.arbitrateFines && f.membership_id !== overview.me.membershipId && (f.state === 'contested' || f.state === 'issued') ? (
                          <div className="k-actionbar">
                            {f.state === 'contested' && (
                              <button type="button" className="k-button k-button-secondary" onClick={() => setArbitrate({ id: f.fine_id, act: 'uphold', reason: '' })}>Maintenir</button>
                            )}
                            <button type="button" className="k-button k-button-secondary" onClick={() => setArbitrate({ id: f.fine_id, act: 'cancel', reason: '' })}>Annuler</button>
                          </div>
                        ) : null,
                    },
                  ]}
                />
              )}
            </RemoteState>
            {arbitrate && (
              <form
                className="b-inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void act.run('arb', () => api.actOnFine(groupId, arbitrate.id, arbitrate.act, arbitrate.reason.trim()), arbitrate.act === 'uphold' ? 'Amende maintenue.' : 'Amende annulée.', () => {
                    setArbitrate(null);
                    fines.reload();
                  });
                }}
              >
                <TextAreaField
                  label={arbitrate.act === 'cancel' ? 'Motif d’annulation (obligatoire)' : 'Motif du maintien'}
                  textareaProps={{ value: arbitrate.reason, maxLength: 300, required: arbitrate.act === 'cancel', minLength: arbitrate.act === 'cancel' ? 3 : undefined, onChange: (e) => setArbitrate({ ...arbitrate, reason: e.target.value }) }}
                />
                <div className="k-actionbar">
                  <SubmitButton busy={act.busy === 'arb'}>{arbitrate.act === 'uphold' ? 'Maintenir l’amende' : 'Annuler l’amende'}</SubmitButton>
                  <button type="button" className="k-button k-button-secondary" onClick={() => setArbitrate(null)}>Fermer</button>
                </div>
              </form>
            )}
          </Panel>
        </div>
        <div className="k-span-4">
          <Gate allowed={ab.can('fine.issue')}>
            <Panel title="Infliger une amende">
              <form onSubmit={issue}>
                <MemberSelect label="Membre" value={form.membershipId} onChange={(v) => setForm({ ...form, membershipId: v })} members={members} exclude={overview.me.membershipId} />
                <SelectField label="Manquement" selectProps={{ value: form.kind, onChange: (e) => setForm({ ...form, kind: e.target.value as FineKind }) }}>
                  {FINE_KINDS.map((k) => <option key={k} value={k}>{FINE_KIND_LABELS[k]}</option>)}
                </SelectField>
                {form.kind === 'indiscipline' && (
                  <Field label="Montant (FCFA)" hint={`Au plus ${formatFcfa(scale.indisciplineCap)} selon le règlement.`} inputProps={{ value: form.amount, inputMode: 'numeric', required: true, onChange: (e) => setForm({ ...form, amount: e.target.value }) }} />
                )}
                {form.kind !== 'indiscipline' && <Note>Le montant est calculé par le serveur selon le règlement.</Note>}
                <SelectField label={form.kind === 'late_contribution' ? 'Séance de l’échéance' : 'Séance (facultatif)'} selectProps={{ value: form.meetingId, required: form.kind === 'late_contribution', onChange: (e) => setForm({ ...form, meetingId: e.target.value }) }}>
                  <option value="">—</option>
                  {(meetings.state.kind === 'ready' ? meetings.state.data : []).map((m) => (
                    <option key={m.meeting_id} value={m.meeting_id}>{`n° ${m.seq} — ${formatDay(m.scheduled_date)}`}</option>
                  ))}
                </SelectField>
                {form.kind === 'late_contribution' && form.meetingId && form.membershipId && lateDetail.state.kind === 'ready' && !obligationId && (
                  <p className="b-feedback b-feedback-error">Ce membre n’a pas d’échéance pour cette séance.</p>
                )}
                <TextAreaField label="Motif" textareaProps={{ value: form.reason, minLength: 3, maxLength: 300, required: true, onChange: (e) => setForm({ ...form, reason: e.target.value }) }} />
                <SubmitButton busy={act.busy === 'issue'}>Infliger</SubmitButton>
              </form>
            </Panel>
          </Gate>
          {!ab.can('fine.issue') && <Note>Les amendes sont infligées par le Censeur ou la présidence.</Note>}
        </div>
      </div>
    </>
  );
}

const aidTone = (s: string) => (s === 'paid' ? 'ok' : s === 'approved' ? 'ok' : s === 'rejected' || s === 'cancelled' ? 'danger' : 'warn');

export function Aids() {
  const { api, groupId, overview, abilities: ab } = useBureau();
  const aids = useRemote((s) => api.aids(groupId, s), [api, groupId]);
  const members = useActiveMembers();
  const act = useAction();
  const [req, setReq] = useState({ beneficiaryMembershipId: '', event: 'birth' as AidEvent, eventDate: todayDouala(), note: '' });
  const [deciding, setDeciding] = useState<{ id: string; decision: 'approve' | 'reject'; overrideAmount: string; overrideReason: string; note: string } | null>(null);
  const [paying, setPaying] = useState<{ id: string; channel: PaymentChannel; reference: string; justification: string } | null>(null);
  return (
    <>
      <PageHeader title="Secours" description="Aides de la caisse de secours selon le barème du règlement. Le bénéficiaire ne décide jamais de sa propre aide." />
      <FeedbackLine feedback={act.feedback} />
      <div className="k-grid">
        <div className="k-span-8">
          <Panel title="Demandes">
            <RemoteState state={aids.state} onRetry={aids.reload} emptyTitle="Aucune demande de secours">
              {(rows) => (
                <DataTable
                  rows={rows}
                  rowKey={(a) => a.aid_id}
                  columns={[
                    { header: 'Bénéficiaire', render: (a) => a.display_name ?? 'Membre' },
                    { header: 'Événement', render: (a) => `${label(AID_EVENT_LABELS, a.event)} · ${formatDay(a.event_date)}` },
                    { header: 'Montant', render: (a) => formatFcfa(a.amount) },
                    { header: 'État', render: (a) => <Chip tone={aidTone(a.state)}>{label(AID_STATE_LABELS, a.state)}</Chip> },
                    {
                      header: '',
                      render: (a) => (
                        <div className="k-actionbar">
                          {a.state === 'requested' && ab.can('aid.decide') && a.beneficiary_membership_id !== overview.me.membershipId && (
                            <>
                              <button type="button" className="k-button k-button-primary" onClick={() => setDeciding({ id: a.aid_id, decision: 'approve', overrideAmount: '', overrideReason: '', note: '' })}>Approuver</button>
                              <button type="button" className="k-button k-button-secondary" onClick={() => setDeciding({ id: a.aid_id, decision: 'reject', overrideAmount: '', overrideReason: '', note: '' })}>Refuser</button>
                            </>
                          )}
                          {a.state === 'approved' && ab.treasury && (
                            <button type="button" className="k-button k-button-primary" onClick={() => setPaying({ id: a.aid_id, channel: 'cash', reference: '', justification: '' })}>Déclarer le versement</button>
                          )}
                        </div>
                      ),
                    },
                  ]}
                />
              )}
            </RemoteState>
            {deciding && (
              <form
                className="b-inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const override = deciding.overrideAmount.trim() ? parseXafInput(deciding.overrideAmount) : null;
                  void act.run(
                    'decide',
                    () =>
                      api.decideAid(groupId, deciding.id, {
                        decision: deciding.decision,
                        ...(override ? { overrideAmount: override, overrideReason: deciding.overrideReason.trim() || null } : {}),
                        note: deciding.note.trim() || null,
                      }),
                    (r) => (r.state === 'approved' ? `Secours approuvé : ${formatFcfa(r.amount)}.` : 'Demande refusée.'),
                    () => {
                      setDeciding(null);
                      aids.reload();
                    },
                  );
                }}
              >
                {deciding.decision === 'approve' && (
                  <div className="k-grid">
                    <div className="k-span-6">
                      <Field label="Montant hors barème (facultatif)" inputProps={{ value: deciding.overrideAmount, inputMode: 'numeric', onChange: (e) => setDeciding({ ...deciding, overrideAmount: e.target.value }) }} />
                    </div>
                    <div className="k-span-6">
                      <Field label="Motif du montant hors barème" inputProps={{ value: deciding.overrideReason, maxLength: 300, required: !!deciding.overrideAmount.trim(), onChange: (e) => setDeciding({ ...deciding, overrideReason: e.target.value }) }} />
                    </div>
                  </div>
                )}
                <Field label="Note" inputProps={{ value: deciding.note, maxLength: 500, onChange: (e) => setDeciding({ ...deciding, note: e.target.value }) }} />
                <div className="k-actionbar">
                  <SubmitButton busy={act.busy === 'decide'} danger={deciding.decision === 'reject'}>{deciding.decision === 'approve' ? 'Approuver le secours' : 'Refuser la demande'}</SubmitButton>
                  <button type="button" className="k-button k-button-secondary" onClick={() => setDeciding(null)}>Fermer</button>
                </div>
              </form>
            )}
            {paying && (
              <form
                className="b-inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void act.run(
                    'pay',
                    () => api.payAid(groupId, paying.id, { channel: paying.channel, reference: paying.reference.trim() || null, justification: paying.justification.trim() || null }),
                    'Versement déclaré. Le bénéficiaire doit confirmer la réception.',
                    () => {
                      setPaying(null);
                      aids.reload();
                    },
                  );
                }}
              >
                <div className="k-grid">
                  <div className="k-span-4">
                    <SelectField label="Moyen" selectProps={{ value: paying.channel, onChange: (e) => setPaying({ ...paying, channel: e.target.value as PaymentChannel }) }}>
                      {PAYMENT_CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABELS[c]}</option>)}
                    </SelectField>
                  </div>
                  <div className="k-span-4"><Field label="Référence" inputProps={{ value: paying.reference, maxLength: 64, disabled: paying.channel === 'cash', onChange: (e) => setPaying({ ...paying, reference: e.target.value }) }} /></div>
                  <div className="k-span-4"><Field label="Justification" inputProps={{ value: paying.justification, maxLength: 500, onChange: (e) => setPaying({ ...paying, justification: e.target.value }) }} /></div>
                </div>
                <div className="k-actionbar">
                  <SubmitButton busy={act.busy === 'pay'}>Déclarer le versement</SubmitButton>
                  <button type="button" className="k-button k-button-secondary" onClick={() => setPaying(null)}>Fermer</button>
                </div>
              </form>
            )}
          </Panel>
        </div>
        <div className="k-span-4">
          <Panel title="Nouvelle demande">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void act.run('request', () => api.requestAid(groupId, { ...req, note: req.note.trim() || null }), (r) => `Demande enregistrée (barème : ${formatFcfa(r.amount)}).`, () => aids.reload());
              }}
            >
              <MemberSelect label="Bénéficiaire" value={req.beneficiaryMembershipId} onChange={(v) => setReq({ ...req, beneficiaryMembershipId: v })} members={members} />
              <SelectField label="Événement" selectProps={{ value: req.event, onChange: (e) => setReq({ ...req, event: e.target.value as AidEvent }) }}>
                {AID_EVENTS.map((ev) => <option key={ev} value={ev}>{AID_EVENT_LABELS[ev]}</option>)}
              </SelectField>
              <Field label="Date de l’événement" inputProps={{ type: 'date', value: req.eventDate, required: true, onChange: (e) => setReq({ ...req, eventDate: e.target.value }) }} />
              <Field label="Note" inputProps={{ value: req.note, maxLength: 500, onChange: (e) => setReq({ ...req, note: e.target.value }) }} />
              <SubmitButton busy={act.busy === 'request'}>Enregistrer la demande</SubmitButton>
            </form>
          </Panel>
        </div>
      </div>
    </>
  );
}

export function Debts() {
  const { api, groupId, overview, abilities: ab } = useBureau();
  const debts = useRemote((s) => api.debts(groupId, s), [api, groupId]);
  const members = useActiveMembers();
  const act = useAction();
  const [form, setForm] = useState({ debtorMembershipId: '', origin: 'unpaid_obligation' as DebtOrigin, amount: '', originRef: '' });
  const [writeOff, setWriteOff] = useState<{ id: string; reason: string } | null>(null);
  return (
    <>
      <PageHeader title="Dettes" description="Dettes d’un membre envers une caisse (cotisation impayée, avance, amende). L’avaliseur (parrain) est prévenu. Un abandon est toujours motivé." />
      <FeedbackLine feedback={act.feedback} />
      <div className="k-grid">
        <div className="k-span-8">
          <Panel title="Registre des dettes">
            <RemoteState state={debts.state} onRetry={debts.reload} emptyTitle="Aucune dette">
              {(rows) => (
                <DataTable
                  rows={rows}
                  rowKey={(d) => d.debt_id}
                  columns={[
                    { header: 'Membre', render: (d) => d.display_name ?? 'Membre' },
                    { header: 'Origine', render: (d) => label(DEBT_ORIGIN_LABELS, d.origin) },
                    { header: 'Montant', render: (d) => formatFcfa(d.amount) },
                    { header: 'Réglé', render: (d) => formatFcfa(d.settled) },
                    { header: 'Avaliseur', render: (d) => d.guarantor_name ?? '—' },
                    { header: 'État', render: (d) => <Chip tone={d.state === 'settled' ? 'ok' : d.state === 'open' ? 'warn' : 'neutral'}>{label(DEBT_STATE_LABELS, d.state)}</Chip> },
                    {
                      header: '',
                      render: (d) =>
                        d.state === 'open' && ab.can('debt.manage') && d.debtor_membership_id !== overview.me.membershipId ? (
                          <button type="button" className="k-button k-button-secondary" onClick={() => setWriteOff({ id: d.debt_id, reason: '' })}>Abandonner</button>
                        ) : null,
                    },
                  ]}
                />
              )}
            </RemoteState>
            {writeOff && (
              <form
                className="b-inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void act.run('wo', () => api.writeOffDebt(groupId, writeOff.id, writeOff.reason.trim()), 'Dette abandonnée ; la décision est tracée au journal.', () => {
                    setWriteOff(null);
                    debts.reload();
                  });
                }}
              >
                <TextAreaField label="Motif (décision d’assemblée, etc.)" textareaProps={{ value: writeOff.reason, minLength: 3, maxLength: 300, required: true, onChange: (e) => setWriteOff({ ...writeOff, reason: e.target.value }) }} />
                <div className="k-actionbar">
                  <SubmitButton busy={act.busy === 'wo'} danger>Abandonner la dette</SubmitButton>
                  <button type="button" className="k-button k-button-secondary" onClick={() => setWriteOff(null)}>Fermer</button>
                </div>
              </form>
            )}
          </Panel>
        </div>
        <div className="k-span-4">
          <Gate allowed={ab.can('debt.manage')}>
            <Panel title="Ouvrir une dette">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const amount = parseXafInput(form.amount);
                  if (!amount) return;
                  void act.run(
                    'open',
                    () => api.openDebt(groupId, { debtorMembershipId: form.debtorMembershipId, origin: form.origin, amount, originRef: form.originRef.trim() || null }),
                    'Dette ouverte. Le membre et son avaliseur sont prévenus.',
                    () => {
                      setForm({ ...form, amount: '', originRef: '' });
                      debts.reload();
                    },
                  );
                }}
              >
                <MemberSelect label="Membre" value={form.debtorMembershipId} onChange={(v) => setForm({ ...form, debtorMembershipId: v })} members={members} />
                <SelectField label="Origine" selectProps={{ value: form.origin, onChange: (e) => setForm({ ...form, origin: e.target.value as DebtOrigin }) }}>
                  {DEBT_ORIGINS.map((o) => <option key={o} value={o}>{DEBT_ORIGIN_LABELS[o]}</option>)}
                </SelectField>
                <Field label="Montant (FCFA)" {...(form.amount && !parseXafInput(form.amount) ? { error: 'Entier positif attendu.' } : {})} inputProps={{ value: form.amount, inputMode: 'numeric', required: true, onChange: (e) => setForm({ ...form, amount: e.target.value }) }} />
                <Field label="Référence (facultatif)" inputProps={{ value: form.originRef, maxLength: 200, onChange: (e) => setForm({ ...form, originRef: e.target.value }) }} />
                <SubmitButton busy={act.busy === 'open'}>Ouvrir la dette</SubmitButton>
              </form>
            </Panel>
          </Gate>
          {!ab.can('debt.manage') && <Note>Les dettes sont gérées par la présidence et le Trésorier.</Note>}
        </div>
      </div>
    </>
  );
}

const badgeTone = (b: string) => (b === 'exemplaire' || b === 'régulier' ? 'ok' : b === 'en retard' ? 'danger' : b === 'à suivre' ? 'warn' : 'neutral');

export function Regularity() {
  const { api, groupId } = useBureau();
  const q = useRemote((s) => api.regularity(groupId, s), [api, groupId]);
  return (
    <>
      <PageHeader title="Régularité" description="Échéances arrivées à terme, payées à temps ou en retard (délai de grâce compris), et amendes en cours." />
      <Panel>
        <RemoteState state={q.state} onRetry={q.reload} emptyTitle="Aucune échéance encore arrivée à terme">
          {(rows) => (
            <DataTable
              rows={[...rows].sort((a, b) => b.unpaidLate - a.unpaidLate || a.onTimeRate - b.onTimeRate)}
              rowKey={(r) => r.membershipId}
              columns={[
                { header: 'Membre', render: (r) => <>{r.name}{r.isMe && <> <Chip>vous</Chip></>}</> },
                { header: 'Échéances', render: (r) => String(r.dueSoFar) },
                { header: 'À temps', render: (r) => String(r.onTime) },
                { header: 'En retard', render: (r) => String(r.late) },
                { header: 'Impayées', render: (r) => (r.unpaidLate > 0 ? <strong className="b-danger">{r.unpaidLate}</strong> : '0') },
                { header: 'Amendes en cours', render: (r) => String(r.openFines) },
                { header: 'Taux à temps', render: (r) => <span className="b-rate"><span className="b-rate-track" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, r.onTimeRate))}%` }} /></span>{r.onTimeRate} %</span> },
                { header: 'Repère', render: (r) => <Chip tone={badgeTone(r.badge)}>{r.badge}</Chip> },
              ]}
            />
          )}
        </RemoteState>
      </Panel>
      <Spacer />
    </>
  );
}
