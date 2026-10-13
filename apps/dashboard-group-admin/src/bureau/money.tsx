import { useState } from 'react';
import { DataTable, PageHeader, Panel, RemoteState, SelectField, useRemote } from '@kombe/dashboard-core';
import { FeedbackLine, Note, Spacer, ValidationRing, useAction, useBureau } from './common';
import { CHANNEL_LABELS, FUND_KIND_LABELS, MOVEMENT_KIND_LABELS, formatDay, formatFcfa, label } from '../tontine/format';
import type { Movement, MovementState } from '../tontine/types';

/** Ce que l'acteur peut faire sur une ligne de SA file (le serveur reste juge). */
export function rowActions(m: Movement, me: { membershipId: string; canConfirm: boolean; canControl: boolean }) {
  const isMyPayout = m.kind === 'payout' && m.membershipId === me.membershipId;
  const confirm = m.state === 'declared' && !m.declaredByMe && (m.kind === 'payout' ? isMyPayout : me.canConfirm);
  const control = m.state === 'confirmed' && !m.declaredByMe && me.canControl;
  const reject = (m.state === 'declared' || m.state === 'confirmed') && !m.declaredByMe && (me.canConfirm || me.canControl || isMyPayout);
  return { confirm, control, reject };
}

export function Validations() {
  const { api, groupId, overview, abilities: ab, reloadOverview } = useBureau();
  const q = useRemote((s) => api.pendingValidations(groupId, s), [api, groupId]);
  const act = useAction();
  const [rejecting, setRejecting] = useState<{ id: string; reason: string } | null>(null);
  const me = { membershipId: overview.me.membershipId, canConfirm: ab.can('movement.confirm'), canControl: ab.can('movement.control') };
  const refresh = () => {
    q.reload();
    reloadOverview();
  };
  const stateMsg = (s: MovementState) => (s === 'validated' ? 'Opération validée.' : s === 'confirmed' ? 'Opération confirmée par le trésorier ; elle attend le contrôle du commissaire.' : `Nouvel état : ${s}.`);
  return (
    <>
      <PageHeader
        title="File à valider"
        description="Chaque opération passe par trois étapes : Déclarée → Confirmée par le trésorier → Validée (contrôle du commissaire aux comptes). Personne ne valide sa propre déclaration."
      />
      <FeedbackLine feedback={act.feedback} />
      <Panel title="Opérations qui attendent votre geste">
        <RemoteState state={q.state} onRetry={q.reload} emptyTitle="Rien à valider" emptyBody="Aucune opération n’attend une action de votre fonction.">
          {(rows) => {
            const batch = rows.filter((m) => m.state === 'declared' && m.kind !== 'payout' && rowActions(m, me).confirm);
            return (
              <>
                {me.canConfirm && batch.length > 1 && (
                  <div className="k-actionbar">
                    <button
                      type="button"
                      className="k-button k-button-primary"
                      disabled={act.busy !== null}
                      onClick={() => void act.run('batch', () => api.confirmMovements(groupId, batch.map((m) => m.movementId)), (r) => `${Object.keys(r).length} opération(s) confirmée(s).`, refresh)}
                    >
                      {`Confirmer les ${batch.length} déclarations`}
                    </button>
                  </div>
                )}
                <DataTable
                  rows={rows}
                  rowKey={(m) => m.movementId}
                  columns={[
                    { header: 'Opération', render: (m) => `${label(MOVEMENT_KIND_LABELS, m.kind)} · ${m.fundName}` },
                    { header: 'Membre', render: (m) => m.memberName ?? '—' },
                    { header: 'Montant', render: (m) => <strong>{formatFcfa(m.amount)}</strong> },
                    { header: 'Moyen', render: (m) => `${CHANNEL_LABELS[m.channel] ?? m.channel}${m.reference ? ` · ${m.reference}` : ''}` },
                    { header: 'Date', render: (m) => formatDay(m.allegedDate ?? m.declaredAt) },
                    { header: 'Étape', render: (m) => <ValidationRing state={m.state} kind={m.kind} /> },
                    {
                      header: '',
                      render: (m) => {
                        const a = rowActions(m, me);
                        return (
                          <div className="k-actionbar">
                            {a.confirm && (
                              <button type="button" className="k-button k-button-primary" disabled={act.busy !== null} onClick={() => void act.run(m.movementId, () => api.confirmMovement(groupId, m.movementId), (r) => stateMsg(r.state), refresh)}>
                                {m.kind === 'payout' ? 'Confirmer la réception' : 'Confirmer'}
                              </button>
                            )}
                            {a.control && (
                              <button type="button" className="k-button k-button-primary" disabled={act.busy !== null} onClick={() => void act.run(m.movementId, () => api.controlMovement(groupId, m.movementId), (r) => stateMsg(r.state), refresh)}>
                                Contrôler et valider
                              </button>
                            )}
                            {a.reject && (
                              <button type="button" className="k-button k-button-secondary" onClick={() => setRejecting({ id: m.movementId, reason: '' })}>
                                Rejeter
                              </button>
                            )}
                          </div>
                        );
                      },
                    },
                  ]}
                />
              </>
            );
          }}
        </RemoteState>
        {rejecting && (
          <form
            className="b-inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              void act.run('reject', () => api.rejectMovement(groupId, rejecting.id, rejecting.reason.trim()), 'Opération rejetée. Le déclarant est prévenu.', () => {
                setRejecting(null);
                refresh();
              });
            }}
          >
            <label className="k-field">
              <span>Motif du rejet (au moins 3 caractères)</span>
              <textarea value={rejecting.reason} minLength={3} maxLength={500} required onChange={(e) => setRejecting({ ...rejecting, reason: e.target.value })} />
            </label>
            <div className="k-actionbar">
              <button type="submit" className="k-button k-button-danger" disabled={act.busy === 'reject'}>Rejeter l’opération</button>
              <button type="button" className="k-button k-button-secondary" onClick={() => setRejecting(null)}>Annuler</button>
            </div>
          </form>
        )}
      </Panel>
    </>
  );
}

export function Funds() {
  const { api, groupId } = useBureau();
  const funds = useRemote((s) => api.funds(groupId, s), [api, groupId]);
  const [fundId, setFundId] = useState('');
  const [state, setState] = useState<'' | MovementState>('');
  const movements = useRemote(
    (s) => api.movements(groupId, { ...(fundId ? { fundId } : {}), ...(state ? { state } : {}) }, s),
    [api, groupId, fundId, state],
  );
  return (
    <>
      <PageHeader
        title="Caisses"
        description="KÓMBE tient le registre des caisses ; l’argent reste chez le trésorier, sur Mobile Money ou à la banque. « Au registre » ne compte que les opérations validées."
      />
      <Panel title="Registre par caisse">
        <RemoteState state={funds.state} onRetry={funds.reload} emptyTitle="Aucune caisse">
          {(rows) => (
            <DataTable
              rows={rows}
              rowKey={(f) => f.fundId}
              columns={[
                { header: 'Caisse', render: (f) => <strong>{f.name}</strong> },
                { header: 'Type', render: (f) => label(FUND_KIND_LABELS, f.kind) },
                { header: 'Au registre (validé)', render: (f) => <strong>{formatFcfa(f.registerBalance)}</strong> },
                { header: 'Entrées en cours', render: (f) => formatFcfa(f.inProgressIn) },
                { header: 'Sorties en cours', render: (f) => formatFcfa(f.inProgressOut) },
                { header: '', render: (f) => <button type="button" className="k-button k-button-secondary" onClick={() => setFundId(f.fundId)}>Opérations</button> },
              ]}
            />
          )}
        </RemoteState>
        <Note>« En cours » : déclarées ou confirmées, pas encore validées. Elles ne comptent pas au registre.</Note>
      </Panel>
      <Spacer />
      <Panel title="Opérations">
        <div className="k-grid">
          <div className="k-span-6">
            <SelectField label="Caisse" selectProps={{ value: fundId, onChange: (e) => setFundId(e.target.value) }}>
              <option value="">Toutes les caisses</option>
              {(funds.state.kind === 'ready' ? funds.state.data : []).map((f) => (
                <option key={f.fundId} value={f.fundId}>{f.name}</option>
              ))}
            </SelectField>
          </div>
          <div className="k-span-6">
            <SelectField label="Étape" selectProps={{ value: state, onChange: (e) => setState(e.target.value as '' | MovementState) }}>
              <option value="">Toutes</option>
              <option value="declared">Déclarée</option>
              <option value="confirmed">Confirmée par le trésorier</option>
              <option value="validated">Validée</option>
              <option value="rejected">Rejetée</option>
              <option value="compensated">Compensée</option>
            </SelectField>
          </div>
        </div>
        <RemoteState state={movements.state} onRetry={movements.reload} emptyTitle="Aucune opération">
          {(rows) => (
            <DataTable
              rows={rows}
              rowKey={(m) => m.movementId}
              columns={[
                { header: 'Date', render: (m) => formatDay(m.allegedDate ?? m.declaredAt) },
                { header: 'Opération', render: (m) => label(MOVEMENT_KIND_LABELS, m.kind) },
                { header: 'Caisse', render: (m) => m.fundName },
                { header: 'Membre', render: (m) => m.memberName ?? '—' },
                { header: 'Montant', render: (m) => formatFcfa(m.amount) },
                { header: 'Moyen', render: (m) => `${CHANNEL_LABELS[m.channel] ?? m.channel}${m.reference ? ` · ${m.reference}` : ''}` },
                { header: 'Étape', render: (m) => <><ValidationRing state={m.state} kind={m.kind} />{m.rejectedReason && <small className="b-muted"> — {m.rejectedReason}</small>}</> },
              ]}
            />
          )}
        </RemoteState>
      </Panel>
    </>
  );
}
