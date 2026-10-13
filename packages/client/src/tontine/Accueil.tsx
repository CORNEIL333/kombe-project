/* KÓMBE — accueil « Mes tontines » (I-06) : la personne voit ses groupes,
   ce qu'elle doit, sa prochaine séance et la date de sa remise ; elle touche
   un groupe pour l'ouvrir. Aucun identifiant n'est jamais saisi à la main. */

import { acces, type Session } from "./api.js";
import { Carte, Charge, Pastille, useDonnees } from "./ui.js";
import { useTextes } from "./textes.js";

export function Accueil({
  session,
  onOuvrir,
  onCreer,
  onRejoindre,
}: {
  readonly session: Session;
  readonly onOuvrir: (groupId: string) => void;
  readonly onCreer: () => void;
  readonly onRejoindre: () => void;
}) {
  const { tx, dyn, xaf, date } = useTextes();
  const { etat, recharger } = useDonnees(() => acces.mesTontines(session), [session.sessionId]);

  return (
    <div className="pile">
      <div className="barre-titre">
        <h2>{tx("acc.titre")}</h2>
        <div className="barre-titre__actions">
          <button type="button" className="bouton" onClick={onCreer}>
            {tx("acc.creer")}
          </button>
          <button type="button" className="bouton bouton-secondaire" onClick={onRejoindre}>
            {tx("acc.rejoindre")}
          </button>
        </div>
      </div>
      <Charge etat={etat} recharger={recharger}>
        {(liste) =>
          liste.length === 0 ? (
            <Carte>
              <p>{tx("acc.aucune")}</p>
              <p className="aide-champ">{tx("app.positionnement")}</p>
            </Carte>
          ) : (
            <ul className="grille-tontines" aria-label={tx("acc.titre")}>
              {liste.map((g) => (
                <li key={g.groupId}>
                  <button type="button" className="tuile-tontine" onClick={() => onOuvrir(g.groupId)} disabled={g.membershipState === "pending"}>
                    <span className="tuile-tontine__nom">{g.name}</span>
                    <span className="tuile-tontine__meta">
                      {dyn(`etat.${g.state}`)} · {tx("acc.membres", { n: g.memberCount })} · {xaf(g.contributionPerShare)}
                    </span>
                    {g.membershipState === "pending" ? (
                      <Pastille ton="attente">{tx("acc.enAttente")}</Pastille>
                    ) : (
                      <>
                        <span>{g.nextMeetingDate ? tx("acc.prochaine", { date: date(g.nextMeetingDate) }) : tx("acc.sansSeance")}</span>
                        {BigInt(g.myOpenDue || "0") > 0n ? (
                          <Pastille ton="attente">{tx("acc.aRegler", { montant: xaf(g.myOpenDue) })}</Pastille>
                        ) : (
                          <Pastille ton="ok">{tx("acc.aJour")}</Pastille>
                        )}
                        {g.myPayoutDate ? <span>{tx("acc.maRemise", { date: date(g.myPayoutDate) })}</span> : null}
                        {g.roles.filter((r) => r !== "member").length ? (
                          <span className="tuile-tontine__roles">{g.roles.filter((r) => r !== "member").map((r) => dyn(`role.${r}`)).join(" · ")}</span>
                        ) : null}
                      </>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )
        }
      </Charge>
    </div>
  );
}

export function Notifications({ session, onOuvrir }: { readonly session: Session; readonly onOuvrir: (groupId: string) => void }) {
  const { tx, dyn, date } = useTextes();
  const { etat, recharger } = useDonnees(() => acces.notifications(session), [session.sessionId]);
  return (
    <div className="pile">
      <div className="barre-titre">
        <h2>{tx("app.notifications")}</h2>
        <button
          type="button"
          className="bouton bouton-secondaire bouton-compact"
          onClick={() => void acces.marquerLues(session, "all").then(recharger, recharger)}
        >
          {tx("no.toutLu")}
        </button>
      </div>
      <Charge etat={etat} recharger={recharger}>
        {(liste) =>
          liste.length === 0 ? (
            <p>{tx("no.aucune")}</p>
          ) : (
            <ul className="liste">
              {liste.map((n) => (
                <li key={n.notificationId} className={n.read ? "liste__ligne" : "liste__ligne liste__ligne--nouveau"}>
                  <div>
                    <strong>{dyn(`notif.${n.kind}`) === `notif.${n.kind}` ? libelleNotification(n.kind) : dyn(`notif.${n.kind}`)}</strong>
                    <span className="aide-champ">
                      {n.groupName ?? ""} · {date(n.createdAt)}
                    </span>
                  </div>
                  {n.groupId ? (
                    <button type="button" className="bouton bouton-secondaire bouton-compact" onClick={() => onOuvrir(n.groupId as string)}>
                      {tx("td.apercu")}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )
        }
      </Charge>
    </div>
  );
}

/** Libellé lisible d'un type de notification (« meeting.reminder » → « Meeting reminder »). */
function libelleNotification(kind: string): string {
  const s = kind.replace(/[._]/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
