import type { ReactNode } from 'react';
import type { ApiClient } from '../api/client';
import { useRemote } from '../hooks/useRemote';
import { CapabilityNotice } from './Elements';
import { RemoteState } from './RemoteState';

/** Console de la plateforme : réservée aux OPÉRATEURS (le serveur tranche,
 *  403 sinon). Un compte non opérateur reçoit l'explication exacte, jamais
 *  une page vide ni des chiffres de démonstration. */
export function OperatorGate(p: { readonly api: ApiClient; readonly children: ReactNode }) {
  const me = useRemote((s) => p.api.get<{ identityId: string; operator: boolean }>('/v1/ops/me', undefined, s), [p.api], { isEmpty: () => false });
  return (
    <RemoteState state={me.state} onRetry={me.reload}>
      {(m) => m.operator ? <>{p.children}</> : (
        <CapabilityNotice title="Accès réservé aux opérateurs de la plateforme">
          Le compte <span className="k-code">{m.identityId}</span> est bien connecté, mais il n’a pas la fonction d’opérateur.
          Elle s’accorde par un acte d’administration sur la base de production :{' '}
          <code>node packages/db/scripts/grant-operator.mjs {m.identityId}</code> (voir DEPLOY.md). Rechargez ensuite la page.
        </CapabilityNotice>
      )}
    </RemoteState>
  );
}
