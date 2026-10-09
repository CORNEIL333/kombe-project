/* KÓMBE — connexion RÉELLE (ADR-0024, Piste A3 suite). Code à 6 chiffres par
   email, jamais de mot de passe. Écran plein-bord à deux panneaux (direction
   visuelle fournie par le porteur) : à gauche le panneau de marque immersif
   (photo réelle + promesse + atouts), à droite le panneau fonctionnel — UNE
   action à la fois, l'étape « code » n'existe tant que l'email n'est pas
   envoyé, et vice versa. Contrat HTTP prouvé par
   `docs/PREUVES_PISTE_A3_SERVEUR.md` (A3-LOGIN). */

import { useState } from "react";
import { useLangue } from "../i18n/ContexteLangue.js";
import type { CleI18n } from "../i18n/dictionnaires.js";
import { ChampTexte } from "../composants/Champs.js";
import { ChampCode } from "../composants/ChampCode.js";
import { ZoneEtat } from "../composants/Etats.js";
import { ApiError, creerCompte, verifierInscription, confirmerConnexion, demanderConnexion } from "../api/kombeApi.js";

export interface SessionOuverte {
  readonly sessionId: string;
  readonly identityId: string;
}

export interface ConnexionProps {
  readonly onConnecte: (session: SessionOuverte) => void;
}

function messageErreur(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return err instanceof Error ? err.message : String(err);
}

const ATOUTS: ReadonlyArray<{ readonly icone: string; readonly titre: CleI18n; readonly texte: CleI18n }> = [
  { icone: "", titre: "atout.securise.titre", texte: "atout.securise.texte" },
  { icone: "", titre: "atout.solidaire.titre", texte: "atout.solidaire.texte" },
  { icone: "", titre: "atout.simple.titre", texte: "atout.simple.texte" },
  { icone: "", titre: "atout.durable.titre", texte: "atout.durable.texte" },
];

function PanneauMarque() {
  const { t } = useLangue();
  return (
    <aside className="panneau-marque">
      <div className="panneau-marque__marque">
        <img src="/brand/kombe-mark.svg" alt="" aria-hidden="true" />
        <span>
          <strong>{t("app.titre")}</strong>
          <small>{t("marque.tagline")}</small>
        </span>
      </div>

      <div className="panneau-marque__corps">
        <h1>
          {t("connexion.headlinePlain")} <em>{t("connexion.headlineAccent")}</em>
          <br />
          {t("connexion.headlineSuite")}
        </h1>
        <p>{t("connexion.sousAccroche")}</p>
        <ul className="panneau-marque__atouts">
          {ATOUTS.map((a) => (
            <li key={a.titre}>
              <span className="icone" aria-hidden="true">
                {a.icone}
              </span>
              <span>
                <strong>{t(a.titre)}</strong>
                <span>{t(a.texte)}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="panneau-marque__signature">{t("connexion.signature")}</p>
    </aside>
  );
}

function PointsEtape({ etape }: { readonly etape: 0 | 1 }) {
  return (
    <div className="points-etape" aria-hidden="true">
      <span data-actif={etape === 0 ? "true" : "false"} />
      <span data-actif={etape === 1 ? "true" : "false"} />
    </div>
  );
}

export function Connexion({ onConnecte }: ConnexionProps) {
  const { t } = useLangue();
  const [modele, setModele] = useState<"connexion" | "inscription">("connexion");
  const [etape, setEtape] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [touche, setTouche] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const emailValide = email.trim() !== "";
  const codeValide = /^\d{6}$/.test(code);

  const changerModele = (prochain: "connexion" | "inscription") => {
    setModele(prochain);
    setEtape("email");
    setCode("");
    setTouche(false);
    setErreur(null);
    setSucces(null);
  };

  const envoyerCode = () => {
    setTouche(true);
    if (!emailValide) return;
    setEnCours(true);
    setErreur(null);
    setSucces(null);
    const demande = modele === "inscription" ? creerCompte(email.trim()) : demanderConnexion(email.trim());
    void demande
      .then(() => {
        setEtape("code");
        setTouche(false);
      })
      .catch((err: unknown) => setErreur(messageErreur(err)))
      .finally(() => setEnCours(false));
  };

  const confirmer = () => {
    setTouche(true);
    if (!codeValide) return;
    setEnCours(true);
    setErreur(null);
    if (modele === "inscription") {
      // Vérifie le code d'inscription (active le compte SERVEUR), puis enchaîne
      // sans détour sur une vraie connexion : le serveur délivre un second code
      // et, à sa validation, le `sessionId` (jamais choisi par la PWA).
      void verifierInscription(email.trim(), code)
        .then(() => demanderConnexion(email.trim()))
        .then(() => {
          setModele("connexion");
          setEtape("code");
          setCode("");
          setTouche(false);
          setSucces(t("connexion.compteVerifie"));
        })
        .catch((err: unknown) => setErreur(messageErreur(err)))
        .finally(() => setEnCours(false));
      return;
    }
    void confirmerConnexion(email.trim(), code)
      .then(({ sessionId }) => onConnecte({ sessionId, identityId: email.trim() }))
      .catch((err: unknown) => setErreur(messageErreur(err)))
      .finally(() => setEnCours(false));
  };

  const enInscription = modele === "inscription";
  const titre = etape === "email" ? (enInscription ? t("connexion.titreInscription") : t("connexion.bonRetour")) : enInscription ? t("connexion.titreInscription") : t("connexion.titre");
  const consigne =
    etape === "email"
      ? enInscription
        ? t("connexion.consigneInscription")
        : t("connexion.consigne")
      : enInscription
        ? t("connexion.codeInscriptionEnvoye")
        : t("connexion.codeEnvoye");

  return (
    <div className="ecran-connexion">
      <PanneauMarque />
      <section className="panneau-formulaire" aria-labelledby="connexion-titre">
        <div className="panneau-formulaire__interieur">
          <header className="panneau-formulaire__entete">
            <img src="/brand/kombe-mark.svg" alt="" aria-hidden="true" />
            <div role="tablist" aria-label={t("connexion.titre")}>
              <button
                type="button"
                role="tab"
                aria-selected={modele === "connexion"}
                className={modele === "connexion" ? "bouton bouton-actif" : "bouton bouton-secondaire"}
                onClick={() => changerModele("connexion")}
                disabled={enCours}
              >
                {t("connexion.ongletConnexion")}
              </button>{" "}
              <button
                type="button"
                role="tab"
                aria-selected={modele === "inscription"}
                className={modele === "inscription" ? "bouton bouton-actif" : "bouton bouton-secondaire"}
                onClick={() => changerModele("inscription")}
                disabled={enCours}
              >
                {t("connexion.ongletInscription")}
              </button>
            </div>
            <PointsEtape etape={etape === "email" ? 0 : 1} />
            <h2 id="connexion-titre">{titre}</h2>
            <p className="aide-champ">{consigne}</p>
          </header>

          {etape === "email" ? (
            <>
              <ChampTexte
                libelle={t("champ.email")}
                aide={t("aide.email")}
                erreur={touche && !emailValide ? t("erreur.email") : undefined}
                valeur={email}
                requis
                onChange={setEmail}
              />
              <button type="button" className="bouton bouton-avec-icone" onClick={envoyerCode} disabled={enCours}>
                {enInscription ? t("bouton.creerCompte") : t("bouton.envoyerCode")}
                <span className="pastille-fleche" aria-hidden="true">
                  →
                </span>
              </button>
            </>
          ) : (
            <>
              <ChampCode
                libelle={t("champ.code")}
                valeur={code}
                onChange={setCode}
                erreur={touche && !codeValide ? t("erreur.code") : undefined}
              />
              <button type="button" className="bouton bouton-avec-icone" onClick={confirmer} disabled={enCours}>
                {enInscription ? t("bouton.verifierCompte") : t("bouton.confirmerCode")}
                <span className="pastille-fleche" aria-hidden="true">
                  →
                </span>
              </button>
              <p className="carte-etape__pied">
                <button type="button" className="bouton-secondaire bouton" onClick={() => setEtape("email")} disabled={enCours}>
                  {t("bouton.changerEmail")}
                </button>
              </p>
            </>
          )}

          {enCours ? <ZoneEtat etat="chargement" /> : null}
          {succes ? (
            <p role="status">
              {succes}
            </p>
          ) : null}
          {erreur ? (
            <p className="erreur-champ" role="alert">
              {erreur}
            </p>
          ) : null}

          <p className="panneau-formulaire__pied">
            {t("app.titre")} — {t("marque.tagline")}
          </p>
        </div>
      </section>
    </div>
  );
}
