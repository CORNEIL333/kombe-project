/* KÓMBE — onglet « Groupes » : toutes mes tontines (actives et en attente),
   leur photo ou leurs initiales, ma fonction, l'essentiel utile, l'accès au
   bureau selon la fonction ; rejoindre et créer en actions compactes. Le
   sélecteur de la barre du haut sert au changement rapide ; cet onglet est
   la vue complète et permanente. */

import type { Route } from "../App.js";
import type { Session, TontineSummary } from "./api.js";
import { estBureau, ouvrirBureau } from "./bureau.js";
import type { GroupeActif } from "./groupeActif.js";
import { AvatarGroupe } from "./PhotoGroupe.js";
import { useTextes } from "./textes.js";
import { Icone } from "../composants/Icones.js";

export function MesGroupes({ session, groupes, aller }: { readonly session: Session; readonly groupes: GroupeActif; readonly aller: (r: Route) => void }) {
  const { tx, dyn, xaf, date } = useTextes();
  const liste = groupes.groupes;
  const roles = (g: TontineSummary) => g.roles.filter((r) => r !== "member").map((r) => dyn(`role.${r}`)).join(" · ") || dyn("role.member");
  return (
    <div className="pile ecran groupes">
      <div className="titre-section titre-section--action">
        <h1 className="ecran-titre-simple">{tx("gr.titre")}</h1>
      </div>
      <div className="actions-ligne">
        <button type="button" className="bouton bouton-secondaire bouton-compact" onClick={() => aller({ ecran: "rejoindre" })}>
          <Icone nom="inviter" taille={18} />
          {tx("gr.rejoindre")}
        </button>
        <button type="button" className="bouton bouton-secondaire bouton-compact" onClick={() => aller({ ecran: "creer" })}>
          <Icone nom="plus" taille={18} />
          {tx("gr.creer")}
        </button>
      </div>
      {liste === null ? (
        <ul className="cartes-groupes" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="carte-groupe squelette" />
          ))}
        </ul>
      ) : liste.length === 0 ? (
        <p className="msg">{tx("gr.aucun")}</p>
      ) : (
        <ul className="cartes-groupes">
          {liste.map((g) => {
            const actif = g.groupId === groupes.actif?.groupId;
            const attente = g.membershipState === "pending";
            const du = BigInt(g.myOpenDue || "0");
            return (
              <li key={g.groupId} className={actif ? "carte-groupe is-actif" : "carte-groupe"}>
                <button
                  type="button"
                  className="carte-groupe__corps"
                  disabled={attente}
                  onClick={() => {
                    groupes.choisir(g.groupId);
                    aller({ ecran: "groupe", groupId: g.groupId });
                  }}
                >
                  <AvatarGroupe session={session} groupId={g.groupId} nom={g.name} version={g.photoVersion} taille={56} />
                  <span className="carte-groupe__texte">
                    <span className="carte-groupe__nom">{g.name}</span>
                    <span className="carte-groupe__meta">
                      {roles(g)} · {tx("acc.membres", { n: g.memberCount })}
                    </span>
                    {attente ? (
                      <span className="etiquette etiquette--attente">{tx("acc.enAttente")}</span>
                    ) : (
                      <span className="carte-groupe__infos">
                        <span className={du > 0n ? "etiquette etiquette--attente" : "etiquette etiquette--ok"}>
                          {du > 0n ? tx("acc.aRegler", { montant: xaf(g.myOpenDue) }) : tx("acc.aJour")}
                        </span>
                        {g.nextMeetingDate ? <span className="carte-groupe__date">{tx("acc.prochaine", { date: date(g.nextMeetingDate) })}</span> : null}
                      </span>
                    )}
                  </span>
                  {actif ? <span className="visuellement-cache">{tx("gr.actif")}</span> : null}
                </button>
                {!attente && estBureau(g.roles) ? (
                  <button type="button" className="carte-groupe__bureau" aria-label={tx("app.bureauDe", { nom: g.name })} onClick={() => ouvrirBureau(session, g.groupId)}>
                    <Icone nom="bureau" taille={20} />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
