import { useState, type ChangeEvent } from 'react';
import { DataTable, PageHeader, Panel, RemoteState, useRemote } from '@kombe/dashboard-core';
import { Chip, FeedbackLine, Note, Spacer, useAction, useBureau } from './common';
import { formatDateTime, formatDay, formatFcfa } from '../tontine/format';
import type { LegacyNjangi } from '../tontine/types';

export function StatutesPage() {
  const { api, groupId, abilities: ab } = useBureau();
  const q = useRemote((s) => api.statutes(groupId, s), [api, groupId], { isEmpty: (d) => d === null });
  const act = useAction();
  const publish = () =>
    void act.run('publish', () => api.publishStatutes(groupId), (r) => `Statuts publiés (version ${r.version}). Chaque membre doit les lire et les accepter.`, () => q.reload());
  return (
    <>
      <PageHeader
        title="Statuts"
        description="Statuts générés depuis le règlement en vigueur (caisses, amendes, secours, bureau). Chaque membre accepte un texte précis, identifié par son empreinte."
        actions={
          ab.can('statutes.publish') ? (
            <button type="button" className="k-button k-button-primary" disabled={act.busy !== null} onClick={publish}>
              Publier la version à jour
            </button>
          ) : undefined
        }
      />
      <FeedbackLine feedback={act.feedback} />
      <RemoteState state={q.state} onRetry={q.reload} emptyTitle="Aucun statut publié" emptyBody="Les statuts n’ont pas encore été publiés pour ce groupe.">
        {(s) =>
          s && (
            <Panel title={`${s.title} — version ${s.version}`} action={s.accepted_by_me ? <Chip tone="ok">Acceptés par vous</Chip> : <Chip tone="warn">À accepter</Chip>}>
              <div className="b-kv-row">
                <div><span>Publiés le</span><strong>{formatDateTime(s.published_at)}</strong></div>
                <div><span>Acceptations</span><strong>{s.acceptances}</strong></div>
                <div><span>Empreinte</span><strong><code className="b-hash">{s.hash}</code></strong></div>
              </div>
              <pre className="b-minutes">{s.body}</pre>
              {!s.accepted_by_me && (
                <div className="k-actionbar">
                  <button
                    type="button"
                    className="k-button k-button-primary"
                    disabled={act.busy !== null}
                    onClick={() => void act.run('accept', () => api.acceptStatutes(groupId, s.version, s.hash), 'Vous avez accepté cette version des statuts.', () => q.reload())}
                  >
                    J’ai lu et j’accepte cette version
                  </button>
                </div>
              )}
            </Panel>
          )
        }
      </RemoteState>
    </>
  );
}

/** Lit un fichier d'export JSON : accepte `{ njangi: {...} }` ou l'objet njangi seul. */
export function parseLegacyExport(text: string): { ok: true; njangi: LegacyNjangi } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Fichier illisible : JSON attendu.' };
  }
  const candidate = (raw && typeof raw === 'object' && 'njangi' in raw ? (raw as { njangi: unknown }).njangi : raw) as Record<string, unknown> | null;
  if (!candidate || typeof candidate !== 'object') return { ok: false, error: 'Objet « njangi » introuvable.' };
  if (typeof candidate['id'] !== 'string' || typeof candidate['name'] !== 'string') return { ok: false, error: 'Champs « id » et « name » requis.' };
  if (!Array.isArray(candidate['members']) || !Array.isArray(candidate['contributions'])) return { ok: false, error: 'Listes « members » et « contributions » requises.' };
  return { ok: true, njangi: candidate as unknown as LegacyNjangi };
}

export function HistoryImport() {
  const { api, groupId, abilities: ab } = useBureau();
  const history = useRemote((s) => api.history(groupId, s), [api, groupId]);
  const act = useAction();
  const [file, setFile] = useState<{ name: string; njangi: LegacyNjangi } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [report, setReport] = useState<{ accepted: number; rejected: number; report: readonly unknown[] } | null>(null);
  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setFile(null);
    setReport(null);
    setParseError(null);
    if (!f) return;
    const parsed = parseLegacyExport(await f.text());
    if (parsed.ok) setFile({ name: f.name, njangi: parsed.njangi });
    else setParseError(parsed.error);
  }
  return (
    <>
      <PageHeader title="Reprise d’historique" description="Importe en lecture seule les cotisations d’un ancien registre (export JSON). Rien n’est rejoué comme opération : l’historique reste marqué « importé »." />
      {ab.can('import.history') ? (
        <Panel title="Importer un export">
          <label className="k-field">
            <span>Fichier JSON</span>
            <input type="file" accept="application/json,.json" onChange={(e) => void onFile(e)} />
          </label>
          {parseError && <p className="b-feedback b-feedback-error" role="alert">{parseError}</p>}
          {file && (
            <>
              <p>
                <strong>{file.njangi.name}</strong> — {file.njangi.members.length} membre(s), {file.njangi.contributions.length} cotisation(s).
              </p>
              <button
                type="button"
                className="k-button k-button-primary"
                disabled={act.busy !== null}
                onClick={() =>
                  void act.run('import', () => api.importHistory(groupId, file.njangi), (r) => `Import terminé : ${r.accepted} ligne(s) acceptée(s), ${r.rejected} rejetée(s).`, (r) => {
                    setReport(r);
                    history.reload();
                  })
                }
              >
                Importer l’historique
              </button>
            </>
          )}
          <FeedbackLine feedback={act.feedback} />
          {report && report.rejected > 0 && (
            <details className="k-json">
              <summary>Rapport détaillé</summary>
              <pre>{JSON.stringify(report.report, null, 2)}</pre>
            </details>
          )}
        </Panel>
      ) : (
        <Note>L’import d’historique est réservé au Président et au Vice-président.</Note>
      )}
      <Spacer />
      <Panel title="Historique importé">
        <RemoteState state={history.state} onRetry={history.reload} emptyTitle="Aucun historique importé">
          {(rows) => (
            <DataTable
              rows={rows}
              rowKey={(r) => r.legacy_id}
              columns={[
                { header: 'Date', render: (r) => formatDay(r.contribution_date) },
                { header: 'Membre (ancien registre)', render: (r) => r.legacy_member_name },
                { header: 'Rapproché', render: (r) => (r.membership_id ? <Chip tone="ok">Membre actuel</Chip> : <Chip>Non rapproché</Chip>) },
                { header: 'Montant', render: (r) => formatFcfa(r.amount) },
              ]}
            />
          )}
        </RemoteState>
      </Panel>
    </>
  );
}
