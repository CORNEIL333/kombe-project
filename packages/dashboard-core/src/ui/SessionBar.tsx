import { useState, type FormEvent } from 'react';
import { Field, SubmitButton } from './Forms';
import { Panel, StatusChip } from './Elements';
import type { SessionController } from '../api/session';

/** Barre de session C02 partagée par tous les dashboards : identifiant → code
 *  hors-bande → session Bearer réelle. Remplace l'ancien `x-actor` saisi à la
 *  main (interdit en mode réel, §8) — l'identité est tranchée côté serveur. */
export function SessionBar(p: { session: SessionController }) {
  const [identityId, setIdentityId] = useState('');
  const [code, setCode] = useState('');
  const { session } = p;
  function submitIdentity(e: FormEvent) { e.preventDefault(); if (identityId.trim()) void session.begin(identityId.trim()); }
  function submitCode(e: FormEvent) { e.preventDefault(); if (code.trim()) void session.confirm(code.trim()); }
  if (session.phase.kind === 'authenticated') {
    const expiry = new Date(session.phase.session.expiresAt);
    return <Panel title="Session"><div className="k-session-authenticated"><StatusChip status="Connecté" tone="ok"/><span className="k-code">{session.phase.identityId}</span><span className="k-hint">expire {Number.isNaN(expiry.getTime()) ? '—' : expiry.toLocaleString()}</span><button type="button" className="k-button k-button-secondary" onClick={session.logout}>Fermer la session</button></div></Panel>;
  }
  return <Panel title="Connexion (session réelle C02)">
    <p className="k-hint">Pas de mot de passe : le serveur envoie un code sur le canal de l'identité (hors-bande). L'identité et le rôle sont résolus côté serveur sous <code>Authorization: Bearer</code> — aucun <code>x-actor</code> n'est transmis.</p>
    {session.phase.kind === 'anonymous' ? <form onSubmit={submitIdentity} className="k-grid"><div className="k-span-8"><Field label="Identité (identityId)" inputProps={{ value: identityId, onChange: e => setIdentityId(e.target.value), required: true, maxLength: 120, autoComplete: 'off' }} /></div><div className="k-span-4" style={{ alignSelf: 'end', paddingBottom: 14 }}><SubmitButton busy={session.busy}>Recevoir le code</SubmitButton></div></form>
      : <form onSubmit={submitCode} className="k-grid"><div className="k-span-8"><Field label="Code de connexion" hint={`Code envoyé pour ${session.phase.identityId}`} inputProps={{ value: code, onChange: e => setCode(e.target.value), required: true, maxLength: 20, autoComplete: 'off' }} /></div><div className="k-span-4" style={{ alignSelf: 'end', paddingBottom: 14 }}><SubmitButton busy={session.busy}>Ouvrir la session</SubmitButton></div></form>}
    {session.error && <p className="k-field-error" role="alert">{session.error}</p>}
  </Panel>;
}
