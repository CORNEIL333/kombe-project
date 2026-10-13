import { useState, type FormEvent } from 'react';
import { Field, SubmitButton } from './Forms';
import { Panel, StatusChip } from './Elements';
import type { SessionController } from '../api/session';

/** Barre de session partagée par tous les tableaux de bord : numéro de
 *  téléphone (ou e-mail) → code à 6 chiffres → session Bearer réelle.
 *  L'identité et les droits sont tranchés côté serveur. */
export function SessionBar(p: { session: SessionController; title?: string }) {
  const [login, setLogin] = useState('');
  const [code, setCode] = useState('');
  const { session } = p;
  function submitLogin(e: FormEvent) { e.preventDefault(); if (login.trim()) void session.begin(login.trim()); }
  function submitCode(e: FormEvent) { e.preventDefault(); if (/^\d{6}$/.test(code.trim())) void session.confirm(code.trim()); }
  if (session.phase.kind === 'authenticated') {
    const expiry = new Date(session.phase.session.expiresAt);
    return <div className="k-session-authenticated" role="status"><StatusChip status="Connecté" tone="ok"/><span className="k-code">{session.phase.identityId}</span><span className="k-hint">jusqu’à {Number.isNaN(expiry.getTime()) ? '—' : expiry.toLocaleString('fr-FR')}</span><button type="button" className="k-button k-button-secondary" onClick={session.logout}>Se déconnecter</button></div>;
  }
  return <Panel title={p.title ?? 'Connexion'}>
    <p className="k-hint">Pas de mot de passe : un code à 6 chiffres est envoyé par SMS (ou par e-mail). Les droits affichés sont ceux que le serveur vous reconnaît.</p>
    {session.phase.kind === 'anonymous'
      ? <form onSubmit={submitLogin} className="k-grid"><div className="k-span-8"><Field label="Téléphone ou e-mail" hint="Exemple : 6 77 12 34 56" inputProps={{ value: login, onChange: e => setLogin(e.target.value), required: true, maxLength: 120, autoComplete: 'username', inputMode: 'email' }} /></div><div className="k-span-4" style={{ alignSelf: 'end', paddingBottom: 14 }}><SubmitButton busy={session.busy}>Recevoir le code</SubmitButton></div></form>
      : <form onSubmit={submitCode} className="k-grid"><div className="k-span-8"><Field label="Code à 6 chiffres" hint={session.phase.devCode ? `Code envoyé à ${session.phase.identityId} — code de test (développement) : ${session.phase.devCode}` : `Code envoyé à ${session.phase.identityId}`} inputProps={{ value: code, onChange: e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6)), required: true, inputMode: 'numeric', autoComplete: 'one-time-code' }} /></div><div className="k-span-4" style={{ alignSelf: 'end', paddingBottom: 14 }}><SubmitButton busy={session.busy}>Ouvrir la session</SubmitButton></div></form>}
    {session.error && <p className="k-field-error" role="alert">{session.error}</p>}
  </Panel>;
}
