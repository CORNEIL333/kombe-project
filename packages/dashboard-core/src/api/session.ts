import { useCallback, useState } from 'react';
import type { ApiClient } from './client';

/** Session réelle KÓMBE (ADR-0024) : `sessionId` opaque généré SERVEUR, porté
 *  en `Authorization: Bearer`, jamais un JWT, jamais dérivé côté client. */
export interface KombeSession { readonly sessionId: string; readonly expiresAt: number }
export type SessionPhase =
  | { readonly kind: 'anonymous' }
  | { readonly kind: 'code_sent'; readonly identityId: string }
  | { readonly kind: 'authenticated'; readonly identityId: string; readonly session: KombeSession };

/** Flux de connexion hors-bande (C02) : le serveur émet un code sur le canal
 *  de l'identité ; le client ne fournit que identityId + code, jamais de mot
 *  de passe. Les deux appels sont réels — aucun état fabriqué. */
export class AccessApi {
  constructor(private readonly api: ApiClient) {}
  requestLogin(identityId: string) { return this.api.post<{ accepted: true }>('/v1/access/login-requests', { identityId }); }
  completeLogin(identityId: string, code: string) { return this.api.post<KombeSession>('/v1/access/login-completions', { identityId, code }); }
}

export interface SessionController {
  readonly phase: SessionPhase;
  readonly busy: boolean;
  readonly error: string | null;
  readonly token: string | null;
  begin(identityId: string): Promise<void>;
  confirm(code: string): Promise<void>;
  logout(): void;
  dismissError(): void;
}

/** Machine à états minimale du flux C02. `token` est lu à chaque requête par
 *  l'`ApiClient` (getSessionToken) — il reflète toujours la phase courante. */
export function useSession(access: AccessApi): SessionController {
  const [phase, setPhase] = useState<SessionPhase>({ kind: 'anonymous' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const begin = useCallback(async (identityId: string) => {
    setBusy(true); setError(null);
    try { await access.requestLogin(identityId); setPhase({ kind: 'code_sent', identityId }); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }, [access]);
  const confirm = useCallback(async (code: string) => {
    if (phase.kind !== 'code_sent') return;
    setBusy(true); setError(null);
    try { const session = await access.completeLogin(phase.identityId, code); setPhase({ kind: 'authenticated', identityId: phase.identityId, session }); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }, [access, phase]);
  const logout = useCallback(() => { setPhase({ kind: 'anonymous' }); setError(null); }, []);
  const dismissError = useCallback(() => setError(null), []);
  const token = phase.kind === 'authenticated' ? phase.session.sessionId : null;
  return { phase, busy, error, token, begin, confirm, logout, dismissError };
}
