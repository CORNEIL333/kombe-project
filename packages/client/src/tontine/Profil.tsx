/* KÓMBE — profil de la personne connectée : identité, tontines et fonctions,
   langue, sécurité de la session, aide. Les données viennent du serveur
   (/v1/me, /v1/me/tontines, /v1/me/dues) ; rien n'est inventé. */

import { useEffect, useState } from "react";
import { acces, type Session } from "./api.js";
import { estBureau, ouvrirBureau } from "./bureau.js";
import { lireFile, surChangementFile } from "./fileAttenteMoteur.js";
import { BoutonIcone, Carte, Charge, Retour, useAction, useDonnees } from "./ui.js";
import { useTextes } from "./textes.js";
import { useLangue } from "../i18n/ContexteLangue.js";
import type { Langue } from "../i18n/dictionnaires.js";
import { Icone, type NomIcone } from "../composants/Icones.js";

function initiales(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  return ((mots[0]?.[0] ?? "") + (mots.length > 1 ? (mots[mots.length - 1]?.[0] ?? "") : "")).toUpperCase() || "K";
}

const LANGUES: { id: Langue; court: string; nom: string }[] = [
  { id: "fr", court: "FR", nom: "Français" },
  { id: "en", court: "EN", nom: "English" },
  { id: "pcm", court: "PCM", nom: "Pidgin" },
];

export function Profil({
  session,
  onOuvrirGroupe,
  onAller,
  onDeconnecter,
}: {
  readonly session: Session;
  readonly onOuvrirGroupe: (groupId: string) => void;
  readonly onAller: (ecran: "cotisations" | "validations" | "aide" | "notifications") => void;
  readonly onDeconnecter: () => void;
}) {
  const { tx, dyn, xaf, date } = useTextes();
  const { langue, definirLangue } = useLangue();
  const moi = useDonnees(() => acces.moi(session), [session.sessionId]);
  const tontines = useDonnees(() => acces.mesTontines(session), [session.sessionId]);
  const echeances = useDonnees(() => acces.mesEcheances(session), [session.sessionId]);
  const [edition, setEdition] = useState(false);
  const [nom, setNom] = useState("");
  const [enAttente, setEnAttente] = useState(() => lireFile().length);
  const action = useAction();
  useEffect(() => surChangementFile(() => setEnAttente(lireFile().length)), []);

  const enregistrer = async () => {
    const r = await action.lancer(() => acces.majMoi(session, { displayName: nom.trim() }), tx("pf.enregistre"));
    if (r) {
      setEdition(false);
      moi.recharger();
    }
  };
  const choisirLangue = (l: Langue) => {
    definirLangue(l);
    // Le serveur ne connaît que fr/en (notifications, PV) ; le pidgin reste local.
    if (l === "fr" || l === "en") void acces.majMoi(session, { language: l }).catch(() => undefined);
  };

  const actives = tontines.etat.statut === "ok" ? tontines.etat.donnees.filter((g) => g.membershipState === "active") : [];
  const aRegler = echeances.etat.statut === "ok" ? echeances.etat.donnees.reduce((s, d) => s + BigInt(d.remaining), 0n) : null;
  const bureau = actives.filter((g) => estBureau(g.roles));

  return (
    <div className="pile ecran profil">
      <Charge etat={moi.etat} recharger={moi.recharger}>
        {(m) => (
          <section className="profil-entete" aria-labelledby="profil-nom">
            <span className="profil-entete__avatar" aria-hidden="true">
              {initiales(m.displayName ?? m.login)}
            </span>
            <div className="profil-entete__texte">
              {edition ? (
                <form
                  className="profil-entete__form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void enregistrer();
                  }}
                >
                  <label htmlFor="profil-nom-champ" className="visuellement-cache">
                    {tx("pf.nom")}
                  </label>
                  <input id="profil-nom-champ" value={nom} maxLength={80} autoFocus onChange={(e) => setNom(e.target.value)} />
                  <BoutonIcone icone="coche" libelle={tx("pf.enregistrer")} ton="primaire" desactive={action.enCours || nom.trim().length < 2} onClick={() => void enregistrer()} />
                  <BoutonIcone icone="fermer" libelle={tx("app.annuler")} onClick={() => setEdition(false)} />
                </form>
              ) : (
                <h1 id="profil-nom" className="profil-entete__nom">
                  {m.displayName ?? tx("pf.sansNom")}
                </h1>
              )}
              <p className="profil-entete__login">
                <Icone nom={m.login.includes("@") ? "courriel" : "telephone"} taille={16} />
                {m.login}
              </p>
              <Retour erreur={action.erreur} succes={action.succes} />
            </div>
            {edition ? null : (
              <BoutonIcone
                icone="modifier"
                libelle={tx("pf.modifierNom")}
                onClick={() => {
                  setNom(m.displayName ?? "");
                  setEdition(true);
                }}
              />
            )}
          </section>
        )}
      </Charge>

      <ul className="profil-chiffres">
        <li>
          <Icone nom="groupes" taille={22} />
          <span>{tx("pf.tontines")}</span>
          <strong>{tontines.etat.statut === "ok" ? actives.length : "—"}</strong>
        </li>
        <li>
          <Icone nom="cagnotte" taille={22} />
          <span>{tx("pf.aRegler")}</span>
          <strong>{aRegler === null ? "—" : xaf(aRegler)}</strong>
        </li>
        <li>
          <Icone nom="bureau" taille={22} />
          <span>{tx("pf.bureau")}</span>
          <strong>{tontines.etat.statut === "ok" ? bureau.length : "—"}</strong>
        </li>
      </ul>

      <nav className="profil-raccourcis" aria-label={tx("pf.raccourcis")}>
        <BoutonIcone icone="declarer" libelle={tx("nav.cotisations")} legende onClick={() => onAller("cotisations")} />
        {bureau.length > 0 ? <BoutonIcone icone="validations" libelle={tx("pf.validations")} legende onClick={() => onAller("validations")} /> : null}
        <BoutonIcone icone="cloche" libelle={tx("nav.activite")} legende onClick={() => onAller("notifications")} />
        <BoutonIcone icone="aide" libelle={tx("pf.aide")} legende onClick={() => onAller("aide")} />
      </nav>

      <Carte titre={tx("pf.mesTontines")}>
        <Charge etat={tontines.etat} recharger={tontines.recharger}>
          {() =>
            actives.length === 0 ? (
              <p>{tx("pf.aucuneTontine")}</p>
            ) : (
              <ul className="liste">
                {actives.map((g) => (
                  <li key={g.groupId} className="liste__ligne">
                    <div>
                      <strong>{g.name}</strong>
                      <span className="aide-champ">
                        {g.roles.filter((r) => r !== "member").map((r) => dyn(`role.${r}`)).join(" · ") || dyn("role.member")}
                        {g.nextMeetingDate ? ` · ${tx("pf.prochaine", { date: date(g.nextMeetingDate) })}` : ""}
                      </span>
                    </div>
                    <div className="liste__actions">
                      {estBureau(g.roles) ? (
                        <BoutonIcone icone="bureau" ton="or" libelle={tx("app.bureauDe", { nom: g.name })} onClick={() => ouvrirBureau(session, g.groupId)} />
                      ) : null}
                      <BoutonIcone icone="fleche" ton="primaire" libelle={tx("pf.ouvrir", { nom: g.name })} onClick={() => onOuvrirGroupe(g.groupId)} />
                    </div>
                  </li>
                ))}
              </ul>
            )
          }
        </Charge>
      </Carte>

      <Carte titre={tx("pf.preferences")}>
        <div className="profil-reglage">
          <span className="profil-reglage__icone">
            <Icone nom="langue" taille={20} />
          </span>
          <span className="profil-reglage__texte">
            <strong>{tx("pf.langue")}</strong>
          </span>
          <div className="saut-langue" role="group" aria-label={tx("pf.langue")}>
            {LANGUES.map((l) => (
              <button key={l.id} type="button" lang={l.id === "pcm" ? "en" : l.id} aria-pressed={langue === l.id} title={l.nom} onClick={() => choisirLangue(l.id)}>
                {l.court}
              </button>
            ))}
          </div>
        </div>
      </Carte>

      <Carte titre={tx("pf.securite")}>
        <ul className="profil-lignes">
          <LigneInfo icone="cadenas" titre={tx("pf.codeUnique")} texte={tx("pf.codeUniqueTexte")} />
          <LigneInfo icone="appareil" titre={tx("pf.session")} texte={tx("pf.sessionTexte", { date: date(new Date(session.expiresAt).toISOString()) })} />
          <LigneInfo
            icone="hors-ligne"
            titre={tx("pf.enAttente")}
            texte={enAttente > 0 ? tx("pf.enAttenteN", { n: enAttente }) : tx("pf.enAttenteRien")}
            ton={enAttente > 0 ? "attente" : undefined}
          />
          <LigneInfo icone="bouclier" titre={tx("pf.argent")} texte={tx("pf.argentTexte")} />
        </ul>
        <button type="button" className="bouton bouton-danger profil-sortie" onClick={onDeconnecter}>
          <Icone nom="sortir" taille={18} />
          {tx("app.deconnexion")}
        </button>
      </Carte>

      <Carte titre={tx("pf.aideSupport")}>
        <nav className="profil-grille" aria-label={tx("pf.aideSupport")}>
          <LienIcone icone="aide" libelle={tx("pf.centreAide")} onClick={() => onAller("aide")} />
          <LienIcone icone="contact" libelle={tx("pf.contact")} href="/site/aide/#contact" />
          <LienIcone icone="bouclier-plein" libelle={tx("pf.securiteSite")} href="/site/securite/" />
          <LienIcone icone="document" libelle={tx("pf.confidentialite")} href="/site/legal/confidentialite/" />
          <LienIcone icone="telecharger" libelle={tx("pf.appli")} href="/site/telecharger/" />
          <LienIcone icone="monde" libelle={tx("pf.site")} href="/site/" />
        </nav>
      </Carte>
    </div>
  );
}

function LigneInfo({ icone, titre, texte, ton }: { readonly icone: NomIcone; readonly titre: string; readonly texte: string; readonly ton?: "attente" | undefined }) {
  return (
    <li className={ton ? "profil-reglage profil-reglage--attente" : "profil-reglage"}>
      <span className="profil-reglage__icone">
        <Icone nom={icone} taille={20} />
      </span>
      <span className="profil-reglage__texte">
        <strong>{titre}</strong>
        <span className="aide-champ">{texte}</span>
      </span>
    </li>
  );
}

/** Tuile icône : lien (page du site) ou action (écran du PWA). */
function LienIcone({ icone, libelle, href, onClick }: { readonly icone: NomIcone; readonly libelle: string; readonly href?: string; readonly onClick?: () => void }) {
  const contenu = (
    <>
      <span className="profil-grille__icone">
        <Icone nom={icone} taille={22} />
      </span>
      <span className="profil-grille__libelle">{libelle}</span>
    </>
  );
  return href ? (
    <a className="profil-grille__tuile" href={href}>
      {contenu}
    </a>
  ) : (
    <button type="button" className="profil-grille__tuile" onClick={onClick}>
      {contenu}
    </button>
  );
}
