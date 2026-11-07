/* KÓMBE CRM — console unique de la plateforme (ADR-0046) : fusion des consoles
   Opérations & Support, Direction & Analytics et Engineering, autour d'un CRM
   (demandes avec délais de service, comptes, contacts, tâches, segments,
   conformité, journal d'audit).

   Accès : opérateurs de la plateforme seulement, second facteur exigé
   (OperatorGate). La navigation ne montre que les sections de VOS fonctions
   (moindre privilège) ; le serveur revérifie chaque appel (403 sinon). La
   console ne touche à aucun montant : KÓMBE ne détient aucun argent. */
import { useMemo, useState, type ReactNode } from 'react';
import {
  CapabilityNotice, DashboardBoot, DashboardShell, OperatorGate, RemoteState, useHashRoute, useRemote,
  type DashboardContext, type NavItem, type OperatorMe, type OperatorRole,
} from '@kombe/dashboard-core';
import { CrmApi } from './crm/api';
import { Demandes, FicheDemande } from './crm/Demandes';
import { Comptes, Contacts, FicheCompte, FicheContact } from './crm/Comptes';
import { Segments, TableauDeBord, Taches } from './crm/Pilotage';
import { Conformite, Journal } from './crm/Conformite';
import { OperationsApi, Overview, Runbooks, Sante, Support } from './operations/Operations';
import { Activite, Cohorts, DirectionApi, EconomicsPage, FunnelPage, Gates, PilotOverview, Risks } from './direction/Direction';
import { EngineeringApi, Files, H00, Integration, Lots, Production, Repo, RepoOverview } from './technique/Technique';

const messages = { app: { fr: 'KÓMBE CRM', en: 'KÓMBE CRM' } } as const;
const PRODUIT = 'KÓMBE CRM';

const SUPPORT: readonly OperatorRole[] = ['support', 'operations'];
const PILOTAGE: readonly OperatorRole[] = ['support', 'operations', 'direction'];
const DIRECTION: readonly OperatorRole[] = ['direction'];
const TECHNIQUE: readonly OperatorRole[] = ['engineering'];
const TOUS: readonly OperatorRole[] = ['support', 'operations', 'direction', 'engineering'];

interface Entree extends NavItem {
  readonly roles: readonly OperatorRole[];
  /** Pages de la passerelle dépôt (poste de développement seulement). */
  readonly gateway?: boolean;
}

/** Navigation complète, par section ; filtrée ensuite selon les fonctions. */
export const ENTREES: readonly Entree[] = [
  { section: 'CRM', path: '/', label: 'Tableau de bord', roles: PILOTAGE },
  { section: 'CRM', path: '/demandes', label: 'Demandes', roles: SUPPORT },
  { section: 'CRM', path: '/comptes', label: 'Comptes', roles: PILOTAGE },
  { section: 'CRM', path: '/contacts', label: 'Contacts', roles: SUPPORT },
  { section: 'CRM', path: '/taches', label: 'Tâches', roles: SUPPORT },
  { section: 'CRM', path: '/segments', label: 'Segments', roles: PILOTAGE },
  { section: 'Opérations', path: '/ops', label: 'Vue d’ensemble', roles: SUPPORT },
  { section: 'Opérations', path: '/ops/acces', label: 'Accès JIT', roles: SUPPORT },
  { section: 'Opérations', path: '/ops/sante', label: 'Santé de l’API', roles: SUPPORT },
  { section: 'Opérations', path: '/ops/runbooks', label: 'Incidents & runbooks', roles: TOUS },
  { section: 'Direction', path: '/direction', label: 'Activité', roles: DIRECTION },
  { section: 'Direction', path: '/direction/pilote', label: 'Pilote', roles: DIRECTION },
  { section: 'Direction', path: '/direction/funnel', label: 'Entonnoir', roles: DIRECTION },
  { section: 'Direction', path: '/direction/cohortes', label: 'Cohortes', roles: DIRECTION },
  { section: 'Direction', path: '/direction/economie', label: 'Économie unitaire', roles: DIRECTION },
  { section: 'Direction', path: '/direction/risques', label: 'Risques', roles: DIRECTION },
  { section: 'Direction', path: '/direction/gates', label: 'Gates d’extension', roles: DIRECTION },
  { section: 'Technique', path: '/technique', label: 'Production', roles: TECHNIQUE },
  { section: 'Technique', path: '/technique/integration', label: 'Intégration', roles: TECHNIQUE },
  { section: 'Technique', path: '/technique/depot', label: 'Dépôt (local)', roles: TECHNIQUE, gateway: true },
  { section: 'Technique', path: '/technique/lots', label: 'Lots', roles: TECHNIQUE, gateway: true },
  { section: 'Technique', path: '/technique/h00', label: 'G-CONSTRUCTION', roles: TECHNIQUE, gateway: true },
  { section: 'Technique', path: '/technique/ci', label: 'CI / workflows', roles: TECHNIQUE, gateway: true },
  { section: 'Technique', path: '/technique/migrations', label: 'Migrations', roles: TECHNIQUE, gateway: true },
  { section: 'Technique', path: '/technique/preuves', label: 'Preuves', roles: TECHNIQUE, gateway: true },
  { section: 'Technique', path: '/technique/provenance', label: 'Provenance', roles: TECHNIQUE, gateway: true },
  { section: 'Gouvernance', path: '/conformite', label: 'Conformité', roles: ['direction', 'admin'] },
  { section: 'Gouvernance', path: '/journal', label: 'Journal d’audit', roles: ['admin'] },
];

/** Une entrée est ouverte si la personne a l'une de ses fonctions ; « admin » ouvre tout. */
export function autorise(roles: readonly OperatorRole[], requis: readonly OperatorRole[]): boolean {
  return roles.includes('admin') || requis.some((r) => roles.includes(r));
}
export function navigationPour(roles: readonly OperatorRole[], gateway: boolean): readonly Entree[] {
  return ENTREES.filter((e) => autorise(roles, e.roles) && (!e.gateway || gateway));
}
/** Chemin → entrée de navigation active (les fiches /demandes/tk_… restent sous « Demandes »). */
export function entreeActive(path: string, nav: readonly Entree[]): Entree | undefined {
  const sans = path.split('?')[0] ?? '/';
  return nav.find((e) => e.path === sans) ?? [...nav].sort((a, b) => b.path.length - a.path.length).find((e) => e.path !== '/' && sans.startsWith(`${e.path}/`));
}
function requete(path: string): URLSearchParams {
  return new URLSearchParams(path.split('?')[1] ?? '');
}

export function App() {
  return <DashboardBoot product={PRODUIT} messages={messages}>{(ctx) => <Console ctx={ctx} />}</DashboardBoot>;
}

function Console({ ctx }: { readonly ctx: DashboardContext }) {
  const { path, navigate } = useHashRoute();
  const badge = (
    <span className="k-hint">
      {ctx.session.phase.kind === 'authenticated' ? ctx.session.phase.identityId : ''}{' '}
      <button type="button" className="k-button k-button-secondary" onClick={ctx.session.logout}>Se déconnecter</button>
    </span>
  );
  return (
    <OperatorGate api={ctx.api}>
      <Espace ctx={ctx} path={path} navigate={navigate} badge={badge} />
    </OperatorGate>
  );
}

function Espace({ ctx, path, navigate, badge }: { readonly ctx: DashboardContext; readonly path: string; readonly navigate: (p: string) => void; readonly badge: ReactNode }) {
  const me = useRemote((s) => ctx.api.get<OperatorMe>('/v1/ops/me', undefined, s), [ctx.api], { isEmpty: () => false });
  return (
    <RemoteState state={me.state} onRetry={me.reload}>{(m) => <Pages ctx={ctx} roles={m.roles ?? []} path={path} navigate={navigate} badge={badge} />}</RemoteState>
  );
}

function Pages({ ctx, roles, path, navigate, badge }: {
  readonly ctx: DashboardContext; readonly roles: readonly OperatorRole[]; readonly path: string; readonly navigate: (p: string) => void; readonly badge: ReactNode;
}) {
  const crm = useMemo(() => new CrmApi(ctx.api), [ctx.api]);
  const ops = useMemo(() => new OperationsApi(ctx.api), [ctx.api]);
  const dir = useMemo(() => new DirectionApi(ctx.api), [ctx.api]);
  const gatewayUrl = ctx.config.engineeringGatewayBaseUrl;
  const repo = useMemo(() => (gatewayUrl ? new EngineeringApi(gatewayUrl) : null), [gatewayUrl]);
  const [jitGid, setJitGid] = useState('');
  const nav = navigationPour(roles, !!repo);
  const active = entreeActive(path, nav);
  const peut = (requis: readonly OperatorRole[]) => autorise(roles, requis);

  const ouvrirDemande = (id: string) => navigate(`/demandes/${id}`);
  const ouvrirCompte = (gid: string) => navigate(`/comptes/${encodeURIComponent(gid)}`);
  const ouvrirContact = (cid: string) => navigate(`/contacts/${cid}`);
  const jit = (gid: string) => { setJitGid(gid); navigate('/ops/acces'); };

  const segs = (path.split('?')[0] ?? '/').split('/').filter(Boolean);
  const q = requete(path);
  let page: ReactNode;
  if (!active) {
    // Page inconnue ou hors de vos fonctions : première page ouverte.
    const premiere = nav[0];
    page = premiere ? (
      <CapabilityNotice title="Page non disponible pour vos fonctions">
        <button type="button" className="k-button k-button-primary" onClick={() => navigate(premiere.path)}>Aller à « {premiere.label} »</button>
      </CapabilityNotice>
    ) : <CapabilityNotice title="Aucune fonction d’opérateur active">Demandez à un administrateur de vous attribuer une fonction (support, opérations, direction, engineering).</CapabilityNotice>;
  } else {
    switch (active.path) {
      case '/': page = <TableauDeBord api={crm} onNavigate={navigate} canTickets={peut(SUPPORT)} />; break;
      case '/demandes': page = segs[1] ? <FicheDemande api={crm} id={segs[1]} onBack={() => navigate('/demandes')} onOpenAccount={ouvrirCompte} onOpenContact={ouvrirContact} />
        : <Demandes key={path} api={crm} onOpen={ouvrirDemande} initial={{ status: q.get('status') ?? 'ouvertes', ...(q.get('assignee') ? { assignee: q.get('assignee') as string } : {}) }} />; break;
      case '/comptes': page = segs[1] && peut(SUPPORT)
        ? <FicheCompte api={crm} groupId={decodeURIComponent(segs[1])} onBack={() => navigate('/comptes')} onOpenTicket={ouvrirDemande} onOpenContact={ouvrirContact} onJit={jit} canJit={peut(SUPPORT)} />
        : <Comptes key={path} api={crm} onOpen={peut(SUPPORT) ? ouvrirCompte : () => undefined} {...(q.get('segment') ? { segment: q.get('segment') as string } : {})} />; break;
      case '/contacts': page = segs[1] ? <FicheContact api={crm} contactId={segs[1]} onBack={() => window.history.back()} onOpenTicket={ouvrirDemande} onOpenAccount={ouvrirCompte} /> : <Contacts api={crm} onOpen={ouvrirContact} />; break;
      case '/taches': page = <Taches api={crm} onOpenTicket={ouvrirDemande} onOpenAccount={ouvrirCompte} />; break;
      case '/segments': page = <Segments api={crm} onOpenAccount={peut(SUPPORT) ? ouvrirCompte : () => undefined} />; break;
      case '/ops': page = <Overview api={ops} onNavigate={navigate} />; break;
      case '/ops/acces': page = <Support api={ops} initialGid={jitGid} />; break;
      case '/ops/sante': page = <Sante api={ops} />; break;
      case '/ops/runbooks': page = <Runbooks />; break;
      case '/direction': page = <Activite api={dir} />; break;
      case '/direction/pilote': page = <PilotOverview api={dir} />; break;
      case '/direction/funnel': page = <FunnelPage api={dir} />; break;
      case '/direction/cohortes': page = <Cohorts api={dir} />; break;
      case '/direction/economie': page = <EconomicsPage api={dir} />; break;
      case '/direction/risques': page = <Risks api={dir} />; break;
      case '/direction/gates': page = <Gates api={dir} />; break;
      case '/technique': page = <Production api={ctx.api} />; break;
      case '/technique/integration': page = <Integration />; break;
      case '/conformite': page = <Conformite api={crm} onOpenTicket={peut(SUPPORT) ? ouvrirDemande : () => undefined} isAdmin={roles.includes('admin')} />; break;
      case '/journal': page = <Journal api={crm} />; break;
      default:
        page = repo ? ({
          '/technique/depot': <RepoOverview api={repo} />,
          '/technique/lots': <Lots api={repo} />,
          '/technique/h00': <H00 api={repo} />,
          '/technique/ci': <Files api={repo} title="CI / workflows" kind="workflows" />,
          '/technique/migrations': <Files api={repo} title="Migrations PostgreSQL" kind="migrations" />,
          '/technique/preuves': <Files api={repo} title="Preuves" kind="evidence" />,
          '/technique/provenance': <Repo api={repo} />,
        } as Record<string, ReactNode>)[active.path] : null;
    }
  }
  return (
    <DashboardShell product={PRODUIT} nav={nav} activePath={active?.path ?? ''} onNavigate={navigate} userBadge={badge} {...(ctx.config.environment ? { environment: ctx.config.environment } : {})}>
      {page}
    </DashboardShell>
  );
}
