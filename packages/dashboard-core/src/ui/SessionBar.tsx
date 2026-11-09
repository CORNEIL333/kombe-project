import { useEffect, useState, type FormEvent } from 'react';
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
  // Le serveur ne renvoie pas de nouveau code avant 45 s : compte à rebours visible.
  const [renvoi, setRenvoi] = useState(0);
  useEffect(() => { if (session.phase.kind === 'code_sent') setRenvoi(45); }, [session.phase.kind]);
  useEffect(() => { if (renvoi <= 0) return; const t = window.setTimeout(() => setRenvoi(n => n - 1), 1000); return () => window.clearTimeout(t); }, [renvoi]);
  function submitLogin(e: FormEvent) { e.preventDefault(); if (login.trim()) void session.begin(login.trim()); }
  function submitCode(e: FormEvent) { e.preventDefault(); if (/^\d{6}$/.test(code.trim())) void session.confirm(code.trim()); }
  if (session.phase.kind === 'authenticated') {
    const expiry = new Date(session.phase.session.expiresAt);
    return <div className="k-session-authenticated" role="status"><StatusChip status="Connecté" tone="ok"/><span>{session.phase.displayName ?? session.phase.identityId}</span><span className="k-hint">jusqu’à {Number.isNaN(expiry.getTime()) ? '—' : expiry.toLocaleString('fr-FR')}</span><button type="button" className="k-button k-button-secondary" onClick={session.logout}>Se déconnecter</button></div>;
  }
  return <Panel title={p.title ?? 'Connexion'}>
    <p className="k-hint">Même compte que l’application KÓMBE. Pas de mot de passe : un code à 6 chiffres vous est envoyé. Première fois ? Le premier code crée votre compte. Les droits affichés sont ceux que le serveur vous reconnaît.</p>
    {session.phase.kind === 'anonymous'
      ? <form onSubmit={submitLogin} className="k-grid"><div className="k-span-8"><Field label="Adresse e-mail ou numéro de téléphone" hint="Exemple : awa@exemple.cm ou 6 77 12 34 56" inputProps={{ value: login, onChange: e => setLogin(e.target.value), required: true, maxLength: 120, autoComplete: 'username', inputMode: 'text', autoCapitalize: 'none' }} /></div><div className="k-span-4" style={{ alignSelf: 'end', paddingBottom: 14 }}><SubmitButton busy={session.busy}>Recevoir le code</SubmitButton></div></form>
      : <form onSubmit={submitCode} className="k-grid"><div className="k-span-8"><Field label="Code à 6 chiffres" hint={session.phase.devCode ? `Code envoyé à ${session.phase.identityId} — code de test (développement) : ${session.phase.devCode}` : `Code envoyé à ${session.phase.identityId}`} inputProps={{ value: code, onChange: e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6)), required: true, inputMode: 'numeric', autoComplete: 'one-time-code' }} /></div><div className="k-span-4" style={{ alignSelf: 'end', paddingBottom: 14 }}><SubmitButton busy={session.busy}>Ouvrir la session</SubmitButton></div><div className="k-span-12" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="button" className="k-button k-button-secondary" disabled={session.busy || renvoi > 0} onClick={() => { if (session.phase.kind === 'code_sent') { void session.begin(session.phase.identityId); setRenvoi(45); } }}>{renvoi > 0 ? `Renvoyer le code (dans ${renvoi} s)` : 'Renvoyer le code'}</button><button type="button" className="k-button k-button-secondary" onClick={() => { setCode(''); session.restart(); }}>Changer d’identifiant</button></div></form>}
    {session.error && <p className="k-field-error" role="alert">{session.error}</p>}
  </Panel>;
}
