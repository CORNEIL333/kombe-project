/* KÓMBE CRM — conformité (RGPD, loi camerounaise n° 2024/017) et journal
   d'audit (ISO/IEC 27001 A.8.15). Lecture seule, sauf l'anonymisation des
   demandes closes au-delà de la durée de conservation (administration). */
import { useState, type FormEvent } from 'react';
import { DataTable, Field, JsonDisclosure, KeyValue, PageHeader, Panel, RemoteState, StatCard, StatusChip, SubmitButton, useMutation, useRemote } from '@kombe/dashboard-core';
import type { CrmApi } from './api';
import { date, errText } from './commun';
import { TableDemandes } from './Demandes';

const BASE_LEGALE: Readonly<Record<string, string>> = {
  consent: 'Consentement',
  contract: 'Exécution du service',
  legal_obligation: 'Obligation légale',
  legitimate_interest: 'Intérêt légitime',
};
export const ACTION: Readonly<Record<string, string>> = {
  consultation_contact: 'Consultation d’une fiche',
  affichage_identifiant: 'Identifiant affiché en clair',
  recherche_contact: 'Recherche d’un contact',
  consultation_demande: 'Consultation d’une demande',
  creation_demande: 'Demande saisie',
  modification_demande: 'Demande modifiée',
  reponse_demande: 'Réponse envoyée',
  note_interne: 'Note interne (demande)',
  note: 'Note sur une fiche',
  tache: 'Tâche',
  anonymisation: 'Anonymisation',
  consultation_journal: 'Consultation du journal',
};

export function Conformite({ api, onOpenTicket, isAdmin }: { readonly api: CrmApi; readonly onOpenTicket: (id: string) => void; readonly isAdmin: boolean }) {
  const r = useRemote((s) => api.compliance(s), [api], { isEmpty: () => false });
  return (
    <>
      <PageHeader title="Conformité" description="Registre des traitements, demandes d’exercice des droits (accès, rectification, effacement : 30 jours), conservation limitée des demandes, et volume des consultations journalisées. À faire valider par un juriste (loi n° 2024/017)." />
      <RemoteState state={r.state} onRetry={r.reload}>{(c) => (
        <>
          <div className="k-stats">
            <StatCard label="Droits des personnes" value={String(c.rightsRequestsOpen.length)} hint="demandes ouvertes" tone={c.rightsRequestsOpen.some((t) => t.sla.resolutionBreached) ? 'danger' : c.rightsRequestsOpen.length ? 'warn' : 'ok'} />
            <StatCard label="À anonymiser" value={String(c.retention.eligibleForAnonymization)} hint={`demandes closes depuis plus de ${c.retention.policyDays} jours`} tone={c.retention.eligibleForAnonymization ? 'warn' : 'ok'} />
            <StatCard label="Déjà anonymisées" value={String(c.retention.anonymizedTotal)} />
            <StatCard label="Identifiants affichés (30 j)" value={String(c.auditLast30Days.affichage_identifiant ?? 0)} hint="avec motif, au journal" />
          </div>
          <div className="k-grid">
            <div className="k-span-12"><Panel title="Demandes d’exercice des droits en cours">
              {c.rightsRequestsOpen.length === 0 ? <StatusChip status="Aucune" tone="ok" /> : <TableDemandes rows={c.rightsRequestsOpen} onOpen={onOpenTicket} />}
            </Panel></div>
            <div className="k-span-12"><Panel title="Registre des traitements">
              <DataTable rows={c.processingRecords} rowKey={(x) => x.recordId} caption="Registre des traitements" columns={[
                { header: 'Traitement', render: (x) => <><strong>{x.purpose}</strong><br /><span className="k-code">{x.recordId}</span></> },
                { header: 'Données', render: (x) => x.dataCategories.join(', ') },
                { header: 'Base légale', render: (x) => BASE_LEGALE[x.legalBasis] ?? x.legalBasis },
                { header: 'Destinataires', render: (x) => x.recipients.join(', ') },
                { header: 'Hébergement', render: (x) => x.country },
                { header: 'Conservation', render: (x) => `${x.retentionDays} jours` },
              ]} />
              <p className="k-hint">Hébergement hors du Cameroun : transfert à déclarer ou encadrer (voir docs/production-readiness/13_go_no_go.md).</p>
            </Panel></div>
            <div className="k-span-6"><Panel title="Consultations journalisées (30 jours)">
              {Object.keys(c.auditLast30Days).length === 0 ? <p className="k-hint">Aucune.</p> : Object.entries(c.auditLast30Days).map(([k, n]) => <KeyValue key={k} label={ACTION[k] ?? k} value={String(n)} />)}
            </Panel></div>
            <div className="k-span-6">{isAdmin ? <Anonymiser api={api} onDone={r.reload} eligible={c.retention.eligibleForAnonymization} /> : (
              <Panel title="Anonymisation"><p className="k-hint">Réservée à l’administration : les demandes closes depuis plus de {c.retention.policyDays} jours sont anonymisées (objet, messages, lien avec la personne).</p></Panel>
            )}</div>
          </div>
        </>
      )}</RemoteState>
    </>
  );
}

function Anonymiser({ api, onDone, eligible }: { readonly api: CrmApi; readonly onDone: () => void; readonly eligible: number }) {
  const [jours, setJours] = useState('730');
  const [confirme, setConfirme] = useState(false);
  const m = useMutation(() => api.anonymize(Number(jours)));
  const submit = (e: FormEvent) => { e.preventDefault(); if (confirme) void m.run(undefined).then(onDone, () => undefined); };
  return (
    <Panel title="Anonymiser les demandes anciennes">
      <form onSubmit={submit}>
        <Field label="Closes depuis plus de (jours)" hint="365 jours au moins. Irréversible : l’objet et les messages sont remplacés par « [anonymisé] » et le lien avec la personne est retiré." inputProps={{ type: 'number', min: 365, max: 3650, value: jours, onChange: (e) => setJours(e.target.value), required: true }} />
        <label className="crm-confirmer"><input type="checkbox" checked={confirme} onChange={(e) => setConfirme(e.target.checked)} /> Je confirme l’anonymisation ({eligible} demande(s) éligible(s) à 730 jours)</label>
        <SubmitButton busy={m.state.kind === 'submitting'} danger>Anonymiser</SubmitButton>
        {m.state.kind === 'success' ? <p className="k-hint" role="status">{m.state.data.anonymized} demande(s) anonymisée(s), acte enregistré au journal.</p> : null}
        {m.state.kind === 'error' ? <p className="k-field-error" role="alert">{errText(m.state.error)}</p> : null}
      </form>
    </Panel>
  );
}

export function Journal({ api }: { readonly api: CrmApi }) {
  const [kind, setKind] = useState('');
  const [objet, setObjet] = useState('');
  const [f, setF] = useState<{ objectKind?: string; objectId?: string }>({});
  const r = useRemote((s) => api.audit(f, s), [api, f]);
  return (
    <>
      <PageHeader title="Journal d’audit" description="Chaque consultation de fiche, affichage d’identifiant (avec motif), recherche et écriture du CRM, en ajout seul : personne ne peut le modifier ni l’effacer. Votre consultation y est elle-même enregistrée." />
      <form className="crm-filtres" onSubmit={(e) => { e.preventDefault(); setF({ ...(kind ? { objectKind: kind } : {}), ...(objet.trim() ? { objectId: objet.trim() } : {}) }); }}>
        <label>Objet <select className="k-select-group" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Tous</option><option value="contact">Contact</option><option value="demande">Demande</option><option value="groupe">Groupe</option><option value="tache">Tâche</option><option value="journal">Journal</option>
        </select></label>
        <label>Identifiant <input className="k-select-group" value={objet} onChange={(e) => setObjet(e.target.value)} placeholder="ct_… / tk_… / groupe" /></label>
        <button type="submit" className="k-button k-button-secondary">Filtrer</button>
      </form>
      <Panel>
        <RemoteState state={r.state} onRetry={r.reload} emptyTitle="Journal vide">{(rows) => (
          <DataTable rows={rows} rowKey={(x) => x.auditId} caption="Journal d’audit (300 dernières lignes)" columns={[
            { header: 'Quand', render: (x) => date(x.at) },
            { header: 'Qui', render: (x) => x.actorName ?? x.actorContactId },
            { header: 'Acte', render: (x) => <StatusChip status={ACTION[x.action] ?? x.action} tone={x.action === 'affichage_identifiant' || x.action === 'anonymisation' ? 'warn' : 'neutral'} /> },
            { header: 'Objet', render: (x) => <>{x.objectKind}{x.objectId ? <> <span className="k-code">{x.objectId}</span></> : null}</> },
            { header: 'Motif', render: (x) => x.motif ?? '—' },
            { header: 'Détail', render: (x) => (x.detail ? <JsonDisclosure value={x.detail} label="Voir" /> : '—') },
          ]} />
        )}</RemoteState>
      </Panel>
    </>
  );
}
