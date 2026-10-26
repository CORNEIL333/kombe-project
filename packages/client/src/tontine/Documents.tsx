/* KÓMBE — documents de mes tontines : statuts en vigueur (version, mon
   acceptation) et procès-verbaux des séances closes. Chaque document s'ouvre
   dans sa tontine (onglet Statuts ou Séances, impression en PDF). */

import { acces, reglement, seances, type MeetingSummary, type Session, type StatutesView, type TontineSummary } from "./api.js";
import { BoutonIcone, Carte, Charge, Pastille, useDonnees } from "./ui.js";
import { useTextes } from "./textes.js";
import { Icone } from "../composants/Icones.js";

interface DocsGroupe {
  readonly groupe: TontineSummary;
  readonly statuts: StatutesView | null;
  readonly pv: readonly MeetingSummary[];
}

export function Documents({ session, onOuvrir }: { readonly session: Session; readonly onOuvrir: (groupId: string, onglet: "statuts" | "seances") => void }) {
  const { tx, date } = useTextes();
  const docs = useDonnees(async (): Promise<DocsGroupe[]> => {
    const groupes = (await acces.mesTontines(session)).filter((g) => g.membershipState === "active");
    return Promise.all(
      groupes.map(async (groupe) => {
        // Statuts non encore publiés : 404 attendu, pas une erreur d'écran.
        const statuts = await reglement.statuts(session, groupe.groupId).catch(() => null);
        const pv = (await seances.liste(session, groupe.groupId).catch(() => [] as MeetingSummary[])).filter((m) => m.state === "closed");
        return { groupe, statuts, pv: [...pv].sort((a, b) => b.date.localeCompare(a.date)) };
      }),
    );
  }, [session.sessionId]);

  return (
    <div className="pile ecran">
      <header className="ecran-titre">
        <span className="ecran-titre__icone" aria-hidden="true">
          <Icone nom="document" taille={26} />
        </span>
        <div>
          <h1>{tx("doc.titre")}</h1>
          <p className="aide-champ">{tx("doc.intro")}</p>
        </div>
      </header>
      <Charge etat={docs.etat} recharger={docs.recharger}>
        {(liste) =>
          liste.length === 0 ? (
            <p className="tcarte">{tx("pf.aucuneTontine")}</p>
          ) : (
            <>
              {liste.map(({ groupe, statuts, pv }) => (
                <Carte key={groupe.groupId} titre={groupe.name}>
                  <ul className="liste">
                    <li className="liste__ligne">
                      <div>
                        <strong>{statuts ? tx("doc.statutsV", { v: statuts.version }) : tx("doc.statutsAbsents")}</strong>
                        {statuts ? (
                          <>
                            <span className="aide-champ">{tx("doc.publies", { date: date(statuts.publishedAt) })}</span>
                            <Pastille ton={statuts.acceptedByMe ? "ok" : "attente"}>{statuts.acceptedByMe ? tx("doc.acceptes") : tx("doc.aAccepter")}</Pastille>
                          </>
                        ) : null}
                      </div>
                      {statuts ? (
                        <div className="liste__actions">
                          <BoutonIcone icone="document" ton="primaire" libelle={tx("doc.lireStatuts", { nom: groupe.name })} onClick={() => onOuvrir(groupe.groupId, "statuts")} />
                        </div>
                      ) : null}
                    </li>
                    {pv.slice(0, 12).map((m) => (
                      <li key={m.meetingId} className="liste__ligne">
                        <div>
                          <strong>{tx("doc.pv", { n: m.seq })}</strong>
                          <span className="aide-champ">{date(m.date)}{m.location ? ` · ${m.location}` : ""}</span>
                          <Pastille ton={m.minutesApproved ? "ok" : "attente"}>{m.minutesApproved ? tx("doc.pvApprouve") : tx("doc.pvAApprouver")}</Pastille>
                        </div>
                        <div className="liste__actions">
                          <BoutonIcone icone="seance" libelle={tx("doc.ouvrirPv", { n: m.seq })} onClick={() => onOuvrir(groupe.groupId, "seances")} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </Carte>
              ))}
            </>
          )
        }
      </Charge>
    </div>
  );
}
