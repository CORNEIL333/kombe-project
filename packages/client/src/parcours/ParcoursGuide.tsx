/* KÓMBE C14 — parcours guidé de création de groupe (story 12.1).
   Quatre étapes : modèle → Njangi → caisse → récapitulatif. Le retour en
   arrière CONSERVE les données déjà saisies (l'état vit dans le composant,
   jamais dans le champ non contrôlé). Aucune donnée n'est envoyée tant que
   l'utilisateur ne confirme PAS au récapitulatif : passer d'une étape à l'autre
   (aller comme revenir) n'appelle jamais `onSoumettre` (scénario C14-BACK,
   submission_count = 0). La confirmation finale est la SEULE action de
   soumission. L'étape « caisse » illustre la distinction déclaré/validé : une
   contribution « en cours » n'y est jamais présentée comme payée (C14-MONEY). */

import { useState } from "react";
import { useLangue } from "../i18n/ContexteLangue.js";
import type { CleI18n } from "../i18n/dictionnaires.js";
import { ChampTexte, ChampSelect } from "../composants/Champs.js";
import { IndicateurEtapes } from "../composants/Etats.js";
import { BadgeStatut } from "../composants/StatutContribution.js";

export const ETAPES: ReadonlyArray<{ cle: CleI18n }> = [
  { cle: "etape.modele" },
  { cle: "etape.njangi" },
  { cle: "etape.caisse" },
  { cle: "etape.recap" },
];

export interface DonneesParcours {
  nomGroupe: string;
  modele: "rotation" | "caisse";
  montant: string;
  membres: string;
}

const DONNEES_INITIALES: DonneesParcours = {
  nomGroupe: "",
  modele: "rotation",
  montant: "",
  membres: "",
};

/** Montant XAF : entier strict, positif (aucun flottant, ADR-0002). */
export function montantValide(montant: string): boolean {
  return /^\d+$/.test(montant) && BigInt(montant) > 0n;
}

export function membresValides(membres: string): boolean {
  if (!/^\d+$/.test(membres)) return false;
  const n = Number(membres);
  return Number.isInteger(n) && n >= 3 && n <= 1000;
}

/** Erreurs par champ pour une étape donnée (vide ⇒ champ valide non renseigné). */
export function erreursEtape(
  etape: number,
  donnees: DonneesParcours,
): Partial<Record<"nomGroupe" | "montant" | "membres", CleI18n>> {
  const erreurs: Partial<
    Record<"nomGroupe" | "montant" | "membres", CleI18n>
  > = {};
  if (etape === 0 && donnees.nomGroupe.trim() === "") {
    erreurs.nomGroupe = "erreur.nomGroupe";
  }
  if (etape === 1) {
    if (!montantValide(donnees.montant)) erreurs.montant = "erreur.montant";
    if (!membresValides(donnees.membres)) erreurs.membres = "erreur.membres";
  }
  return erreurs;
}

export interface ParcoursGuideProps {
  /** Appelée UNIQUEMENT par la confirmation finale du récapitulatif. */
  readonly onSoumettre?: (donnees: DonneesParcours) => void;
}

export function ParcoursGuide({ onSoumettre }: ParcoursGuideProps) {
  const { t } = useLangue();
  const [etape, setEtape] = useState(0);
  const [donnees, setDonnees] = useState<DonneesParcours>(DONNEES_INITIALES);
  const [touche, setTouche] = useState(false);

  const maj = (patch: Partial<DonneesParcours>) =>
    setDonnees((courantes) => ({ ...courantes, ...patch }));

  const erreurs = erreursEtape(etape, donnees);
  const aDesErreurs = Object.keys(erreurs).length > 0;
  // Les messages d'erreur ne s'affichent qu'APRÈS une tentative de passage
  // d'étape (`touche`), jamais dès le premier rendu : un lecteur d'écran n'est
  // pas agressé d'une alerte avant toute interaction (12.4).
  const erreursAffichees = touche ? erreurs : {};

  const precedent = () => {
    // Navigation arrière : AUCUNE soumission, données conservées (C14-BACK).
    setTouche(false);
    setEtape((n) => Math.max(0, n - 1));
  };

  const suivant = () => {
    setTouche(true);
    if (aDesErreurs) return;
    setEtape((n) => Math.min(ETAPES.length - 1, n + 1));
  };

  const confirmer = () => {
    // Seule action de soumission ; garde-fou : on ne confirme que si TOUT est
    // valide (réévaluation de toutes les étapes, pas seulement la dernière).
    const blocantes = [0, 1].some((n) => Object.keys(erreursEtape(n, donnees)).length > 0);
    if (blocantes) return;
    onSoumettre?.(donnees);
  };

  return (
    <section aria-labelledby="parcours-titre" data-etape={etape}>
      <h2 id="parcours-titre">{t("parcours.titre")}</h2>
      <p className="aide-champ">{t("parcours.consigne")}</p>

      <IndicateurEtapes etapes={ETAPES} indexCourant={etape} />

      {etape === 0 ? (
        <div role="group" aria-label={t("etape.modele")}>
          <ChampTexte
            libelle={t("champ.nomGroupe")}
            aide={t("aide.nomGroupe")}
            erreur={erreursAffichees.nomGroupe ? t(erreursAffichees.nomGroupe) : undefined}
            valeur={donnees.nomGroupe}
            requis
            onChange={(v) => maj({ nomGroupe: v })}
          />
          <ChampSelect
            libelle={t("champ.modele")}
            valeur={donnees.modele}
            onChange={(v) => maj({ modele: v === "caisse" ? "caisse" : "rotation" })}
            options={[
              { valeur: "rotation", libelle: t("modele.rotation") },
              { valeur: "caisse", libelle: t("modele.caisse") },
            ]}
          />
        </div>
      ) : null}

      {etape === 1 ? (
        <div role="group" aria-label={t("etape.njangi")}>
          <ChampTexte
            libelle={t("champ.montant")}
            aide={t("aide.montant")}
            erreur={erreursAffichees.montant ? t(erreursAffichees.montant) : undefined}
            valeur={donnees.montant}
            type="number"
            entier
            min={1}
            inputMode="numeric"
            requis
            onChange={(v) => maj({ montant: v })}
          />
          <ChampTexte
            libelle={t("champ.membres")}
            aide={t("aide.membres")}
            erreur={erreursAffichees.membres ? t(erreursAffichees.membres) : undefined}
            valeur={donnees.membres}
            type="number"
            entier
            min={3}
            max={1000}
            inputMode="numeric"
            requis
            onChange={(v) => maj({ membres: v })}
          />
        </div>
      ) : null}

      {etape === 2 ? (
        <div role="group" aria-label={t("etape.caisse")}>
          <h3>{t("obligation.titre")}</h3>
          <p className="aide-champ">{t("obligation.consigne")}</p>
          <p>
            <BadgeStatut statut="en_cours" />
          </p>
        </div>
      ) : null}

      {etape === 3 ? (
        <div className="recapitulatif" role="group" aria-label={t("etape.recap")}>
          <h3>{t("recap.titre")}</h3>
          <p className="aide-champ">{t("recap.consigne")}</p>
          <dl>
            <dt>{t("recap.nomGroupe")}</dt>
            <dd>{donnees.nomGroupe}</dd>
            <dt>{t("recap.modele")}</dt>
            <dd>
              {donnees.modele === "caisse"
                ? t("modele.caisse")
                : t("modele.rotation")}
            </dd>
            <dt>{t("recap.montant")}</dt>
            <dd>{t("recap.montantValeur", { montant: donnees.montant })}</dd>
            <dt>{t("recap.membres")}</dt>
            <dd>{donnees.membres}</dd>
            <dt>{t("recap.cycle")}</dt>
            <dd>{t("recap.cycleValeur", { membres: donnees.membres })}</dd>
          </dl>
        </div>
      ) : null}

      <nav className="nav-parcours" aria-label={t("parcours.titre")}>
        <button
          type="button"
          className="bouton bouton-secondaire"
          onClick={precedent}
          disabled={etape === 0}
        >
          {t("bouton.precedent")}
        </button>
        {etape < ETAPES.length - 1 ? (
          <button type="button" className="bouton" onClick={suivant}>
            {t("bouton.suivant")}
          </button>
        ) : (
          <button
            type="button"
            className="bouton"
            onClick={confirmer}
            disabled={aDesErreurs && touche}
          >
            {t("bouton.confirmer")}
          </button>
        )}
      </nav>
    </section>
  );
}
