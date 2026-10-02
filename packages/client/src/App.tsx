/* KÓMBE C14 — coquille applicative : en-tête (titre + bascule de langue
   accessible), lien d'évitement, parcours guidé, pied de page de non-promesse.
   Aucun chiffrement ni journal technique n'apparaît dans le parcours ordinaire ;
   aucune garantie sur les fonds n'est affirmée (pied de page explicite). */

import { useLangue, BasculeLangue } from "./i18n/ContexteLangue.js";
import { ParcoursGuide } from "./parcours/ParcoursGuide.js";

export function App() {
  const { t } = useLangue();
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
        <ParcoursGuide />
      </main>

      <footer className="pied-page">{t("app.sousTitre")}</footer>
    </div>
  );
}
