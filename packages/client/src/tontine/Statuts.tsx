/* KÓMBE — statuts et règlement intérieur (L-12) et registre chaîné. */

import { reglement, discipline } from "./api.js";
import { peut } from "./droits.js";
import { Carte, Charge, Pastille, Retour, useAction, useDonnees } from "./ui.js";
import { useTextes } from "./textes.js";
import type { ContexteGroupe } from "./Groupe.js";
import { ApiError } from "./api.js";
import { Historique } from "./Historique.js";

export function Statuts({ ctx }: { readonly ctx: ContexteGroupe }) {
  const { tx } = useTextes();
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
  const apres = () => {
    recharger();
    ctx.rafraichir();
  };

  return (
    <Carte
      titre={tx("st.titre")}
      actions={
        peut(ctx.roles, "statutes.publish") ? (
          <button type="button" className="bouton bouton-secondaire bouton-compact" disabled={action.enCours} onClick={() => void action.lancer(() => reglement.publier(ctx.session, gid)).then(apres)}>
            {tx("st.publier")}
          </button>
        ) : null
      }
    >
      <Retour erreur={action.erreur} succes={action.succes} />
      <Charge etat={etat} recharger={recharger}>
        {(st) =>
          st === null ? (
            <p>{tx("st.aucun")}</p>
          ) : (
            <div className="pile">
              <p className="aide-champ">{tx("st.version", { v: st.version, n: st.acceptedCount })}</p>
              <article className="statuts">
                <h4>{st.title}</h4>
                <pre className="pv">{st.body}</pre>
              </article>
              <p className="aide-champ">{tx("st.mention")}</p>
              <p className="aide-champ">{tx("se.empreinte", { hash: st.hash })}</p>
              {st.acceptedByMe ? (
                <Pastille ton="ok">{tx("st.accepte")}</Pastille>
              ) : (
                <button type="button" className="bouton" disabled={action.enCours} onClick={() => void action.lancer(() => reglement.accepter(ctx.session, gid, st.hash)).then(apres)}>
                  {tx("st.accepter")}
                </button>
              )}
              <button type="button" className="bouton bouton-secondaire bouton-compact" onClick={() => window.print()}>
                {tx("se.imprimer")}
              </button>
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
