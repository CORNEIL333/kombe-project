/* KÓMBE — tours, grille « qui a cotisé », remise devant témoins, clôture,
   échanges de tour (L-02, L-06, L-10, L-13, L-18). */

import { useState } from "react";
import type { PaymentChannel, PayoutPolicy } from "@kombe/domain";
import { cycle, tontines, type RoundView } from "./api.js";
import { peut } from "./droits.js";
import { CANAUX } from "./Argent.js";
import { Carte, Champ, ChampMontant, Charge, Pastille, Retour, useAction, useDonnees } from "./ui.js";
import { useTextes, type CleTexte } from "./textes.js";
import type { ContexteGroupe } from "./Groupe.js";

export function Tours({ ctx }: { readonly ctx: ContexteGroupe }) {
  const { tx, dyn, xaf, date } = useTextes();
  const gid = ctx.groupe.groupId;
  const tours = useDonnees(() => cycle.tours(ctx.session, gid), [gid]);
  const [choisi, setChoisi] = useState<number | null>(ctx.groupe.currentRound?.seq ?? null);

  return (
    <div className="pile">
      <Carte titre={tx("to.liste")}>
        <Charge etat={tours.etat} recharger={tours.recharger}>
          {(liste) =>
            liste.length === 0 ? (
              <p>{tx("app.vide")}</p>
            ) : (
              <ol className="liste">
                {liste.map((r) => (
                  <li key={r.seq} className={r.seq === choisi ? "liste__ligne liste__ligne--choisie" : "liste__ligne"}>
                    <button type="button" className="ligne-bouton" onClick={() => setChoisi(r.seq)} aria-pressed={r.seq === choisi}>
                      <strong>
                        {r.seq}. {date(r.date)}
                      </strong>
                      <span className="aide-champ">
                        {r.beneficiaryName ?? "—"} · {xaf(r.collected)} / {xaf(r.expectedPot)}
                      </span>
                    </button>
                    <span>
                      <Pastille ton={r.state === "closed" ? "ok" : "neutre"}>{r.state === "closed" ? tx("to.clos") : tx("to.ouvert")}</Pastille>{" "}
                      <Pastille ton={r.payoutState === "received" ? "ok" : r.payoutState === "none" ? "neutre" : "attente"}>{dyn(`to.remiseEtat.${r.payoutState}`)}</Pastille>
                    </span>
                  </li>
                ))}
              </ol>
            )
          }
        </Charge>
      </Carte>
      {choisi !== null && tours.etat.statut === "ok" ? (
        <DetailTour
          ctx={ctx}
          tour={tours.etat.donnees.find((r) => r.seq === choisi) ?? null}
          onFini={() => {
            tours.recharger();
            ctx.rafraichir();
          }}
        />
      ) : null}
      {ctx.groupe.cycleStarted ? <Echanges ctx={ctx} tours={tours.etat.statut === "ok" ? tours.etat.donnees : []} /> : null}
    </div>
  );
}

function DetailTour({ ctx, tour, onFini }: { readonly ctx: ContexteGroupe; readonly tour: RoundView | null; readonly onFini: () => void }) {
  const { tx, dyn, xaf } = useTextes();
  const gid = ctx.groupe.groupId;
  const seq = tour?.seq ?? 0;
  const grille = useDonnees(() => cycle.grille(ctx.session, gid, seq), [gid, seq]);
  const action = useAction();
  if (!tour) return null;
  const peutRemettre = peut(ctx.roles, "movement.confirm") && tour.state === "open" && tour.payoutState === "none";
  const peutClore = peut(ctx.roles, "meeting.manage") && tour.state === "open" && tour.payoutState === "received";

  return (
    <>
      <Carte titre={`${tx("to.grille")} — ${tx("ar.tour")} ${tour.seq}`}>
        <Charge etat={grille.etat} recharger={grille.recharger}>
          {(g) => (
            <>
              <p className="aide-champ">
                {tx("to.statut.paid")} : {g.summary.paid} · {tx("to.statut.partial")} : {g.summary.partial} · {tx("to.statut.unpaid")} : {g.summary.unpaid} / {g.summary.total}
              </p>
              <table className="tableau">
                <thead>
                  <tr>
                    <th scope="col">{tx("td.membres")}</th>
                    <th scope="col">{tx("ar.montant")}</th>
                    <th scope="col">{tx("td.confirme")}</th>
                    <th scope="col">{tx("td.enAttente")}</th>
                    <th scope="col">—</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((row, i) => (
                    <tr key={row.membershipId ?? i}>
                      <td>{row.displayName ?? `#${i + 1}`}</td>
                      <td>{xaf(row.due)}</td>
                      <td>{xaf(row.confirmed)}</td>
                      <td>{xaf(row.declared)}</td>
                      <td>
                        <Pastille ton={row.status === "paid" ? "ok" : row.status === "unpaid" ? "alerte" : "attente"}>{dyn(`to.statut.${row.status}`)}</Pastille>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Charge>
      </Carte>
      {peutRemettre ? <FormulaireRemise ctx={ctx} tour={tour} onFini={onFini} /> : null}
      {peutClore ? (
        <Carte titre={tx("to.clore")}>
          <p className="aide-champ">{tx("to.cloreAide")}</p>
          <Retour erreur={action.erreur} succes={action.succes} />
          <button type="button" className="bouton" disabled={action.enCours} onClick={() => void action.lancer(() => cycle.clore(ctx.session, gid, tour.seq)).then(onFini)}>
            {tx("to.clore")}
          </button>
        </Carte>
      ) : null}
    </>
  );
}

function FormulaireRemise({ ctx, tour, onFini }: { readonly ctx: ContexteGroupe; readonly tour: RoundView; readonly onFini: () => void }) {
  const { tx, dyn, xaf } = useTextes();
  const gid = ctx.groupe.groupId;
  const membres = useDonnees(() => tontines.membres(ctx.session, gid), [gid]);
  const [canal, setCanal] = useState<PaymentChannel>("cash");
  const [reference, setReference] = useState("");
  const [temoins, setTemoins] = useState<string[]>([]);
  const [politique, setPolitique] = useState<PayoutPolicy>(ctx.groupe.settings.payoutPolicy);
  const [montant, setMontant] = useState("");
  const action = useAction();
  const exiges = ctx.groupe.settings.payoutWitnesses;
  const incomplet = BigInt(tour.collected) < BigInt(tour.expectedPot);

  return (
    <Carte titre={`${tx("to.remise")} — ${tour.beneficiaryName ?? ""}`}>
      <p>
        {xaf(tour.collected)} / {xaf(tour.expectedPot)}
      </p>
      {canal === "cash" ? <p className="msg msg--info">{tx("to.especesSeance")}</p> : null}
      <Champ id="rem-canal" libelle={tx("ar.canal")}>
        <select id="rem-canal" value={canal} onChange={(e) => setCanal(e.target.value as PaymentChannel)}>
          {CANAUX.map((c) => (
            <option key={c} value={c}>
              {dyn(`ar.canal.${c}`)}
            </option>
          ))}
        </select>
      </Champ>
      {canal !== "cash" ? (
        <Champ id="rem-ref" libelle={tx("ar.reference")}>
          <input id="rem-ref" value={reference} maxLength={64} onChange={(e) => setReference(e.target.value)} />
        </Champ>
      ) : null}
      {incomplet ? (
        <>
          <Champ id="rem-pol" libelle={tx("to.politique")}>
            <select id="rem-pol" value={politique} onChange={(e) => setPolitique(e.target.value as PayoutPolicy)}>
              {(["full_with_advance", "reduced", "wait"] as const).map((p) => (
                <option key={p} value={p}>
                  {tx(`cr.p.${p}` as CleTexte)}
                </option>
              ))}
            </select>
          </Champ>
          {politique === "reduced" ? <ChampMontant id="rem-montant" libelle={tx("ar.montant")} valeur={montant} onChange={setMontant} /> : null}
        </>
      ) : null}
      <fieldset className="champ">
        <legend>
          {tx("to.temoins")} ({temoins.length}/{exiges})
        </legend>
        <Charge etat={membres.etat} recharger={membres.recharger}>
          {(liste) => (
            <div className="cases">
              {liste
                .filter((m) => m.state === "active" && m.membershipId !== tour.beneficiaryMembershipId && !m.isMe)
                .map((m) => (
                  <label key={m.membershipId} className="case">
                    <input
                      type="checkbox"
                      checked={temoins.includes(m.membershipId)}
                      onChange={(e) => setTemoins((t) => (e.target.checked ? [...t, m.membershipId] : t.filter((x) => x !== m.membershipId)))}
                    />
                    {m.displayName}
                  </label>
                ))}
            </div>
          )}
        </Charge>
      </fieldset>
      <Retour erreur={action.erreur} succes={action.succes} />
      <button
        type="button"
        className="bouton"
        disabled={action.enCours || temoins.length < exiges}
        onClick={() =>
          void action
            .lancer(() =>
              cycle.remise(ctx.session, gid, tour.seq, {
                channel: canal,
                witnessMembershipIds: temoins,
                ...(reference.trim() ? { reference: reference.trim() } : {}),
                ...(incomplet ? { policy: politique } : {}),
                ...(incomplet && politique === "reduced" && montant ? { amount: montant } : {}),
                ...(tour.meetingId ? { meetingId: tour.meetingId } : {}),
              }),
            )
            .then((r) => r && onFini())
        }
      >
        {action.enCours ? tx("app.envoi") : tx("to.remise")}
      </button>
    </Carte>
  );
}

function Echanges({ ctx, tours }: { readonly ctx: ContexteGroupe; readonly tours: readonly RoundView[] }) {
  const { tx, dyn } = useTextes();
  const gid = ctx.groupe.groupId;
  const { etat, recharger } = useDonnees(() => cycle.echanges(ctx.session, gid), [gid]);
  const ouverts = tours.filter((r) => r.state === "open" && r.payoutState === "none");
  const [a, setA] = useState<number>(ouverts[0]?.seq ?? 1);
  const [b, setB] = useState<number>(ouverts[1]?.seq ?? 2);
  const action = useAction();
  return (
    <Carte titre={tx("to.echange")}>
      <div className="grille-champs">
        <Champ id="ech-a" libelle={`${tx("ar.tour")} A`}>
          <select id="ech-a" value={a} onChange={(e) => setA(Number(e.target.value))}>
            {ouverts.map((r) => (
              <option key={r.seq} value={r.seq}>
                {r.seq} — {r.beneficiaryName ?? ""}
              </option>
            ))}
          </select>
        </Champ>
        <Champ id="ech-b" libelle={`${tx("ar.tour")} B`}>
          <select id="ech-b" value={b} onChange={(e) => setB(Number(e.target.value))}>
            {ouverts.map((r) => (
              <option key={r.seq} value={r.seq}>
                {r.seq} — {r.beneficiaryName ?? ""}
              </option>
            ))}
          </select>
        </Champ>
      </div>
      <Retour erreur={action.erreur} succes={action.succes} />
      <button
        type="button"
        className="bouton bouton-secondaire"
        disabled={action.enCours || a === b || ouverts.length < 2}
        onClick={() => void action.lancer(() => cycle.demanderEchange(ctx.session, gid, a, b)).then(recharger)}
      >
        {tx("to.echangeAvec", { a, b })}
      </button>
      <Charge etat={etat} recharger={recharger}>
        {(liste) =>
          liste.length === 0 ? null : (
            <ul className="liste">
              {liste.map((c) => (
                <li key={c.changeId} className="liste__ligne liste__ligne--haute">
                  <div>
                    <strong>{tx("to.echangeAvec", { a: c.seqA, b: c.seqB })}</strong>
                    <span className="aide-champ">
                      {c.acceptedNames.join(", ")} / {c.requiredNames.join(", ")} · {dyn(`ech.${c.state}`) === `ech.${c.state}` ? c.state : dyn(`ech.${c.state}`)}
                    </span>
                  </div>
                  <div className="liste__actions">
                    {c.needsMyAcceptance ? (
                      <button type="button" className="bouton bouton-compact" onClick={() => void action.lancer(() => cycle.accepterEchange(ctx.session, gid, c.changeId)).then(recharger)}>
                        {tx("to.accepter")}
                      </button>
                    ) : null}
                    {c.state === "requested" && peut(ctx.roles, "order.manage") && !c.needsMyAcceptance ? (
                      <button type="button" className="bouton bouton-secondaire bouton-compact" onClick={() => void action.lancer(() => cycle.approuverEchange(ctx.session, gid, c.changeId)).then(recharger)}>
                        {tx("to.approuver")}
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )
        }
      </Charge>
    </Carte>
  );
}
