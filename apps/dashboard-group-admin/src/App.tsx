import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  AccessApi,
  ApiClient,
  ApiError,
  BrandMark,
  CapabilityNotice,
  DashboardShell,
  Field,
  LocaleProvider,
  Panel,
  RemoteState,
  SubmitButton,
  UserBadge,
  loadRuntimeConfig,
  useHashRoute,
  useRemote,
  useSession,
  type SessionController,
} from '@kombe/dashboard-core';
import { TontineApi } from './tontine/client';
import { roleList } from './tontine/roles';
import { label, GROUP_STATE_LABELS } from './tontine/format';
import type { MyGroup } from './tontine/types';
import { BureauProvider, Chip, Note } from './bureau/common';
import { Overview } from './bureau/overview';
import { BureauRoles, Invitations, Members } from './bureau/people';
import { Calendar } from './bureau/calendar';
import { Seance } from './bureau/seance';
import { Funds, Validations } from './bureau/money';
import { Aids, Debts, Fines, Regularity } from './bureau/discipline';
import { HistoryImport, StatutesPage } from './bureau/records';
import './bureau/bureau.css';

const messages = { app: { fr: 'Bureau', en: 'Bureau' } } as const;

export const NAV = [
  { path: '/', label: 'Vue d’ensemble', icon: '◫' },
  { path: '/seance', label: 'Séance', icon: '◉' },
  { path: '/validations', label: 'File à valider', icon: '✓' },
  { path: '/members', label: 'Membres', icon: '◎' },
  { path: '/invitations', label: 'Invitations', icon: '＋' },
  { path: '/bureau', label: 'Bureau', icon: '◇' },
  { path: '/calendar', label: 'Calendrier', icon: '◌' },
  { path: '/funds', label: 'Caisses', icon: '▤' },
  { path: '/fines', label: 'Amendes', icon: '!' },
  { path: '/aids', label: 'Secours', icon: '♡' },
  { path: '/debts', label: 'Dettes', icon: '↺' },
  { path: '/regularity', label: 'Régularité', icon: '≡' },
  { path: '/statutes', label: 'Statuts', icon: '§' },
  { path: '/history', label: 'Reprise d’historique', icon: '⇪' },
] as const;

const GROUP_KEY = 'kombe.bureau.groupId';
function readStoredGroup(): string {
  try {
    return window.localStorage.getItem(GROUP_KEY) ?? '';
  } catch {
    return '';
  }
}
function storeGroup(id: string) {
  try {
    if (id) window.localStorage.setItem(GROUP_KEY, id);
    else window.localStorage.removeItem(GROUP_KEY);
  } catch {
    /* préférence locale seulement */
  }
}

export function Login({ session }: { session: SessionController }) {
  const [identity, setIdentity] = useState('');
  const [code, setCode] = useState('');
  function begin(e: FormEvent) {
    e.preventDefault();
    if (identity.trim()) void session.begin(identity.trim());
  }
  function confirm(e: FormEvent) {
    e.preventDefault();
    if (code.trim()) void session.confirm(code.trim());
  }
  return (
    <main className="b-login">
      <div className="b-login-brand">
        <BrandMark />
        <h1>
          Le poste du <em>bureau</em>
        </h1>
        <p>Séances, appel, collecte, remises devant témoins et procès-verbaux. KÓMBE tient le registre de votre association ; il ne garde pas son argent.</p>
      </div>
      <div className="b-login-card">
        {session.phase.kind === 'code_sent' ? (
          <form onSubmit={confirm}>
            <h2>Code de connexion</h2>
            <Field label="Code reçu" hint={`Code envoyé à ${session.phase.identityId} (SMS ou e-mail).`} inputProps={{ value: code, onChange: (e) => setCode(e.target.value), required: true, inputMode: 'numeric', autoComplete: 'one-time-code', maxLength: 20 }} />
            <SubmitButton busy={session.busy}>Se connecter</SubmitButton>
            <button type="button" className="k-button k-button-secondary b-mt" onClick={session.logout}>Changer d’identifiant</button>
          </form>
        ) : (
          <form onSubmit={begin}>
            <h2>Connexion</h2>
            <Field label="Téléphone ou e-mail" hint="Par exemple 6 90 00 00 01 ou tresoriere@exemple.cm. Aucun mot de passe : vous recevez un code." inputProps={{ value: identity, onChange: (e) => setIdentity(e.target.value), required: true, maxLength: 120, autoComplete: 'username' }} />
            <SubmitButton busy={session.busy}>Recevoir un code</SubmitButton>
          </form>
        )}
        {session.error && <p className="b-feedback b-feedback-error" role="alert">{session.error}</p>}
      </div>
    </main>
  );
}

export function GroupPicker({ api, onPick, onLogout }: { api: TontineApi; onPick: (g: MyGroup) => void; onLogout: () => void }) {
  const q = useRemote((s) => api.myGroups(s), [api]);
  return (
    <main className="b-login">
      <div className="b-login-brand">
        <BrandMark />
        <h1>
          Choisissez votre <em>groupe</em>
        </h1>
        <p>Le Bureau s’ouvre sur un groupe dont vous êtes membre actif.</p>
      </div>
      <div className="b-login-card">
        <RemoteState state={q.state} onRetry={q.reload} emptyTitle="Aucun groupe" emptyBody="Vous n’êtes membre d’aucun groupe. Rejoignez-en un avec un code d’invitation depuis l’application.">
          {(rows) => (
            <ul className="b-group-list">
              {rows.map((g) => (
                <li key={g.groupId}>
                  <button type="button" disabled={g.membershipState !== 'active'} onClick={() => onPick(g)}>
                    <strong>{g.name ?? 'Groupe'}</strong>
                    <small>{g.membershipState === 'active' ? `${roleList(g.roles)} · ${label(GROUP_STATE_LABELS, g.groupState)}` : 'Adhésion en attente d’admission'}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </RemoteState>
        <button type="button" className="k-button k-button-secondary b-mt" onClick={onLogout}>Fermer la session</button>
      </div>
    </main>
  );
}

function Console({ api, groupId, session, onChangeGroup, environment }: { api: TontineApi; groupId: string; session: SessionController; onChangeGroup: () => void; environment?: string | undefined }) {
  const { path, navigate } = useHashRoute();
  const overview = useRemote((s) => api.overview(groupId, s), [api, groupId]);
  const unauthorized = overview.state.kind === 'error' && overview.state.error instanceof ApiError && overview.state.error.status === 401;
  useEffect(() => {
    if (unauthorized) session.logout();
  }, [unauthorized, session]);
  let page: ReactNode;
  switch (path) {
    case '/seance': page = <Seance />; break;
    case '/validations': page = <Validations />; break;
    case '/members': page = <Members />; break;
    case '/invitations': page = <Invitations />; break;
    case '/bureau': page = <BureauRoles />; break;
    case '/calendar': page = <Calendar />; break;
    case '/funds': page = <Funds />; break;
    case '/fines': page = <Fines />; break;
    case '/aids': page = <Aids />; break;
    case '/debts': page = <Debts />; break;
    case '/regularity': page = <Regularity />; break;
    case '/statutes': page = <StatutesPage />; break;
    case '/history': page = <HistoryImport />; break;
    default: page = <Overview />;
  }
  const o = overview.state.kind === 'ready' ? overview.state.data : null;
  return (
    <DashboardShell
      product="Bureau"
      nav={NAV}
      activePath={path}
      onNavigate={navigate}
      {...(environment !== undefined ? { environment } : {})}
      topRight={
        <div className="b-topright">
          {o && <strong className="b-group-name">{o.name}</strong>}
          <button type="button" className="k-button k-button-secondary" onClick={onChangeGroup}>Changer de groupe</button>
          <button type="button" className="k-button k-button-secondary" onClick={session.logout}>Déconnexion</button>
        </div>
      }
      userBadge={o ? <UserBadge name={o.me.displayName ?? 'Moi'} role={roleList(o.me.roles)} /> : undefined}
    >
      <RemoteState state={overview.state} onRetry={overview.reload}>
        {(data) => (
          <BureauProvider value={{ api, groupId, overview: data, reloadOverview: overview.reload, navigate }}>
            {data.me.roles.every((r) => r === 'member') && (
              <Panel>
                <Note>
                  Vous êtes simple membre de ce groupe : le Bureau s’affiche en lecture, les actions sont réservées aux fonctions du bureau. <Chip>{roleList(data.me.roles)}</Chip>
                </Note>
              </Panel>
            )}
            {page}
          </BureauProvider>
        )}
      </RemoteState>
    </DashboardShell>
  );
}

function SessionGate({ apiBaseUrl, environment }: { apiBaseUrl: string; environment?: string | undefined }) {
  const access = useMemo(() => new AccessApi(new ApiClient({ baseUrl: apiBaseUrl })), [apiBaseUrl]);
  const session = useSession(access);
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = session.token;
  const api = useMemo(() => new TontineApi(new ApiClient({ baseUrl: apiBaseUrl, getSessionToken: () => tokenRef.current })), [apiBaseUrl]);
  const [groupId, setGroupId] = useState(readStoredGroup);
  const pick = (id: string) => {
    storeGroup(id);
    setGroupId(id);
  };
  if (session.phase.kind !== 'authenticated') return <Login session={session} />;
  if (!groupId) return <GroupPicker api={api} onPick={(g) => pick(g.groupId)} onLogout={session.logout} />;
  return <Console key={groupId} api={api} groupId={groupId} session={session} onChangeGroup={() => pick('')} environment={environment} />;
}

export function App() {
  const [ready, setReady] = useState<{ apiBaseUrl: string; environment?: string | undefined } | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    loadRuntimeConfig()
      .then((c) => setReady({ apiBaseUrl: c.apiBaseUrl, ...(c.environment !== undefined ? { environment: c.environment } : {}) }))
      .catch(setError);
  }, []);
  if (error)
    return (
      <main>
        <CapabilityNotice title="Configuration API absente">{error instanceof Error ? error.message : String(error)}</CapabilityNotice>
      </main>
    );
  if (!ready)
    return (
      <main>
        <div className="k-skeleton-stack"><span className="k-skeleton" /></div>
      </main>
    );
  return (
    <LocaleProvider messages={messages}>
      <SessionGate {...ready} />
    </LocaleProvider>
  );
}
