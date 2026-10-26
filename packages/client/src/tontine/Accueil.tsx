/* KÓMBE — accueil « Mes tontines » (I-06) : la personne voit ses groupes,
   ce qu'elle doit, sa prochaine séance et la date de sa remise ; elle touche
   un groupe pour l'ouvrir. Aucun identifiant n'est jamais saisi à la main. */

import { acces, type Session } from "./api.js";
import { Carte, Charge, Pastille, useDonnees } from "./ui.js";
import { Icone } from "../composants/Icones.js";
import { useTextes } from "./textes.js";
import { BandeauPhoto, photoPour, urlPhoto } from "../composants/Scene.js";
import { Orbite } from "../composants/Orbite.js";

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
  const moi = useDonnees(() => acces.moi(session), [session.sessionId]);
  const prenom = moi.etat.statut === "ok" && moi.etat.donnees.displayName ? moi.etat.donnees.displayName.split(" ")[0] : null;
  const groupes = etat.statut === "ok" ? etat.donnees : null;
  const aRegler = groupes ? groupes.filter((g) => g.membershipState !== "pending" && BigInt(g.myOpenDue || "0") > 0n).length : 0;

  return (
    <div className="pile ecran">
      <BandeauPhoto
        photo="cercle-vue-dessus"
        surtitre={tx("imm.accSur")}
        titre={prenom ? `${tx("imm.bonjour", { nom: prenom })} ${tx("imm.accTitre")}` : tx("acc.titre")}
        accent={tx("imm.accAccent")}
        orbite={<Orbite total={8} courant={3} variante="marque" taille={150} />}
      >
        {groupes && groupes.length ? (
          <ul className="bandeau-photo__chiffres">
            <li>{tx("imm.tontines", { n: groupes.length })}</li>
            <li data-ton={aRegler ? "attente" : "ok"}>{aRegler ? tx("imm.aRegler", { n: aRegler }) : tx("acc.aJour")}</li>
          </ul>
        ) : null}
        <div className="bandeau-photo__actions">
          <button type="button" className="bouton" onClick={onCreer}>
            {tx("acc.creer")}
          </button>
          <button type="button" className="bouton bouton-secondaire" onClick={onRejoindre}>
            {tx("acc.rejoindre")}
          </button>
        </div>
      </BandeauPhoto>
      <Charge etat={etat} recharger={recharger}>
        {(liste) =>
          liste.length === 0 ? (
            <section className="etat-vide">
              <img className="etat-vide__photo" src={urlPhoto("mains-telephone")} alt="" decoding="async" />
              <div className="etat-vide__texte">
                <h3>{tx("imm.accVideTitre")}</h3>
                <p>{tx("acc.aucune")}</p>
                <p className="aide-champ">{tx("imm.accVideTexte")}</p>
              </div>
            </section>
          ) : (
            <ul className="grille-tontines" aria-label={tx("acc.titre")}>
              {liste.map((g, i) => (
                <li key={g.groupId} className="entree-decalee" style={{ animationDelay: `${80 + i * 70}ms` }}>
                  <button type="button" className="tuile-tontine" onClick={() => onOuvrir(g.groupId)} disabled={g.membershipState === "pending"}>
                    <span className="tuile-tontine__couverture" aria-hidden="true">
                      <img src={urlPhoto(photoPour(g.groupId), true)} alt="" decoding="async" loading="lazy" />
                      <span className="tuile-tontine__monogramme">{g.name.trim().charAt(0).toUpperCase()}</span>
                    </span>
                    <span className="tuile-tontine__corps">
                      <span className="tuile-tontine__nom">{g.name}</span>
                      <span className="tuile-tontine__meta">
                        {dyn(`etat.${g.state}`)} · {tx("acc.membres", { n: g.memberCount })} · {xaf(g.contributionPerShare)}
                      </span>
                      {g.membershipState === "pending" ? (
                        <Pastille ton="attente">{tx("acc.enAttente")}</Pastille>
                      ) : (
                        <>
                          <span className="tuile-tontine__ligne">{g.nextMeetingDate ? tx("acc.prochaine", { date: date(g.nextMeetingDate) }) : tx("acc.sansSeance")}</span>
                          {BigInt(g.myOpenDue || "0") > 0n ? (
                            <Pastille ton="attente">{tx("acc.aRegler", { montant: xaf(g.myOpenDue) })}</Pastille>
                          ) : (
                            <Pastille ton="ok">{tx("acc.aJour")}</Pastille>
                          )}
                          {g.myPayoutDate ? (
                            <span className="tuile-tontine__remise">
                              <span className="accent-or" aria-hidden="true" />
                              {tx("acc.maRemise", { date: date(g.myPayoutDate) })}
                            </span>
                          ) : null}
                          {g.roles.filter((r) => r !== "member").length ? (
                            <span className="tuile-tontine__roles">{g.roles.filter((r) => r !== "member").map((r) => dyn(`role.${r}`)).join(" · ")}</span>
                          ) : null}
                        </>
                      )}
                    </span>
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
  const nouvelles = etat.statut === "ok" ? etat.donnees.filter((n) => !n.read).length : 0;
  return (
    <div className="pile ecran">
      <BandeauPhoto photo="mains-telephone" variante="compact" surtitre={tx("app.notifications")} titre={tx("imm.noTitre")} accent={tx("imm.noAccent")}>
        <div className="bandeau-photo__actions">
          {nouvelles ? <span className="pastille-verre">{tx("imm.nouvelles", { n: nouvelles })}</span> : null}
          <button
            type="button"
            className="bouton bouton-secondaire bouton-compact"
            onClick={() => void acces.marquerLues(session, "all").then(recharger, recharger)}
          >
            {tx("no.toutLu")}
          </button>
        </div>
      </BandeauPhoto>
      <Charge etat={etat} recharger={recharger}>
        {(liste) =>
          liste.length === 0 ? (
            <p className="msg">{tx("no.aucune")}</p>
          ) : (
            <ul className="liste liste-notifications">
              {liste.map((n, i) => (
                <li
                  key={n.notificationId}
                  className={`entree-decalee liste__ligne${n.read ? "" : " liste__ligne--nouveau"}`}
                  style={{ animationDelay: `${60 + i * 60}ms` }}
                >
                  <span className="notif-icone" data-famille={familleNotification(n.kind)} aria-hidden="true" />
                  <div>
                    <strong>{dyn(`notif.${n.kind}`) === `notif.${n.kind}` ? libelleNotification(n.kind) : dyn(`notif.${n.kind}`)}</strong>
                    <span className="aide-champ">
                      {n.groupName ?? ""} · {date(n.createdAt)}
                    </span>
                  </div>
                  {n.groupId ? (
                    <button type="button" className="bouton bouton-secondaire bouton-compact bouton-avec-icone" onClick={() => onOuvrir(n.groupId as string)} title={tx("td.apercu")}>
                      <Icone nom="accueil" taille={18} />
                      <span className="bouton-libelle">{tx("td.apercu")}</span>
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

/** Famille visuelle d'une notification (icône seulement ; le texte fait foi). */
function familleNotification(kind: string): "argent" | "seance" | "decision" | "autre" {
  if (/payout|due|contribution|fine|payment|fund/.test(kind)) return "argent";
  if (/meeting|minutes/.test(kind)) return "seance";
  if (/validation|vote|decision|aid|member/.test(kind)) return "decision";
  return "autre";
}

/** Libellé lisible d'un type de notification (« meeting.reminder » → « Meeting reminder »). */
function libelleNotification(kind: string): string {
  const s = kind.replace(/[._]/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
