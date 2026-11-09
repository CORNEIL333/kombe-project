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

/** Le plus urgent d'abord : à payer, par date ; puis les autres ; les adhésions en attente à la fin. */
function parUrgence(a: TontineSummary, b: TontineSummary): number {
  const poids = (g: TontineSummary) => (g.membershipState === "pending" ? 2 : BigInt(g.myOpenDue || "0") > 0n ? 0 : 1);
  return poids(a) - poids(b) || (a.nextMeetingDate ?? "9").localeCompare(b.nextMeetingDate ?? "9");
}

export function MesGroupes({ session, groupes, aller }: { readonly session: Session; readonly groupes: GroupeActif; readonly aller: (r: Route) => void }) {
  const { tx, dyn, xaf, date } = useTextes();
  const liste = groupes.groupes;
  const role = (g: TontineSummary) => g.roles.find((r) => r !== "member") ?? "member";
  return (
    <div className="pile ecran groupes">
      <header className="entete-liste">
        <h1 className="ecran-titre-simple">{tx("gr.titre")}</h1>
        <div className="entete-liste__actions">
          <button type="button" className="bouton-petit" onClick={() => aller({ ecran: "rejoindre" })}>
            {tx("gr.rejoindre")}
          </button>
          <button type="button" className="bouton-petit" onClick={() => aller({ ecran: "creer" })}>
            <Icone nom="plus" taille={18} />
            {tx("gr.creer")}
          </button>
        </div>
      </header>
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
          {[...liste].sort(parUrgence).map((g) => {
            const actif = g.groupId === groupes.actif?.groupId;
            const attente = g.membershipState === "pending";
            const du = BigInt(g.myOpenDue || "0");
            const r = role(g);
            const cy = g.cyclePosition;
            const retard = du > 0n && !!g.nextMeetingDate && new Date(g.nextMeetingDate).getTime() < Date.now();
            const ouvrir = () => {
              groupes.choisir(g.groupId);
              aller({ ecran: "groupe", groupId: g.groupId });
            };
            return (
              <li key={g.groupId} className={attente ? "carte-groupe is-attente" : "carte-groupe"} data-teinte={attente ? undefined : teinteGroupe(g.groupId)}>
                <button type="button" className="carte-groupe__corps" disabled={attente} onClick={ouvrir}>
                  <span className="carte-groupe__tete">
                    <AvatarGroupe session={session} groupId={g.groupId} nom={g.name} version={g.photoVersion} taille={48} />
                    <span className="carte-groupe__texte">
                      <span className="carte-groupe__nom">{g.name}</span>
                      <span className="carte-groupe__role">{attente ? tx("acc.enAttente") : dyn(`role.${r}`)}</span>
                    </span>
                    {attente ? null : <Icone nom="chevron" taille={22} />}
                  </span>
                  {du > 0n ? (
                    <span className="carte-groupe__payer">
                      <span className="carte-groupe__payer-libelle">{tx("ho.aRegler")}</span>
                      <span className="carte-groupe__payer-ligne">
                        <strong>{xaf(g.myOpenDue)}</strong>
                        {retard ? <span className="pastille pastille--alerte">{tx("ho.enRetard")}</span> : g.nextMeetingDate ? <span>{tx("ho.avant", { date: date(g.nextMeetingDate) })}</span> : null}
                      </span>
                    </span>
                  ) : null}
                  {!attente && cy ? (
                    <span className="carte-groupe__cycle">
                      <BandeCycle courant={cy.current} total={cy.total} libelle={tx("gr.cycle", { n: cy.current, total: cy.total })} clair />
                      <span>{tx("gr.cycle", { n: cy.current, total: cy.total })}</span>
                    </span>
                  ) : null}
                  {actif ? <span className="visuellement-cache">{tx("gr.actif")}</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
