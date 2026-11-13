/* KÓMBE — « Espace bureau » : le tableau de bord du bureau d'un groupe
   (président, secrétaire, trésorier, commissaire) sur ordinateur. Mêmes
   données et mêmes droits que la PWA (API tontine réelle) ; vues en tableaux,
   collecte en lot, procès-verbaux imprimables et exports CSV pour les comptes
   rendus. KÓMBE ne garde pas l'argent : tous les montants sont des
   déclarations confirmées par des personnes. */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  CapabilityNotice, DashboardBoot, DashboardShell, DataTable, KeyValue, PageHeader, Panel, RemoteState, StatCard, StatusChip,
  formatServerDate, formatXaf, useHashRoute, useRemote, useTx, type DashboardContext,
} from '@kombe/dashboard-core';
import { ENGLISH } from './english';
import { GroupAdminApi, type DecisionView, downloadBlob, downloadCsv, toCsv, type MeetingDetail, type MovementView, type TontineSummary } from './api';

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
  rotation: 'Cagnotte (njangi)', solidarity: 'Secours', year_end_reserve: 'Réserve de fin d’année', operating: 'Fonctionnement', fines: 'Amendes', loan: 'Prêts', collector: 'Collecte journalière', custom: 'Caisse personnalisée',
};
const TYPE: Record<string, string> = {
  contribution: 'Cotisation', payout: 'Remise', fine_payment: 'Amende payée', advance: 'Avance de caisse', advance_repayment: 'Remboursement d’avance',
  transfer_in: 'Transfert reçu', transfer_out: 'Transfert envoyé', fee: 'Frais', expense: 'Dépense',
};
const CANAL: Record<string, string> = { cash: 'Espèces', orange_money: 'Orange Money', mtn_momo: 'MTN MoMo', bank: 'Banque', international_transfer: 'Transfert depuis l’étranger', other: 'Autre' };
const BUREAU = ['animator', 'vice_president', 'secretary', 'treasurer', 'treasurer_deputy', 'auditor', 'censor', 'advisor'];
/* Langue courante, posée par Espace à chaque rendu (avant ses enfants) : dates et montants suivent. */
let langue: 'fr' | 'en' = 'fr';
const xaf = (v: string) => { try { return formatXaf(v, langue); } catch { return `${v} FCFA`; } };
const jour = (iso: string | null | undefined) => (iso ? formatServerDate(iso.length === 10 ? `${iso}T12:00:00Z` : iso, langue).replace(/,? \d{2}:\d{2}$/, '') : '—');
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function App() {
  return <DashboardBoot product="Espace bureau" messages={messages} followAppLanguage english={ENGLISH}>{(ctx) => <Espace ctx={ctx} />}</DashboardBoot>;
}

function Espace({ ctx }: { readonly ctx: DashboardContext }) {
  const { tx, locale } = useTx();
  langue = locale;
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
      <span className="k-hint">{tx('Groupe')}</span>
      <select className="k-select-group" value={groupId} onChange={(e) => setGroupId(e.target.value)} aria-label={tx('Groupe')}>
        {actives.map((g) => <option key={g.groupId} value={g.groupId}>{g.name}</option>)}
      </select>
    </label>
  );
  const badge = <span className="k-hint">{ctx.session.phase.kind === 'authenticated' ? ctx.session.phase.identityId : ''} <button type="button" className="k-button k-button-secondary" onClick={ctx.session.logout}>{tx('Se déconnecter')}</button></span>;

  let page: ReactNode;
  if (mine.state.kind !== 'ready' && mine.state.kind !== 'empty') page = <RemoteState state={mine.state} onRetry={mine.reload}>{() => null}</RemoteState>;
  else if (!current) page = <CapabilityNotice title={tx('Aucun groupe actif')}>{tx('Ce compte n’est membre actif d’aucun groupe. Créez ou rejoignez une tontine depuis l’application KÓMBE, puis revenez ici.')}</CapabilityNotice>;
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
  const { tx, L } = useTx();
  const d = useRemote((s) => api.detail(g.groupId, s), [api, g.groupId]);
  const pending = useRemote((s) => api.movements(g.groupId, { state: 'declared' }, s), [api, g.groupId], { isEmpty: () => false });
  const rounds = useRemote((s) => api.rounds(g.groupId, s), [api, g.groupId], { isEmpty: () => false });
  const debts = useRemote((s) => api.debts(g.groupId, s), [api, g.groupId], { isEmpty: () => false });
  return (
    <>
      <PageHeader title={g.name} description={L(`Vos fonctions : ${g.roles.map((r) => ROLE[r] ?? r).join(', ') || 'Membre'}. KÓMBE tient le registre ; l’argent reste chez le trésorier.`, `Your roles: ${g.roles.map((r) => tx(ROLE[r] ?? r)).join(', ') || 'Member'}. KÓMBE keeps the register; the money stays with the treasurer.`)} />
      <RemoteState state={d.state} onRetry={d.reload}>{(t) => {
        const closed = rounds.state.kind === 'ready' ? rounds.state.data.filter((r) => r.state === 'closed').length : 0;
        const total = rounds.state.kind === 'ready' ? rounds.state.data.length : 0;
        const aConfirmer = pending.state.kind === 'ready' ? pending.state.data.length : 0;
        const dettes = debts.state.kind === 'ready' ? debts.state.data.filter((x) => x.state === 'open').reduce((s, x) => s + BigInt(x.remaining), 0n) : 0n;
        return (
          <div className="k-grid">
            <div className="k-span-12"><div className="k-stats">
              <StatCard label={tx('Membres actifs')} value={String(t.memberCount)} hint={t.pendingCount ? L(`${t.pendingCount} adhésion(s) à valider`, `${t.pendingCount} membership(s) to approve`) : 'Aucune adhésion en attente'} tone={t.pendingCount ? 'warn' : 'ok'} />
              <StatCard label={tx('Tours clos')} value={total ? `${closed}/${total}` : '—'} hint={t.cycleStarted ? 'Cycle démarré' : 'Cycle en préparation'} />
              <StatCard label={tx('À confirmer')} value={String(aConfirmer)} hint={tx('Déclarations en attente du trésorier')} tone={aConfirmer ? 'warn' : 'ok'} />
              <StatCard label={tx('Dettes suivies')} value={xaf(dettes.toString())} hint={tx('Reste dû, toutes dettes ouvertes')} tone={dettes > 0n ? 'warn' : 'ok'} />
            </div></div>
            <div className="k-span-7">
              <Panel title={t.currentRound ? L(`Tour en cours : n° ${t.currentRound.seq} — ${jour(t.currentRound.date)}`, `Current turn: no. ${t.currentRound.seq} — ${jour(t.currentRound.date)}`) : 'Tour en cours'}>
                {t.currentRound ? (
                  <>
                    <KeyValue label={tx('Bénéficiaire')} value={t.currentRound.beneficiaryName ?? '—'} />
                    <KeyValue label={tx('Confirmé / attendu')} value={`${xaf(t.currentRound.collected)} / ${xaf(t.currentRound.expectedPot)}`} />
                    <KeyValue label={tx('Remise')} value={<StatusChip status={{ none: 'Pas encore remise', declared: 'Déclarée', confirmed: 'Confirmée', received: 'Reçue par le bénéficiaire' }[t.currentRound.payoutState]} tone={t.currentRound.payoutState === 'received' ? 'ok' : 'warn'} />} />
                    {BigInt(t.currentRound.expectedPot) > 0n ? (() => { const pct = Math.min(100, Number((BigInt(t.currentRound.collected) * 100n) / BigInt(t.currentRound.expectedPot))); return <><div className="k-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={tx('Part de la cagnotte confirmée')}><span style={{ width: `${pct}%` }} /></div><p className="k-hint">{L(`${pct} % de la cagnotte confirmé`, `${pct}% of the pot confirmed`)}</p></>; })() : null}
                  </>
                ) : <p className="k-hint">{tx('Le cycle n’a pas encore démarré.')}</p>}
                <div className="k-toolbar"><button type="button" className="k-button k-button-primary" onClick={() => onNavigate('/collecte')}>{tx('Ouvrir la collecte')}</button></div>
              </Panel>
            </div>
            <div className="k-span-5">
              <Panel title={tx('Caisses du groupe')}>
                <p className="k-hint">{tx('Argent tenu par le trésorier, pas par KÓMBE.')}</p>
                {t.funds.map((f) => <KeyValue key={f.fundId} label={CAISSE[f.kind] ?? f.kind} value={`${xaf(f.confirmedBalance)}${BigInt(f.pendingIn) > 0n ? L(` (+ ${xaf(f.pendingIn)} déclaré)`, ` (+ ${xaf(f.pendingIn)} declared)`) : ''}`} />)}
              </Panel>
              {t.nextMeeting ? <Panel title={tx('Prochaine séance')}><KeyValue label={L(`Séance n° ${t.nextMeeting.seq}`, `Meeting no. ${t.nextMeeting.seq}`)} value={`${jour(t.nextMeeting.date)}${t.nextMeeting.location ? ` · ${t.nextMeeting.location}` : ''}`} /></Panel> : null}
            </div>
          </div>
        );
      }}</RemoteState>
    </>
  );
}

function Collecte({ api, g }: P) {
  const { tx, L } = useTx();
  const rounds = useRemote((s) => api.rounds(g.groupId, s), [api, g.groupId]);
  const [seq, setSeq] = useState<number | null>(null);
  const open = rounds.state.kind === 'ready' ? rounds.state.data.find((r) => r.state === 'open') : undefined;
  const sel = seq ?? open?.seq ?? (rounds.state.kind === 'ready' ? rounds.state.data[0]?.seq ?? null : null);
  const grid = useRemote((s) => api.grid(g.groupId, sel ?? 1, s), [api, g.groupId, sel], { enabled: sel !== null, isEmpty: () => false });
  return (
    <>
      <PageHeader title={tx('Collecte du tour')} description={tx('Qui a cotisé, qui a déclaré, qui reste à régler. La confirmation se fait en lot ; le trésorier ne confirme jamais sa propre déclaration.')} />
      <RemoteState state={rounds.state} onRetry={rounds.reload} emptyTitle={tx('Cycle non démarré')}>{(rs) => (
        <div className="k-toolbar">
          <label>{tx('Tour')} <select className="k-select-group" value={sel ?? ''} onChange={(e) => setSeq(Number(e.target.value))}>{rs.map((r) => <option key={r.seq} value={r.seq}>{r.seq} — {jour(r.date)} — {r.beneficiaryName ?? ''}</option>)}</select></label>
        </div>
      )}</RemoteState>
      <div className="k-grid">
        <div className="k-span-7"><Panel title={tx('Grille du tour')}>
          <RemoteState state={grid.state} onRetry={grid.reload}>{(gr) => (
            <>
              <p className="k-hint">{L(`Payé : ${gr.summary.paid} · Partiel : ${gr.summary.partial} · Non payé : ${gr.summary.unpaid} / ${gr.summary.total}`, `Paid: ${gr.summary.paid} · Partial: ${gr.summary.partial} · Unpaid: ${gr.summary.unpaid} / ${gr.summary.total}`)}</p>
              <DataTable rows={gr.rows} rowKey={(r, i) => r.membershipId ?? String(i)} caption={tx('Grille du tour')} columns={[
                { header: 'Membre', render: (r) => r.displayName ?? '—' },
                { header: 'Dû', render: (r) => xaf(r.due) },
                { header: 'Confirmé', render: (r) => xaf(r.confirmed) },
                { header: 'Déclaré', render: (r) => xaf(r.declared) },
                { header: 'Statut', render: (r) => <StatusChip status={{ paid: 'Payé', partial: 'Partiel', declared: 'Déclaré', unpaid: 'Non payé' }[r.status]} tone={r.status === 'paid' ? 'ok' : r.status === 'unpaid' ? 'danger' : 'warn'} /> },
              ]} />
            </>
          )}</RemoteState>
        </Panel></div>
        <div className="k-span-5"><AConfirmer api={api} g={g} /><AValider api={api} g={g} /></div>
      </div>
    </>
  );
}

function AConfirmer({ api, g }: P) {
  const { tx, L } = useTx();
  const q = useRemote((s) => api.movements(g.groupId, { state: 'declared' }, s), [api, g.groupId]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg(ok); setSel(new Set()); q.reload(); } catch (e) { setMsg(errText(e)); } finally { setBusy(false); }
  };
  return (
    <Panel title={tx('À confirmer')}>
      <RemoteState state={q.state} onRetry={q.reload} emptyTitle={tx('Rien à confirmer')}>{(rows) => {
        const ok = rows.filter((m) => m.can.confirm);
        return (
          <>
            <DataTable rows={rows} rowKey={(m) => m.movementId} caption={tx('Déclarations à confirmer')} columns={[
              { header: '', render: (m) => m.can.confirm ? <input type="checkbox" aria-label={L(`Sélectionner ${m.memberName ?? ''}`, `Select ${m.memberName ?? ''}`)} checked={sel.has(m.movementId)} onChange={(e) => setSel((s) => { const n = new Set(s); if (e.target.checked) n.add(m.movementId); else n.delete(m.movementId); return n; })} /> : null, width: '36px' },
              { header: 'Membre', render: (m) => m.memberName ?? '—' },
              { header: 'Caisse', render: (m) => (m.fundKind === 'custom' ? m.fundName : CAISSE[m.fundKind] ?? m.fundKind) },
              { header: 'Montant', render: (m) => xaf(m.amount) },
              { header: 'Moyen', render: (m) => `${tx(CANAL[m.channel] ?? m.channel)}${m.reference ? ` · ${m.reference}` : ''}` },
              { header: '', render: (m) => m.can.reject ? <button type="button" className="k-button k-button-secondary" disabled={busy} onClick={() => { const motif = window.prompt(tx('Motif du rejet (visible par le membre) :')); if (motif && motif.trim().length >= 3) void run(() => api.reject(g.groupId, m.movementId, motif.trim()), tx('Déclaration rejetée.')); }}>{tx('Rejeter')}</button> : null },
            ]} />
            <div className="k-toolbar">
              <button type="button" className="k-button k-button-secondary" disabled={!ok.length} onClick={() => setSel(new Set(ok.map((m) => m.movementId)))}>Tout sélectionner ({ok.length})</button>
              <button type="button" className="k-button k-button-primary" disabled={busy || sel.size === 0} onClick={() => void run(() => api.confirm(g.groupId, [...sel]), tx('Lot confirmé.'))}>Confirmer la sélection ({sel.size})</button>
            </div>
            {ok.length < rows.length ? <p className="k-hint">{tx('Les lignes sans case vous concernent (votre propre déclaration) ou dépassent vos fonctions : une autre personne du bureau les confirme.')}</p> : null}
            {msg ? <p className="k-hint" role="status">{tx(msg)}</p> : null}
          </>
        );
      }}</RemoteState>
    </Panel>
  );
}

/** Commissaire aux comptes : valide après contrôle les versements confirmés (jamais les siens). */
function AValider({ api, g }: P) {
  const { tx } = useTx();
  const q = useRemote((s) => api.movements(g.groupId, { state: 'confirmed' }, s), [api, g.groupId]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg(ok); q.reload(); } catch (e) { setMsg(errText(e)); } finally { setBusy(false); }
  };
  return (
    <Panel title={tx('À valider (commissaire aux comptes)')}>
      <RemoteState state={q.state} onRetry={q.reload} emptyTitle={tx('Rien à valider')}>{(all) => {
        const rows = all.filter((m) => m.can.control);
        if (rows.length === 0) return <p className="k-hint">{tx('Rien à valider pour vous : les versements confirmés le sont par le commissaire aux comptes, jamais sur ses propres versements.')}</p>;
        return (
          <>
            <DataTable rows={rows} rowKey={(m) => m.movementId} caption={tx('Versements confirmés à valider')} columns={[
              { header: 'Membre', render: (m) => m.memberName ?? '—' },
              { header: 'Montant', render: (m) => xaf(m.amount) },
              { header: 'Confirmé par', render: (m) => m.confirmedByName ?? '—' },
              { header: '', render: (m) => <button type="button" className="k-button k-button-primary" disabled={busy} onClick={() => void run(() => api.control(g.groupId, m.movementId), 'Versement validé.')}>{tx('Valider')}</button> },
            ]} />
            {msg ? <p className="k-hint" role="status">{tx(msg)}</p> : null}
          </>
        );
      }}</RemoteState>
    </Panel>
  );
}

function Mouvements({ api, g }: P) {
  const { tx, L } = useTx();
  const [state, setState] = useState('');
  const q = useRemote((s) => api.movements(g.groupId, state ? { state } : {}, s), [api, g.groupId, state]);
  const exporter = (rows: readonly MovementView[]) => downloadCsv(`kombe-mouvements-${g.name.replace(/\W+/g, '-')}.csv`, toCsv(
    ['Date', 'Type', 'Caisse', 'Membre', 'Tour', 'Montant (XAF)', 'Moyen', 'Référence', 'État', 'Déclaré par', 'Confirmé par', 'Contrôlé par'].map(tx),
    rows.map((m) => [m.declaredAt.slice(0, 10), tx(TYPE[m.kind] ?? m.kind), m.fundKind === 'custom' ? m.fundName : tx(CAISSE[m.fundKind] ?? m.fundKind), m.memberName, m.roundSeq, m.amount, tx(CANAL[m.channel] ?? m.channel), m.reference, tx(ETAT_MVT[m.state]?.[0] ?? m.state), m.declaredByName, m.confirmedByName, m.controlledByName]),
  ));
  return (
    <>
      <PageHeader title={tx('Mouvements')} description={tx('Toutes les déclarations du groupe, avec le circuit déclaré → confirmé → validé.')} />
      <div className="k-toolbar">
        <label>{tx('État')} <select className="k-select-group" value={state} onChange={(e) => setState(e.target.value)}>
          <option value="">{tx('Tous')}</option>{Object.entries(ETAT_MVT).map(([k, v]) => <option key={k} value={k}>{tx(v[0])}</option>)}
        </select></label>
      </div>
      <Panel>
        <RemoteState state={q.state} onRetry={q.reload} emptyTitle={tx('Aucun mouvement')}>{(rows) => (
          <>
            <div className="k-toolbar"><button type="button" className="k-button k-button-secondary" onClick={() => exporter(rows)}>{tx('Exporter en CSV')}</button></div>
            <DataTable rows={rows} rowKey={(m) => m.movementId} caption={tx('Mouvements')} columns={[
              { header: 'Date', render: (m) => jour(m.declaredAt) },
              { header: 'Type', render: (m) => TYPE[m.kind] ?? m.kind },
              { header: 'Caisse', render: (m) => (m.fundKind === 'custom' ? m.fundName : CAISSE[m.fundKind] ?? m.fundKind) },
              { header: 'Membre', render: (m) => m.memberName ?? '—' },
              { header: 'Montant', render: (m) => xaf(m.amount) },
              { header: 'Moyen', render: (m) => `${tx(CANAL[m.channel] ?? m.channel)}${m.reference ? ` · ${m.reference}` : ''}` },
              { header: 'État', render: (m) => <StatusChip status={ETAT_MVT[m.state]?.[0] ?? m.state} tone={ETAT_MVT[m.state]?.[1] ?? 'neutral'} /> },
              { header: 'Circuit', render: (m) => [m.declaredByName && L(`déclaré : ${m.declaredByName}`, `declared: ${m.declaredByName}`), m.confirmedByName && L(`confirmé : ${m.confirmedByName}`, `confirmed: ${m.confirmedByName}`), m.controlledByName && L(`contrôlé : ${m.controlledByName}`, `checked: ${m.controlledByName}`)].filter(Boolean).join(' · ') },
            ]} />
          </>
        )}</RemoteState>
      </Panel>
    </>
  );
}

function Membres({ api, g }: P) {
  const { tx, L } = useTx();
  const presidence = g.roles.includes('animator') || g.roles.includes('vice_president');
  const admin = presidence || g.roles.includes('secretary');
  const q = useRemote((s) => api.members(g.groupId, s), [api, g.groupId]);
  const inv = useRemote((s) => api.invitations(g.groupId, s), [api, g.groupId], { enabled: admin, isEmpty: () => false });
  const [msg, setMsg] = useState<string | null>(null);
  const [invUses, setInvUses] = useState('');
  const [invJours, setInvJours] = useState('');
  const creerInvitation = async () => {
    const n = (v: string) => (v.trim() === '' ? undefined : Number(v));
    const uses = n(invUses);
    const days = n(invJours);
    const ok = (x: number | undefined, max: number) => x === undefined || (Number.isInteger(x) && x >= 1 && x <= max);
    if (!ok(uses, 100) || !ok(days, 30)) { setMsg(tx('Utilisations de 1 à 100, jours de 1 à 30.')); return; }
    await act(() => api.createInvitation(g.groupId, uses, days));
  };
  const act = async (fn: () => Promise<unknown>) => { setMsg(null); try { await fn(); q.reload(); if (admin) inv.reload(); } catch (e) { setMsg(errText(e)); } };
  return (
    <>
      <PageHeader title={tx('Membres & invitations')} description={tx('Les numéros complets ne sont visibles que du bureau ; chaque membre voit les autres masqués.')} />
      {msg ? <p className="k-field-error" role="alert">{tx(msg)}</p> : null}
      <div className="k-grid">
        <div className="k-span-8"><Panel title={tx('Membres')}>
          <RemoteState state={q.state} onRetry={q.reload}>{(rows) => (
            <DataTable rows={rows} rowKey={(m) => m.membershipId} caption={tx('Membres')} columns={[
              { header: 'Nom', render: (m) => `${m.displayName}${m.offline ? tx(' (sans smartphone)') : ''}` },
              { header: 'Fonctions', render: (m) => [...m.roles.map((r) => tx(ROLE[r] ?? r)), ...m.pendingRoles.map((r) => L(`${ROLE[r] ?? r} (proposé)`, `${tx(ROLE[r] ?? r)} (offered)`))].join(', ') },
              { header: 'Téléphone', render: (m) => m.login ?? '—' },
              { header: 'Parts', render: (m) => String(m.shares) },
              { header: 'État', render: (m) => m.state === 'pending'
                ? (presidence ? <span className="k-toolbar"><button type="button" className="k-button k-button-primary" onClick={() => void act(() => api.admission(g.groupId, m.membershipId, 'admit'))}>{tx('Admettre')}</button><button type="button" className="k-button k-button-secondary" onClick={() => void act(() => api.admission(g.groupId, m.membershipId, 'reject'))}>{tx('Refuser')}</button></span> : <StatusChip status={tx('En attente')} tone="warn" />)
                : <StatusChip status={m.state === 'active' ? 'Actif' : m.state} tone={m.state === 'active' ? 'ok' : 'neutral'} /> },
            ]} />
          )}</RemoteState>
        </Panel></div>
        <div className="k-span-4"><Panel title={tx('Invitations')} action={admin ? <button type="button" className="k-button k-button-primary" onClick={() => void creerInvitation()}>{tx('Nouveau lien')}</button> : undefined}>
          {admin ? <>
          <div className="k-toolbar">
            <label className="k-hint">{tx('Utilisations')} <input type="number" min={1} max={100} value={invUses} onChange={(e) => setInvUses(e.target.value)} style={{ width: '5em' }} /></label>
            <label className="k-hint">{tx('Jours')} <input type="number" min={1} max={30} value={invJours} onChange={(e) => setInvJours(e.target.value)} style={{ width: '4em' }} /></label>
          </div>
          <p className="k-hint">{tx('Vide = défauts du serveur (30 utilisations, 14 jours).')}</p>
          <RemoteState state={inv.state} onRetry={inv.reload}>{(rows) => rows.length === 0 ? <p className="k-hint">{tx('Aucun lien.')}</p> : <>{rows.map((i) => (
            <div key={i.invitationId} className="k-invite">
              <KeyValue label={tx('Code')} value={<span className="k-code">{i.code}</span>} />
              <KeyValue label={tx('Valable')} value={`jusqu’au ${jour(i.expiresAt)} · ${i.usedCount}/${i.maxUses}`} />
              {i.revoked ? <StatusChip status={tx('Révoqué')} tone="neutral" /> : <div className="k-toolbar">
                <a className="k-button k-button-primary" href={`https://wa.me/?text=${encodeURIComponent(i.whatsappText)}`} target="_blank" rel="noopener noreferrer">{tx('WhatsApp')}</a>
                <button type="button" className="k-button k-button-secondary" onClick={() => void navigator.clipboard?.writeText(i.url)}>{tx('Copier le lien')}</button>
                <button type="button" className="k-button k-button-secondary" onClick={() => void act(() => api.revokeInvitation(g.groupId, i.invitationId))}>{tx('Révoquer')}</button>
              </div>}
            </div>
          ))}</>}</RemoteState>
          </> : <p className="k-hint">{tx('Réservé au président, au vice-président et au secrétaire.')}</p>}
        </Panel></div>
      </div>
    </>
  );
}

function Seances({ api, g }: P) {
  const { tx } = useTx();
  const q = useRemote((s) => api.meetings(g.groupId, s), [api, g.groupId]);
  const [mid, setMid] = useState<string | null>(null);
  const d = useRemote((s) => api.meeting(g.groupId, mid ?? '', s), [api, g.groupId, mid], { enabled: !!mid, isEmpty: () => false });
  const [msg, setMsg] = useState<string | null>(null);
  const admin = g.roles.some((r) => ['animator', 'vice_president', 'secretary'].includes(r));
  return (
    <>
      <PageHeader title={tx('Séances & procès-verbaux')} description={tx('Le PV est généré depuis les événements de la séance et porte une empreinte SHA-256 ; il est approuvé à la séance suivante.')} />
      <div className="k-grid">
        <div className="k-span-5"><Panel title={tx('Séances')}>
          <RemoteState state={q.state} onRetry={q.reload} emptyTitle={tx('Aucune séance (cycle non démarré)')}>{(rows) => (
            <DataTable rows={rows} rowKey={(m) => m.meetingId} caption={tx('Séances')} columns={[
              { header: 'N°', render: (m) => <button type="button" className="k-button k-button-secondary" onClick={() => setMid(m.meetingId)}>{m.seq}</button>, width: '60px' },
              { header: 'Date', render: (m) => jour(m.date) },
              { header: 'État', render: (m) => <StatusChip status={{ planned: 'Prévue', open: 'Ouverte', closed: 'Close', cancelled: 'Annulée' }[m.state]} tone={m.state === 'closed' ? 'ok' : m.state === 'open' ? 'warn' : 'neutral'} /> },
              { header: 'PV', render: (m) => m.minutesApproved ? 'Approuvé' : m.state === 'closed' ? 'À approuver' : '—' },
            ]} />
          )}</RemoteState>
        </Panel></div>
        <div className="k-span-7">{mid ? <Panel title={tx('Détail')}>
          <RemoteState state={d.state} onRetry={d.reload}>{(m) => (
            <>
              <KeyValue label={tx('Présents')} value={String(m.attendance.filter((a) => a.status === 'present' || a.status === 'late').length)} />
              <KeyValue label={tx('Excusés / absents / représentés')} value={`${m.attendance.filter((a) => a.status === 'excused').length} / ${m.attendance.filter((a) => a.status === 'absent').length} / ${m.attendance.filter((a) => a.status === 'represented').length}`} />
              <KeyValue label={tx('Mouvements')} value={String(m.movements.length)} />
              {m.minutes ? (
                <>
                  <pre className="k-minutes" tabIndex={0} role="region" aria-label={tx('Procès-verbal')} lang="fr">{m.minutes.text}</pre>
                  <p className="k-hint">{tx('Empreinte :')} <span className="k-code">{m.minutes.hash}</span></p>
                  <div className="k-toolbar">
                    <button type="button" className="k-button k-button-secondary" onClick={() => imprimer(m)}>{tx('Imprimer / PDF')}</button>
                    {!m.minutes.approvedAt && admin ? <button type="button" className="k-button k-button-primary" onClick={() => { setMsg(null); api.approveMinutes(g.groupId, m.meetingId, m.minutes?.hash ?? '').then(() => { d.reload(); q.reload(); }, (e) => setMsg(errText(e))); }}>{tx('Approuver le PV')}</button> : null}
                    {m.minutes.approvedAt ? <StatusChip status={tx('PV approuvé')} tone="ok" /> : null}
                  </div>
                </>
              ) : <p className="k-hint">{tx('Le PV sera généré à la clôture de la séance.')}</p>}
              {msg ? <p className="k-field-error" role="alert">{tx(msg)}</p> : null}
            </>
          )}</RemoteState>
        </Panel> : <CapabilityNotice title={tx('Choisissez une séance')}>{tx('Sélectionnez une séance pour voir l’appel, les mouvements et le procès-verbal.')}</CapabilityNotice>}</div>
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
  const { tx } = useTx();
  const fines = useRemote((s) => api.fines(g.groupId, s), [api, g.groupId]);
  const aids = useRemote((s) => api.aids(g.groupId, s), [api, g.groupId]);
  const debts = useRemote((s) => api.debts(g.groupId, s), [api, g.groupId]);
  return (
    <>
      <PageHeader title={tx('Amendes, secours et dettes')} description={tx('Une amende ne modifie jamais une cotisation. Les montants de dette individuels ne sont visibles que du bureau et de l’intéressé.')} />
      <div className="k-grid">
        <div className="k-span-6"><Panel title={tx('Amendes')}><RemoteState state={fines.state} onRetry={fines.reload} emptyTitle={tx('Aucune amende')}>{(rows) => (
          <DataTable rows={rows} rowKey={(f) => f.fineId} caption={tx('Amendes')} columns={[
            { header: 'Membre', render: (f) => f.memberName }, { header: 'Motif', render: (f) => f.reason }, { header: 'Montant', render: (f) => xaf(f.amount) },
            { header: 'État', render: (f) => <StatusChip status={{ issued: 'Constatée', contested: 'Contestée', paid: 'Payée', cancelled: 'Annulée' }[f.state]} tone={f.state === 'paid' ? 'ok' : f.state === 'contested' ? 'danger' : 'warn'} /> },
          ]} />
        )}</RemoteState></Panel></div>
        <div className="k-span-6"><Panel title={tx('Secours')}><RemoteState state={aids.state} onRetry={aids.reload} emptyTitle={tx('Aucune demande')}>{(rows) => (
          <DataTable rows={rows} rowKey={(a) => a.aidId} caption={tx('Secours')} columns={[
            { header: 'Bénéficiaire', render: (a) => a.beneficiaryName }, { header: 'Date', render: (a) => jour(a.eventDate) }, { header: 'Montant', render: (a) => xaf(a.amount) },
            { header: 'État', render: (a) => <StatusChip status={{ requested: 'Demandé', approved: 'Accordé', rejected: 'Refusé', paid: 'Remis', cancelled: 'Annulé' }[a.state]} tone={a.state === 'paid' ? 'ok' : a.state === 'rejected' ? 'danger' : 'warn'} /> },
          ]} />
        )}</RemoteState></Panel></div>
        <div className="k-span-12"><Panel title={tx('Dettes suivies')}><RemoteState state={debts.state} onRetry={debts.reload} emptyTitle={tx('Aucune dette')}>{(rows) => (
          <DataTable rows={rows} rowKey={(d) => d.debtId} caption={tx('Dettes')} columns={[
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
  const { tx, L } = useTx();
  const d = useRemote((s) => api.decisions(g.groupId, s), [api, g.groupId]);
  const sn = useRemote((s) => api.sanctions(g.groupId, s), [api, g.groupId], { isEmpty: (rows) => rows.every((r) => r.lateCount === 0 && !r.payoutSuspended) });
  const [err, setErr] = useState<string | null>(null);
  const objet = (x: DecisionView) =>
    x.kind === 'removal' ? `${x.targetName ?? ''} — ${ROLE[x.targetRole ?? ''] ?? ''}`
      : x.kind === 'replacement' ? L(`${String(x.params.incomingName ?? '')} reprend la place de ${x.targetName ?? ''}`, `${String(x.params.incomingName ?? '')} takes over the place of ${x.targetName ?? ''}`)
        : x.kind === 'pause' ? L(`${String(x.params.occurrences ?? 1)} séance(s)`, `${String(x.params.occurrences ?? 1)} meeting(s)`) : (x.targetName ?? '');
  return (
    <>
      <PageHeader title={tx('Votes & sanctions')} description={tx('Décisions de l’assemblée à la majorité absolue des électeurs (la personne concernée ne vote pas). Le vote est secret jusqu’au dépouillement ; les membres votent dans l’application.')} />
      {err ? <CapabilityNotice title={tx('Action refusée')}>{err}</CapabilityNotice> : null}
      <div className="k-grid">
        <div className="k-span-12"><Panel title={tx('Votes de l’assemblée')} action={d.state.kind === 'ready' ? <button type="button" className="k-button k-button-secondary" onClick={() => d.state.kind === 'ready' && downloadCsv(`kombe-votes-${g.name.replace(/\W+/g, '-')}.csv`, toCsv(['Ouvert le', 'Objet', 'Concerné', 'Motif', 'État', 'Électeurs', 'Oui', 'Non', 'Abstention', 'Exécution'].map(tx), d.state.data.map((x) => [x.openedAt, tx(DECISION[x.kind] ?? x.kind), objet(x), x.reason, tx(DECISION_ETAT[x.state]?.[0] ?? x.state), x.electorate, x.result?.yes, x.result?.no, x.result?.abstain, x.outcomeNote])))}>{tx('Exporter en CSV')}</button> : undefined}>
          <RemoteState state={d.state} onRetry={d.reload} emptyTitle={tx('Aucun vote')}>{(rows) => (
            <DataTable rows={rows} rowKey={(x) => x.decisionId} caption={tx('Votes')} columns={[
              { header: 'Objet', render: (x) => DECISION[x.kind] }, { header: 'Concerné', render: (x) => objet(x) }, { header: 'Motif', render: (x) => x.reason },
              { header: 'Bulletins', render: (x) => x.result ? L(`Oui ${x.result.yes} · Non ${x.result.no} · Abst. ${x.result.abstain} / ${x.electorate}`, `Yes ${x.result.yes} · No ${x.result.no} · Abst. ${x.result.abstain} / ${x.electorate}`) : `${x.ballots} / ${x.electorate} (secret)` },
              { header: 'Clôture', render: (x) => formatServerDate(x.closesAt) },
              { header: 'État', render: (x) => <StatusChip status={DECISION_ETAT[x.state]?.[0] ?? x.state} tone={DECISION_ETAT[x.state]?.[1] ?? 'neutral'} /> },
              { header: 'Exécution', render: (x) => x.outcomeNote ?? (x.can.close ? <button type="button" className="k-button k-button-secondary" onClick={() => { setErr(null); api.closeDecision(g.groupId, x.decisionId).then(d.reload, (e: unknown) => setErr(errText(e))); }}>{tx('Dépouiller')}</button> : '—') },
            ]} />
          )}</RemoteState>
        </Panel></div>
        <div className="k-span-12"><Panel title={tx('Graduation des sanctions (suggestion)')}>
          <p className="k-hint">{tx('Avertissement → amende → suspension du droit de bouffer → vote d’exclusion, d’après les retards et dettes non régularisés. Le bureau décide ; l’assemblée vote.')}</p>
          <RemoteState state={sn.state} onRetry={sn.reload} emptyTitle={tx('Aucun retard à signaler')}>{(rows) => (
            <DataTable rows={rows.filter((r) => r.lateCount > 0 || r.payoutSuspended)} rowKey={(r) => r.membershipId} caption={tx('Sanctions')} columns={[
              { header: 'Membre', render: (r) => r.displayName }, { header: 'Retards / dettes', render: (r) => String(r.lateCount) },
              { header: 'En retard', render: (r) => xaf(r.lateAmount) }, { header: 'Dette ouverte', render: (r) => xaf(r.openDebt) },
              { header: 'Suggestion', render: (r) => <StatusChip status={SANCTION[r.suggested]?.[0] ?? r.suggested} tone={SANCTION[r.suggested]?.[1] ?? 'neutral'} /> },
              { header: 'Droit de bouffer', render: (r) => r.payoutSuspended ? <StatusChip status={tx('Suspendu')} tone="danger" /> : 'Normal' },
            ]} />
          )}</RemoteState>
        </Panel></div>
      </div>
    </>
  );
}

/** Classeur Excel complet du groupe (tours, membres, mouvements, amendes, séances, votes). */
function ExportExcel({ api, g }: P) {
  const { tx } = useTx();
  const [etat, setEtat] = useState<'repos' | 'encours' | 'erreur'>('repos');
  const lancer = async () => {
    setEtat('encours');
    try {
      const blob = await api.exportXlsx(g.groupId);
      downloadBlob(`kombe-${g.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\W+/g, '-')}.xlsx`, blob);
      setEtat('repos');
    } catch {
      setEtat('erreur');
    }
  };
  return (
    <div className="k-toolbar">
      <button type="button" className="k-button" disabled={etat === 'encours'} onClick={() => void lancer()}>{tx(etat === 'encours' ? 'Préparation du classeur…' : 'Exporter tout en Excel (.xlsx)')}</button>
      {etat === 'erreur' ? <span role="alert">{tx('Export impossible pour le moment. Réessayez.')}</span> : null}
    </div>
  );
}

function Registre({ api, g }: P) {
  const { tx } = useTx();
  const q = useRemote((s) => api.journal(g.groupId, s), [api, g.groupId], { isEmpty: (d) => d.entries.length === 0 });
  return (
    <>
      <PageHeader title={tx('Registre')} description={tx('Journal append-only chaîné par empreintes : un événement modifié ou supprimé casse la chaîne.')} />
      <ExportExcel api={api} g={g} />
      <RemoteState state={q.state} onRetry={q.reload}>{(j) => (
        <Panel title={j.valid ? 'Chaîne vérifiée' : 'Chaîne NON vérifiée'} action={<button type="button" className="k-button k-button-secondary" onClick={() => downloadCsv(`kombe-registre-${g.name.replace(/\W+/g, '-')}.csv`, toCsv(['N°', 'Date', 'Événement', 'Auteur', 'Empreinte'].map(tx), j.entries.map((e) => [e.seq, e.at, e.summary, e.actorName, e.hash])))}>{tx('Exporter en CSV')}</button>}>
          <StatusChip status={j.valid ? 'Aucun événement modifié ni supprimé' : 'Prévenez le commissaire aux comptes'} tone={j.valid ? 'ok' : 'danger'} />
          <DataTable rows={[...j.entries].reverse()} rowKey={(e) => String(e.seq)} caption={tx('Registre')} columns={[
            { header: 'N°', render: (e) => String(e.seq), width: '60px' }, { header: 'Date', render: (e) => formatServerDate(e.at, langue) },
            { header: 'Événement', render: (e) => e.summary }, { header: 'Auteur', render: (e) => e.actorName ?? '—' }, { header: 'Empreinte', render: (e) => <span className="k-code">{e.hash.slice(0, 12)}</span> },
          ]} />
        </Panel>
      )}</RemoteState>
    </>
  );
}

function Reglement({ api, g }: P) {
  const { tx, L } = useTx();
  const d = useRemote((s) => api.detail(g.groupId, s), [api, g.groupId], { isEmpty: () => false });
  // Avant publication, l'API répond 404 : ce n'est pas une panne, juste « pas encore ».
  const st = useRemote((s) => api.statutes(g.groupId, s).catch((e: unknown) => { if (e && typeof e === 'object' && (e as { status?: number }).status === 404) return null; throw e; }), [api, g.groupId], { isEmpty: () => false });
  return (
    <>
      <PageHeader title={tx('Règlement & statuts')} description={tx('Le règlement se modifie dans l’application avant le premier cycle et entre deux saisons ; les règles ne sont jamais rétroactives.')} />
      <div className="k-grid">
        <div className="k-span-5"><Panel title={tx('Règlement')}><RemoteState state={d.state} onRetry={d.reload}>{(t) => (
          <>
            <KeyValue label={tx('Cotisation par part')} value={xaf(t.settings.contributionPerShare)} />
            <KeyValue label={tx('Membres (max.)')} value={String(t.settings.maxMembers)} />
            <KeyValue label={tx('Heure limite')} value={`${t.settings.deadlineTime} (Douala)`} />
            <KeyValue label={tx('Témoins à la remise')} value={String(t.settings.payoutWitnesses)} />
            <KeyValue label={tx('Transparence')} value={{ all_members: 'Tous les membres', bureau_only: 'Bureau seulement', anonymized: 'Anonymisée' }[t.settings.transparency]} />
            <KeyValue label={tx('Cagnotte incomplète')} value={{ full_with_advance: 'Avance de caisse', reduced: 'Remise réduite', wait: 'On attend' }[t.settings.payoutPolicy]} />
            <KeyValue label={tx('Secours / séance')} value={t.settings.solidarity.enabled ? xaf(t.settings.solidarity.perMeeting) : '—'} />
            <KeyValue label={tx('Fonctionnement / séance')} value={t.settings.operating.enabled ? xaf(t.settings.operating.perMeeting) : '—'} />
            <KeyValue label={tx('Réserve de fin d’année / séance')} value={t.settings.yearEndReserve.enabled ? xaf(t.settings.yearEndReserve.perMeeting) : '—'} />
            <KeyValue label={tx('Absence à la séance')} value={xaf(t.settings.fines.meetingAbsence)} />
            <KeyValue label={tx('Jours de grâce')} value={String(t.settings.fines.graceDays)} />
          </>
        )}</RemoteState></Panel></div>
        <div className="k-span-7"><Panel title={tx('Statuts et règlement intérieur')}><RemoteState state={st.state} onRetry={st.reload}>{(s) => s === null ? (
          <p className="k-hint">{tx('Statuts pas encore publiés. Le président les publie depuis l’application (onglet Statuts), avec une date limite d’acceptation.')}</p>
        ) : (
          <>
            <p className="k-hint">{L(`Version ${s.version} · acceptée par ${s.acceptedCount} sur ${s.expectedCount}`, `Version ${s.version} · accepted by ${s.acceptedCount} of ${s.expectedCount}`)}{s.deadline ? ` · ${L('échéance', 'deadline')} ${new Date(s.deadline.deadlineAt).toLocaleString(L('fr-FR', 'en-GB'), { timeZone: 'Africa/Douala', dateStyle: 'medium', timeStyle: 'short' })} (${tx(s.deadline.onExpiry === 'exclude' ? 'retardataires exclus' : 'bureau prévenu')})` : ''} · {L('empreinte', 'fingerprint')} <span className="k-code">{s.hash.slice(0, 16)}</span></p>
            {s.pending.length ? <p className="k-hint">Pas encore accepté : {s.pending.map((p) => p.name).join(', ')}</p> : null}
            {L('', 'The rules are drafted in French.') ? <p className="k-hint">{L('', 'The rules are drafted in French.')}</p> : null}
            <pre className="k-minutes" tabIndex={0} role="region" aria-label={tx('Statuts et règlement intérieur')} lang="fr">{s.body}</pre>
            <p className="k-hint">{tx('Document indicatif inspiré de la loi n° 90/053 sur la liberté d’association ; sans valeur juridique par lui-même.')}</p>
          </>
        )}</RemoteState></Panel></div>
      </div>
    </>
  );
}
