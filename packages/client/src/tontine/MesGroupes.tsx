/* KÓMBE — onglet « Groupes » (planche de référence) : toutes mes tontines,
   leur photo ou leur couverture tissée, ma fonction, la progression réelle du
   cycle, la prochaine cotisation, l'accès au bureau selon la fonction ;
   créer et rejoindre en tuiles. Le sélecteur de la barre du haut sert au
   changement rapide ; cet onglet est la vue complète et permanente. */

import { BandeCycle } from "./BandeCycle.js";
import type { Route } from "../App.js";
import type { Session, TontineSummary } from "./api.js";
import { estBureau, ouvrirBureau } from "./bureau.js";
import type { GroupeActif } from "./groupeActif.js";
import { AvatarGroupe, teinteGroupe } from "./PhotoGroupe.js";
import { useTextes } from "./textes.js";
import { Icone } from "../composants/Icones.js";

export function MesGroupes({ session, groupes, aller }: { readonly session: Session; readonly groupes: GroupeActif; readonly aller: (r: Route) => void }) {
  const { tx, dyn, xaf, date } = useTextes();
  const liste = groupes.groupes;
  const role = (g: TontineSummary) => g.roles.find((r) => r !== "member") ?? "member";
  return (
    <div className="pile ecran groupes">
      <header className="entete-ecran">
        <h1 className="ecran-titre-simple">{tx("gr.titre")}</h1>
        <p className="ecran-sous-titre">{tx("gr.sousTitre")}</p>
      </header>
      <div className="tuiles-groupes">
        <button type="button" className="tuile-groupe tuile-groupe--forte" onClick={() => aller({ ecran: "creer" })}>
          <Icone nom="plus" taille={24} />
          <span>{tx("gr.creerTuile")}</span>
        </button>
        <button type="button" className="tuile-groupe" onClick={() => aller({ ecran: "rejoindre" })}>
          <Icone nom="inviter" taille={24} />
          <span>{tx("gr.rejoindreTuile")}</span>
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
            const r = role(g);
            const cy = g.cyclePosition;
            const pct = cy && cy.total > 0 ? Math.round((cy.current / cy.total) * 100) : null;
            const ouvrir = () => {
              groupes.choisir(g.groupId);
              aller({ ecran: "groupe", groupId: g.groupId });
            };
            return (
              <li key={g.groupId} className={actif ? "carte-groupe is-actif" : "carte-groupe"} data-teinte={teinteGroupe(g.groupId)}>
                <button type="button" className="carte-groupe__corps" disabled={attente} onClick={ouvrir}>
                  <AvatarGroupe session={session} groupId={g.groupId} nom={g.name} version={g.photoVersion} taille={84} />
                  <span className="carte-groupe__texte">
                    <span className="carte-groupe__nom">{g.name}</span>
                    <span className="carte-groupe__meta">
                      <Icone nom="personnes" taille={16} />
                      {tx("acc.membres", { n: g.memberCount })}
                      <span className={r === "member" ? "etiquette etiquette--ok" : "etiquette etiquette--or"}>
                        {r === "member" ? null : "★ "}
                        {dyn(`role.${r}`)}
                      </span>
                    </span>
                    {attente ? (
                      <span className="etiquette etiquette--attente">{tx("acc.enAttente")}</span>
                    ) : cy && pct !== null ? (
                      <span className="carte-groupe__cycle">
                        <span>{tx("gr.cycle", { n: cy.current, total: cy.total })}</span>
                        <BandeCycle courant={cy.current} total={cy.total} libelle={tx("gr.cycle", { n: cy.current, total: cy.total })} />
                      </span>
                    ) : null}
                  </span>
                  <Icone nom="chevron" taille={20} />
                  {actif ? <span className="visuellement-cache">{tx("gr.actif")}</span> : null}
                </button>
                {!attente ? (
                  <div className="carte-groupe__pied">
                    <button type="button" className="carte-groupe__prochaine" onClick={ouvrir}>
                      <span className="carte-groupe__calendrier" aria-hidden="true">
                        <Icone nom="seance" taille={18} />
                      </span>
                      <span className="carte-groupe__prochaine-texte">
                        <span>{du > 0n ? tx("acc.aRegler", { montant: xaf(g.myOpenDue) }) : tx("ho.prochaineCotisation")}</span>
                        <strong>{g.nextMeetingDate ? date(g.nextMeetingDate) : "—"}</strong>
                      </span>
                      <Icone nom="chevron" taille={18} />
                    </button>
                    {estBureau(g.roles) ? (
                      <button type="button" className="carte-groupe__bureau" aria-label={tx("app.bureauDe", { nom: g.name })} title={tx("app.bureau")} onClick={() => ouvrirBureau(session, g.groupId)}>
                        <Icone nom="bureau" taille={20} />
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
