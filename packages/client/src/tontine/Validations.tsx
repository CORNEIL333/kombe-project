/* KÓMBE — validations du bureau, toutes tontines confondues : la trésorerie
   confirme les versements déclarés, le commissaire aux comptes contrôle ce
   qui a été confirmé. Mêmes composants et mêmes règles que dans la tontine
   (jamais sa propre déclaration, contrôle par une troisième personne). */

import { acces, tontines, type Session, type TontineSummary } from "./api.js";
import { AConfirmer, AControler } from "./Argent.js";
import { estBureau, ouvrirBureau } from "./bureau.js";
import { peut } from "./droits.js";
import type { ContexteGroupe } from "./Groupe.js";
import { BoutonIcone, Charge, useDonnees } from "./ui.js";
import { useTextes } from "./textes.js";
import { Icone } from "../composants/Icones.js";

export function Validations({ session, onOuvrirGroupe }: { readonly session: Session; readonly onOuvrirGroupe: (groupId: string) => void }) {
  const { tx } = useTextes();
  const mes = useDonnees(() => acces.mesTontines(session), [session.sessionId]);
  return (
    <div className="pile ecran">
      <header className="ecran-titre">
        <span className="ecran-titre__icone" aria-hidden="true">
          <Icone nom="validations" taille={26} />
        </span>
        <div>
          <h1>{tx("pf.validations")}</h1>
          <p className="aide-champ">{tx("va.intro")}</p>
        </div>
      </header>
      <Charge etat={mes.etat} recharger={mes.recharger}>
        {(liste) => {
          const concernees = liste.filter(
            (g) => g.membershipState === "active" && (peut(g.roles, "movement.confirm") || peut(g.roles, "movement.control")),
          );
          return concernees.length === 0 ? (
            <p className="tcarte">{tx("va.aucune")}</p>
          ) : (
            <>
              {concernees.map((g) => (
                <ValidationsGroupe key={g.groupId} session={session} resume={g} onOuvrirGroupe={onOuvrirGroupe} />
              ))}
            </>
          );
        }}
      </Charge>
    </div>
  );
}

function ValidationsGroupe({ session, resume, onOuvrirGroupe }: { readonly session: Session; readonly resume: TontineSummary; readonly onOuvrirGroupe: (groupId: string) => void }) {
  const { tx } = useTextes();
  const detail = useDonnees(() => tontines.detail(session, resume.groupId), [resume.groupId]);
  return (
    <section className="validations-groupe" aria-label={resume.name}>
      <header className="validations-groupe__entete">
        <h2>{resume.name}</h2>
        <div className="liste__actions">
          {estBureau(resume.roles) ? (
            <BoutonIcone icone="bureau" ton="or" libelle={tx("app.bureauDe", { nom: resume.name })} onClick={() => ouvrirBureau(session, resume.groupId)} />
          ) : null}
          <BoutonIcone icone="fleche" ton="primaire" libelle={tx("pf.ouvrir", { nom: resume.name })} onClick={() => onOuvrirGroupe(resume.groupId)} />
        </div>
      </header>
      <Charge etat={detail.etat} recharger={detail.recharger}>
        {(g) => {
          const ctx: ContexteGroupe = { session, groupe: g, roles: g.me.roles, rafraichir: detail.recharger };
          return (
            <>
              {peut(g.me.roles, "movement.confirm") ? <AConfirmer ctx={ctx} onFini={detail.recharger} /> : null}
              {peut(g.me.roles, "movement.control") ? <AControler ctx={ctx} onFini={detail.recharger} /> : null}
            </>
          );
        }}
      </Charge>
    </section>
  );
}
