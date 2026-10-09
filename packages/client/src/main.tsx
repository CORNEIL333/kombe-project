/* KÓMBE C14 — point d'entrée navigateur. Monte React sous le fournisseur de
   langue (FR par défaut, baseline du pilote). */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { FournisseurLangue } from "./i18n/ContexteLangue.js";
import { App } from "./App.js";
import "@kombe/brand/kombe.css";
import "./styles.css";

const conteneur = document.getElementById("root");
if (conteneur === null) {
  throw new Error("Élément #root introuvable dans index.html.");
}

createRoot(conteneur).render(
  <StrictMode>
    <FournisseurLangue langueInitiale="fr">
      <App />
    </FournisseurLangue>
  </StrictMode>,
);
