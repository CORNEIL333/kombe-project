/* KÓMBE — mes cotisations, toutes tontines confondues : ce qui reste à
   verser (échéances ouvertes) et l'historique de mes déclarations, avec leur
   état (déclaré → confirmé → validé). Une déclaration se fait depuis la
   tontine concernée (même formulaire, mêmes règles). */

import { argent, acces, type MovementView, type Session, type TontineSummary } from "./api.js";
import { LigneMouvement } from "./Argent.js";
import { useNomCaisse } from "./Caisses.js";
import { BoutonIcone, Carte, Charge, Pastille, useDonnees } from "./ui.js";
import { useTextes } from "./textes.js";
import { Icone } from "../composants/Icones.js";

export function MesCotisations({ session, onOuvrirGroupe }: { readonly session: Session; readonly onOuvrirGroupe: (groupId: string) => void }) {
  const { tx, dyn, xaf, date } = useTextes();
  const nomCaisse = useNomCaisse();
  const tontines = useDonnees(() => acces.mesTontines(session), [session.sessionId]);
  const echeances = useDonnees(() => acces.mesEcheances(session), [session.sessionId]);
  const historique = useDonnees(async () => {
    const groupes = (await acces.mesTontines(session)).filter((g) => g.membershipState === "active");
    const listes = await Promise.all(
      groupes.map(async (g) => (await argent.mouvements(session, g.groupId, { mine: true })).map((m) => ({ m, groupe: g }))),
    );
    return listes
      .flat()
      .sort((a, b) => b.m.declaredAt.localeCompare(a.m.declaredAt))
      .slice(0, 40);
  }, [session.sessionId]);

  const nomDe = (gid: string): string =>
    tontines.etat.statut === "ok" ? (tontines.etat.donnees.find((g: TontineSummary) => g.groupId === gid)?.name ?? "") : "";

  return (
    <div className="pile ecran">
      <header className="ecran-titre">
        <span className="ecran-titre__icone" aria-hidden="true">
          <Icone nom="declarer" taille={26} />
        </span>
        <div>
          <h1>{tx("nav.cotisations")}</h1>
          <p className="aide-champ">{tx("mc.intro")}</p>
        </div>
      </header>

      <Carte titre={tx("mc.aVerser")}>
        <Charge etat={echeances.etat} recharger={echeances.recharger}>
          {(liste) =>
            liste.length === 0 ? (
              <p>{tx("acc.aJour")}</p>
            ) : (
              <ul className="liste">
                {liste.map((d) => (
                  <li key={`${d.groupId}-${d.fundId}-${d.roundSeq}`} className="liste__ligne">
                    <div>
                      <strong>
                        {nomCaisse(d)} · {xaf(d.remaining)}
                      </strong>
                      <span className="aide-champ">
                        {nomDe(d.groupId)} · {tx("ar.tour")} {d.roundSeq} · {date(d.date)}
                      </span>
                      <Pastille ton={d.lateness === "late" ? "alerte" : d.lateness === "grace" ? "attente" : "neutre"}>{dyn(`ar.retard.${d.lateness}`)}</Pastille>
                    </div>
                    <div className="liste__actions">
                      <BoutonIcone icone="declarer" ton="primaire" libelle={tx("mc.declarerDans", { nom: nomDe(d.groupId) })} onClick={() => onOuvrirGroupe(d.groupId)} />
                    </div>
                  </li>
                ))}
              </ul>
            )
          }
        </Charge>
      </Carte>

      <Carte titre={tx("mc.historique")}>
        <Charge etat={historique.etat} recharger={historique.recharger}>
          {(liste: { m: MovementView; groupe: TontineSummary }[]) =>
            liste.length === 0 ? (
              <p>{tx("app.vide")}</p>
            ) : (
              <ul className="liste">
                {liste.map(({ m, groupe }) => (
                  <LigneMouvement
                    key={m.movementId}
                    m={m}
                    actions={<BoutonIcone icone="fleche" libelle={tx("pf.ouvrir", { nom: groupe.name })} onClick={() => onOuvrirGroupe(groupe.groupId)} />}
                  />
                ))}
              </ul>
            )
          }
        </Charge>
      </Carte>
    </div>
  );
}
