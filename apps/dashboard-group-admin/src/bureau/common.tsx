import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { describeError } from '@kombe/dashboard-core';
import type { TontineApi } from '../tontine/client';
import { abilities, type BureauAbilities } from '../tontine/roles';
import { movementStateLabel, type Tone } from '../tontine/format';
import type { GroupOverview, Member, MovementState } from '../tontine/types';

export interface BureauContextValue {
  readonly api: TontineApi;
  readonly groupId: string;
  readonly overview: GroupOverview;
  readonly abilities: BureauAbilities;
  readonly reloadOverview: () => void;
  readonly navigate: (path: string) => void;
}

const Ctx = createContext<BureauContextValue | null>(null);

export function BureauProvider(p: { value: Omit<BureauContextValue, 'abilities'>; children: ReactNode }) {
  const value: BureauContextValue = { ...p.value, abilities: abilities(p.value.overview.me.roles) };
  return <Ctx.Provider value={value}>{p.children}</Ctx.Provider>;
}

export function useBureau(): BureauContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useBureau hors du Bureau');
  return v;
}

/** Retour d'action : succès seulement après la réponse du serveur, refus du serveur affiché tel quel. */
export type Feedback = { readonly kind: 'ok'; readonly text: string } | { readonly kind: 'error'; readonly text: string } | null;

export function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const run = useCallback(async <T,>(key: string, fn: () => Promise<T>, success: string | ((r: T) => string), after?: (r: T) => void): Promise<T | undefined> => {
    setBusy(key);
    setFeedback(null);
    try {
      const r = await fn();
      setFeedback({ kind: 'ok', text: typeof success === 'function' ? success(r) : success });
      after?.(r);
      return r;
    } catch (e) {
      setFeedback({ kind: 'error', text: `Refusé par le serveur : ${describeError(e)}` });
      return undefined;
    } finally {
      setBusy(null);
    }
  }, []);
  return { busy, feedback, run, clear: useCallback(() => setFeedback(null), []) };
}

export function FeedbackLine(p: { feedback: Feedback }) {
  if (!p.feedback) return null;
  return (
    <p className={`b-feedback b-feedback-${p.feedback.kind}`} role={p.feedback.kind === 'error' ? 'alert' : 'status'}>
      {p.feedback.text}
    </p>
  );
}

export function Chip(p: { tone?: Tone; children: ReactNode }) {
  return <span className={`k-chip k-chip-${p.tone ?? 'neutral'}`}>{p.children}</span>;
}

/**
 * Anneau de validation à 3 segments (grammaire de marque) : déclarée →
 * confirmée → validée. La forme n'est jamais seule : le libellé suit.
 */
export function ValidationRing(p: { state: MovementState; kind?: string }) {
  const step = p.state === 'declared' ? 1 : p.state === 'confirmed' ? 2 : p.state === 'validated' || p.state === 'compensated' ? 3 : 0;
  const rejected = p.state === 'rejected';
  const arcs = [
    'M12 3 A9 9 0 0 1 19.79 16.5',
    'M19.79 16.5 A9 9 0 0 1 4.21 16.5',
    'M4.21 16.5 A9 9 0 0 1 12 3',
  ];
  return (
    <span className="b-ring">
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        {arcs.map((d, i) => (
          <path
            key={d}
            d={d}
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            className={rejected ? 'b-ring-rejected' : i < step ? (step === 3 ? 'b-ring-done' : 'b-ring-progress') : 'b-ring-todo'}
          />
        ))}
        {step === 3 && !rejected && <path d="M8 12.5 l2.6 2.6 L16 9.5" fill="none" strokeWidth="2.2" className="b-ring-check" />}
      </svg>
      <span>{movementStateLabel(p.state, p.kind)}</span>
    </span>
  );
}

export function memberName(members: readonly Member[] | undefined, id: string | null | undefined): string {
  if (!id) return '—';
  return members?.find((m) => m.membershipId === id)?.displayName ?? 'Membre';
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* repli ci-dessous */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Bloc « texte à partager » : copie + ouverture WhatsApp, texte visible pour copie manuelle. */
export function ShareBox(p: { title: string; text: string }) {
  const [copied, setCopied] = useState<boolean | null>(null);
  return (
    <div className="b-share">
      <strong>{p.title}</strong>
      <pre className="b-share-text">{p.text}</pre>
      <div className="k-actionbar">
        <button type="button" className="k-button k-button-primary" onClick={() => void copyText(p.text).then(setCopied)}>
          Copier le texte
        </button>
        <a className="k-button k-button-secondary" href={`https://wa.me/?text=${encodeURIComponent(p.text)}`} target="_blank" rel="noreferrer noopener">
          Ouvrir WhatsApp
        </a>
      </div>
      {copied === true && <p className="b-feedback b-feedback-ok" role="status">Texte copié.</p>}
      {copied === false && <p className="b-feedback b-feedback-error" role="alert">Copie impossible : sélectionnez le texte ci-dessus.</p>}
    </div>
  );
}

export function Gate(p: { allowed: boolean; children: ReactNode }) {
  return p.allowed ? <>{p.children}</> : null;
}

export function Note(p: { children: ReactNode }) {
  return <p className="k-hint b-note">{p.children}</p>;
}

export function Spacer() {
  return <div style={{ height: 16 }} />;
}
