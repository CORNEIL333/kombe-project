/* KÓMBE — séances (L-04 à L-06) : ouverture, appel (présent, en retard,
   excusé, absent, représenté), collecte en séance (déclaration pour un
   membre + confirmation en lot par le trésorier), clôture avec procès-verbal
   généré depuis les événements, approbation et impression. */

import { useEffect, useState } from "react";
import type { AttendanceStatus } from "@kombe/domain";
import { seances, tontines, type MeetingDetail, type MemberView } from "./api.js";
import { peut } from "./droits.js";
import { AConfirmer, FormulaireDeclaration, LigneMouvement } from "./Argent.js";
import { Carte, Champ, Charge, Pastille, Retour, useAction, useDonnees } from "./ui.js";
import { useTextes } from "./textes.js";
import type { ContexteGroupe } from "./Groupe.js";

const STATUTS: readonly AttendanceStatus[] = ["present", "late", "excused", "absent", "represented"];

export function Seances({ ctx }: { readonly ctx: ContexteGroupe }) {
  const { tx, dyn, date } = useTextes();
  const gid = ctx.groupe.groupId;
  const { etat, recharger } = useDonnees(() => seances.liste(ctx.session, gid), [gid]);
  const [choisie, setChoisie] = useState<string | null>(ctx.groupe.nextMeeting?.meetingId ?? null);

  return (
    <div className="pile">
      <Carte titre={tx("td.seances")}>
        <Charge etat={etat} recharger={recharger}>
          {(liste) =>
            liste.length === 0 ? (
              <p>{tx("app.vide")}</p>
            ) : (
              <ol className="liste">
                {liste.map((s) => (
                  <li key={s.meetingId} className={s.meetingId === choisie ? "liste__ligne liste__ligne--choisie" : "liste__ligne"}>
                    <button type="button" className="ligne-bouton" aria-pressed={s.meetingId === choisie} onClick={() => setChoisie(s.meetingId)}>
                      <strong>{tx("se.seance", { seq: s.seq, date: date(s.date) })}</strong>
                      <span className="aide-champ">
                        {s.location ?? ""}
                        {s.minutesApproved ? ` · ${tx("se.approuve")}` : ""}
                      </span>
                    </button>
                    <Pastille ton={s.state === "open" ? "attente" : s.state === "closed" ? "ok" : "neutre"}>{dyn(`se.etat.${s.state}`)}</Pastille>
                  </li>
                ))}
              </ol>
            )
          }
        </Charge>
      </Carte>
      {choisie ? <DetailSeance ctx={ctx} meetingId={choisie} onChange={recharger} /> : null}
    </div>
  );
}

function DetailSeance({ ctx, meetingId, onChange }: { readonly ctx: ContexteGroupe; readonly meetingId: string; readonly onChange: () => void }) {
  const { tx, dyn, date } = useTextes();
  const gid = ctx.groupe.groupId;
  const { etat, recharger } = useDonnees(() => seances.detail(ctx.session, gid, meetingId), [gid, meetingId]);
  const membres = useDonnees(() => tontines.membres(ctx.session, gid), [gid]);
  const action = useAction();
  const [notes, setNotes] = useState("");
  const [decisions, setDecisions] = useState("");
  const [pour, setPour] = useState<MemberView | null>(null);
  const moiId = membres.etat.statut === "ok" ? membres.etat.donnees.find((m) => m.isMe)?.membershipId : undefined;

  const apres = () => {
    recharger();
    onChange();
    ctx.rafraichir();
  };

  return (
    <Charge etat={etat} recharger={recharger}>
      {(s) => (
        <>
          <Carte
            titre={tx("se.seance", { seq: s.seq, date: date(s.date) })}
            actions={
              s.state === "planned" && peut(ctx.roles, "meeting.manage") ? (
                <button type="button" className="bouton bouton-compact" disabled={action.enCours} onClick={() => void action.lancer(() => seances.ouvrir(ctx.session, gid, meetingId)).then(apres)}>
                  {tx("se.ouvrir")}
                </button>
              ) : null
            }
          >
            <p>
              <Pastille ton={s.state === "open" ? "attente" : s.state === "closed" ? "ok" : "neutre"}>{dyn(`se.etat.${s.state}`)}</Pastille>
              {s.location ? ` · ${s.location}` : ""}
              {s.hostName ? ` · ${s.hostName}` : ""}
            </p>
            <Retour erreur={action.erreur} succes={action.succes} />
          </Carte>

          {s.state === "open" && peut(ctx.roles, "meeting.attendance") ? (
            <Appel ctx={ctx} seance={s} onFini={apres} />
          ) : s.attendance.some((a) => a.status) ? (
            <Carte titre={tx("se.appel")}>
              <ul className="liste">
                {s.attendance.map((a) => (
                  <li key={a.membershipId} className="liste__ligne">
                    <span>{a.displayName}</span>
                    <span>{a.status ? dyn(`se.p.${a.status}`) : "—"}</span>
                  </li>
                ))}
              </ul>
            </Carte>
          ) : null}

          {s.state === "open" ? (
            <Carte titre={tx("ar.declarer")}>
              {membres.etat.statut === "ok" ? (
                <Champ id="se-pour" libelle={tx("ar.pourQui")}>
                  <select
                    id="se-pour"
                    value={pour?.membershipId ?? ""}
                    onChange={(e) => setPour(membres.etat.statut === "ok" ? (membres.etat.donnees.find((m) => m.membershipId === e.target.value) ?? null) : null)}
                  >
                    <option value="">—</option>
                    {membres.etat.donnees
                      .filter((m) => m.state === "active" && (m.isMe || peut(ctx.roles, "movement.confirm") || (moiId !== undefined && m.proxyMembershipId === moiId)))
                      .map((m) => (
                        <option key={m.membershipId} value={m.membershipId}>
                          {m.displayName}
                        </option>
                      ))}
                  </select>
                </Champ>
              ) : null}
              {pour ? <FormulaireDeclaration ctx={ctx} pourMembre={pour} meetingId={meetingId} onFini={() => (setPour(null), apres())} /> : null}
            </Carte>
          ) : null}

          {s.state === "open" && (peut(ctx.roles, "movement.confirm") || peut(ctx.roles, "member.admit")) ? <AConfirmer ctx={ctx} meetingId={meetingId} onFini={apres} /> : null}

          {s.movements.length ? (
            <Carte titre={tx("se.mouvements")}>
              <ul className="liste">
                {s.movements.map((m) => (
                  <LigneMouvement key={m.movementId} m={m} />
                ))}
              </ul>
            </Carte>
          ) : null}

          {s.state === "open" && peut(ctx.roles, "meeting.manage") ? (
            <Carte titre={tx("se.clore")}>
              <Champ id="se-notes" libelle={tx("se.notes")}>
                <textarea id="se-notes" rows={4} maxLength={4000} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Champ>
              <Champ id="se-dec" libelle={tx("se.decisions")}>
                <textarea id="se-dec" rows={3} value={decisions} onChange={(e) => setDecisions(e.target.value)} />
              </Champ>
              <button
                type="button"
                className="bouton"
                disabled={action.enCours}
                onClick={() =>
                  void action
                    .lancer(() =>
                      seances.clore(
                        ctx.session,
                        gid,
                        meetingId,
                        notes.trim() || undefined,
                        decisions
                          .split("\n")
                          .map((d) => d.trim())
                          .filter(Boolean)
                          .slice(0, 30),
                      ),
                    )
                    .then(apres)
                }
              >
                {tx("se.clore")}
              </button>
            </Carte>
          ) : null}

          {s.minutes ? (
            <Carte
              titre={tx("se.pv")}
              actions={
                <button type="button" className="bouton bouton-secondaire bouton-compact" onClick={() => imprimerPv(s)}>
                  {tx("se.imprimer")}
                </button>
              }
            >
              <pre className="pv">{s.minutes.text}</pre>
              <p className="aide-champ">{tx("se.empreinte", { hash: s.minutes.hash })}</p>
              {s.minutes.approvedAt ? (
                <Pastille ton="ok">{tx("se.approuve")}</Pastille>
              ) : peut(ctx.roles, "meeting.manage") ? (
                <button
                  type="button"
                  className="bouton bouton-compact"
                  disabled={action.enCours}
                  onClick={() => void action.lancer(() => seances.approuverPv(ctx.session, gid, meetingId, s.minutes?.hash ?? "")).then(apres)}
                >
                  {tx("se.approuver")}
                </button>
              ) : null}
            </Carte>
          ) : null}
        </>
      )}
    </Charge>
  );
}

function Appel({ ctx, seance, onFini }: { readonly ctx: ContexteGroupe; readonly seance: MeetingDetail; readonly onFini: () => void }) {
  const { tx, dyn } = useTextes();
  const [lignes, setLignes] = useState(() =>
    seance.attendance.map((a) => ({ membershipId: a.membershipId, displayName: a.displayName, status: a.status ?? ("present" as AttendanceStatus), representedByMembershipId: a.representedByMembershipId })),
  );
  useEffect(() => {
    setLignes(seance.attendance.map((a) => ({ membershipId: a.membershipId, displayName: a.displayName, status: a.status ?? ("present" as AttendanceStatus), representedByMembershipId: a.representedByMembershipId })));
  }, [seance]);
  const action = useAction();
  return (
    <Carte titre={tx("se.appel")}>
      <ul className="liste">
        {lignes.map((l, i) => (
          <li key={l.membershipId} className="liste__ligne liste__ligne--haute">
            <span>{l.displayName}</span>
            <span className="liste__actions">
              <select
                aria-label={`${tx("se.appel")} — ${l.displayName}`}
                value={l.status}
                onChange={(e) => setLignes((x) => x.map((y, j) => (j === i ? { ...y, status: e.target.value as AttendanceStatus } : y)))}
              >
                {STATUTS.map((st) => (
                  <option key={st} value={st}>
                    {dyn(`se.p.${st}`)}
                  </option>
                ))}
              </select>
              {l.status === "represented" ? (
                <select
                  aria-label={`${tx("mb.representant")} — ${l.displayName}`}
                  value={l.representedByMembershipId ?? ""}
                  onChange={(e) => setLignes((x) => x.map((y, j) => (j === i ? { ...y, representedByMembershipId: e.target.value || null } : y)))}
                >
                  <option value="">{tx("mb.representant")}</option>
                  {lignes
                    .filter((o) => o.membershipId !== l.membershipId)
                    .map((o) => (
                      <option key={o.membershipId} value={o.membershipId}>
                        {o.displayName}
                      </option>
                    ))}
                </select>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      <Retour erreur={action.erreur} succes={action.succes} />
      <button
        type="button"
        className="bouton"
        disabled={action.enCours}
        onClick={() =>
          void action
            .lancer(
              () =>
                seances.presence(
                  ctx.session,
                  ctx.groupe.groupId,
                  seance.meetingId,
                  lignes.map((l) => ({
                    membershipId: l.membershipId,
                    status: l.status,
                    ...(l.status === "represented" ? { representedByMembershipId: l.representedByMembershipId } : {}),
                  })),
                ),
              "✓",
            )
            .then(onFini)
        }
      >
        {tx("se.enregistrerAppel")}
      </button>
    </Carte>
  );
}

/** Ouvre une fenêtre imprimable (Imprimer → « Enregistrer en PDF » sur le téléphone). */
function imprimerPv(s: MeetingDetail): void {
  if (!s.minutes) return;
  const w = window.open("", "_blank", "noopener=no");
  if (!w) return;
  const echap = (t: string) => t.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);
  w.document.write(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>PV séance ${s.seq}</title>` +
      `<style>body{font:14px/1.5 Georgia,serif;margin:2cm;color:#13211c}pre{white-space:pre-wrap;font:inherit}small{color:#56645e;word-break:break-all}</style>` +
      `</head><body><pre>${echap(s.minutes.text)}</pre><hr><small>Empreinte SHA-256 : ${echap(s.minutes.hash)}</small></body></html>`,
  );
  w.document.close();
  w.focus();
  w.print();
}
