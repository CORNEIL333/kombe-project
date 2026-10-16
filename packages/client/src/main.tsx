/* KÓMBE C14 — point d'entrée navigateur. Monte React sous le fournisseur de
   langue (FR par défaut, baseline du pilote). */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { FournisseurLangue } from "./i18n/ContexteLangue.js";
import { App } from "./App.js";
import "@kombe/brand/kombe.css";
import "@kombe/brand/v3.css";
import "./styles.css";
import "./tontine/tontine.css";
import "./immersif.css";
import "./charte.css";
import "./connexion.css";

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

/* Écran d'ouverture : laissé le temps de l'animation du logo (≈ 1,6 s depuis
   le début du chargement), puis fondu ; immédiat si le mouvement est réduit. */
const ouverture = document.getElementById("ouverture");
if (ouverture) {
  const reduit = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const reste = Math.max(0, (reduit ? 200 : 1650) - (typeof performance !== "undefined" ? performance.now() : 0));
  window.setTimeout(() => {
    ouverture.classList.add("is-fin");
    window.setTimeout(() => ouverture.remove(), 460);
  }, reste);
}
