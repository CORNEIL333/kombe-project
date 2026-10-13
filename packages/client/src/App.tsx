/* KÓMBE C14 — coquille applicative : en-tête (titre + bascule de langue
   accessible), lien d'évitement, parcours guidé, pied de page de non-promesse.
   Aucun chiffrement ni journal technique n'apparaît dans le parcours ordinaire ;
   aucune garantie sur les fonds n'est affirmée (pied de page explicite). */

import { useEffect, useState } from "react";
import { useLangue, BasculeLangue } from "./i18n/ContexteLangue.js";
import { ParcoursGuide } from "./parcours/ParcoursGuide.js";
import { AmorcageTontine } from "./parcours/AmorcageTontine.js";
import { BandeauHorsLigne } from "./horsLigne/BandeauHorsLigne.js";
import { Connexion, type SessionOuverte } from "./connexion/Connexion.js";
import { DeclarerCotisation } from "./cotisation/DeclarerCotisation.js";
import { ImmersiveBackdrop } from "./composants/ImmersiveBackdrop.js";
import { Scene } from "./composants/Scene.js";
import { LogoKombe } from "./composants/Marque.js";

type Onglet = "groupe" | "tontines" | "cotisation";

export function App() {
  const { t } = useLangue();
  // Onglet "Créer un groupe" par défaut : le parcours C14 reste la première
  // chose vue (comportement inchangé). "Ma cotisation" est le nouveau
  // parcours RÉEL (Piste A3 suite) — session en mémoire de composant
  // seulement, jamais persistée (pas de localStorage pour un secret de
  // session).
  const [onglet, setOnglet] = useState<Onglet>("groupe");
  const [session, setSession] = useState<SessionOuverte | null>(null);
  // Reflète la connectivité RÉELLE du navigateur ; ne présume jamais d'une
  // synchronisation serveur (derniereSync/attente laissés à l'état initial).
  const [horsLigne, setHorsLigne] = useState<boolean>(
    () => typeof navigator !== "undefined" && navigator.onLine === false,
  );
  useEffect(() => {
    const enLigne = () => setHorsLigne(false);
    const horsLigneEv = () => setHorsLigne(true);
    window.addEventListener("online", enLigne);
    window.addEventListener("offline", horsLigneEv);
    return () => {
      window.removeEventListener("online", enLigne);
      window.removeEventListener("offline", horsLigneEv);
    };
  }, []);

  return (
    <div className="app">
      <a className="evitement" href="#contenu">
        {t("lien.evitement")}
      </a>

      <header className="entete">
        <div className="entete-marque">
          <h1>
            <LogoKombe hauteur={24} />
          </h1>
          <p className="entete-sous-titre">{t("app.sousTitre")}</p>
        </div>
        <BasculeLangue />
      </header>

      <main id="contenu">
        <BandeauHorsLigne
          etat={{ horsLigne, derniereSync: undefined, brouillonsEnAttente: 0 }}
        />

        <nav className="onglets-app" role="tablist" aria-label={t("app.titre")}>
          <button
            type="button"
            role="tab"
            aria-selected={onglet === "groupe"}
            className={onglet === "groupe" ? "bouton" : "bouton bouton-secondaire"}
            onClick={() => setOnglet("groupe")}
          >
            {t("nav.creerGroupe")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={onglet === "tontines"}
            className={onglet === "tontines" ? "bouton" : "bouton bouton-secondaire"}
            onClick={() => setOnglet("tontines")}
          >
            {t("nav.tontines")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={onglet === "cotisation"}
            className={onglet === "cotisation" ? "bouton" : "bouton bouton-secondaire"}
            onClick={() => setOnglet("cotisation")}
          >
            {t("nav.cotisation")}
          </button>
        </nav>

        {onglet === "groupe" ? (
          <Scene
            variante="groupe"
            etiquette={t("nav.creerGroupe")}
            surtitre={t("scene.groupe.surtitre")}
            titre={t("scene.groupe.titre")}
            accent={t("scene.groupe.accent")}
            texte={t("scene.groupe.texte")}
          >
            <ParcoursGuide />
          </Scene>
        ) : null}
        {onglet === "tontines" ? (
          <section className="scene-immersive" aria-label={t("nav.tontines")}>
            <ImmersiveBackdrop variante="groupe" />
            <div className="carte-etape" style={{ maxWidth: "40rem" }}>
              {session ? (
                <AmorcageTontine session={session} />
              ) : (
                <>
                  <p role="status" className="aide-champ">
                    {t("amorce.sessionRequise")}
                  </p>
                  <Connexion onConnecte={setSession} />
                </>
              )}
            </div>
          </section>
        ) : null}
        {onglet === "cotisation" ? (
          session ? (
            <>
              <div className="barre-session">
                <p role="status">
                  <span className="pastille-connecte" aria-hidden="true" />
                  {t("connexion.connecte")}
                </p>
                <button type="button" className="bouton-secondaire bouton bouton-compact" onClick={() => setSession(null)}>
                  {t("bouton.deconnexion")}
                </button>
              </div>
              <DeclarerCotisation session={session} />
            </>
          ) : (
            <Connexion onConnecte={setSession} />
          )
        ) : null}
      </main>

      <footer className="pied-page">
        <p className="pied-page__promesse">{t("marque.promesse")}</p>
        <p>
          {t("app.titre")} · {t("app.sousTitre")}
        </p>
      </footer>
    </div>
  );
}
