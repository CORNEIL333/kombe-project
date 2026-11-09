import { useState, type FormEvent, type ReactNode } from 'react';
import { ApiError, type ApiClient } from '../api/client';
import { useRemote } from '../hooks/useRemote';
import { CapabilityNotice, Panel } from './Elements';
import { Field, SubmitButton } from './Forms';
import { RemoteState } from './RemoteState';

/** Fonctions d'opérateur (ADR-0043) ; « admin » ouvre toutes les consoles. */
export type OperatorRole = 'support' | 'operations' | 'direction' | 'engineering' | 'admin';

export interface OperatorMe {
  readonly identityId: string;
  readonly operator: boolean;
  readonly roles?: readonly OperatorRole[];
  readonly mfa?: { readonly required: boolean; readonly enrolled: boolean; readonly verified: boolean };
}

const ROLE_LABEL: Readonly<Record<OperatorRole, string>> = {
  support: 'Support',
  operations: 'Opérations',
  direction: 'Direction',
  engineering: 'Engineering',
  admin: 'Administration',
};

/** Message lisible d'un refus du serveur sur les routes du second facteur. */
export function mfaErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 429 || e.code === 'AUTH_THROTTLED') return 'Trop d’essais. Patientez une dizaine de minutes avant de réessayer.';
    if (e.code === 'TOKEN_INVALID' || e.status === 400 || e.status === 422) return 'Code incorrect. Vérifiez l’heure de votre téléphone et saisissez le code affiché maintenant.';
    if (e.code === 'OPERATOR_MFA_REQUIRED') return 'Vérifiez d’abord le second facteur déjà actif.';
    if (e.status === 401) return 'Session expirée : reconnectez-vous.';
  }
  return 'Le serveur n’a pas pu traiter la demande. Réessayez.';
}

/** Console de la plateforme : réservée aux OPÉRATEURS tenant la bonne fonction,
 *  second facteur (TOTP) activé et vérifié pour la session. Le serveur tranche
 *  (403 sinon) ; cette porte n'explique que ce qui manque, jamais une page
 *  vide ni des chiffres de démonstration. */
export function OperatorGate(p: { readonly api: ApiClient; readonly roles?: readonly OperatorRole[]; readonly children: ReactNode }) {
  const me = useRemote((s) => p.api.get<OperatorMe>('/v1/ops/me', undefined, s), [p.api], { isEmpty: () => false });
  return (
    <RemoteState state={me.state} onRetry={me.reload}>
      {(m) => {
        if (!m.operator) {
          return (
            <CapabilityNotice title="Accès réservé aux opérateurs de la plateforme">
              Votre compte (<span className="k-code">{m.identityId}</span>) est bien connecté, mais il n’a pas la fonction d’opérateur de la plateforme.
              Cette console sert à l’équipe KÓMBE ; les responsables d’une tontine utilisent l’Espace bureau. Si vous faites partie de l’équipe, demandez à un administrateur d’activer votre accès, puis rechargez la page.
            </CapabilityNotice>
          );
        }
        const roles = m.roles ?? [];
        if (p.roles && p.roles.length > 0 && roles.length > 0 && !roles.includes('admin') && !p.roles.some((r) => roles.includes(r))) {
          return (
            <CapabilityNotice title="Cette console demande une autre fonction">
              Fonction requise : {p.roles.map((r) => ROLE_LABEL[r]).join(' ou ')}. Vos fonctions : {roles.map((r) => ROLE_LABEL[r]).join(', ')}.
              Demandez à un administrateur de vous l’attribuer si votre travail l’exige (moindre privilège).
            </CapabilityNotice>
          );
        }
        const mfa = m.mfa;
        if (mfa?.required && !mfa.enrolled) return <MfaEnrollment api={p.api} onDone={me.reload} />;
        if (mfa?.required && !mfa.verified) return <MfaVerification api={p.api} onDone={me.reload} />;
        return <>{p.children}</>;
      }}
    </RemoteState>
  );
}

function groupBy4(secret: string): string {
  return secret.replace(/(.{4})/g, '$1 ').trim();
}

/** Inscription : secret montré UNE fois, activation par un premier code, puis
 *  codes de secours montrés UNE fois. */
function MfaEnrollment(p: { readonly api: ApiClient; readonly onDone: () => void }) {
  const [enrollment, setEnrollment] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [recovery, setRecovery] = useState<readonly string[] | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true); setError(null);
    try { setEnrollment(await p.api.post<{ secret: string; otpauthUri: string }>('/v1/ops/mfa/enrollment')); }
    catch (e) { setError(mfaErrorMessage(e)); }
    finally { setBusy(false); }
  }
  async function activate(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true); setError(null);
    try { setRecovery((await p.api.post<{ recoveryCodes: string[] }>('/v1/ops/mfa/activation', { code: code.replace(/\s/g, '') })).recoveryCodes); }
    catch (e) { setError(mfaErrorMessage(e)); }
    finally { setBusy(false); }
  }

  if (recovery) {
    return (
      <Panel title="Second facteur activé">
        <p>Notez ces codes de secours et rangez-les hors de l’ordinateur. Chacun ne sert qu’une fois, si vous perdez votre téléphone. Ils ne seront plus jamais affichés.</p>
        <ul className="k-code-list" aria-label="Codes de secours">{recovery.map((c) => <li key={c}><code>{c}</code></li>)}</ul>
        <button type="button" className="k-button k-button-primary" onClick={p.onDone}>J’ai noté mes codes, continuer</button>
      </Panel>
    );
  }
  if (!enrollment) {
    return (
      <Panel title="Activez le second facteur">
        <p>Les consoles de la plateforme exigent un code à 6 chiffres en plus de votre connexion. Installez une application d’authentification (Google Authenticator, Microsoft Authenticator, Aegis, 2FAS…) sur votre téléphone, puis commencez.</p>
        {error && <p className="k-field-error" role="alert">{error}</p>}
        <button type="button" className="k-button k-button-primary" onClick={start} disabled={busy}>{busy ? 'Traitement…' : 'Commencer'}</button>
      </Panel>
    );
  }
  return (
    <Panel title="Ajoutez KÓMBE à votre application">
      <ol>
        <li>Dans l’application, choisissez « Saisir une clé de configuration ». Nom du compte : KÓMBE. Clé :
          <p><code className="k-code" aria-label="Clé secrète">{groupBy4(enrollment.secret)}</code></p>
          Sur le téléphone lui-même, vous pouvez aussi <a href={enrollment.otpauthUri}>ouvrir ce lien</a>.
        </li>
        <li>Saisissez le code à 6 chiffres affiché par l’application.</li>
      </ol>
      <form onSubmit={activate} noValidate>
        <Field label="Code à 6 chiffres" {...(error ? { error } : {})} inputProps={{ value: code, onChange: (e) => setCode(e.target.value), inputMode: 'numeric', autoComplete: 'one-time-code', pattern: '[0-9 ]*', maxLength: 7, required: true }} />
        <SubmitButton busy={busy}>Activer</SubmitButton>
      </form>
    </Panel>
  );
}

/** Vérification pour la session (12 h) : code TOTP, ou code de secours. */
function MfaVerification(p: { readonly api: ApiClient; readonly onDone: () => void }) {
  const [secours, setSecours] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true); setError(null);
    try {
      const v = value.trim();
      await p.api.post('/v1/ops/mfa/verification', secours ? { recoveryCode: v } : { code: v.replace(/\s/g, '') });
      p.onDone();
    } catch (e) { setError(mfaErrorMessage(e)); }
    finally { setBusy(false); }
  }
  return (
    <Panel title="Code du second facteur">
      <p>{secours ? 'Saisissez l’un de vos codes de secours. Il ne servira plus ensuite.' : 'Saisissez le code à 6 chiffres affiché par votre application d’authentification.'}</p>
      <form onSubmit={submit} noValidate>
        <Field
          label={secours ? 'Code de secours' : 'Code à 6 chiffres'}
          {...(error ? { error } : {})}
          inputProps={secours
            ? { value, onChange: (e) => setValue(e.target.value), autoComplete: 'off', maxLength: 20, required: true }
            : { value, onChange: (e) => setValue(e.target.value), inputMode: 'numeric', autoComplete: 'one-time-code', pattern: '[0-9 ]*', maxLength: 7, required: true }}
        />
        <SubmitButton busy={busy}>Vérifier</SubmitButton>
      </form>
      <button type="button" className="k-button k-button-secondary" onClick={() => { setSecours(!secours); setValue(''); setError(null); }}>
        {secours ? 'Utiliser le code de l’application' : 'Téléphone perdu ? Utiliser un code de secours'}
      </button>
    </Panel>
  );
}
