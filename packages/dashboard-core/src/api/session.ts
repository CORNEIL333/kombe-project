import { useCallback, useEffect, useState } from 'react';
import type { ApiClient } from './client';

/** Session réelle KÓMBE : `sessionId` opaque généré SERVEUR, porté en
 *  `Authorization: Bearer`, jamais un JWT, jamais dérivé côté client. */
export interface KombeSession { readonly sessionId: string; readonly expiresAt: number }
export type SessionPhase =
  | { readonly kind: 'anonymous' }
  | { readonly kind: 'code_sent'; readonly identityId: string; readonly devCode?: string }
  | { readonly kind: 'authenticated'; readonly identityId: string; readonly session: KombeSession; readonly displayName?: string };

interface CodeRequestResult { readonly accepted: true; readonly login: string; readonly channel: string; readonly devCode?: string }
interface CodeVerificationResult { readonly sessionId: string; readonly expiresAt: number; readonly identityId: string }

/** Connexion unique de la plateforme (L-01) : téléphone (+237…) ou e-mail →
 *  code à 6 chiffres → session. Mêmes routes que la PWA (`/v1/auth/*`) : un
 *  membre du bureau se connecte au tableau de bord avec son numéro. Le serveur
 *  ne révèle jamais si le compte existe. */
export class AccessApi {
  constructor(private readonly api: ApiClient) {}
  requestLogin(login: string) {
    return this.api.post<CodeRequestResult>('/v1/auth/code-requests', { login }, { 'idempotency-key': cle() });
  }
  async completeLogin(login: string, code: string): Promise<KombeSession & { identityId: string }> {
    const r = await this.api.post<CodeVerificationResult>('/v1/auth/code-verifications', { login, code }, { 'idempotency-key': cle() });
    return { sessionId: r.sessionId, expiresAt: r.expiresAt, identityId: r.identityId };
  }
  /** Nom affiché de la personne connectée (jamais bloquant). */
  async displayName(token: string): Promise<string | undefined> {
    try {
      const me = await this.api.request<{ displayName?: string | null }>('/v1/me', { method: 'GET', headers: { authorization: `Bearer ${token}` } });
      return me.displayName ?? undefined;
    } catch { return undefined; }
  }
  logout(token: string) {
    return this.api.request<void>('/v1/auth/logout', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: '{}' });
  }
}

function cle(): string {
  const c = globalThis.crypto;
  return c && typeof c.randomUUID === 'function' ? c.randomUUID() : `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export interface SessionController {
  readonly phase: SessionPhase;
  readonly busy: boolean;
  readonly error: string | null;
  readonly token: string | null;
  begin(login: string): Promise<void>;
  confirm(code: string): Promise<void>;
  /** Revenir à la saisie de l'identifiant (autre numéro ou adresse). */
  restart(): void;
  logout(): void;
  dismissError(): void;
}

const STORAGE_KEY = 'kombe.dashboard.session';

/** Session gardée pour l'onglet (sessionStorage) : un rechargement ne
 *  déconnecte pas ; fermer l'onglet, si. Toute erreur de stockage est ignorée. */
function restore(): SessionPhase {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { kind: 'anonymous' };
    const p = JSON.parse(raw) as { identityId?: unknown; sessionId?: unknown; expiresAt?: unknown; displayName?: unknown };
    if (typeof p.identityId === 'string' && typeof p.sessionId === 'string' && typeof p.expiresAt === 'number' && p.expiresAt > Date.now()) {
      return { kind: 'authenticated', identityId: p.identityId, session: { sessionId: p.sessionId, expiresAt: p.expiresAt }, ...(typeof p.displayName === 'string' ? { displayName: p.displayName } : {}) };
    }
  } catch { /* stockage indisponible */ }
  // Même origine que l'application des membres : on reprend sa session
  // (« kombe.session ») au lieu de redemander un code.
  try {
    const raw = window.localStorage.getItem('kombe.session');
    if (raw) {
      const p = JSON.parse(raw) as { identityId?: unknown; sessionId?: unknown; expiresAt?: unknown };
      if (typeof p.identityId === 'string' && typeof p.sessionId === 'string' && typeof p.expiresAt === 'number' && p.expiresAt > Date.now()) {
        return { kind: 'authenticated', identityId: p.identityId, session: { sessionId: p.sessionId, expiresAt: p.expiresAt } };
      }
    }
  } catch { /* stockage indisponible */ }
  return { kind: 'anonymous' };
}

function persist(phase: SessionPhase): void {
  try {
    if (phase.kind === 'authenticated') window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ identityId: phase.identityId, ...phase.session, ...(phase.displayName ? { displayName: phase.displayName } : {}) }));
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* stockage indisponible */ }
}

/** Machine à états du flux de connexion. `token` est lu à chaque requête par
 *  l'`ApiClient` (getSessionToken) — il reflète toujours la phase courante. */
export function useSession(access: AccessApi): SessionController {
  const [phase, setPhase] = useState<SessionPhase>(restore);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { persist(phase); }, [phase]);
  const begin = useCallback(async (login: string) => {
    setBusy(true); setError(null);
    try {
      const r = await access.requestLogin(login);
      setPhase({ kind: 'code_sent', identityId: r.login, ...(r.devCode ? { devCode: r.devCode } : {}) });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }, [access]);
  const confirm = useCallback(async (code: string) => {
    if (phase.kind !== 'code_sent') return;
    setBusy(true); setError(null);
    try {
      const s = await access.completeLogin(phase.identityId, code);
      const displayName = await access.displayName(s.sessionId);
      setPhase({ kind: 'authenticated', identityId: s.identityId, session: { sessionId: s.sessionId, expiresAt: s.expiresAt }, ...(displayName ? { displayName } : {}) });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }, [access, phase]);
  const logout = useCallback(() => {
    if (phase.kind === 'authenticated') void access.logout(phase.session.sessionId).catch(() => undefined);
    // La session est partagée avec l'application des membres : on l'oublie aussi.
    try { window.localStorage.removeItem('kombe.session'); } catch { /* stockage indisponible */ }
    setPhase({ kind: 'anonymous' }); setError(null);
  }, [access, phase]);
  const dismissError = useCallback(() => setError(null), []);
  const restart = useCallback(() => { setPhase({ kind: 'anonymous' }); setError(null); }, []);
  const token = phase.kind === 'authenticated' ? phase.session.sessionId : null;
  return { phase, busy, error, token, begin, confirm, restart, logout, dismissError };
}
