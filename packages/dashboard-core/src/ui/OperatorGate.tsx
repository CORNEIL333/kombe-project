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
          Votre compte (<span className="k-code">{m.identityId}</span>) est bien connecté, mais il n’a pas la fonction d’opérateur de la plateforme.
          Cette console sert à l’équipe KÓMBE ; les responsables d’une tontine utilisent l’Espace bureau. Si vous faites partie de l’équipe, demandez à un administrateur d’activer votre accès, puis rechargez la page.
        </CapabilityNotice>
      )}
    </RemoteState>
  );
}
