import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiClient } from '../api/client';
import { AccessApi, useSession, type SessionController } from '../api/session';
import { loadRuntimeConfig, type DashboardRuntimeConfig as RuntimeConfig } from '../config/runtime';
import { LocaleProvider } from '../i18n/locale';
import { CapabilityNotice } from './Elements';
import { SessionBar } from './SessionBar';
import { BrandMark } from './Elements';

export interface DashboardContext {
  /** Client réel portant la session courante (Bearer) sur chaque requête. */
  readonly api: ApiClient;
  readonly session: SessionController;
  readonly config: RuntimeConfig;
}

/** Démarrage commun des tableaux de bord : configuration servie →
 *  connexion par téléphone/e-mail → contenu. Rien n'est affiché comme donnée
 *  tant que le serveur n'a pas répondu ; aucune donnée locale n'est injectée. */
export function DashboardBoot(p: {
  readonly product: string;
  readonly messages: Parameters<typeof LocaleProvider>[0]['messages'];
  readonly children: (ctx: DashboardContext) => ReactNode;
}) {
  const [config, setConfig] = useState<RuntimeConfig | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => { loadRuntimeConfig().then(setConfig).catch(setError); }, []);
  if (error) return <main className="k-boot"><CapabilityNotice title="Configuration API absente">{error instanceof Error ? error.message : String(error)}</CapabilityNotice></main>;
  if (!config) return <main className="k-boot"><div className="k-skeleton-stack" role="status" aria-label="Chargement"><span className="k-skeleton" /></div></main>;
  return <LocaleProvider messages={p.messages}><Gate product={p.product} config={config}>{p.children}</Gate></LocaleProvider>;
}

/* Scène d'accueil par espace : photo d'ambiance (illustration, décorative),
   une phrase Manrope + une phrase Newsreader. Aucune donnée affichée. */
interface Hero { readonly photo: string; readonly title: string; readonly accent: string; readonly lead: string }
const HERO_DEFAUT: Hero = { photo: 'cercle-vue-dessus', title: 'Votre tontine,', accent: 'plus claire.', lead: 'Les mêmes données que l’application, sur grand écran.' };
const HEROS: Readonly<Record<string, Hero>> = {
  'Espace bureau': { photo: 'tresoriere', title: 'Le registre du bureau,', accent: 'sans zone d’ombre.', lead: 'Collecte en lot, procès-verbaux, votes et registre chaîné : les mêmes données que l’application des membres, pensées pour le grand écran.' },
  'Opérations & Support': { photo: 'mains-telephone', title: 'Chaque groupe', accent: 'bien accompagné.', lead: 'Console des opérateurs de la plateforme : santé du service, demandes d’aide et suivi des groupes.' },
  'Direction & Analytics': { photo: 'decision', title: 'Décider sur des faits,', accent: 'pas sur des impressions.', lead: 'Activité réelle du pilote, entonnoir, cohortes et risques — uniquement des mesures servies par l’API.' },
  Engineering: { photo: 'quartier', title: 'Un registre fiable,', accent: 'de bout en bout.', lead: 'État du service, qualité et passerelle dépôt pour l’équipe technique.' },
};

function Gate(p: { readonly product: string; readonly config: RuntimeConfig; readonly children: (ctx: DashboardContext) => ReactNode }) {
  const access = useMemo(() => new AccessApi(new ApiClient({ baseUrl: p.config.apiBaseUrl })), [p.config.apiBaseUrl]);
  const session = useSession(access);
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = session.token;
  const api = useMemo(() => new ApiClient({ baseUrl: p.config.apiBaseUrl, getSessionToken: () => tokenRef.current }), [p.config.apiBaseUrl]);
  if (session.phase.kind !== 'authenticated') {
    const hero = HEROS[p.product] ?? HERO_DEFAUT;
    return (
      <main className="k-boot k-boot--immersive">
        <section className="k-boot-hero">
          <img className="k-boot-photo" src={`/brand/photos/${hero.photo}.webp`} alt="" aria-hidden="true" decoding="async" />
          <span className="k-boot-veil" aria-hidden="true" />
          <svg className="k-boot-orbits" viewBox="0 0 400 400" aria-hidden="true" focusable="false">
            <circle cx="200" cy="200" r="150" />
            <circle cx="200" cy="200" r="196" />
            <circle className="k-boot-orbits__node" cx="200" cy="50" r="7" />
          </svg>
          <BrandMark />
          <div className="k-boot-hero-body">
            <p className="k-eyebrow">{p.product}</p>
            <h1 className="k-boot-title">{hero.title} <em>{hero.accent}</em></h1>
            <p className="k-boot-lead">{hero.lead}</p>
          </div>
        </section>
        <div className="k-boot-card">
          <SessionBar session={session} />
          <p className="k-boot-note">KÓMBE tient le registre ; l’argent reste chez le trésorier du groupe.</p>
        </div>
      </main>
    );
  }
  return <>{p.children({ api, session, config: p.config })}</>;
}
