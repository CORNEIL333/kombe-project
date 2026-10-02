/* KÓMBE C14 — recette unitaire (vitest + jsdom). Elle prouve les trois scénarios
   propres au composant à partir d'ACTIONS RÉELLES sur le DOM rendu (aucune
   constante recopiée depuis un fichier d'attentes) :
   - C14-BACK  : naviguer (aller puis retour) pendant la saisie ne soumet RIEN
                 (`onSoumettre` jamais appelée → submission_count = 0) et conserve
                 les données déjà saisies ;
   - C14-MONEY : une contribution « en cours » (déclarée, non validée) n'affiche
                 jamais un libellé prétendant le paiement vérifié/reçu ;
   - C14-A11Y  : chaque champ a un nom accessible, l'erreur est liée (role=alert +
                 aria-describedby), la bascule de langue utilise aria-pressed, et
                 l'indicateur marque l'étape courante (aria-current), sans
                 reposer sur la couleur seule.
   La soumission finale (récapitulatif) est l'unique chemin qui appelle
   `onSoumettre`, et exactement une fois. */

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FournisseurLangue } from "../i18n/ContexteLangue.js";
import { App } from "../App.js";
import { ParcoursGuide, type DonneesParcours } from "../parcours/ParcoursGuide.js";
import {
  BadgeStatut,
  revendiquePaiementVerifie,
} from "../composants/StatutContribution.js";

function monter(element: React.ReactNode) {
  return render(<FournisseurLangue>{element}</FournisseurLangue>);
}

/** Renseigne les deux premières étapes avec des données valides. */
function remplirEtapesInitiales() {
  fireEvent.change(screen.getByLabelText(/Nom du groupe/), {
    target: { value: "Tontine des voisins" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Suivant" }));
  fireEvent.change(screen.getByLabelText(/Montant de la cotisation/), {
    target: { value: "5000" },
  });
  fireEvent.change(screen.getByLabelText(/Nombre de membres/), {
    target: { value: "10" },
  });
}

describe("C14-BACK — retour sans soumission", () => {
  it("n'appelle jamais onSoumettre en allant puis en revenant, et conserve les données", () => {
    const onSoumettre = vi.fn();
    monter(<ParcoursGuide onSoumettre={onSoumettre} />);

    // Étape modèle → nom saisi → Suivant (aucune soumission attendue).
    fireEvent.change(screen.getByLabelText(/Nom du groupe/), {
      target: { value: "Tontine du lundi" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Suivant" }));

    // Étape Njangi atteinte ; on revient en arrière.
    expect(screen.getByRole("group", { name: "Njangi" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Précédent" }));

    // Donnée conservée (pas de perte au retour).
    expect(
      (screen.getByLabelText(/Nom du groupe/) as HTMLInputElement).value,
    ).toBe("Tontine du lundi");

    // submission_count = 0 : ni Suivant ni Précédent ne soumettent.
    expect(onSoumettre).not.toHaveBeenCalled();
  });

  it("refuse d'avancer si une obligation de champ n'est pas remplie", () => {
    monter(<ParcoursGuide />);
    // Nom vide → Suivant bloque sur l'étape modèle.
    fireEvent.click(screen.getByRole("button", { name: "Suivant" }));
    expect(screen.getByRole("group", { name: "Modèle" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});

describe("C14-MONEY — déclaré ≠ validé", () => {
  it("un statut « en cours » ne revendique pas un paiement vérifié", () => {
    expect(revendiquePaiementVerifie("en_cours")).toBe(false);
    expect(revendiquePaiementVerifie("conteste")).toBe(false);
    expect(revendiquePaiementVerifie("valide")).toBe(true);
  });

  it("le badge « en cours » affiche un texte explicite, jamais « vérifié/payé »", () => {
    monter(<BadgeStatut statut="en_cours" />);
    const badge = screen.getByText(/en cours de validation/i);
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).not.toMatch(/vérifi|pay|reçu|reçu/i);
  });

  it("l'étape caisse présente la contribution comme « en cours », non validée", () => {
    monter(<ParcoursGuide />);
    remplirEtapesInitiales();
    fireEvent.click(screen.getByRole("button", { name: "Suivant" })); // → caisse
    expect(screen.getByRole("group", { name: "Caisse" })).toBeInTheDocument();
    expect(screen.getByText(/en cours de validation/i)).toBeInTheDocument();
  });
});

describe("C14-A11Y — primitives accessibles", () => {
  it("lie l'erreur au champ (aria-describedby) et signale aria-invalid", () => {
    monter(<ParcoursGuide />);
    fireEvent.click(screen.getByRole("button", { name: "Suivant" }));
    const champ = screen.getByLabelText(/Nom du groupe/);
    expect(champ).toHaveAttribute("aria-invalid", "true");
    const decritePar = champ.getAttribute("aria-describedby") ?? "";
    expect(decritePar.length).toBeGreaterThan(0);
    const alerte = screen.getByRole("alert");
    expect(champ.getAttribute("aria-describedby")).toContain(alerte.id);
  });

  it("indique l'étape courante par du texte (aria-current), pas par couleur seule", () => {
    monter(<ParcoursGuide />);
    const courant = document.querySelector("li[aria-current='step']");
    expect(courant).not.toBeNull();
    expect(courant?.textContent).toMatch(/Modèle/);
    expect(courant?.textContent).toMatch(/en cours/);
  });

  it("la bascule de langue est un groupe avec aria-pressed et change toute l'UI", () => {
    monter(<App />);
    const groupe = screen.getByRole("group", {
      name: /Changer la langue/i,
    });
    const fr = screen.getByRole("button", { name: "Français" });
    const en = screen.getByRole("button", { name: "English" });
    expect(fr).toHaveAttribute("aria-pressed", "true");
    expect(en).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(en);
    expect(en).toHaveAttribute("aria-pressed", "true");
    // Toute l'interface bascule : le titre du parcours est traduit.
    expect(screen.getByRole("heading", { name: "Create my group" }));
    expect(groupe).toBeInTheDocument();
  });

  it("met à jour lang du document au changement de langue", () => {
    monter(<App />);
    expect(document.documentElement.lang).toBe("fr");
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    expect(document.documentElement.lang).toBe("en");
  });
});

describe("Soumission finale (récapitulatif)", () => {
  it("n'appelle onSoumettre qu'une fois, à la confirmation, avec les données", () => {
    const onSoumettre = vi.fn();
    monter(<ParcoursGuide onSoumettre={onSoumettre} />);
    remplirEtapesInitiales();
    fireEvent.click(screen.getByRole("button", { name: "Suivant" })); // → caisse
    fireEvent.click(screen.getByRole("button", { name: "Suivant" })); // → récap

    const attendues: DonneesParcours = {
      nomGroupe: "Tontine des voisins",
      modele: "rotation",
      montant: "5000",
      membres: "10",
    };
    fireEvent.click(screen.getByRole("button", { name: "Confirmer le groupe" }));
    expect(onSoumettre).toHaveBeenCalledTimes(1);
    expect(onSoumettre).toHaveBeenCalledWith(attendues);
  });
});
