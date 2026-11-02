/* KÓMBE — la cloche ouvre les NON LUES en demi-fenêtre ; l'onglet Activité
   garde l'historique complet. Ouvrir une ligne la marque lue et mène à
   l'action ; le compteur est recalculé par la coquille à la fermeture. */

import { createPortal } from "react-dom";
import { useEffect, useRef } from "react";
import type { Route } from "../App.js";
import { acces, type Session } from "./api.js";
import { ouvrirNotification } from "./Accueil.js";
import { entreeNotification } from "./notifications.js";
import { Charge, useDonnees } from "./ui.js";
import { useTextes, type CleTexte } from "./textes.js";
import { Icone } from "../composants/Icones.js";

export function ApercuNonLues({ session, onFermer, aller }: { readonly session: Session; readonly onFermer: () => void; readonly aller: (r: Route) => void }) {
  const { tx, date } = useTextes();
  const { etat, recharger } = useDonnees(() => acces.notifications(session, true), [session.sessionId]);
  const fermer = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    fermer.current?.focus();
    const declencheur = document.querySelector(".barre-haut__cloche") as HTMLElement | null;
    const echap = (e: KeyboardEvent) => e.key === "Escape" && onFermer();
    window.addEventListener("keydown", echap);
    return () => {
      window.removeEventListener("keydown", echap);
      declencheur?.focus?.();
    };
  }, [onFermer]);

  return createPortal(
    <div className="voile-dialogue voile-dialogue--bas" onClick={(e) => e.target === e.currentTarget && onFermer()}>
      <div className="dialogue panneau-bas" role="dialog" aria-modal="true" aria-labelledby="nonlues-titre">
        <div className="panneau-bas__tete">
          <h2 id="nonlues-titre">{tx("nb.titre")}</h2>
          <button ref={fermer} type="button" className="bouton-icone-nu" aria-label={tx("app.annuler")} onClick={onFermer}>
            <Icone nom="fermer" taille={22} />
          </button>
        </div>
        <Charge etat={etat} recharger={recharger}>
          {(liste) =>
            liste.length === 0 ? (
              <p className="msg">{tx("nb.rien")}</p>
            ) : (
              <ul className="lignes">
                {liste.slice(0, 8).map((n) => {
                  const e = entreeNotification(n);
                  return (
                    <li key={n.notificationId}>
                      <button
                        type="button"
                        className="ligne ligne--nonlue"
                        onClick={() => {
                          onFermer();
                          ouvrirNotification(session, n, aller);
                        }}
                      >
                        <span className="ligne__icone" aria-hidden="true">
                          <Icone nom={e.icone} taille={22} />
                        </span>
                        <span className="ligne__texte">
                          <span className="ligne__titre">{tx(e.cle as CleTexte)}</span>
                          <span className="ligne__sous">{[n.groupName ?? "", date(n.createdAt)].filter(Boolean).join(" · ")}</span>
                        </span>
                        <span className="ligne__point" aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )
          }
        </Charge>
        <div className="actions-formulaire">
          <button
            type="button"
            className="bouton bouton-secondaire"
            onClick={() => {
              onFermer();
              aller({ ecran: "notifications" });
            }}
          >
            {tx("nb.toutVoir")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
