/* KÓMBE CRM — tableau de bord du support, tâches et segments. */
import { useState } from 'react';
import { DataTable, PageHeader, Panel, RemoteState, StatCard, StatusChip, useRemote } from '@kombe/dashboard-core';
import type { CrmApi, Task } from './api';
import { date, errText } from './commun';
import { LIBELLE_SEGMENT } from './Comptes';

export function TableauDeBord({ api, onNavigate, canTickets }: { readonly api: CrmApi; readonly onNavigate: (p: string) => void; readonly canTickets: boolean }) {
  const r = useRemote((s) => api.dashboard(s), [api], { isEmpty: () => false });
  const seg = useRemote((s) => api.segments(s), [api]);
  return (
    <>
      <PageHeader title="Tableau de bord" description="Demandes d’assistance et délais de service (ITIL), satisfaction des membres (ISO 10002), vos tâches et les comptes à accompagner. Chiffres lus en base à l’instant." />
      <RemoteState state={r.state} onRetry={r.reload}>{(d) => {
        const t = d.tickets;
        const ouvertes = t.byStatus.nouveau + t.byStatus.en_cours + t.byStatus.attente_membre;
        return (
          <>
            <div className="k-stats">
              <StatCard label="Demandes ouvertes" value={String(ouvertes)} hint={`${t.byStatus.nouveau} nouvelle(s) · ${t.unassigned} sans responsable`} tone={t.byStatus.nouveau ? 'warn' : 'ok'} />
              <StatCard label="Délais dépassés" value={String(t.breaches.firstResponse + t.breaches.resolution)} hint={`${t.breaches.firstResponse} réponse(s) · ${t.breaches.resolution} résolution(s)`} tone={t.breaches.firstResponse + t.breaches.resolution ? 'danger' : 'ok'} />
              <StatCard label="Réponse à temps (30 j)" value={t.firstResponseOnTimePercent === null ? '—' : `${t.firstResponseOnTimePercent} %`} hint={t.medianFirstResponseHours === null ? 'aucune réponse sur 30 jours' : `médiane ${t.medianFirstResponseHours} h`} tone={t.firstResponseOnTimePercent !== null && t.firstResponseOnTimePercent < 90 ? 'warn' : 'ok'} />
              <StatCard label="Satisfaction (90 j)" value={d.satisfaction.average === null ? '—' : `${d.satisfaction.average} / 5`} hint={`${d.satisfaction.responses} avis`} tone={d.satisfaction.average !== null && d.satisfaction.average < 3.5 ? 'warn' : 'ok'} />
              <StatCard label="Droits des personnes" value={String(t.rightsRequestsOpen)} hint="demandes ouvertes (délai légal 30 j)" tone={t.rightsRequestsOpen ? 'warn' : 'ok'} />
              <StatCard label="Mes tâches" value={String(d.myTasks.open)} hint={`${d.myTasks.overdue} en retard`} tone={d.myTasks.overdue ? 'danger' : 'ok'} />
            </div>
            <div className="k-grid">
              <div className="k-span-6"><Panel title="Ouvertes par priorité">
                <DataTable rows={[1, 2, 3, 4].map((p) => ({ p, n: t.openByPriority[`p${p}` as 'p1'] }))} rowKey={(x) => String(x.p)} caption="Demandes ouvertes par priorité" columns={[
                  { header: 'Priorité', render: (x) => <StatusChip status={`P${x.p}`} tone={x.p === 1 ? 'danger' : x.p === 2 ? 'warn' : 'neutral'} /> },
                  { header: 'Ouvertes', render: (x) => String(x.n) },
                  { header: 'Délais', render: (x) => ({ 1: '1 h / 8 h', 2: '4 h / 24 h', 3: '8 h / 72 h', 4: '24 h / 7 j' })[x.p] },
                ]} />
                {canTickets ? (
                  <div className="k-toolbar">
                    <button type="button" className="k-button k-button-primary" onClick={() => onNavigate('/demandes')}>Ouvrir la file</button>
                    <button type="button" className="k-button k-button-secondary" onClick={() => onNavigate('/demandes?assignee=moi')}>Mes demandes ({t.mineOpen})</button>
                  </div>
                ) : null}
              </Panel></div>
              <div className="k-span-6"><Panel title="Activité">
                <DataTable rows={[
                  { k: 'Reçues sur 7 jours', v: t.created7d },
                  { k: 'Résolues sur 30 jours', v: t.byStatus.resolus30j },
                  { k: 'En attente du membre', v: t.byStatus.attente_membre },
                ]} rowKey={(x) => x.k} caption="Activité du support" columns={[{ header: 'Mesure', render: (x) => x.k }, { header: 'Nombre', render: (x) => String(x.v) }]} />
              </Panel></div>
            </div>
          </>
        );
      }}</RemoteState>
      <Panel title="Comptes à accompagner">
        <RemoteState state={seg.state} onRetry={seg.reload} emptyTitle="Aucun segment">{(rows) => (
          <div className="crm-segments">{rows.map((s) => (
            <button key={s.key} type="button" className="crm-segment" onClick={() => onNavigate(`/comptes?segment=${s.key}`)}>
              <strong>{s.count}</strong><span>{s.label}</span>
            </button>
          ))}</div>
        )}</RemoteState>
      </Panel>
    </>
  );
}

export function Taches({ api, onOpenTicket, onOpenAccount }: { readonly api: CrmApi; readonly onOpenTicket: (id: string) => void; readonly onOpenAccount: (gid: string) => void }) {
  const [scope, setScope] = useState<'miennes' | 'toutes'>('miennes');
  const [status, setStatus] = useState<'ouvertes' | 'toutes'>('ouvertes');
  const [err, setErr] = useState<string | null>(null);
  const r = useRemote((s) => api.tasks(scope, status, s), [api, scope, status]);
  const changer = async (t: Task, st: 'fait' | 'annule' | 'a_faire') => {
    setErr(null);
    try { await api.updateTask(t.taskId, st, t.version); r.reload(); } catch (e) { setErr(errText(e)); }
  };
  return (
    <>
      <PageHeader title="Tâches" description="Suivis à faire : rappeler un trésorier, vérifier une correction, recontacter une personne. Une tâche se crée depuis une demande ou une fiche." />
      <div className="crm-filtres">
        <label>Pour <select className="k-select-group" value={scope} onChange={(e) => setScope(e.target.value as 'miennes')}><option value="miennes">Moi</option><option value="toutes">Toute l’équipe</option></select></label>
        <label>État <select className="k-select-group" value={status} onChange={(e) => setStatus(e.target.value as 'ouvertes')}><option value="ouvertes">À faire</option><option value="toutes">Toutes</option></select></label>
      </div>
      {err ? <p className="k-field-error" role="alert">{err}</p> : null}
      <Panel>
        <RemoteState state={r.state} onRetry={r.reload} emptyTitle="Aucune tâche" emptyBody="Rien à faire pour ce filtre.">{(rows) => (
          <DataTable rows={rows} rowKey={(t) => t.taskId} caption="Tâches" columns={[
            { header: 'À faire', render: (t) => <><strong>{t.title}</strong>{t.overdue ? <> <StatusChip status="En retard" tone="danger" /></> : null}</> },
            { header: 'Échéance', render: (t) => date(t.dueAt) },
            { header: 'Pour', render: (t) => t.assigneeName ?? '—' },
            { header: 'Lien', render: (t) => <>
              {t.ticketId ? <button type="button" className="crm-lien" onClick={() => onOpenTicket(t.ticketId as string)}>{t.ticketRef}</button> : null}
              {t.groupId ? <> <button type="button" className="crm-lien" onClick={() => onOpenAccount(t.groupId as string)}>{t.groupName ?? t.groupId}</button></> : null}
              {t.contactName ? <span className="k-hint"> {t.contactName}</span> : null}
            </> },
            { header: 'État', render: (t) => <StatusChip status={t.status === 'a_faire' ? 'À faire' : t.status === 'fait' ? 'Fait' : 'Annulée'} tone={t.status === 'fait' ? 'ok' : t.status === 'a_faire' ? 'warn' : 'neutral'} /> },
            { header: '', render: (t) => t.status === 'a_faire'
              ? <span className="crm-actions"><button type="button" className="k-button k-button-primary" onClick={() => void changer(t, 'fait')}>Fait</button><button type="button" className="k-button k-button-secondary" onClick={() => void changer(t, 'annule')}>Annuler</button></span>
              : <button type="button" className="k-button k-button-secondary" onClick={() => void changer(t, 'a_faire')}>Rouvrir</button> },
          ]} />
        )}</RemoteState>
      </Panel>
    </>
  );
}

export function Segments({ api, onOpenAccount }: { readonly api: CrmApi; readonly onOpenAccount: (gid: string) => void }) {
  const r = useRemote((s) => api.segments(s), [api]);
  return (
    <>
      <PageHeader title="Segments" description="Listes calculées à la demande sur l’activité réelle des groupes : qui relancer, qui accompagner. Aucun envoi automatique : l’opérateur décide." />
      <RemoteState state={r.state} onRetry={r.reload} emptyTitle="Aucun segment">{(rows) => (
        <div className="k-grid">{rows.map((s) => (
          <div key={s.key} className="k-span-6"><Panel title={`${s.label} (${s.count})`}>
            <p className="k-hint">{s.description}</p>
            {s.groups.length === 0 ? <StatusChip status="Aucun groupe" tone="ok" /> : (
              <ul className="crm-liste">{s.groups.slice(0, 50).map((g) => (
                <li key={g.groupId}><button type="button" className="crm-lien" onClick={() => onOpenAccount(g.groupId)}>{g.name ?? g.groupId}</button></li>
              ))}</ul>
            )}
            {s.groups.length > 50 ? <p className="k-hint">… et {s.groups.length - 50} autres (page Comptes, filtre « {LIBELLE_SEGMENT[s.key] ?? s.key} »).</p> : null}
          </Panel></div>
        ))}</div>
      )}</RemoteState>
    </>
  );
}
