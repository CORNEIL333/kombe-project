/* KÓMBE C14 — coquille applicative : en-tête (titre + bascule de langue
   accessible), lien d'évitement, parcours guidé, pied de page de non-promesse.
   Aucun chiffrement ni journal technique n'apparaît dans le parcours ordinaire ;
   aucune garantie sur les fonds n'est affirmée (pied de page explicite). */

import { useEffect, useState } from "react";
import { useLangue, BasculeLangue } from "./i18n/ContexteLangue.js";
import { ParcoursGuide } from "./parcours/ParcoursGuide.js";
import { BandeauHorsLigne } from "./horsLigne/BandeauHorsLigne.js";

export function App() {
  const { t } = useLangue();
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
        <div>
          <h1>{t("app.titre")}</h1>
          <p className="aide-champ">{t("app.sousTitre")}</p>
        </div>
        <BasculeLangue />
      </header>

      <main id="contenu">
        <BandeauHorsLigne
          etat={{ horsLigne, derniereSync: undefined, brouillonsEnAttente: 0 }}
        />
        <ParcoursGuide />
      </main>

      <footer className="pied-page">{t("app.sousTitre")}</footer>
    </div>
  );
}
