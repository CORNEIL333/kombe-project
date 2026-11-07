/* KÓMBE CRM — comptes (groupes) et contacts (personnes, pseudonymes).
   Minimisation : un contact est désigné par un identifiant ct_… et un
   identifiant de connexion MASQUÉ ; l'afficher en clair exige un motif écrit,
   enregistré au journal d'audit. Aucun montant individuel n'est affiché. */
import { useState, type FormEvent } from 'react';
import { DataTable, Field, KeyValue, PageHeader, Panel, RemoteState, StatCard, StatusChip, SubmitButton, TextAreaField, useMutation, useRemote } from '@kombe/dashboard-core';
import type { Account, CrmApi } from './api';
import { NotesPanel, TachesMini, date, errText } from './commun';
import { TableDemandes } from './Demandes';

export const ETAT_GROUPE: Readonly<Record<string, string>> = { configuration: 'En préparation', active: 'En cours', paused: 'En pause', closed: 'Terminé', stopped_with_discrepancies: 'Arrêté avec écarts', archived: 'Archivé' };
export const LIBELLE_SEGMENT: Readonly<Record<string, string>> = {
  'a-relancer': 'Confirmations en retard',
  admissions: 'Admissions en attente',
  inactifs: 'Inactif 30 j',
  'preparation-longue': 'Préparation longue',
  dettes: 'Dettes ouvertes',
  nouveaux: 'Nouveau',
  'demandes-ouvertes': 'Demande ouverte',
};
const ROLE: Readonly<Record<string, string>> = { president: 'Président', treasurer: 'Trésorier', secretary: 'Secrétaire', auditor: 'Commissaire', censor: 'Censeur', member: 'Membre' };
const heures = (v: string | null) => (v ? Math.round((Date.now() - new Date(v).getTime()) / 3_600_000) : 0);

export function Comptes({ api, onOpen, segment }: { readonly api: CrmApi; readonly onOpen: (gid: string) => void; readonly segment?: string }) {
  const r = useRemote((s) => api.accounts(s), [api]);
  const [filtre, setFiltre] = useState('');
  const [seg, setSeg] = useState(segment ?? '');
  return (
    <>
      <PageHeader title="Comptes" description="Chaque groupe (tontine) est un compte : santé, demandes, notes et tâches. Les segments signalent ceux à accompagner. Aucun nom de membre ni montant individuel ici." />
      <div className="crm-filtres">
        <label>Rechercher <input className="k-select-group" value={filtre} onChange={(e) => setFiltre(e.target.value)} placeholder="Nom du groupe" /></label>
        <label>Segment <select className="k-select-group" value={seg} onChange={(e) => setSeg(e.target.value)}>
          <option value="">Tous</option>{Object.entries(LIBELLE_SEGMENT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select></label>
      </div>
      <Panel>
        <RemoteState state={r.state} onRetry={r.reload} emptyTitle="Aucun groupe">{(rows: readonly Account[]) => {
          const vus = rows.filter((g) => (!filtre || (g.name ?? '').toLowerCase().includes(filtre.toLowerCase())) && (!seg || g.segments.includes(seg)));
          return (
            <DataTable rows={vus} rowKey={(g) => g.groupId} caption={`Comptes (${vus.length})`} columns={[
              { header: 'Groupe', render: (g) => <button type="button" className="crm-lien" onClick={() => onOpen(g.groupId)}><strong>{g.name ?? g.groupId}</strong></button> },
              { header: 'État', render: (g) => <StatusChip status={ETAT_GROUPE[g.state] ?? g.state} tone={g.state === 'active' ? 'ok' : 'neutral'} /> },
              { header: 'Membres', render: (g) => `${g.membersActive}${g.membersPending ? ` (+${g.membersPending})` : ''}` },
              { header: 'À confirmer', render: (g) => g.movementsDeclaredPending ? <StatusChip status={`${g.movementsDeclaredPending} · ${heures(g.oldestPendingAt)} h`} tone={heures(g.oldestPendingAt) > 72 ? 'danger' : 'warn'} /> : '0' },
              { header: 'Demandes', render: (g) => g.ticketsOpen ? <StatusChip status={`${g.ticketsOpen} ouverte(s)`} tone="warn" /> : String(g.ticketsTotal) },
              { header: 'Segments', render: (g) => g.segments.map((s) => <StatusChip key={s} status={LIBELLE_SEGMENT[s] ?? s} tone={s === 'a-relancer' || s === 'dettes' ? 'warn' : 'neutral'} />) },
              { header: 'Dernière activité', render: (g) => date(g.lastActivityAt) },
            ]} />
          );
        }}</RemoteState>
      </Panel>
    </>
  );
}

export function FicheCompte({ api, groupId, onBack, onOpenTicket, onOpenContact, onJit, canJit }: {
  readonly api: CrmApi; readonly groupId: string; readonly onBack: () => void; readonly onOpenTicket: (id: string) => void;
  readonly onOpenContact: (cid: string) => void; readonly onJit: (gid: string) => void; readonly canJit: boolean;
}) {
  const r = useRemote((s) => api.account(groupId, s), [api, groupId], { isEmpty: () => false });
  return (
    <>
      <div className="k-toolbar"><button type="button" className="k-button k-button-secondary" onClick={onBack}>← Comptes</button></div>
      <RemoteState state={r.state} onRetry={r.reload}>{(a) => (
        <>
          <PageHeader title={a.name ?? a.groupId} description={`Compte créé le ${date(a.createdAt)} · ${ETAT_GROUPE[a.state] ?? a.state}. Consultation enregistrée au journal d’audit.`}
            actions={canJit ? <button type="button" className="k-button k-button-secondary" onClick={() => onJit(a.groupId)}>Demander un accès JIT au contenu</button> : undefined} />
          <div className="k-stats">
            <StatCard label="Membres actifs" value={String(a.health.membersActive)} hint={a.health.membersPending ? `${a.health.membersPending} en attente d’admission` : 'Aucune admission en attente'} tone={a.health.membersPending ? 'warn' : 'ok'} />
            <StatCard label="À confirmer" value={String(a.health.movementsDeclaredPending)} hint={a.health.oldestPendingAt ? `la plus ancienne depuis ${heures(a.health.oldestPendingAt)} h` : 'rien en attente'} tone={heures(a.health.oldestPendingAt) > 72 ? 'danger' : 'ok'} />
            <StatCard label="Dettes ouvertes" value={String(a.health.openDebts)} tone={a.health.openDebts ? 'warn' : 'ok'} />
            <StatCard label="Dernière activité" value={date(a.health.lastActivityAt)} />
          </div>
          {a.segments.length ? <p>{a.segments.map((s) => <StatusChip key={s} status={LIBELLE_SEGMENT[s] ?? s} tone="warn" />)}</p> : null}
          <div className="k-grid">
            <div className="k-span-6"><Panel title={`Bureau (${a.contacts.length})`}>
              {a.contacts.length === 0 ? <p className="k-hint">Aucun responsable désigné.</p> : (
                <DataTable rows={a.contacts} rowKey={(c) => c.contactId} caption="Responsables du groupe" columns={[
                  { header: 'Nom', render: (c) => <button type="button" className="crm-lien" onClick={() => onOpenContact(c.contactId)}>{c.displayName}</button> },
                  { header: 'Fonctions', render: (c) => c.roles.map((x) => ROLE[x] ?? x).join(', ') },
                  { header: 'Identifiant', render: (c) => <span className="k-code">{c.loginMasked}</span> },
                ]} />
              )}
            </Panel></div>
            <div className="k-span-6"><Panel title={`Demandes (${a.tickets.length})`}>
              {a.tickets.length === 0 ? <p className="k-hint">Aucune demande liée.</p> : <TableDemandes rows={a.tickets} onOpen={onOpenTicket} />}
            </Panel></div>
            <div className="k-span-6"><Panel title="Notes internes"><NotesPanel notes={a.notes} onAdd={(b) => api.addNote({ groupId: a.groupId }, b).then(r.reload)} /></Panel></div>
            <div className="k-span-6"><Panel title="Tâches"><TachesMini tasks={a.tasks} /></Panel></div>
          </div>
        </>
      )}</RemoteState>
    </>
  );
}

export function Contacts({ api, onOpen }: { readonly api: CrmApi; readonly onOpen: (cid: string) => void }) {
  const [login, setLogin] = useState('');
  const m = useMutation(() => api.searchContact(login.trim()));
  const submit = (e: FormEvent) => { e.preventDefault(); void m.run(undefined).then((r) => onOpen(r.contactId), () => undefined); };
  return (
    <>
      <PageHeader title="Contacts" description="Trouver une personne par son identifiant de connexion EXACT (téléphone ou e-mail), quand elle appelle ou écrit au support. Pas de liste ni de recherche approximative : minimisation des données. Chaque recherche est journalisée." />
      <div className="k-grid"><div className="k-span-6"><Panel title="Rechercher">
        <form onSubmit={submit}>
          <Field label="Téléphone ou e-mail" hint="Ex. 677123456, +237677123456 ou nom@exemple.cm" inputProps={{ value: login, onChange: (e) => setLogin(e.target.value), required: true, minLength: 3, maxLength: 120, autoComplete: 'off' }} />
          <SubmitButton busy={m.state.kind === 'submitting'}>Ouvrir la fiche</SubmitButton>
          {m.state.kind === 'error' ? <p className="k-field-error" role="alert">{errText(m.state.error)}</p> : null}
        </form>
      </Panel></div>
      <div className="k-span-6"><Panel title="Autres accès">
        <p className="k-hint">Une fiche contact s’ouvre aussi depuis une demande (demandeur) ou depuis le bureau d’un compte.</p>
      </Panel></div></div>
    </>
  );
}

export function FicheContact({ api, contactId, onBack, onOpenTicket, onOpenAccount }: {
  readonly api: CrmApi; readonly contactId: string; readonly onBack: () => void; readonly onOpenTicket: (id: string) => void; readonly onOpenAccount: (gid: string) => void;
}) {
  const r = useRemote((s) => api.contact(contactId, s), [api, contactId], { isEmpty: () => false });
  return (
    <>
      <div className="k-toolbar"><button type="button" className="k-button k-button-secondary" onClick={onBack}>← Retour</button></div>
      <RemoteState state={r.state} onRetry={r.reload}>{(c) => (
        <>
          <PageHeader title={c.displayName} description={`Contact ${c.contactId} · compte créé le ${date(c.createdAt)}. Consultation enregistrée au journal d’audit.`} />
          <div className="k-grid">
            <div className="k-span-5">
              <Panel title="Identité">
                <KeyValue label="Identifiant" value={<span className="k-code">{c.loginMasked}</span>} />
                <KeyValue label="Type" value={c.loginKind === 'email' ? 'E-mail' : 'Téléphone'} />
                <KeyValue label="Langue" value={c.language === 'en' ? 'Anglais' : 'Français'} />
                <KeyValue label="Opérateur KÓMBE" value={c.isOperator ? 'Oui' : 'Non'} />
                <KeyValue label="Messages hors application" value={[c.consent.push ? 'notifications' : null, c.consent.sms ? 'SMS' : null, c.consent.email ? 'e-mail' : null].filter(Boolean).join(', ') || 'aucun'} />
              </Panel>
              <Afficher api={api} contactId={c.contactId} />
            </div>
            <div className="k-span-7">
              <Panel title={`Groupes (${c.groups.length})`}>
                {c.groups.length === 0 ? <p className="k-hint">Aucun groupe.</p> : (
                  <ul className="crm-liste">{c.groups.map((g) => (
                    <li key={g.groupId}><button type="button" className="crm-lien" onClick={() => onOpenAccount(g.groupId)}>{g.name ?? g.groupId}</button>
                      <span className="k-hint"> · {ETAT_GROUPE[g.state] ?? g.state}{g.roles.length ? ` · ${g.roles.map((x) => ROLE[x] ?? x).join(', ')}` : ''}</span></li>
                  ))}</ul>
                )}
              </Panel>
              <Panel title={`Demandes (${c.tickets.length})`}>{c.tickets.length === 0 ? <p className="k-hint">Aucune demande.</p> : <TableDemandes rows={c.tickets} onOpen={onOpenTicket} />}</Panel>
              <Panel title="Notes internes"><NotesPanel notes={c.notes} onAdd={(b) => api.addNote({ contactId: c.contactId }, b).then(r.reload)} /></Panel>
              <Panel title="Tâches"><TachesMini tasks={c.tasks} /></Panel>
            </div>
          </div>
        </>
      )}</RemoteState>
    </>
  );
}

/** Affichage de l'identifiant en clair : motif obligatoire, journalisé ; masqué de nouveau au départ de la page. */
function Afficher({ api, contactId }: { readonly api: CrmApi; readonly contactId: string }) {
  const [motif, setMotif] = useState('');
  const m = useMutation(() => api.reveal(contactId, motif.trim()));
  const submit = (e: FormEvent) => { e.preventDefault(); void m.run(undefined).catch(() => undefined); };
  return (
    <Panel title="Afficher l’identifiant en clair">
      {m.state.kind === 'success' ? (
        <>
          <KeyValue label="Identifiant" value={<span className="k-code">{m.state.data.login}</span>} />
          <p className="k-hint">Affichage enregistré au journal avec votre motif. Ne le copiez pas ailleurs que dans l’outil d’appel.</p>
          <button type="button" className="k-button k-button-secondary" onClick={m.reset}>Masquer</button>
        </>
      ) : (
        <form onSubmit={submit}>
          <TextAreaField label="Motif (obligatoire)" hint="Ex. « Rappel demandé par la personne, demande KMB-000123 ». 10 caractères au moins ; relu par l’administration." textareaProps={{ value: motif, onChange: (e) => setMotif(e.target.value), required: true, minLength: 10, maxLength: 500, rows: 2 }} />
          <SubmitButton busy={m.state.kind === 'submitting'}>Afficher</SubmitButton>
          {m.state.kind === 'error' ? <p className="k-field-error" role="alert">{errText(m.state.error)}</p> : null}
        </form>
      )}
    </Panel>
  );
}
