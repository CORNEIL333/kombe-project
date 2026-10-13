import { useState, type FormEvent } from 'react';
import { DataTable, Field, PageHeader, Panel, RemoteState, SelectField, SubmitButton, TextAreaField, useRemote } from '@kombe/dashboard-core';
import { Chip, FeedbackLine, Gate, Note, ShareBox, Spacer, useAction, useBureau } from './common';
import { formatDateTime, formatDay, invitationShareText, todayDouala } from '../tontine/format';
import { BUREAU_ROLES, ROLE_LABELS, roleList } from '../tontine/roles';
import type { CreatedInvitation, GroupRole } from '../tontine/types';

export function Members() {
  const { api, groupId, abilities: ab, reloadOverview } = useBureau();
  const q = useRemote((s) => api.members(groupId, s), [api, groupId]);
  const act = useAction();
  const decide = (membershipId: string, decision: 'admit' | 'refuse', name: string) =>
    void act.run(
      membershipId,
      () => api.decideMembership(groupId, membershipId, decision),
      decision === 'admit' ? `${name} est admis(e) dans le groupe.` : `La demande de ${name} est refusée.`,
      () => {
        q.reload();
        reloadOverview();
      },
    );
  return (
    <>
      <PageHeader title="Membres" description="Membres actifs, fonctions acceptées et demandes d’adhésion reçues par code d’invitation." />
      <FeedbackLine feedback={act.feedback} />
      <RemoteState state={q.state} onRetry={q.reload} emptyTitle="Aucun membre">
        {(rows) => {
          const pending = rows.filter((m) => m.state === 'pending');
          const active = rows.filter((m) => m.state === 'active');
          return (
            <>
              {pending.length > 0 && (
                <>
                  <Panel title={`Demandes d’adhésion (${pending.length})`}>
                    {!ab.can('member.admit') && <Note>L’admission est décidée par la présidence (Président ou Vice-président).</Note>}
                    <DataTable
                      rows={pending}
                      rowKey={(m) => m.membershipId}
                      columns={[
                        { header: 'Nom', render: (m) => m.displayName },
                        { header: 'Contact', render: (m) => m.contact ?? '—' },
                        { header: 'Parrain', render: (m) => (m.sponsorMembershipId ? rows.find((x) => x.membershipId === m.sponsorMembershipId)?.displayName ?? 'Membre' : '—') },
                        {
                          header: 'Décision',
                          render: (m) =>
                            ab.can('member.admit') ? (
                              <div className="k-actionbar">
                                <button type="button" className="k-button k-button-primary" disabled={act.busy !== null} onClick={() => decide(m.membershipId, 'admit', m.displayName)}>Admettre</button>
                                <button type="button" className="k-button k-button-secondary" disabled={act.busy !== null} onClick={() => decide(m.membershipId, 'refuse', m.displayName)}>Refuser</button>
                              </div>
                            ) : (
                              <Chip tone="warn">En attente</Chip>
                            ),
                        },
                      ]}
                    />
                  </Panel>
                  <Spacer />
                </>
              )}
              <Panel title={`Membres actifs (${active.length})`}>
                <DataTable
                  rows={active}
                  rowKey={(m) => m.membershipId}
                  columns={[
                    { header: 'Nom', render: (m) => <>{m.displayName}{m.isMe && <> <Chip>vous</Chip></>}</> },
                    { header: 'Fonctions', render: (m) => roleList(m.roles) },
                    { header: 'Contact', render: (m) => m.contact ?? '—' },
                    { header: 'Membre depuis', render: (m) => formatDay(m.joinedAt) },
                  ]}
                />
              </Panel>
            </>
          );
        }}
      </RemoteState>
    </>
  );
}

export function Invitations() {
  const { api, groupId, overview, abilities: ab } = useBureau();
  const q = useRemote((s) => api.invitations(groupId, s), [api, groupId], { enabled: ab.can('member.invite') });
  const act = useAction();
  const [maxUses, setMaxUses] = useState('20');
  const [ttl, setTtl] = useState('168');
  const [created, setCreated] = useState<CreatedInvitation | null>(null);
  if (!ab.can('member.invite')) {
    return (
      <>
        <PageHeader title="Invitations" />
        <Note>Les codes d’invitation sont créés par le Président, le Vice-président ou le Secrétaire général.</Note>
      </>
    );
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    void act.run(
      'create',
      () => api.createInvitation(groupId, { maxUses: Number(maxUses), ttlHours: Number(ttl), channel: 'whatsapp' }),
      (r) => `Code ${r.code} créé.`,
      (r) => {
        setCreated(r);
        q.reload();
      },
    );
  }
  return (
    <>
      <PageHeader title="Invitations" description="Un code à 8 caractères permet de demander l’adhésion ; la présidence admet ensuite chaque demande." />
      <div className="k-grid">
        <div className="k-span-5">
          <Panel title="Nouveau code">
            <form onSubmit={submit}>
              <Field label="Nombre d’utilisations" hint="De 1 à 200 personnes." inputProps={{ type: 'number', min: 1, max: 200, value: maxUses, onChange: (e) => setMaxUses(e.target.value), required: true }} />
              <SelectField label="Validité" selectProps={{ value: ttl, onChange: (e) => setTtl(e.target.value) }}>
                <option value="24">24 heures</option>
                <option value="72">3 jours</option>
                <option value="168">7 jours</option>
                <option value="720">30 jours</option>
              </SelectField>
              <SubmitButton busy={act.busy === 'create'}>Créer le code</SubmitButton>
            </form>
            <FeedbackLine feedback={act.feedback} />
            {created && (
              <>
                <Spacer />
                <ShareBox title={`Message pour WhatsApp (valable jusqu’au ${formatDateTime(created.expiresAt)})`} text={invitationShareText(overview.name, created.code)} />
              </>
            )}
          </Panel>
        </div>
        <div className="k-span-7">
          <Panel title="Codes émis">
            <RemoteState state={q.state} onRetry={q.reload} emptyTitle="Aucun code émis">
              {(rows) => (
                <DataTable
                  rows={rows}
                  rowKey={(r) => r.invitation_id}
                  columns={[
                    { header: 'Code', render: (r) => <code className="b-code">{r.code}</code> },
                    { header: 'Utilisations', render: (r) => `${r.used_count} / ${r.max_uses}` },
                    { header: 'Expire', render: (r) => formatDateTime(r.expires_at) },
                    {
                      header: 'État',
                      render: (r) =>
                        r.revoked_at ? <Chip tone="danger">Révoqué</Chip> : Date.parse(r.expires_at) < Date.now() ? <Chip>Expiré</Chip> : <Chip tone="ok">Utilisable</Chip>,
                    },
                    {
                      header: '',
                      render: (r) =>
                        !r.revoked_at && Date.parse(r.expires_at) >= Date.now() ? (
                          <div className="k-actionbar">
                            <button type="button" className="k-button k-button-secondary" onClick={() => setCreated({ invitationId: r.invitation_id, code: r.code, expiresAt: r.expires_at })}>Partager</button>
                            <button
                              type="button"
                              className="k-button k-button-danger"
                              disabled={act.busy !== null}
                              onClick={() => void act.run(r.invitation_id, () => api.revokeInvitation(groupId, r.invitation_id), `Code ${r.code} révoqué.`, () => q.reload())}
                            >
                              Révoquer
                            </button>
                          </div>
                        ) : null,
                    },
                  ]}
                />
              )}
            </RemoteState>
          </Panel>
        </div>
      </div>
    </>
  );
}

export function BureauRoles() {
  const { api, groupId, overview, abilities: ab, reloadOverview } = useBureau();
  const roles = useRemote((s) => api.roles(groupId, s), [api, groupId]);
  const members = useRemote((s) => api.members(groupId, s), [api, groupId]);
  const act = useAction();
  const [form, setForm] = useState({ membershipId: '', role: 'secretary' as Exclude<GroupRole, 'member'>, mandateStart: todayDouala(), mandateEnd: '' });
  const [ending, setEnding] = useState<{ id: string; reason: string } | null>(null);
  const refresh = () => {
    roles.reload();
    members.reload();
    reloadOverview();
  };
  function propose(e: FormEvent) {
    e.preventDefault();
    void act.run(
      'propose',
      () => api.proposeRole(groupId, { membershipId: form.membershipId, role: form.role, mandateStart: form.mandateStart, mandateEnd: form.mandateEnd || null }),
      `Fonction proposée. Elle prendra effet quand la personne l’aura acceptée.`,
      refresh,
    );
  }
  const activeMembers = members.state.kind === 'ready' ? members.state.data.filter((m) => m.state === 'active') : [];
  return (
    <>
      <PageHeader title="Bureau" description="Une fonction est proposée par la présidence puis acceptée par la personne nommée. Une fonction financière ne s’attribue jamais à soi-même." />
      <FeedbackLine feedback={act.feedback} />
      <div className="k-grid">
        <div className="k-span-7">
          <Panel title="Fonctions en cours">
            <RemoteState state={roles.state} onRetry={roles.reload} emptyTitle="Aucune fonction attribuée">
              {(rows) => (
                <DataTable
                  rows={rows}
                  rowKey={(r) => r.role_assignment_id}
                  columns={[
                    { header: 'Fonction', render: (r) => ROLE_LABELS[r.role] ?? r.role },
                    { header: 'Titulaire', render: (r) => r.display_name ?? 'Membre' },
                    { header: 'Mandat', render: (r) => `${formatDay(r.mandate_start)} → ${r.mandate_end ? formatDay(r.mandate_end) : 'sans terme'}` },
                    { header: 'État', render: (r) => (r.accepted_at ? <Chip tone="ok">Acceptée</Chip> : <Chip tone="warn">À accepter</Chip>) },
                    {
                      header: '',
                      render: (r) => {
                        const mine = r.membership_id === overview.me.membershipId;
                        return (
                          <div className="k-actionbar">
                            {mine && !r.accepted_at && (
                              <button type="button" className="k-button k-button-primary" disabled={act.busy !== null} onClick={() => void act.run(r.role_assignment_id, () => api.acceptRole(groupId, r.role_assignment_id), 'Fonction acceptée.', refresh)}>
                                Accepter
                              </button>
                            )}
                            {(mine || ab.can('role.assign')) && (
                              <button type="button" className="k-button k-button-secondary" onClick={() => setEnding({ id: r.role_assignment_id, reason: '' })}>
                                Mettre fin
                              </button>
                            )}
                          </div>
                        );
                      },
                    },
                  ]}
                />
              )}
            </RemoteState>
            {ending && (
              <form
                className="b-inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void act.run('end', () => api.endRole(groupId, ending.id, ending.reason.trim()), 'Mandat terminé.', () => {
                    setEnding(null);
                    refresh();
                  });
                }}
              >
                <TextAreaField label="Motif de fin de mandat" textareaProps={{ value: ending.reason, onChange: (e) => setEnding({ ...ending, reason: e.target.value }), maxLength: 300 }} />
                <div className="k-actionbar">
                  <SubmitButton busy={act.busy === 'end'} danger>Confirmer la fin du mandat</SubmitButton>
                  <button type="button" className="k-button k-button-secondary" onClick={() => setEnding(null)}>Annuler</button>
                </div>
              </form>
            )}
          </Panel>
        </div>
        <div className="k-span-5">
          <Gate allowed={ab.can('role.assign')}>
            <Panel title="Proposer une fonction">
              <form onSubmit={propose}>
                <SelectField label="Membre" selectProps={{ value: form.membershipId, required: true, onChange: (e) => setForm({ ...form, membershipId: e.target.value }) }}>
                  <option value="">Choisir…</option>
                  {activeMembers.map((m) => (
                    <option key={m.membershipId} value={m.membershipId}>{m.displayName}</option>
                  ))}
                </SelectField>
                <SelectField label="Fonction" selectProps={{ value: form.role, onChange: (e) => setForm({ ...form, role: e.target.value as Exclude<GroupRole, 'member'> }) }}>
                  {BUREAU_ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </SelectField>
                <Field label="Début du mandat" inputProps={{ type: 'date', value: form.mandateStart, required: true, onChange: (e) => setForm({ ...form, mandateStart: e.target.value }) }} />
                <Field label="Fin du mandat" hint="Facultatif ; 5 ans au plus." inputProps={{ type: 'date', value: form.mandateEnd, onChange: (e) => setForm({ ...form, mandateEnd: e.target.value }) }} />
                <SubmitButton busy={act.busy === 'propose'}>Proposer</SubmitButton>
              </form>
            </Panel>
          </Gate>
          {!ab.can('role.assign') && <Note>Les fonctions sont proposées par le Président ou le Vice-président.</Note>}
        </div>
      </div>
    </>
  );
}
