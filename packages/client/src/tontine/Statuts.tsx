/* KÓMBE — statuts et règlement intérieur (L-12) et registre chaîné. */

import { reglement, discipline } from "./api.js";
import { peut } from "./droits.js";
import { useState } from "react";
import { Carte, Champ, Charge, Pastille, Retour, useAction, useDonnees } from "./ui.js";
import { useTextes } from "./textes.js";
import type { ContexteGroupe } from "./Groupe.js";
import { ApiError } from "./api.js";
import { Historique } from "./Historique.js";

export function Statuts({ ctx }: { readonly ctx: ContexteGroupe }) {
  const { tx, instant } = useTextes();
  const gid = ctx.groupe.groupId;
  const { etat, recharger } = useDonnees(
    () =>
      reglement.statuts(ctx.session, gid).catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }),
    [gid],
  );
  const action = useAction();
  const bureau = peut(ctx.roles, "statutes.publish");
  const [jours, setJours] = useState("7");
  const [consequence, setConsequence] = useState<"exclude" | "keep">("exclude");
  const [prolonger, setProlonger] = useState("3");
  const apres = () => {
    recharger();
    ctx.rafraichir();
  };
  const publier = (premiere: boolean) => {
    if (!premiere && !window.confirm(tx("st.republierConfirm"))) return;
    const n = Number(jours);
    void action
      .lancer(() => reglement.publier(ctx.session, gid, { acceptanceDays: Number.isInteger(n) && n >= 1 && n <= 60 ? n : 7, onExpiry: consequence }))
      .then(apres);
  };

  const formulairePublication = (premiere: boolean) => (
    <div className="pile">
      {premiere ? <p className="aide-champ">{tx("st.publierAide")}</p> : null}
      <Champ id="st-jours" libelle={tx("st.delai")}>
        <input id="st-jours" inputMode="numeric" value={jours} onChange={(e) => setJours(e.target.value.replace(/\D/g, "").slice(0, 2))} />
      </Champ>
      <fieldset className="champ">
        <legend>{tx("st.consequence")}</legend>
        {(["exclude", "keep"] as const).map((c) => (
          <label key={c} className="case">
            <input type="radio" name="st-consequence" checked={consequence === c} onChange={() => setConsequence(c)} />
            {tx(c === "exclude" ? "st.exclude" : "st.keep")}
          </label>
        ))}
      </fieldset>
      <button type="button" className={premiere ? "bouton" : "bouton bouton-secondaire"} disabled={action.enCours} onClick={() => publier(premiere)}>
        {premiere ? tx("st.publierBouton") : tx("st.publier")}
      </button>
    </div>
  );

  return (
    <Carte titre={tx("st.titre")}>
      <Retour erreur={action.erreur} succes={action.succes} />
      <Charge etat={etat} recharger={recharger}>
        {(st) =>
          st === null ? (
            bureau ? (
              <div className="pile">
                <h4>{tx("st.publierTitre")}</h4>
                {formulairePublication(true)}
              </div>
            ) : (
              <p>{tx("st.aucun")}</p>
            )
          ) : (
            <div className="pile">
              {!st.acceptedByMe ? (
                <div className="msg msg--info pile" role="status">
                  <strong>{st.myDeadlineAt ? tx("st.aAccepterAvant", { date: instant(st.myDeadlineAt) }) : tx("st.lireEtAccepter")}</strong>
                  {st.deadline ? <span>{tx(st.deadline.onExpiry === "exclude" ? "st.aAccepterExclusion" : "st.aAccepterKeep")}</span> : null}
                  <button type="button" className="bouton" disabled={action.enCours} onClick={() => void action.lancer(() => reglement.accepter(ctx.session, gid, st.hash)).then(apres)}>
                    {tx("st.accepterHaut")}
                  </button>
                </div>
              ) : (
                <Pastille ton="ok">{tx("st.accepte")}</Pastille>
              )}
              <p className="aide-champ">{tx("st.version", { v: st.version, n: st.acceptedCount, total: st.expectedCount })}</p>
              <p className="aide-champ">
                {st.deadline
                  ? `${tx("st.echeance", { date: instant(st.deadline.deadlineAt) })} · ${tx(st.deadline.onExpiry === "exclude" ? "st.echeanceExclusion" : "st.echeanceKeep")}`
                  : tx("st.sansEcheance")}
              </p>
              {st.pending.length === 0 ? (
                <Pastille ton="ok">{tx("st.toutAccepte")}</Pastille>
              ) : (
                <details open={bureau}>
                  <summary>{tx("st.enAttente", { n: st.pending.length })}</summary>
                  <ul className="liste">
                    {st.pending.map((p) => (
                      <li key={p.membershipId} className="liste__ligne">
                        <span>
                          {p.name}
                          {p.state === "pending" ? <span className="aide-champ"> · {tx("st.candidat")}</span> : null}
                        </span>
                        {p.deadlineAt ? <span className="aide-champ">{instant(p.deadlineAt)}</span> : null}
                      </li>
                    ))}
                  </ul>
                  {bureau ? (
                    <div className="pile">
                      <button
                        type="button"
                        className="bouton bouton-secondaire bouton-compact"
                        disabled={action.enCours}
                        onClick={() => void action.lancer(() => reglement.relancer(ctx.session, gid)).then((r) => r && action.signaler(tx("st.relances", { n: r.reminded })))}
                      >
                        {tx("st.relancer")}
                      </button>
                      <div className="rangee">
                        <label htmlFor="st-prolonger">{tx("st.prolonger")}</label>
                        <input id="st-prolonger" inputMode="numeric" size={3} value={prolonger} onChange={(e) => setProlonger(e.target.value.replace(/\D/g, "").slice(0, 2))} />
                        <span>{tx("st.jours")}</span>
                        <button
                          type="button"
                          className="bouton bouton-secondaire bouton-compact"
                          disabled={action.enCours || !Number(prolonger)}
                          onClick={() => void action.lancer(() => reglement.echeance(ctx.session, gid, { extendDays: Number(prolonger) })).then(apres)}
                        >
                          {tx("st.prolongerBouton")}
                        </button>
                      </div>
                      {st.deadline ? (
                        <button
                          type="button"
                          className="bouton bouton-secondaire bouton-compact"
                          disabled={action.enCours}
                          onClick={() =>
                            void action
                              .lancer(() => reglement.echeance(ctx.session, gid, { extendDays: 0, onExpiry: st.deadline?.onExpiry === "exclude" ? "keep" : "exclude" }))
                              .then(apres)
                          }
                        >
                          {tx(st.deadline.onExpiry === "exclude" ? "st.changerKeep" : "st.changerExclude")}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </details>
              )}
              <article className="statuts">
                <h4>{st.title}</h4>
                <pre className="pv">{st.body}</pre>
              </article>
              <p className="aide-champ">{tx("st.mention")}</p>
              <p className="aide-champ">{tx("se.empreinte", { hash: st.hash })}</p>
              {st.acceptedByMe ? null : (
                <button type="button" className="bouton" disabled={action.enCours} onClick={() => void action.lancer(() => reglement.accepter(ctx.session, gid, st.hash)).then(apres)}>
                  {tx("st.accepter")}
                </button>
              )}
              <button type="button" className="bouton bouton-secondaire bouton-compact" onClick={() => window.print()}>
                {tx("se.imprimer")}
              </button>
              {bureau ? (
                <details>
                  <summary>{tx("st.publier")}</summary>
                  {formulairePublication(false)}
                </details>
              ) : null}
            </div>
          )
        }
      </Charge>
    </Carte>
  );
}

export function Journal({ ctx }: { readonly ctx: ContexteGroupe }) {
  const { tx, date } = useTextes();
  const gid = ctx.groupe.groupId;
  const { etat, recharger } = useDonnees(() => discipline.journal(ctx.session, gid), [gid]);
  return (
    <div className="pile">
    <Historique ctx={ctx} />
    <Carte titre={tx("td.journal")}>
      <Charge etat={etat} recharger={recharger}>
        {(j) => (
          <div className="pile">
            <p className={j.valid ? "msg msg--succes" : "msg msg--erreur"} role="status">
              {j.valid ? tx("jo.valide") : tx("jo.invalide")}
            </p>
            <ol className="liste">
              {[...j.entries].reverse().map((e) => (
                <li key={e.seq} className="liste__ligne liste__ligne--haute">
                  <div>
                    <strong>
                      {e.seq}. {e.summary}
                    </strong>
                    <span className="aide-champ">
                      {e.actorName ?? "—"} · {date(e.at)} · <code>{e.hash.slice(0, 12)}</code>
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </Charge>
    </Carte>
    </div>
  );
}
