/* KÓMBE — Opérations & Support : la console des opérateurs de la plateforme.
   Données RÉELLES uniquement (/v1/ops/*, réservées aux opérateurs) : files
   d'attente à surveiller, santé de chaque groupe (sans donnée individuelle),
   accès support JIT à double approbation, runbooks d'incident. Aucun pouvoir
   financier : la console ne déclare, ne confirme ni ne remet rien. */
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  CapabilityNotice, DashboardBoot, DashboardShell, DataTable, Field, JsonDisclosure, KeyValue, OperatorGate, PageHeader, Panel,
  RemoteState, SelectField, StatCard, StatusChip, SubmitButton, TextAreaField, formatServerDate, useHashRoute, useMutation, useRemote,
  type DashboardContext,
} from '@kombe/dashboard-core';
import { OperationsApi, type OpsGroupRow, type OpsOverview, type SupportQueueRow } from './api';

const messages = { app: { fr: 'Opérations & Support', en: 'Operations & Support' } } as const;
const NAV = [
  { path: '/', label: 'Vue d’ensemble' },
  { path: '/groupes', label: 'Groupes' },
  { path: '/support', label: 'Support JIT' },
  { path: '/sante', label: 'Santé de l’API' },
  { path: '/runbooks', label: 'Incidents & runbooks' },
] as const;
const ETAT: Record<string, string> = { configuration: 'En préparation', active: 'En cours', paused: 'En pause', closed: 'Terminé', stopped_with_discrepancies: 'Arrêté avec écarts', archived: 'Archivé' };
const date = (v: string | null | undefined) => (v ? formatServerDate(v) : '—');
const heures = (v: string | null | undefined) => (v ? Math.round((Date.now() - new Date(v).getTime()) / 3_600_000) : 0);
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const TTL_ACCES: readonly { readonly valeur: number; readonly label: string }[] = [
  { valeur: 1800, label: '30 minutes' },
  { valeur: 3600, label: '1 heure' },
  { valeur: 7200, label: '2 heures' },
  { valeur: 14400, label: '4 heures' },
];
const labelTtl = (v: number) => TTL_ACCES.find((t) => t.valeur === v)?.label ?? `${Math.round(v / 60)} min`;

export function App() {
  return <DashboardBoot product="Opérations & Support" messages={messages}>{(ctx) => <Console ctx={ctx} />}</DashboardBoot>;
}

function Console({ ctx }: { readonly ctx: DashboardContext }) {
  const api = useMemo(() => new OperationsApi(ctx.api), [ctx.api]);
  const { path, navigate } = useHashRoute();
  const [jitGid, setJitGid] = useState('');
  const demanderJit = (gid: string) => { setJitGid(gid); navigate('/support'); };
  let page: ReactNode;
  switch (path) {
    case '/groupes': page = <Groupes api={api} onJit={demanderJit} />; break;
    case '/support': page = <Support api={api} initialGid={jitGid} />; break;
    case '/sante': page = <Sante api={api} />; break;
    case '/runbooks': page = <Runbooks />; break;
    default: page = <Overview api={api} onNavigate={navigate} />;
  }
  const badge = <span className="k-hint">{ctx.session.phase.kind === 'authenticated' ? ctx.session.phase.identityId : ''} <button type="button" className="k-button k-button-secondary" onClick={ctx.session.logout}>Se déconnecter</button></span>;
  return (
    <DashboardShell product="Opérations & Support" nav={NAV} activePath={path} onNavigate={navigate} userBadge={badge} {...(ctx.config.environment ? { environment: ctx.config.environment } : {})}>
      {path === '/runbooks' ? page : <OperatorGate api={ctx.api}>{page}</OperatorGate>}
    </DashboardShell>
  );
}

export function alertes(o: OpsOverview): { niveau: 'danger' | 'warn'; texte: string }[] {
  const a: { niveau: 'danger' | 'warn'; texte: string }[] = [];
  if (o.outboxDead > 0) a.push({ niveau: 'danger', texte: `${o.outboxDead} notification(s) en échec définitif dans l’outbox : voir runbook S3.` });
  if (o.outboxPending > 0 && heures(o.outboxOldestPendingAt) >= 1) a.push({ niveau: 'warn', texte: `Outbox : ${o.outboxPending} en attente, la plus ancienne depuis ${heures(o.outboxOldestPendingAt)} h (worker arrêté ?).` });
  if (o.movementsDeclaredOver72h > 0) {
    const age = heures(o.oldestDeclaredAt);
    a.push({ niveau: 'warn', texte: `${o.movementsDeclaredOver72h} déclaration(s) attendent leur confirmation depuis plus de 72 h${age ? ` — la plus ancienne depuis ${age} h` : ''} : relancer les trésoriers concernés (page Groupes).` });
  }
  if (o.payoutsAwaitingReceipt > 0) a.push({ niveau: 'warn', texte: `${o.payoutsAwaitingReceipt} remise(s) sans accusé de réception du bénéficiaire.` });
  if (o.finesContested > 0) a.push({ niveau: 'warn', texte: `${o.finesContested} amende(s) contestée(s) en attente de décision du bureau.` });
  if (o.supportRequestsPending > 0) a.push({ niveau: 'warn', texte: `${o.supportRequestsPending} demande(s) d’accès support attendent une seconde approbation.` });
  return a;
}

function Overview({ api, onNavigate }: { readonly api: OperationsApi; readonly onNavigate: (p: string) => void }) {
  const q = useRemote((s) => api.overview(s), [api], { isEmpty: () => false });
  return (
    <>
      <PageHeader title="Vue d’ensemble" description="Chiffres lus en base à l’instant (aucun voyant n’est mis au vert sans réponse réelle). Aucun montant individuel, aucun nom de membre." />
      <RemoteState state={q.state} onRetry={q.reload}>{(o) => {
        const groupes = Object.values(o.groupsByState).reduce((s, n) => s + n, 0);
        const al = alertes(o);
        return (
          <div className="k-grid">
            <div className="k-span-12"><div className="k-stats">
              <StatCard label="Groupes" value={String(groupes)} hint={`${o.groupsByState.active ?? 0} en cours · ${o.groupsByState.configuration ?? 0} en préparation`} />
              <StatCard label="Comptes" value={String(o.identities)} hint={`+${o.identitiesLast7d} sur 7 jours · ${o.sessionsActive24h} actifs (24 h)`} />
              <StatCard label="Adhésions actives" value={String(o.membershipsActive)} hint={`${o.membershipsPending} en attente d’admission`} tone={o.membershipsPending ? 'warn' : 'ok'} />
              <StatCard label="À confirmer" value={String(o.movementsDeclared)} hint={`${o.movementsDeclaredOver72h} depuis plus de 72 h`} tone={o.movementsDeclaredOver72h ? 'warn' : 'ok'} />
              <StatCard label="Outbox" value={`${o.outboxPending} / ${o.outboxDead}`} hint="en attente / en échec" tone={o.outboxDead ? 'danger' : 'ok'} />
            </div></div>
            <div className="k-span-7"><Panel title={al.length ? `À traiter (${al.length})` : 'À traiter'}>
              {al.length === 0 ? <StatusChip status="Rien d’anormal" tone="ok" /> : al.map((x) => <p key={x.texte}><StatusChip status={x.niveau === 'danger' ? 'Urgent' : 'À suivre'} tone={x.niveau} /> {x.texte}</p>)}
              <div className="k-toolbar"><button type="button" className="k-button k-button-secondary" onClick={() => onNavigate('/groupes')}>Voir les groupes</button><button type="button" className="k-button k-button-secondary" onClick={() => onNavigate('/support')}>File support</button></div>
            </Panel></div>
            <div className="k-span-5"><Panel title="Activité">
              <KeyValue label="Séances ouvertes" value={String(o.meetingsOpen)} />
              <KeyValue label="Séances prévues (7 jours)" value={String(o.meetingsNext7d)} />
              <KeyValue label="PV à approuver" value={String(o.meetingsClosedNoMinutesApproval)} />
              <KeyValue label="Secours demandés" value={String(o.aidsRequested)} />
              <KeyValue label="Dettes ouvertes" value={String(o.debtsOpen)} />
              <KeyValue label="Notifications (24 h)" value={String(o.inboxLast24h)} />
              <KeyValue label="Événements de sécurité (7 j)" value={String(o.securityEventsLast7d)} />
              <KeyValue label="Heure serveur" value={date(o.serverNow)} />
            </Panel></div>
          </div>
        );
      }}</RemoteState>
    </>
  );
}

function Groupes({ api, onJit }: { readonly api: OperationsApi; readonly onJit: (gid: string) => void }) {
  const q = useRemote((s) => api.groups(s), [api]);
  const [filtre, setFiltre] = useState('');
  const [selection, setSelection] = useState<OpsGroupRow | null>(null);
  return (
    <>
      <PageHeader title="Groupes" description="Santé de chaque groupe : adhésions, séances, confirmations en retard, dettes. Le contenu d’un groupe (noms, montants) n’est accessible qu’avec un accès support JIT approuvé." />
      <div className="k-toolbar"><label>Rechercher <input className="k-select-group" value={filtre} onChange={(e) => setFiltre(e.target.value)} placeholder="Nom du groupe" /></label></div>
      <Panel>
        <RemoteState state={q.state} onRetry={q.reload} emptyTitle="Aucun groupe">{(rows: readonly OpsGroupRow[]) => (
          <DataTable rows={rows.filter((g) => !filtre || (g.name ?? '').toLowerCase().includes(filtre.toLowerCase()))} rowKey={(g) => g.groupId} caption="Groupes" columns={[
            { header: 'Groupe', render: (g) => <><strong>{g.name ?? '—'}</strong><br /><span className="k-code">{g.groupId}</span></> },
            { header: 'État', render: (g) => <StatusChip status={ETAT[g.state] ?? g.state} tone={g.state === 'active' ? 'ok' : 'neutral'} /> },
            { header: 'Membres', render: (g) => `${g.membersActive}${g.membersPending ? ` (+${g.membersPending})` : ''}` },
            { header: 'Séances', render: (g) => `${g.meetingsClosed}/${g.meetingsTotal}` },
            { header: 'À confirmer', render: (g) => g.movementsDeclaredPending ? <StatusChip status={`${g.movementsDeclaredPending} · ${heures(g.oldestPendingAt)} h`} tone={heures(g.oldestPendingAt) > 72 ? 'danger' : 'warn'} /> : '0' },
            { header: 'Dettes', render: (g) => String(g.openDebts) },
            { header: 'Dernière activité', render: (g) => date(g.lastActivityAt) },
            { header: '', render: (g) => <button type="button" className="k-button k-button-secondary" onClick={() => setSelection(g)}>Détail</button> },
          ]} />
        )}</RemoteState>
      </Panel>
      {selection ? (
        <Panel title={`Détail — ${selection.name ?? selection.groupId}`}>
          <div className="k-grid">
            <div className="k-span-6">
              <KeyValue label="Identifiant" value={<span className="k-code">{selection.groupId}</span>} />
              <KeyValue label="État" value={ETAT[selection.state] ?? selection.state} />
              <KeyValue label="Créé le" value={date(selection.createdAt)} />
              <KeyValue label="Membres" value={`${selection.membersActive} actif(s)${selection.membersPending ? `, ${selection.membersPending} en attente d’admission` : ''}`} />
              <KeyValue label="Séances" value={`${selection.meetingsClosed} close(s) sur ${selection.meetingsTotal}`} />
            </div>
            <div className="k-span-6">
              <KeyValue label="À confirmer" value={selection.movementsDeclaredPending ? `${selection.movementsDeclaredPending} depuis ${heures(selection.oldestPendingAt)} h` : 'Rien en attente'} />
              <KeyValue label="Dettes ouvertes" value={String(selection.openDebts)} />
              <KeyValue label="Dernière activité" value={date(selection.lastActivityAt)} />
              <div className="k-toolbar">
                <button type="button" className="k-button k-button-primary" onClick={() => onJit(selection.groupId)}>Demander un accès JIT</button>
                <button type="button" className="k-button k-button-secondary" onClick={() => setSelection(null)}>Fermer</button>
              </div>
            </div>
          </div>
          <p className="k-hint">Le bouton ci-dessus préremplit une demande d’accès sur la page Support JIT : motivez-la, puis deux opérateurs distincts de vous doivent l’approuver.</p>
        </Panel>
      ) : null}
    </>
  );
}

function Support({ api, initialGid = '' }: { readonly api: OperationsApi; readonly initialGid?: string }) {
  const q = useRemote((s) => api.supportQueue(s), [api]);
  const [msg, setMsg] = useState<string | null>(null);
  const [ttl, setTtl] = useState(3600);
  const act = async (fn: () => Promise<unknown>) => { setMsg(null); try { await fn(); q.reload(); } catch (e) { setMsg(errText(e)); } };
  return (
    <>
      <PageHeader title="Accès support JIT" description="Un accès au contenu d’un groupe exige un motif, deux approbations par des opérateurs DISTINCTS du demandeur, et expire seul. Aucune action financière n’est possible." />
      {msg ? <p className="k-field-error" role="alert">{msg}</p> : null}
      <div className="k-grid">
        <div className="k-span-8"><Panel title="File des demandes">
          <div className="k-toolbar"><label>Durée accordée à l’approbation <select className="k-select-group" value={ttl} onChange={(e) => setTtl(Number(e.target.value))}>{TTL_ACCES.map((t) => <option key={t.valeur} value={t.valeur}>{t.label}</option>)}</select></label></div>
          <RemoteState state={q.state} onRetry={q.reload} emptyTitle="Aucune demande">{(rows: readonly SupportQueueRow[]) => (
            <DataTable rows={rows} rowKey={(r) => r.requestId} caption="Demandes d’accès support" columns={[
              { header: 'Demande', render: (r) => <><span className="k-code">{r.requestId}</span><br /><span className="k-hint">{r.applicantIdentityId}</span></> },
              { header: 'Groupe', render: (r) => r.targetGroupName ?? r.targetGroupId },
              { header: 'Motif', render: (r) => r.motif },
              { header: 'Approbations', render: (r) => `${r.approverCount}/${r.requiredApprovals}` },
              { header: 'État', render: (r) => <StatusChip status={{ pending_approval: 'En attente', granted: `Accordé jusqu’au ${date(r.expiresAt)}`, expired: 'Expiré', revoked: 'Révoqué' }[r.status] ?? r.status} tone={r.status === 'granted' ? 'ok' : r.status === 'pending_approval' ? 'warn' : 'neutral'} /> },
              { header: '', render: (r) => r.status === 'pending_approval'
                ? <button type="button" className="k-button k-button-primary" onClick={() => void act(() => api.approve(r.requestId, ttl, r.version))}>Approuver ({labelTtl(ttl)})</button>
                : r.status === 'granted' ? <button type="button" className="k-button k-button-secondary" onClick={() => void act(() => api.revoke(r.requestId, r.version))}>Révoquer</button> : null },
            ]} />
          )}</RemoteState>
        </Panel></div>
        <div className="k-span-4"><NouvelleDemande key={initialGid} api={api} onFini={q.reload} initialGid={initialGid} /></div>
      </div>
    </>
  );
}

function NouvelleDemande({ api, onFini, initialGid = '' }: { readonly api: OperationsApi; readonly onFini: () => void; readonly initialGid?: string }) {
  const [gid, setGid] = useState(initialGid);
  const [motif, setMotif] = useState('');
  const [permission, setPermission] = useState('view_trace');
  const [ttl, setTtl] = useState(3600);
  const m = useMutation(() => api.createAccess({ requestId: `sup_${Date.now().toString(36)}`, targetGroupId: gid.trim(), motif: motif.trim(), permissions: [permission], ttlSeconds: ttl }));
  const submit = (e: FormEvent) => { e.preventDefault(); void m.run(undefined).then(onFini, () => undefined); };
  return (
    <Panel title="Nouvelle demande">
      <form onSubmit={submit}>
        <Field label="Identifiant du groupe" hint="Prérempli depuis la page Groupes, sinon copiez l’identifiant." inputProps={{ value: gid, onChange: (e) => setGid(e.target.value), required: true, maxLength: 120 }} />
        <TextAreaField label="Motif (visible des approbateurs)" textareaProps={{ value: motif, onChange: (e) => setMotif(e.target.value), required: true, maxLength: 500 }} />
        <SelectField label="Permission" selectProps={{ value: permission, onChange: (e) => setPermission(e.target.value) }}>
          <option value="view_trace">Voir la trace</option><option value="restore_access">Restaurer un accès</option><option value="explain_journal">Expliquer le registre</option>
        </SelectField>
        <SelectField label="Durée demandée" selectProps={{ value: ttl, onChange: (e) => setTtl(Number(e.target.value)) }}>
          {TTL_ACCES.map((t) => <option key={t.valeur} value={t.valeur}>{t.label}</option>)}
        </SelectField>
        <SubmitButton busy={m.state.kind === 'submitting'}>Demander l’accès</SubmitButton>
      </form>
      {m.state.kind === 'error' ? <p className="k-field-error" role="alert">{errText(m.state.error)}</p> : null}
      {m.state.kind === 'success' ? <p className="k-hint" role="status">Demande créée : deux autres opérateurs doivent l’approuver.</p> : null}
    </Panel>
  );
}

function Sante({ api }: { readonly api: OperationsApi }) {
  const h = useRemote((s) => api.health(s), [api], { isEmpty: () => false });
  const r = useRemote((s) => api.ready(s), [api], { isEmpty: () => false });
  return (
    <>
      <PageHeader title="Santé de l’API" description="Réponses brutes des sondes /v1/health et /v1/health/ready." />
      <div className="k-grid">
        <div className="k-span-6"><Panel title="Disponibilité"><RemoteState state={r.state} onRetry={r.reload}>{(d) => <><StatusChip status={d.status === 'ready' ? 'Prête' : String(d.status ?? '—')} tone={d.status === 'ready' ? 'ok' : 'danger'} /><KeyValue label="Mode" value={String(d.mode ?? '—')} /></>}</RemoteState></Panel></div>
        <div className="k-span-6"><Panel title="Détail"><RemoteState state={h.state} onRetry={h.reload}>{(d) => <JsonDisclosure value={d} />}</RemoteState></Panel></div>
      </div>
    </>
  );
}

function Runbooks() {
  const fiches: { titre: string; quand: string; faire: string[] }[] = [
    { titre: 'S1 — Fuite ou soupçon de fuite de données', quand: 'Données d’un groupe vues par une autre personne, jeton exposé, compte détourné.', faire: [
      'Révoquer les sessions du compte concerné (réinitialisation par récupération : la génération de session invalide toutes les sessions).',
      'Révoquer les accès support accordés au groupe (page Support JIT).',
      'Prévenir le président du groupe ; noter les faits au registre de sécurité.',
      'Notification à l’autorité compétente si des données personnelles sont touchées (loi n° 2024/017).'] },
    { titre: 'S2 — API indisponible', quand: 'Sonde « Santé » en échec, erreurs 5xx, PWA « réseau indisponible ».', faire: [
      'Vérifier Neon (base kombe_prod joignable, quotas) puis Vercel (dernier déploiement, logs).',
      'Revenir au déploiement précédent sur Vercel si le dernier est en cause (ROLLBACK.md).',
      'Les membres ne perdent rien : les brouillons restent sur leur téléphone et rien n’est présenté comme confirmé.'] },
    { titre: 'S3 — Codes SMS ou notifications non reçus', quand: 'Plaintes « je ne reçois pas le code », outbox en échec.', faire: [
      'Vérifier le fournisseur SMS (KOMBE_SMS_PROVIDER, crédit Africa’s Talking) ; proposer la connexion par e-mail en attendant.',
      'Outbox : relancer le worker ; les lignes « dead » se rejouent au plus 3 fois.',
      'Ne jamais lire ni transmettre un code de connexion : il n’est jamais journalisé.'] },
    { titre: 'S4 — Désaccord dans un groupe', quand: 'Un membre conteste une cotisation, une remise ou une amende.', faire: [
      'Rappeler que KÓMBE ne garde pas l’argent : le registre montre qui a déclaré, confirmé, contrôlé.',
      'Orienter vers la contestation dans l’application (amende) ou le commissaire aux comptes.',
      'Un accès support JIT « expliquer le registre » peut être demandé avec le motif ; jamais d’action financière.'] },
  ];
  return (
    <>
      <PageHeader title="Incidents & runbooks" description="Procédures à suivre ; aucun incident de démonstration n’est simulé." />
      <div className="k-grid">{fiches.map((f) => (
        <div key={f.titre} className="k-span-6"><Panel title={f.titre}><p className="k-hint">{f.quand}</p><ol>{f.faire.map((x) => <li key={x}>{x}</li>)}</ol></Panel></div>
      ))}</div>
      <CapabilityNotice title="Contacts">Renseignez ici le numéro d’astreinte et l’adresse du délégué à la protection des données avant l’ouverture au public.</CapabilityNotice>
    </>
  );
}
