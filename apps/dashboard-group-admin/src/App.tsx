/* KÓMBE — « Espace bureau » : le tableau de bord du bureau d'un groupe
   (président, secrétaire, trésorier, commissaire) sur ordinateur. Mêmes
   données et mêmes droits que la PWA (API tontine réelle) ; vues en tableaux,
   collecte en lot, procès-verbaux imprimables et exports CSV pour les comptes
   rendus. KÓMBE ne garde pas l'argent : tous les montants sont des
   déclarations confirmées par des personnes. */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  CapabilityNotice, DashboardBoot, DashboardShell, DataTable, KeyValue, PageHeader, Panel, RemoteState, StatCard, StatusChip,
  formatServerDate, formatXaf, useHashRoute, useRemote, type DashboardContext,
} from '@kombe/dashboard-core';
import { GroupAdminApi, type DecisionView, downloadCsv, toCsv, type MeetingDetail, type MovementView, type TontineSummary } from './api';

const messages = { app: { fr: 'Espace bureau', en: 'Board space' } } as const;
const NAV = [
  { path: '/', label: 'Vue d’ensemble' },
  { path: '/collecte', label: 'Collecte du tour' },
  { path: '/mouvements', label: 'Mouvements' },
  { path: '/membres', label: 'Membres & invitations' },
  { path: '/seances', label: 'Séances & PV' },
  { path: '/discipline', label: 'Amendes, secours, dettes' },
  { path: '/votes', label: 'Votes & sanctions' },
  { path: '/registre', label: 'Registre' },
  { path: '/reglement', label: 'Règlement & statuts' },
] as const;

export const ROLE: Record<string, string> = {
  animator: 'Président', vice_president: 'Vice-président', secretary: 'Secrétaire général', treasurer: 'Trésorier',
  treasurer_deputy: 'Trésorier adjoint', auditor: 'Commissaire aux comptes', censor: 'Censeur', advisor: 'Conseiller', member: 'Membre',
};
export const ETAT_MVT: Record<string, [string, 'ok' | 'warn' | 'danger' | 'neutral']> = {
  declared: ['Déclaré', 'warn'], confirmed: ['Confirmé par le trésorier', 'ok'], validated: ['Validé', 'ok'], rejected: ['Rejeté', 'danger'], compensated: ['Corrigé', 'neutral'],
};
const CAISSE: Record<string, string> = {
  rotation: 'Cagnotte (njangi)', solidarity: 'Secours', year_end_reserve: 'Réserve de fin d’année', operating: 'Fonctionnement', fines: 'Amendes', loan: 'Prêts', collector: 'Collecte journalière',
};
const TYPE: Record<string, string> = {
  contribution: 'Cotisation', payout: 'Remise', fine_payment: 'Amende payée', advance: 'Avance de caisse', advance_repayment: 'Remboursement d’avance',
  transfer_in: 'Transfert reçu', transfer_out: 'Transfert envoyé', fee: 'Frais', expense: 'Dépense',
};
const CANAL: Record<string, string> = { cash: 'Espèces', orange_money: 'Orange Money', mtn_momo: 'MTN MoMo', bank: 'Banque', international_transfer: 'Transfert depuis l’étranger', other: 'Autre' };
const BUREAU = ['animator', 'vice_president', 'secretary', 'treasurer', 'treasurer_deputy', 'auditor', 'censor', 'advisor'];
const xaf = (v: string) => { try { return formatXaf(v); } catch { return `${v} FCFA`; } };
const jour = (iso: string | null | undefined) => (iso ? formatServerDate(iso.length === 10 ? `${iso}T12:00:00Z` : iso).replace(/,? \d{2}:\d{2}$/, '') : '—');
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function App() {
  return <DashboardBoot product="Espace bureau" messages={messages}>{(ctx) => <Espace ctx={ctx} />}</DashboardBoot>;
}

function Espace({ ctx }: { readonly ctx: DashboardContext }) {
  const api = useMemo(() => new GroupAdminApi(ctx.api), [ctx.api]);
  const { path, navigate } = useHashRoute();
  const mine = useRemote((s) => api.myTontines(s), [api]);
  const [groupId, setGroupId] = useState<string>(() => { try { return window.localStorage.getItem('kombe.bureau.groupe') ?? ''; } catch { return ''; } });
  const list: readonly TontineSummary[] = mine.state.kind === 'ready' ? mine.state.data : [];
  const actives = list.filter((g) => g.membershipState === 'active');
  useEffect(() => {
    if (!actives.length) return;
    if (!actives.some((g) => g.groupId === groupId)) {
      const pref = actives.find((g) => g.roles.some((r) => BUREAU.includes(r))) ?? actives[0];
      if (pref) setGroupId(pref.groupId);
    }
  }, [actives, groupId]);
  useEffect(() => { try { if (groupId) window.localStorage.setItem('kombe.bureau.groupe', groupId); } catch { /* ignoré */ } }, [groupId]);
  const current = actives.find((g) => g.groupId === groupId);

  const selector = (
    <label className="k-toolbar">
      <span className="k-hint">Groupe</span>
      <select className="k-select-group" value={groupId} onChange={(e) => setGroupId(e.target.value)} aria-label="Groupe">
        {actives.map((g) => <option key={g.groupId} value={g.groupId}>{g.name}</option>)}
      </select>
    </label>
  );
  const badge = <span className="k-hint">{ctx.session.phase.kind === 'authenticated' ? ctx.session.phase.identityId : ''} <button type="button" className="k-button k-button-secondary" onClick={ctx.session.logout}>Se déconnecter</button></span>;

  let page: ReactNode;
  if (mine.state.kind !== 'ready' && mine.state.kind !== 'empty') page = <RemoteState state={mine.state} onRetry={mine.reload}>{() => null}</RemoteState>;
  else if (!current) page = <CapabilityNotice title="Aucun groupe actif">Ce compte n’est membre actif d’aucun groupe. Créez ou rejoignez une tontine depuis l’application KÓMBE, puis revenez ici.</CapabilityNotice>;
  else {
    const p = { api, g: current };
    switch (path) {
      case '/collecte': page = <Collecte {...p} />; break;
      case '/mouvements': page = <Mouvements {...p} />; break;
      case '/membres': page = <Membres {...p} />; break;
      case '/seances': page = <Seances {...p} />; break;
      case '/discipline': page = <Discipline {...p} />; break;
      case '/votes': page = <Votes {...p} />; break;
      case '/registre': page = <Registre {...p} />; break;
      case '/reglement': page = <Reglement {...p} />; break;
      default: page = <Overview {...p} onNavigate={navigate} />;
    }
  }
  return (
    <DashboardShell product="Espace bureau" nav={NAV} activePath={path} onNavigate={navigate} search={selector} userBadge={badge} {...(ctx.config.environment ? { environment: ctx.config.environment } : {})}>
      {page}
    </DashboardShell>
  );
}

interface P { readonly api: GroupAdminApi; readonly g: TontineSummary }

function Overview({ api, g, onNavigate }: P & { readonly onNavigate: (p: string) => void }) {
  const d = useRemote((s) => api.detail(g.groupId, s), [api, g.groupId]);
  const pending = useRemote((s) => api.movements(g.groupId, { state: 'declared' }, s), [api, g.groupId], { isEmpty: () => false });
  const rounds = useRemote((s) => api.rounds(g.groupId, s), [api, g.groupId], { isEmpty: () => false });
  const debts = useRemote((s) => api.debts(g.groupId, s), [api, g.groupId], { isEmpty: () => false });
  return (
    <>
      <PageHeader title={g.name} description={`Vos fonctions : ${g.roles.map((r) => ROLE[r] ?? r).join(', ') || 'Membre'}. KÓMBE tient le registre ; l’argent reste chez le trésorier.`} />
      <RemoteState state={d.state} onRetry={d.reload}>{(t) => {
        const closed = rounds.state.kind === 'ready' ? rounds.state.data.filter((r) => r.state === 'closed').length : 0;
        const total = rounds.state.kind === 'ready' ? rounds.state.data.length : 0;
        const aConfirmer = pending.state.kind === 'ready' ? pending.state.data.length : 0;
        const dettes = debts.state.kind === 'ready' ? debts.state.data.filter((x) => x.state === 'open').reduce((s, x) => s + BigInt(x.remaining), 0n) : 0n;
        return (
          <div className="k-grid">
            <div className="k-span-12"><div className="k-stats">
              <StatCard label="Membres actifs" value={String(t.memberCount)} hint={t.pendingCount ? `${t.pendingCount} adhésion(s) à valider` : 'Aucune adhésion en attente'} tone={t.pendingCount ? 'warn' : 'ok'} />
              <StatCard label="Tours clos" value={total ? `${closed}/${total}` : '—'} hint={t.cycleStarted ? 'Cycle démarré' : 'Cycle en préparation'} />
              <StatCard label="À confirmer" value={String(aConfirmer)} hint="Déclarations en attente du trésorier" tone={aConfirmer ? 'warn' : 'ok'} />
              <StatCard label="Dettes suivies" value={xaf(dettes.toString())} hint="Reste dû, toutes dettes ouvertes" tone={dettes > 0n ? 'warn' : 'ok'} />
            </div></div>
            <div className="k-span-7">
              <Panel title={t.currentRound ? `Tour en cours : n° ${t.currentRound.seq} — ${jour(t.currentRound.date)}` : 'Tour en cours'}>
                {t.currentRound ? (
                  <>
                    <KeyValue label="Bénéficiaire" value={t.currentRound.beneficiaryName ?? '—'} />
                    <KeyValue label="Confirmé / attendu" value={`${xaf(t.currentRound.collected)} / ${xaf(t.currentRound.expectedPot)}`} />
                    <KeyValue label="Remise" value={<StatusChip status={{ none: 'Pas encore remise', declared: 'Déclarée', confirmed: 'Confirmée', received: 'Reçue par le bénéficiaire' }[t.currentRound.payoutState]} tone={t.currentRound.payoutState === 'received' ? 'ok' : 'warn'} />} />
                    {BigInt(t.currentRound.expectedPot) > 0n ? (() => { const pct = Math.min(100, Number((BigInt(t.currentRound.collected) * 100n) / BigInt(t.currentRound.expectedPot))); return <><div className="k-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Part de la cagnotte confirmée"><span style={{ width: `${pct}%` }} /></div><p className="k-hint">{pct} % de la cagnotte confirmé</p></>; })() : null}
                  </>
                ) : <p className="k-hint">Le cycle n’a pas encore démarré.</p>}
                <div className="k-toolbar"><button type="button" className="k-button k-button-primary" onClick={() => onNavigate('/collecte')}>Ouvrir la collecte</button></div>
              </Panel>
            </div>
            <div className="k-span-5">
              <Panel title="Caisses du groupe">
                <p className="k-hint">Argent tenu par le trésorier, pas par KÓMBE.</p>
                {t.funds.map((f) => <KeyValue key={f.fundId} label={CAISSE[f.kind] ?? f.kind} value={`${xaf(f.confirmedBalance)}${BigInt(f.pendingIn) > 0n ? ` (+ ${xaf(f.pendingIn)} déclaré)` : ''}`} />)}
              </Panel>
              {t.nextMeeting ? <Panel title="Prochaine séance"><KeyValue label={`Séance n° ${t.nextMeeting.seq}`} value={`${jour(t.nextMeeting.date)}${t.nextMeeting.location ? ` · ${t.nextMeeting.location}` : ''}`} /></Panel> : null}
            </div>
          </div>
        );
      }}</RemoteState>
    </>
  );
}

function Collecte({ api, g }: P) {
  const rounds = useRemote((s) => api.rounds(g.groupId, s), [api, g.groupId]);
  const [seq, setSeq] = useState<number | null>(null);
  const open = rounds.state.kind === 'ready' ? rounds.state.data.find((r) => r.state === 'open') : undefined;
  const sel = seq ?? open?.seq ?? (rounds.state.kind === 'ready' ? rounds.state.data[0]?.seq ?? null : null);
  const grid = useRemote((s) => api.grid(g.groupId, sel ?? 1, s), [api, g.groupId, sel], { enabled: sel !== null, isEmpty: () => false });
  return (
    <>
      <PageHeader title="Collecte du tour" description="Qui a cotisé, qui a déclaré, qui reste à régler. La confirmation se fait en lot ; le trésorier ne confirme jamais sa propre déclaration." />
      <RemoteState state={rounds.state} onRetry={rounds.reload} emptyTitle="Cycle non démarré">{(rs) => (
        <div className="k-toolbar">
          <label>Tour <select className="k-select-group" value={sel ?? ''} onChange={(e) => setSeq(Number(e.target.value))}>{rs.map((r) => <option key={r.seq} value={r.seq}>{r.seq} — {jour(r.date)} — {r.beneficiaryName ?? ''}</option>)}</select></label>
        </div>
      )}</RemoteState>
      <div className="k-grid">
        <div className="k-span-7"><Panel title="Grille du tour">
          <RemoteState state={grid.state} onRetry={grid.reload}>{(gr) => (
            <>
              <p className="k-hint">Payé : {gr.summary.paid} · Partiel : {gr.summary.partial} · Non payé : {gr.summary.unpaid} / {gr.summary.total}</p>
              <DataTable rows={gr.rows} rowKey={(r, i) => r.membershipId ?? String(i)} caption="Grille du tour" columns={[
                { header: 'Membre', render: (r) => r.displayName ?? '—' },
                { header: 'Dû', render: (r) => xaf(r.due) },
                { header: 'Confirmé', render: (r) => xaf(r.confirmed) },
                { header: 'Déclaré', render: (r) => xaf(r.declared) },
                { header: 'Statut', render: (r) => <StatusChip status={{ paid: 'Payé', partial: 'Partiel', declared: 'Déclaré', unpaid: 'Non payé' }[r.status]} tone={r.status === 'paid' ? 'ok' : r.status === 'unpaid' ? 'danger' : 'warn'} /> },
              ]} />
            </>
          )}</RemoteState>
        </Panel></div>
        <div className="k-span-5"><AConfirmer api={api} g={g} /></div>
      </div>
    </>
  );
}

function AConfirmer({ api, g }: P) {
  const q = useRemote((s) => api.movements(g.groupId, { state: 'declared' }, s), [api, g.groupId]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg(ok); setSel(new Set()); q.reload(); } catch (e) { setMsg(errText(e)); } finally { setBusy(false); }
  };
  return (
    <Panel title="À confirmer">
      <RemoteState state={q.state} onRetry={q.reload} emptyTitle="Rien à confirmer">{(rows) => {
        const ok = rows.filter((m) => m.can.confirm);
        return (
          <>
            <DataTable rows={rows} rowKey={(m) => m.movementId} caption="Déclarations à confirmer" columns={[
              { header: '', render: (m) => m.can.confirm ? <input type="checkbox" aria-label={`Sélectionner ${m.memberName ?? ''}`} checked={sel.has(m.movementId)} onChange={(e) => setSel((s) => { const n = new Set(s); if (e.target.checked) n.add(m.movementId); else n.delete(m.movementId); return n; })} /> : null, width: '36px' },
              { header: 'Membre', render: (m) => m.memberName ?? '—' },
              { header: 'Caisse', render: (m) => CAISSE[m.fundKind] ?? m.fundKind },
              { header: 'Montant', render: (m) => xaf(m.amount) },
              { header: 'Moyen', render: (m) => `${CANAL[m.channel] ?? m.channel}${m.reference ? ` · ${m.reference}` : ''}` },
            ]} />
            <div className="k-toolbar">
              <button type="button" className="k-button k-button-secondary" disabled={!ok.length} onClick={() => setSel(new Set(ok.map((m) => m.movementId)))}>Tout sélectionner ({ok.length})</button>
              <button type="button" className="k-button k-button-primary" disabled={busy || sel.size === 0} onClick={() => void run(() => api.confirm(g.groupId, [...sel]), 'Lot confirmé.')}>Confirmer la sélection ({sel.size})</button>
            </div>
            {ok.length < rows.length ? <p className="k-hint">Les lignes sans case vous concernent (votre propre déclaration) ou dépassent vos fonctions : une autre personne du bureau les confirme.</p> : null}
            {msg ? <p className="k-hint" role="status">{msg}</p> : null}
          </>
        );
      }}</RemoteState>
    </Panel>
  );
}

function Mouvements({ api, g }: P) {
  const [state, setState] = useState('');
  const q = useRemote((s) => api.movements(g.groupId, state ? { state } : {}, s), [api, g.groupId, state]);
  const exporter = (rows: readonly MovementView[]) => downloadCsv(`kombe-mouvements-${g.name.replace(/\W+/g, '-')}.csv`, toCsv(
    ['Date', 'Type', 'Caisse', 'Membre', 'Tour', 'Montant (XAF)', 'Moyen', 'Référence', 'État', 'Déclaré par', 'Confirmé par', 'Contrôlé par'],
    rows.map((m) => [m.declaredAt.slice(0, 10), TYPE[m.kind] ?? m.kind, CAISSE[m.fundKind] ?? m.fundKind, m.memberName, m.roundSeq, m.amount, CANAL[m.channel] ?? m.channel, m.reference, ETAT_MVT[m.state]?.[0] ?? m.state, m.declaredByName, m.confirmedByName, m.controlledByName]),
  ));
  return (
    <>
      <PageHeader title="Mouvements" description="Toutes les déclarations du groupe, avec le circuit déclaré → confirmé → validé." />
      <div className="k-toolbar">
        <label>État <select className="k-select-group" value={state} onChange={(e) => setState(e.target.value)}>
          <option value="">Tous</option>{Object.entries(ETAT_MVT).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}
        </select></label>
      </div>
      <Panel>
        <RemoteState state={q.state} onRetry={q.reload} emptyTitle="Aucun mouvement">{(rows) => (
          <>
            <div className="k-toolbar"><button type="button" className="k-button k-button-secondary" onClick={() => exporter(rows)}>Exporter en CSV</button></div>
            <DataTable rows={rows} rowKey={(m) => m.movementId} caption="Mouvements" columns={[
              { header: 'Date', render: (m) => jour(m.declaredAt) },
              { header: 'Type', render: (m) => TYPE[m.kind] ?? m.kind },
              { header: 'Caisse', render: (m) => CAISSE[m.fundKind] ?? m.fundKind },
              { header: 'Membre', render: (m) => m.memberName ?? '—' },
              { header: 'Montant', render: (m) => xaf(m.amount) },
              { header: 'Moyen', render: (m) => `${CANAL[m.channel] ?? m.channel}${m.reference ? ` · ${m.reference}` : ''}` },
              { header: 'État', render: (m) => <StatusChip status={ETAT_MVT[m.state]?.[0] ?? m.state} tone={ETAT_MVT[m.state]?.[1] ?? 'neutral'} /> },
              { header: 'Circuit', render: (m) => [m.declaredByName && `déclaré : ${m.declaredByName}`, m.confirmedByName && `confirmé : ${m.confirmedByName}`, m.controlledByName && `contrôlé : ${m.controlledByName}`].filter(Boolean).join(' · ') },
            ]} />
          </>
        )}</RemoteState>
      </Panel>
    </>
  );
}

function Membres({ api, g }: P) {
  const presidence = g.roles.includes('animator') || g.roles.includes('vice_president');
  const admin = presidence || g.roles.includes('secretary');
  const q = useRemote((s) => api.members(g.groupId, s), [api, g.groupId]);
  const inv = useRemote((s) => api.invitations(g.groupId, s), [api, g.groupId], { enabled: admin, isEmpty: () => false });
  const [msg, setMsg] = useState<string | null>(null);
  const act = async (fn: () => Promise<unknown>) => { setMsg(null); try { await fn(); q.reload(); if (admin) inv.reload(); } catch (e) { setMsg(errText(e)); } };
  return (
    <>
      <PageHeader title="Membres & invitations" description="Les numéros complets ne sont visibles que du bureau ; chaque membre voit les autres masqués." />
      {msg ? <p className="k-field-error" role="alert">{msg}</p> : null}
      <div className="k-grid">
        <div className="k-span-8"><Panel title="Membres">
          <RemoteState state={q.state} onRetry={q.reload}>{(rows) => (
            <DataTable rows={rows} rowKey={(m) => m.membershipId} caption="Membres" columns={[
              { header: 'Nom', render: (m) => `${m.displayName}${m.offline ? ' (sans smartphone)' : ''}` },
              { header: 'Fonctions', render: (m) => [...m.roles.map((r) => ROLE[r] ?? r), ...m.pendingRoles.map((r) => `${ROLE[r] ?? r} (proposé)`)].join(', ') },
              { header: 'Téléphone', render: (m) => m.login ?? '—' },
              { header: 'Parts', render: (m) => String(m.shares) },
              { header: 'État', render: (m) => m.state === 'pending'
                ? (presidence ? <span className="k-toolbar"><button type="button" className="k-button k-button-primary" onClick={() => void act(() => api.admission(g.groupId, m.membershipId, 'admit'))}>Admettre</button><button type="button" className="k-button k-button-secondary" onClick={() => void act(() => api.admission(g.groupId, m.membershipId, 'reject'))}>Refuser</button></span> : <StatusChip status="En attente" tone="warn" />)
                : <StatusChip status={m.state === 'active' ? 'Actif' : m.state} tone={m.state === 'active' ? 'ok' : 'neutral'} /> },
            ]} />
          )}</RemoteState>
        </Panel></div>
        <div className="k-span-4"><Panel title="Invitations" action={admin ? <button type="button" className="k-button k-button-primary" onClick={() => void act(() => api.createInvitation(g.groupId))}>Nouveau lien</button> : undefined}>
          {admin ? <RemoteState state={inv.state} onRetry={inv.reload}>{(rows) => rows.length === 0 ? <p className="k-hint">Aucun lien.</p> : <>{rows.map((i) => (
            <div key={i.invitationId} className="k-invite">
              <KeyValue label="Code" value={<span className="k-code">{i.code}</span>} />
              <KeyValue label="Valable" value={`jusqu’au ${jour(i.expiresAt)} · ${i.usedCount}/${i.maxUses}`} />
              {i.revoked ? <StatusChip status="Révoqué" tone="neutral" /> : <div className="k-toolbar">
                <a className="k-button k-button-primary" href={`https://wa.me/?text=${encodeURIComponent(i.whatsappText)}`} target="_blank" rel="noreferrer">WhatsApp</a>
                <button type="button" className="k-button k-button-secondary" onClick={() => void navigator.clipboard?.writeText(i.url)}>Copier le lien</button>
                <button type="button" className="k-button k-button-secondary" onClick={() => void act(() => api.revokeInvitation(g.groupId, i.invitationId))}>Révoquer</button>
              </div>}
            </div>
          ))}</>}</RemoteState> : <p className="k-hint">Réservé au président, au vice-président et au secrétaire.</p>}
        </Panel></div>
      </div>
    </>
  );
}

function Seances({ api, g }: P) {
  const q = useRemote((s) => api.meetings(g.groupId, s), [api, g.groupId]);
  const [mid, setMid] = useState<string | null>(null);
  const d = useRemote((s) => api.meeting(g.groupId, mid ?? '', s), [api, g.groupId, mid], { enabled: !!mid, isEmpty: () => false });
  const [msg, setMsg] = useState<string | null>(null);
  const admin = g.roles.some((r) => ['animator', 'vice_president', 'secretary'].includes(r));
  return (
    <>
      <PageHeader title="Séances & procès-verbaux" description="Le PV est généré depuis les événements de la séance et porte une empreinte SHA-256 ; il est approuvé à la séance suivante." />
      <div className="k-grid">
        <div className="k-span-5"><Panel title="Séances">
          <RemoteState state={q.state} onRetry={q.reload} emptyTitle="Aucune séance (cycle non démarré)">{(rows) => (
            <DataTable rows={rows} rowKey={(m) => m.meetingId} caption="Séances" columns={[
              { header: 'N°', render: (m) => <button type="button" className="k-button k-button-secondary" onClick={() => setMid(m.meetingId)}>{m.seq}</button>, width: '60px' },
              { header: 'Date', render: (m) => jour(m.date) },
              { header: 'État', render: (m) => <StatusChip status={{ planned: 'Prévue', open: 'Ouverte', closed: 'Close', cancelled: 'Annulée' }[m.state]} tone={m.state === 'closed' ? 'ok' : m.state === 'open' ? 'warn' : 'neutral'} /> },
              { header: 'PV', render: (m) => m.minutesApproved ? 'Approuvé' : m.state === 'closed' ? 'À approuver' : '—' },
            ]} />
          )}</RemoteState>
        </Panel></div>
        <div className="k-span-7">{mid ? <Panel title="Détail">
          <RemoteState state={d.state} onRetry={d.reload}>{(m) => (
            <>
              <KeyValue label="Présents" value={String(m.attendance.filter((a) => a.status === 'present' || a.status === 'late').length)} />
              <KeyValue label="Excusés / absents / représentés" value={`${m.attendance.filter((a) => a.status === 'excused').length} / ${m.attendance.filter((a) => a.status === 'absent').length} / ${m.attendance.filter((a) => a.status === 'represented').length}`} />
              <KeyValue label="Mouvements" value={String(m.movements.length)} />
              {m.minutes ? (
                <>
                  <pre className="k-minutes">{m.minutes.text}</pre>
                  <p className="k-hint">Empreinte : <span className="k-code">{m.minutes.hash}</span></p>
                  <div className="k-toolbar">
                    <button type="button" className="k-button k-button-secondary" onClick={() => imprimer(m)}>Imprimer / PDF</button>
                    {!m.minutes.approvedAt && admin ? <button type="button" className="k-button k-button-primary" onClick={() => { setMsg(null); api.approveMinutes(g.groupId, m.meetingId, m.minutes?.hash ?? '').then(() => { d.reload(); q.reload(); }, (e) => setMsg(errText(e))); }}>Approuver le PV</button> : null}
                    {m.minutes.approvedAt ? <StatusChip status="PV approuvé" tone="ok" /> : null}
                  </div>
                </>
              ) : <p className="k-hint">Le PV sera généré à la clôture de la séance.</p>}
              {msg ? <p className="k-field-error" role="alert">{msg}</p> : null}
            </>
          )}</RemoteState>
        </Panel> : <CapabilityNotice title="Choisissez une séance">Sélectionnez une séance pour voir l’appel, les mouvements et le procès-verbal.</CapabilityNotice>}</div>
      </div>
    </>
  );
}

function imprimer(m: MeetingDetail) {
  if (!m.minutes) return;
  const w = window.open('', '_blank');
  if (!w) return;
  const e = (t: string) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string);
  w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>PV séance ${m.seq}</title><style>body{font:14px/1.5 Georgia,serif;margin:2cm;color:#13211c}pre{white-space:pre-wrap;font:inherit}small{color:#56645e;word-break:break-all}</style></head><body><pre>${e(m.minutes.text)}</pre><hr><small>Empreinte SHA-256 : ${e(m.minutes.hash)}</small></body></html>`);
  w.document.close(); w.focus(); w.print();
}

function Discipline({ api, g }: P) {
  const fines = useRemote((s) => api.fines(g.groupId, s), [api, g.groupId]);
  const aids = useRemote((s) => api.aids(g.groupId, s), [api, g.groupId]);
  const debts = useRemote((s) => api.debts(g.groupId, s), [api, g.groupId]);
  return (
    <>
      <PageHeader title="Amendes, secours et dettes" description="Une amende ne modifie jamais une cotisation. Les montants de dette individuels ne sont visibles que du bureau et de l’intéressé." />
      <div className="k-grid">
        <div className="k-span-6"><Panel title="Amendes"><RemoteState state={fines.state} onRetry={fines.reload} emptyTitle="Aucune amende">{(rows) => (
          <DataTable rows={rows} rowKey={(f) => f.fineId} caption="Amendes" columns={[
            { header: 'Membre', render: (f) => f.memberName }, { header: 'Motif', render: (f) => f.reason }, { header: 'Montant', render: (f) => xaf(f.amount) },
            { header: 'État', render: (f) => <StatusChip status={{ issued: 'Constatée', contested: 'Contestée', paid: 'Payée', cancelled: 'Annulée' }[f.state]} tone={f.state === 'paid' ? 'ok' : f.state === 'contested' ? 'danger' : 'warn'} /> },
          ]} />
        )}</RemoteState></Panel></div>
        <div className="k-span-6"><Panel title="Secours"><RemoteState state={aids.state} onRetry={aids.reload} emptyTitle="Aucune demande">{(rows) => (
          <DataTable rows={rows} rowKey={(a) => a.aidId} caption="Secours" columns={[
            { header: 'Bénéficiaire', render: (a) => a.beneficiaryName }, { header: 'Date', render: (a) => jour(a.eventDate) }, { header: 'Montant', render: (a) => xaf(a.amount) },
            { header: 'État', render: (a) => <StatusChip status={{ requested: 'Demandé', approved: 'Accordé', rejected: 'Refusé', paid: 'Remis', cancelled: 'Annulé' }[a.state]} tone={a.state === 'paid' ? 'ok' : a.state === 'rejected' ? 'danger' : 'warn'} /> },
          ]} />
        )}</RemoteState></Panel></div>
        <div className="k-span-12"><Panel title="Dettes suivies"><RemoteState state={debts.state} onRetry={debts.reload} emptyTitle="Aucune dette">{(rows) => (
          <DataTable rows={rows} rowKey={(d) => d.debtId} caption="Dettes" columns={[
            { header: 'Débiteur', render: (d) => d.debtorName }, { header: 'Origine', render: (d) => ({ unpaid_obligation: 'Cotisation impayée', fund_advance: 'Avance de caisse', unpaid_fine: 'Amende impayée', catch_up: 'Rattrapage' }[d.origin]) },
            { header: 'Reste / total', render: (d) => `${xaf(d.remaining)} / ${xaf(d.amount)}` }, { header: 'Avaliseur', render: (d) => d.guarantorName ?? '—' },
            { header: 'État', render: (d) => <StatusChip status={{ open: 'En cours', settled: 'Réglée', written_off: 'Abandonnée' }[d.state]} tone={d.state === 'settled' ? 'ok' : d.state === 'open' ? 'warn' : 'neutral'} /> },
          ]} />
        )}</RemoteState></Panel></div>
      </div>
    </>
  );
}

const DECISION: Record<string, string> = {
  pause: 'Pause des séances', removal: 'Destitution', exclusion: 'Exclusion', payout_suspension: 'Suspension du droit de bouffer', replacement: 'Reprise de place',
};
const DECISION_ETAT: Record<string, [string, 'ok' | 'warn' | 'danger' | 'neutral']> = {
  open: ['Vote en cours', 'warn'], adopted: ['Adoptée', 'ok'], rejected: ['Rejetée', 'danger'], cancelled: ['Annulée', 'neutral'], lifted: ['Levée', 'neutral'],
};
const SANCTION: Record<string, [string, 'ok' | 'warn' | 'danger' | 'neutral']> = {
  warning: ['Avertissement', 'neutral'], fine: ['Amende', 'warn'], payout_suspended: ['Suspension du droit de bouffer', 'danger'], exclusion_vote: ['Vote d’exclusion', 'danger'],
};

function Votes({ api, g }: P) {
  const d = useRemote((s) => api.decisions(g.groupId, s), [api, g.groupId]);
  const sn = useRemote((s) => api.sanctions(g.groupId, s), [api, g.groupId], { isEmpty: (rows) => rows.every((r) => r.lateCount === 0 && !r.payoutSuspended) });
  const [err, setErr] = useState<string | null>(null);
  const objet = (x: DecisionView) =>
    x.kind === 'removal' ? `${x.targetName ?? ''} — ${ROLE[x.targetRole ?? ''] ?? ''}`
      : x.kind === 'replacement' ? `${String(x.params.incomingName ?? '')} reprend la place de ${x.targetName ?? ''}`
        : x.kind === 'pause' ? `${String(x.params.occurrences ?? 1)} séance(s)` : (x.targetName ?? '');
  return (
    <>
      <PageHeader title="Votes & sanctions" description="Décisions de l’assemblée à la majorité absolue des électeurs (la personne concernée ne vote pas). Le vote est secret jusqu’au dépouillement ; les membres votent dans l’application." />
      {err ? <CapabilityNotice title="Action refusée">{err}</CapabilityNotice> : null}
      <div className="k-grid">
        <div className="k-span-12"><Panel title="Votes de l’assemblée" action={d.state.kind === 'ready' ? <button type="button" className="k-button k-button-secondary" onClick={() => d.state.kind === 'ready' && downloadCsv(`kombe-votes-${g.name.replace(/\W+/g, '-')}.csv`, toCsv(['Ouvert le', 'Objet', 'Concerné', 'Motif', 'État', 'Électeurs', 'Oui', 'Non', 'Abstention', 'Exécution'], d.state.data.map((x) => [x.openedAt, DECISION[x.kind], objet(x), x.reason, DECISION_ETAT[x.state]?.[0], x.electorate, x.result?.yes, x.result?.no, x.result?.abstain, x.outcomeNote])))}>Exporter en CSV</button> : undefined}>
          <RemoteState state={d.state} onRetry={d.reload} emptyTitle="Aucun vote">{(rows) => (
            <DataTable rows={rows} rowKey={(x) => x.decisionId} caption="Votes" columns={[
              { header: 'Objet', render: (x) => DECISION[x.kind] }, { header: 'Concerné', render: (x) => objet(x) }, { header: 'Motif', render: (x) => x.reason },
              { header: 'Bulletins', render: (x) => x.result ? `Oui ${x.result.yes} · Non ${x.result.no} · Abst. ${x.result.abstain} / ${x.electorate}` : `${x.ballots} / ${x.electorate} (secret)` },
              { header: 'Clôture', render: (x) => formatServerDate(x.closesAt) },
              { header: 'État', render: (x) => <StatusChip status={DECISION_ETAT[x.state]?.[0] ?? x.state} tone={DECISION_ETAT[x.state]?.[1] ?? 'neutral'} /> },
              { header: 'Exécution', render: (x) => x.outcomeNote ?? (x.can.close ? <button type="button" className="k-button k-button-secondary" onClick={() => { setErr(null); api.closeDecision(g.groupId, x.decisionId).then(d.reload, (e: unknown) => setErr(errText(e))); }}>Dépouiller</button> : '—') },
            ]} />
          )}</RemoteState>
        </Panel></div>
        <div className="k-span-12"><Panel title="Graduation des sanctions (suggestion)">
          <p className="k-hint">Avertissement → amende → suspension du droit de bouffer → vote d’exclusion, d’après les retards et dettes non régularisés. Le bureau décide ; l’assemblée vote.</p>
          <RemoteState state={sn.state} onRetry={sn.reload} emptyTitle="Aucun retard à signaler">{(rows) => (
            <DataTable rows={rows.filter((r) => r.lateCount > 0 || r.payoutSuspended)} rowKey={(r) => r.membershipId} caption="Sanctions" columns={[
              { header: 'Membre', render: (r) => r.displayName }, { header: 'Retards / dettes', render: (r) => String(r.lateCount) },
              { header: 'En retard', render: (r) => xaf(r.lateAmount) }, { header: 'Dette ouverte', render: (r) => xaf(r.openDebt) },
              { header: 'Suggestion', render: (r) => <StatusChip status={SANCTION[r.suggested]?.[0] ?? r.suggested} tone={SANCTION[r.suggested]?.[1] ?? 'neutral'} /> },
              { header: 'Droit de bouffer', render: (r) => r.payoutSuspended ? <StatusChip status="Suspendu" tone="danger" /> : 'Normal' },
            ]} />
          )}</RemoteState>
        </Panel></div>
      </div>
    </>
  );
}

function Registre({ api, g }: P) {
  const q = useRemote((s) => api.journal(g.groupId, s), [api, g.groupId], { isEmpty: (d) => d.entries.length === 0 });
  return (
    <>
      <PageHeader title="Registre" description="Journal append-only chaîné par empreintes : un événement modifié ou supprimé casse la chaîne." />
      <RemoteState state={q.state} onRetry={q.reload}>{(j) => (
        <Panel title={j.valid ? 'Chaîne vérifiée' : 'Chaîne NON vérifiée'} action={<button type="button" className="k-button k-button-secondary" onClick={() => downloadCsv(`kombe-registre-${g.name.replace(/\W+/g, '-')}.csv`, toCsv(['N°', 'Date', 'Événement', 'Auteur', 'Empreinte'], j.entries.map((e) => [e.seq, e.at, e.summary, e.actorName, e.hash])))}>Exporter en CSV</button>}>
          <StatusChip status={j.valid ? 'Aucun événement modifié ni supprimé' : 'Prévenez le commissaire aux comptes'} tone={j.valid ? 'ok' : 'danger'} />
          <DataTable rows={[...j.entries].reverse()} rowKey={(e) => String(e.seq)} caption="Registre" columns={[
            { header: 'N°', render: (e) => String(e.seq), width: '60px' }, { header: 'Date', render: (e) => formatServerDate(e.at) },
            { header: 'Événement', render: (e) => e.summary }, { header: 'Auteur', render: (e) => e.actorName ?? '—' }, { header: 'Empreinte', render: (e) => <span className="k-code">{e.hash.slice(0, 12)}</span> },
          ]} />
        </Panel>
      )}</RemoteState>
    </>
  );
}

function Reglement({ api, g }: P) {
  const d = useRemote((s) => api.detail(g.groupId, s), [api, g.groupId], { isEmpty: () => false });
  const st = useRemote((s) => api.statutes(g.groupId, s), [api, g.groupId], { isEmpty: () => false });
  return (
    <>
      <PageHeader title="Règlement & statuts" description="Le règlement se modifie dans l’application tant que le cycle n’a pas démarré ; les règles ne sont jamais rétroactives." />
      <div className="k-grid">
        <div className="k-span-5"><Panel title="Règlement"><RemoteState state={d.state} onRetry={d.reload}>{(t) => (
          <>
            <KeyValue label="Cotisation par part" value={xaf(t.settings.contributionPerShare)} />
            <KeyValue label="Membres (max.)" value={String(t.settings.maxMembers)} />
            <KeyValue label="Heure limite" value={`${t.settings.deadlineTime} (Douala)`} />
            <KeyValue label="Témoins à la remise" value={String(t.settings.payoutWitnesses)} />
            <KeyValue label="Transparence" value={{ all_members: 'Tous les membres', bureau_only: 'Bureau seulement', anonymized: 'Anonymisée' }[t.settings.transparency]} />
            <KeyValue label="Cagnotte incomplète" value={{ full_with_advance: 'Avance de caisse', reduced: 'Remise réduite', wait: 'On attend' }[t.settings.payoutPolicy]} />
            <KeyValue label="Secours / séance" value={t.settings.solidarity.enabled ? xaf(t.settings.solidarity.perMeeting) : '—'} />
            <KeyValue label="Fonctionnement / séance" value={t.settings.operating.enabled ? xaf(t.settings.operating.perMeeting) : '—'} />
            <KeyValue label="Réserve de fin d’année / séance" value={t.settings.yearEndReserve.enabled ? xaf(t.settings.yearEndReserve.perMeeting) : '—'} />
            <KeyValue label="Absence à la séance" value={xaf(t.settings.fines.meetingAbsence)} />
            <KeyValue label="Jours de grâce" value={String(t.settings.fines.graceDays)} />
          </>
        )}</RemoteState></Panel></div>
        <div className="k-span-7"><Panel title="Statuts et règlement intérieur"><RemoteState state={st.state} onRetry={st.reload}>{(s) => (
          <>
            <p className="k-hint">Version {s.version} · acceptée par {s.acceptedCount} membre(s) · empreinte <span className="k-code">{s.hash.slice(0, 16)}</span></p>
            <pre className="k-minutes">{s.body}</pre>
            <p className="k-hint">Document indicatif inspiré de la loi n° 90/053 sur la liberté d’association ; sans valeur juridique par lui-même.</p>
          </>
        )}</RemoteState></Panel></div>
      </div>
    </>
  );
}
