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

function Gate(p: { readonly product: string; readonly config: RuntimeConfig; readonly children: (ctx: DashboardContext) => ReactNode }) {
  const access = useMemo(() => new AccessApi(new ApiClient({ baseUrl: p.config.apiBaseUrl })), [p.config.apiBaseUrl]);
  const session = useSession(access);
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = session.token;
  const api = useMemo(() => new ApiClient({ baseUrl: p.config.apiBaseUrl, getSessionToken: () => tokenRef.current }), [p.config.apiBaseUrl]);
  if (session.phase.kind !== 'authenticated') {
    return (
      <main className="k-boot">
        <div className="k-boot-card">
          <BrandMark />
          <h1 className="k-boot-title">{p.product}</h1>
          <SessionBar session={session} />
        </div>
      </main>
    );
  }
  return <>{p.children({ api, session, config: p.config })}</>;
}
