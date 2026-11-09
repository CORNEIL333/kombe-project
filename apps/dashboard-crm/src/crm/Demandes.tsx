/* KÓMBE CRM — demandes d'assistance (ITIL 4, ISO 10002) : file triée par
   priorité, délais de service visibles, réponse publique (notifie le membre)
   ou note interne, tri impact × urgence, assignation, verrou optimiste. */
import { useState, type FormEvent } from 'react';
import { DataTable, Field, KeyValue, PageHeader, Panel, RemoteState, SelectField, StatusChip, SubmitButton, TextAreaField, useMutation, useRemote } from '@kombe/dashboard-core';
import {
  CATEGORIES, DELAIS, LIBELLE_CANAL, LIBELLE_CATEGORIE, LIBELLE_IMPACT, LIBELLE_URGENCE, STATUTS, LIBELLE_STATUT, priorite,
  type Canal, type Categorie, type CrmApi, type Statut, type Ticket, type TicketDetail, type TicketFilters,
} from './api';
import { PrioriteChip, SlaChip, StatutChip, date, errText } from './commun';

export function Demandes({ api, onOpen, initial }: { readonly api: CrmApi; readonly onOpen: (id: string) => void; readonly initial?: TicketFilters }) {
  const [f, setF] = useState<TicketFilters>(initial ?? { status: 'ouvertes' });
  const [q, setQ] = useState('');
  const [creer, setCreer] = useState(false);
  const r = useRemote((s) => api.tickets(f, s), [api, f]);
  const set = (k: keyof TicketFilters, v: string) => setF((x) => ({ ...x, [k]: v || undefined }));
  return (
    <>
      <PageHeader
        title="Demandes"
        description="File des demandes d’assistance, triée par état puis priorité (impact × urgence). Une réponse publique notifie le membre dans l’application ; une note interne ne lui est jamais montrée."
        actions={<button type="button" className="k-button k-button-primary" onClick={() => setCreer((v) => !v)}>{creer ? 'Fermer le formulaire' : 'Saisir une demande'}</button>}
      />
      {creer ? <NouvelleDemande api={api} onCreated={(t) => { setCreer(false); onOpen(t.ticketId); }} /> : null}
      <Panel>
        <form className="crm-filtres" onSubmit={(e) => { e.preventDefault(); set('q', q.trim()); }}>
          <label>État <select className="k-select-group" value={f.status ?? 'ouvertes'} onChange={(e) => set('status', e.target.value)}>
            <option value="ouvertes">Ouvertes</option>
            {STATUTS.map((s) => <option key={s} value={s}>{LIBELLE_STATUT[s]}</option>)}
          </select></label>
          <label>Priorité <select className="k-select-group" value={f.priority ?? ''} onChange={(e) => set('priority', e.target.value)}>
            <option value="">Toutes</option>{[1, 2, 3, 4].map((p) => <option key={p} value={p}>P{p}</option>)}
          </select></label>
          <label>Assignée <select className="k-select-group" value={f.assignee ?? ''} onChange={(e) => set('assignee', e.target.value)}>
            <option value="">Tout le monde</option><option value="moi">À moi</option><option value="personne">Personne</option>
          </select></label>
          <label>Sujet <select className="k-select-group" value={f.category ?? ''} onChange={(e) => set('category', e.target.value)}>
            <option value="">Tous</option>{CATEGORIES.map((c) => <option key={c} value={c}>{LIBELLE_CATEGORIE[c]}</option>)}
          </select></label>
          <label>Référence ou objet <input className="k-select-group" value={q} onChange={(e) => setQ(e.target.value)} placeholder="KMB-000123" /></label>
          <button type="submit" className="k-button k-button-secondary">Chercher</button>
        </form>
        <RemoteState state={r.state} onRetry={r.reload} emptyTitle="Aucune demande" emptyBody="Aucune demande ne correspond à ces filtres.">{(rows) => <TableDemandes rows={rows} onOpen={onOpen} />}</RemoteState>
      </Panel>
    </>
  );
}

export function TableDemandes({ rows, onOpen }: { readonly rows: readonly Ticket[]; readonly onOpen: (id: string) => void }) {
  return (
    <DataTable rows={rows} rowKey={(t) => t.ticketId} caption="Demandes" columns={[
      { header: 'Réf.', render: (t) => <button type="button" className="crm-lien" onClick={() => onOpen(t.ticketId)}>{t.ref}</button> },
      { header: 'Objet', render: (t) => <><strong>{t.subject}</strong><br /><span className="k-hint">{LIBELLE_CATEGORIE[t.category]} · {LIBELLE_CANAL[t.channel]}</span></> },
      { header: 'Priorité', render: (t) => <PrioriteChip p={t.priority} /> },
      { header: 'État', render: (t) => <StatutChip statut={t.status} /> },
      { header: 'Délai', render: (t) => <SlaChip t={t} /> },
      { header: 'Demandeur', render: (t) => t.requesterName ?? (t.anonymized ? 'Anonymisé' : '—') },
      { header: 'Groupe', render: (t) => t.groupName ?? '—' },
      { header: 'Assignée à', render: (t) => t.assigneeName ?? <StatusChip status="Personne" tone="warn" /> },
      { header: 'Reçue', render: (t) => date(t.createdAt) },
    ]} />
  );
}

function NouvelleDemande({ api, onCreated }: { readonly api: CrmApi; readonly onCreated: (t: Ticket) => void }) {
  const [v, setV] = useState({ subject: '', category: 'autre' as Categorie, channel: 'telephone' as Canal, impact: 3, urgency: 3, groupId: '', contactId: '', body: '' });
  const m = useMutation(() => api.createTicket({
    subject: v.subject.trim(), category: v.category, channel: v.channel, impact: v.impact, urgency: v.urgency, body: v.body.trim(),
    ...(v.groupId.trim() ? { groupId: v.groupId.trim() } : {}), ...(v.contactId.trim() ? { contactId: v.contactId.trim() } : {}),
  }));
  const submit = (e: FormEvent) => { e.preventDefault(); void m.run(undefined).then((t) => t && onCreated(t), () => undefined); };
  const p = priorite(v.impact, v.urgency);
  return (
    <Panel title="Saisir une demande reçue hors application">
      <form className="k-grid" onSubmit={submit}>
        <div className="k-span-6"><Field label="Objet" inputProps={{ value: v.subject, onChange: (e) => setV({ ...v, subject: e.target.value }), required: true, minLength: 3, maxLength: 140 }} /></div>
        <div className="k-span-3"><SelectField label="Sujet" selectProps={{ value: v.category, onChange: (e) => setV({ ...v, category: e.target.value as Categorie }) }}>{CATEGORIES.map((c) => <option key={c} value={c}>{LIBELLE_CATEGORIE[c]}</option>)}</SelectField></div>
        <div className="k-span-3"><SelectField label="Canal" selectProps={{ value: v.channel, onChange: (e) => setV({ ...v, channel: e.target.value as Canal }) }}>{(Object.keys(LIBELLE_CANAL) as Canal[]).map((c) => <option key={c} value={c}>{LIBELLE_CANAL[c]}</option>)}</SelectField></div>
        <div className="k-span-3"><SelectField label="Impact" selectProps={{ value: v.impact, onChange: (e) => setV({ ...v, impact: Number(e.target.value) }) }}>{[1, 2, 3].map((n) => <option key={n} value={n}>{LIBELLE_IMPACT[n]}</option>)}</SelectField></div>
        <div className="k-span-3"><SelectField label="Urgence" selectProps={{ value: v.urgency, onChange: (e) => setV({ ...v, urgency: Number(e.target.value) }) }}>{[1, 2, 3].map((n) => <option key={n} value={n}>{LIBELLE_URGENCE[n]}</option>)}</SelectField></div>
        <div className="k-span-3"><Field label="Groupe (identifiant, facultatif)" inputProps={{ value: v.groupId, onChange: (e) => setV({ ...v, groupId: e.target.value }), maxLength: 64 }} /></div>
        <div className="k-span-3"><Field label="Contact (ct_…, facultatif)" hint="Depuis la page Contacts." inputProps={{ value: v.contactId, onChange: (e) => setV({ ...v, contactId: e.target.value }), pattern: '^ct_[0-9a-f]{20}$' }} /></div>
        <div className="k-span-12"><TextAreaField label="Ce que la personne a dit (note interne)" textareaProps={{ value: v.body, onChange: (e) => setV({ ...v, body: e.target.value }), required: true, maxLength: 4000, rows: 4 }} /></div>
        <div className="k-span-12">
          <p className="k-hint">Priorité calculée : <PrioriteChip p={p} /> — première réponse en {DELAIS[p]?.reponse}, résolution en {DELAIS[p]?.resolution}{v.category === 'donnees_personnelles' ? ' (au plus 30 jours : délai légal)' : ''}.</p>
          <SubmitButton busy={m.state.kind === 'submitting'}>Enregistrer la demande</SubmitButton>
          {m.state.kind === 'error' ? <p className="k-field-error" role="alert">{errText(m.state.error)}</p> : null}
        </div>
      </form>
    </Panel>
  );
}

export function FicheDemande({ api, id, onBack, onOpenAccount, onOpenContact }: {
  readonly api: CrmApi; readonly id: string; readonly onBack: () => void; readonly onOpenAccount: (gid: string) => void; readonly onOpenContact: (cid: string) => void;
}) {
  const r = useRemote((s) => api.ticket(id, s), [api, id], { isEmpty: () => false });
  const ops = useRemote((s) => api.operators(s), [api], { isEmpty: () => false });
  return (
    <>
      <div className="k-toolbar"><button type="button" className="k-button k-button-secondary" onClick={onBack}>← Demandes</button></div>
      <RemoteState state={r.state} onRetry={r.reload}>{(t) => (
        <>
          <PageHeader title={`${t.ref} — ${t.subject}`} description={`${LIBELLE_CATEGORIE[t.category]} · reçue par ${LIBELLE_CANAL[t.channel]} le ${date(t.createdAt)}. Consultation enregistrée au journal d’audit.`} />
          <div className="k-grid">
            <div className="k-span-8">
              <Panel title="Échanges">
                <Fil t={t} />
                {t.anonymized ? <p className="k-hint">Demande anonymisée (conservation limitée) : plus de réponse possible.</p> : <Repondre api={api} t={t} onDone={r.reload} />}
              </Panel>
            </div>
            <div className="k-span-4">
              <Panel title="Suivi">
                <KeyValue label="État" value={<StatutChip statut={t.status} />} />
                <KeyValue label="Priorité" value={<><PrioriteChip p={t.priority} /> <span className="k-hint">{LIBELLE_IMPACT[t.impact]} · {LIBELLE_URGENCE[t.urgency]}</span></>} />
                <KeyValue label="Délai" value={<SlaChip t={t} />} />
                <KeyValue label="Première réponse" value={t.firstResponseAt ? date(t.firstResponseAt) : `attendue avant ${date(t.firstResponseDue)}`} />
                <KeyValue label="Résolution" value={t.resolvedAt ? date(t.resolvedAt) : `attendue avant ${date(t.resolutionDue)}`} />
                <KeyValue label="Demandeur" value={t.requesterContactId ? <button type="button" className="crm-lien" onClick={() => onOpenContact(t.requesterContactId as string)}>{t.requesterName ?? 'Contact'}</button> : '—'} />
                <KeyValue label="Groupe" value={t.groupId ? <button type="button" className="crm-lien" onClick={() => onOpenAccount(t.groupId as string)}>{t.groupName ?? t.groupId}</button> : '—'} />
                <KeyValue label="Satisfaction" value={t.satisfaction === null ? '—' : `${t.satisfaction} / 5${t.satisfactionComment ? ` — « ${t.satisfactionComment} »` : ''}`} />
              </Panel>
              {t.anonymized ? null : <Trier api={api} t={t} operators={ops.state.kind === 'ready' ? ops.state.data : []} onDone={r.reload} />}
              <TacheDepuisDemande api={api} t={t} />
            </div>
          </div>
        </>
      )}</RemoteState>
    </>
  );
}

function Fil({ t }: { readonly t: TicketDetail }) {
  return (
    <ol className="crm-fil">
      {t.messages.map((m) => (
        <li key={m.messageId} className={`crm-fil__item crm-fil__item--${m.authorKind}${m.visibility === 'interne' ? ' crm-fil__item--interne' : ''}`}>
          <span className="k-hint">
            {m.authorKind === 'membre' ? (t.requesterName ?? 'Membre') : m.authorKind === 'operateur' ? (m.authorName ?? 'Opérateur') : 'Système'} · {date(m.createdAt)}
            {m.visibility === 'interne' ? <> · <StatusChip status="Note interne" tone="warn" /></> : null}
          </span>
          <p>{m.body}</p>
        </li>
      ))}
    </ol>
  );
}

function Repondre({ api, t, onDone }: { readonly api: CrmApi; readonly t: TicketDetail; readonly onDone: () => void }) {
  const [body, setBody] = useState('');
  const [vis, setVis] = useState<'public' | 'interne'>(t.requesterContactId ? 'public' : 'interne');
  const m = useMutation(() => api.addMessage(t.ticketId, body.trim(), vis));
  const submit = (e: FormEvent) => { e.preventDefault(); void m.run(undefined).then(() => { setBody(''); onDone(); }, () => undefined); };
  return (
    <form onSubmit={submit} className="crm-repondre">
      <fieldset className="crm-choix">
        <legend>Type de message</legend>
        <label><input type="radio" name="vis" checked={vis === 'public'} disabled={!t.requesterContactId} onChange={() => setVis('public')} /> Réponse au membre (notifiée dans l’application)</label>
        <label><input type="radio" name="vis" checked={vis === 'interne'} onChange={() => setVis('interne')} /> Note interne (opérateurs seulement)</label>
      </fieldset>
      <TextAreaField label={vis === 'public' ? 'Réponse' : 'Note interne'} textareaProps={{ value: body, onChange: (e) => setBody(e.target.value), required: true, maxLength: 4000, rows: 4 }} />
      <SubmitButton busy={m.state.kind === 'submitting'}>{vis === 'public' ? 'Envoyer la réponse' : 'Ajouter la note'}</SubmitButton>
      {m.state.kind === 'error' ? <p className="k-field-error" role="alert">{errText(m.state.error)}</p> : null}
    </form>
  );
}

function Trier({ api, t, operators, onDone }: { readonly api: CrmApi; readonly t: Ticket; readonly operators: readonly { contactId: string; displayName: string }[]; readonly onDone: () => void }) {
  const [v, setV] = useState({ status: t.status, impact: t.impact, urgency: t.urgency, category: t.category, assignee: t.assigneeContactId ?? '' });
  const m = useMutation(() => api.updateTicket(t.ticketId, {
    ...(v.status !== t.status ? { status: v.status } : {}),
    ...(v.impact !== t.impact ? { impact: v.impact } : {}),
    ...(v.urgency !== t.urgency ? { urgency: v.urgency } : {}),
    ...(v.category !== t.category ? { category: v.category } : {}),
    ...(v.assignee !== (t.assigneeContactId ?? '') ? { assigneeContactId: v.assignee || null } : {}),
  }, t.version));
  const change = v.status !== t.status || v.impact !== t.impact || v.urgency !== t.urgency || v.category !== t.category || v.assignee !== (t.assigneeContactId ?? '');
  const submit = (e: FormEvent) => { e.preventDefault(); void m.run(undefined).then(onDone, () => undefined); };
  return (
    <Panel title="Trier et assigner">
      <form onSubmit={submit}>
        <SelectField label="État" selectProps={{ value: v.status, onChange: (e) => setV({ ...v, status: e.target.value as Statut }) }}>{STATUTS.map((s) => <option key={s} value={s}>{LIBELLE_STATUT[s]}</option>)}</SelectField>
        <SelectField label="Impact" selectProps={{ value: v.impact, onChange: (e) => setV({ ...v, impact: Number(e.target.value) }) }}>{[1, 2, 3].map((n) => <option key={n} value={n}>{LIBELLE_IMPACT[n]}</option>)}</SelectField>
        <SelectField label="Urgence" selectProps={{ value: v.urgency, onChange: (e) => setV({ ...v, urgency: Number(e.target.value) }) }}>{[1, 2, 3].map((n) => <option key={n} value={n}>{LIBELLE_URGENCE[n]}</option>)}</SelectField>
        <SelectField label="Sujet" selectProps={{ value: v.category, onChange: (e) => setV({ ...v, category: e.target.value as Categorie }) }}>{CATEGORIES.map((c) => <option key={c} value={c}>{LIBELLE_CATEGORIE[c]}</option>)}</SelectField>
        <SelectField label="Assignée à" selectProps={{ value: v.assignee, onChange: (e) => setV({ ...v, assignee: e.target.value }) }}>
          <option value="">Personne</option>
          {operators.map((o) => <option key={o.contactId} value={o.contactId}>{o.displayName}</option>)}
        </SelectField>
        <p className="k-hint">Nouvelle priorité : <PrioriteChip p={priorite(v.impact, v.urgency)} /> (échéances recalculées depuis la réception).</p>
        <SubmitButton busy={m.state.kind === 'submitting'}>Enregistrer</SubmitButton>
        {!change ? <p className="k-hint">Aucun changement.</p> : null}
        {m.state.kind === 'error' ? <p className="k-field-error" role="alert">{errText(m.state.error)}</p> : null}
      </form>
    </Panel>
  );
}

function TacheDepuisDemande({ api, t }: { readonly api: CrmApi; readonly t: Ticket }) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const m = useMutation(() => api.createTask({ title: title.trim(), ticketId: t.ticketId, ...(t.groupId ? { groupId: t.groupId } : {}), ...(due ? { dueAt: new Date(`${due}T17:00:00`).toISOString() } : {}) }));
  const submit = (e: FormEvent) => { e.preventDefault(); void m.run(undefined).then(() => { setTitle(''); setDue(''); }, () => undefined); };
  return (
    <Panel title="Tâche de suivi">
      <form onSubmit={submit}>
        <Field label="À faire" inputProps={{ value: title, onChange: (e) => setTitle(e.target.value), required: true, minLength: 3, maxLength: 160, placeholder: 'Rappeler le trésorier' }} />
        <Field label="Échéance (facultative)" inputProps={{ type: 'date', value: due, onChange: (e) => setDue(e.target.value) }} />
        <SubmitButton busy={m.state.kind === 'submitting'}>Créer la tâche (pour moi)</SubmitButton>
        {m.state.kind === 'success' ? <p className="k-hint" role="status">Tâche créée : voir la page Tâches.</p> : null}
        {m.state.kind === 'error' ? <p className="k-field-error" role="alert">{errText(m.state.error)}</p> : null}
      </form>
    </Panel>
  );
}
