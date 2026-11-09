/* KÓMBE CRM — briques communes aux pages : puces d'état, de priorité et de
   délai de service, notes internes, liste de tâches. */
import { useState, type FormEvent } from 'react';
import { ApiError, StatusChip, SubmitButton, TextAreaField, formatServerDate } from '@kombe/dashboard-core';
import { LIBELLE_STATUT, type Note, type Statut, type TaskLite, type Ticket } from './api';

export const date = (v: string | null | undefined): string => (v ? formatServerDate(v) : '—');

/** Message lisible d'un refus du serveur (jamais un détail technique). */
export function errText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 409) return 'La fiche a changé entre-temps : rechargez-la, puis recommencez.';
    if (e.status === 403) return 'Votre fonction d’opérateur ne permet pas cette action.';
    if (e.status === 404) return 'Introuvable (ou hors de votre périmètre).';
    if (e.status === 422 || e.status === 400) return 'Saisie refusée : vérifiez les champs.';
    return e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

const TON_STATUT: Readonly<Record<Statut, 'ok' | 'warn' | 'danger' | 'neutral'>> = {
  nouveau: 'warn',
  en_cours: 'neutral',
  attente_membre: 'neutral',
  resolu: 'ok',
  ferme: 'neutral',
};
export function StatutChip({ statut }: { readonly statut: Statut }) {
  return <StatusChip status={LIBELLE_STATUT[statut]} tone={TON_STATUT[statut]} />;
}
export function PrioriteChip({ p }: { readonly p: number }) {
  return <StatusChip status={`P${p}`} tone={p === 1 ? 'danger' : p === 2 ? 'warn' : 'neutral'} />;
}
/** Délai de service : dépassé (rouge), à tenir (échéance), tenu (vert). */
export function SlaChip({ t }: { readonly t: Ticket }) {
  const ouvert = t.status === 'nouveau' || t.status === 'en_cours' || t.status === 'attente_membre';
  if (t.sla.firstResponseBreached && !t.firstResponseAt) return <StatusChip status="Réponse en retard" tone="danger" />;
  if (t.sla.resolutionBreached && ouvert) return <StatusChip status="Résolution en retard" tone="danger" />;
  if (!ouvert) return <StatusChip status={t.sla.resolutionBreached ? 'Résolue hors délai' : 'Dans les délais'} tone={t.sla.resolutionBreached ? 'warn' : 'ok'} />;
  return <span className="k-hint">{t.firstResponseAt ? `Résolution avant ${date(t.resolutionDue)}` : `Réponse avant ${date(t.firstResponseDue)}`}</span>;
}

export function NotesPanel({ notes, onAdd }: { readonly notes: readonly Note[]; readonly onAdd: (body: string) => Promise<unknown> }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await onAdd(body.trim());
      setBody('');
    } catch (x) {
      setErr(errText(x));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <form onSubmit={submit}>
        <TextAreaField label="Nouvelle note interne" hint="Visible des seuls opérateurs ; elle ne s’efface pas (ajout seul). N’y copiez jamais un code ni un identifiant en clair." textareaProps={{ value: body, onChange: (e) => setBody(e.target.value), maxLength: 2000, rows: 3 }} />
        <SubmitButton busy={busy}>Ajouter la note</SubmitButton>
      </form>
      {err ? <p className="k-field-error" role="alert">{err}</p> : null}
      {notes.length === 0 ? (
        <p className="k-hint">Aucune note.</p>
      ) : (
        <ol className="crm-fil">
          {notes.map((n) => (
            <li key={n.noteId} className="crm-fil__item">
              <span className="k-hint">{n.authorName ?? 'Opérateur'} · {date(n.createdAt)}</span>
              <p>{n.body}</p>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

export function TachesMini({ tasks }: { readonly tasks: readonly TaskLite[] }) {
  if (tasks.length === 0) return <p className="k-hint">Aucune tâche.</p>;
  return (
    <ul className="crm-liste">
      {tasks.map((t) => (
        <li key={t.taskId}>
          <StatusChip status={t.status === 'a_faire' ? 'À faire' : t.status === 'fait' ? 'Fait' : 'Annulée'} tone={t.status === 'a_faire' ? 'warn' : t.status === 'fait' ? 'ok' : 'neutral'} /> {t.title}
          <span className="k-hint"> · {t.assigneeName ?? '—'}{t.dueAt ? ` · échéance ${date(t.dueAt)}` : ''}</span>
        </li>
      ))}
    </ul>
  );
}
