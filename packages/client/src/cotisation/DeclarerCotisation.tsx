/* KÓMBE — déclaration/vue RÉELLE d'une cotisation (C06, Piste A3 suite).
   Authentifiée par la session RÉELLE ouverte via `Connexion` — jamais un
   en-tête `x-actor` fictif. La version attendue (`if-match-version`) est
   TOUJOURS celle lue par `voirObligation` juste avant (concurrence
   optimiste, ADR-0006/0017) : jamais une valeur par défaut saisie à la main.
   Contrat HTTP exact déjà prouvé par
   `docs/PREUVES_PISTE_A3_SERVEUR.md` (A3-DECLARE/A3-VIEW). */

import { useState } from "react";
import { useLangue } from "../i18n/ContexteLangue.js";
import { ChampTexte, ChampSelect } from "../composants/Champs.js";
import { ZoneEtat } from "../composants/Etats.js";
import { montantValide } from "../parcours/ParcoursGuide.js";
import {
  ApiError,
  declarerCotisation,
  voirObligation,
  type DeclarationReceipt,
  type ObligationView,
} from "../api/kombeApi.js";
import type { SessionOuverte } from "../connexion/Connexion.js";

export interface DeclarerCotisationProps {
  readonly session: SessionOuverte;
}

function messageErreur(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return err instanceof Error ? err.message : String(err);
}

function aujourdHui(): string {
  return new Date().toISOString().slice(0, 10);
}

export function DeclarerCotisation({ session }: DeclarerCotisationProps) {
  const { t } = useLangue();
  const [groupId, setGroupId] = useState("");
  const [obligationId, setObligationId] = useState("");
  const [obligation, setObligation] = useState<ObligationView | null>(null);
  const [montant, setMontant] = useState("");
  const [canal, setCanal] = useState<"cash" | "electronic">("cash");
  const [dateAlleguee, setDateAlleguee] = useState(aujourdHui);
  const [touche, setTouche] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<DeclarationReceipt | null>(null);

  const identifiantsValides = groupId.trim() !== "" && obligationId.trim() !== "";
  const montantSaisiValide = montantValide(montant);

  const charger = () => {
    setTouche(true);
    if (!identifiantsValides) return;
    setEnCours(true);
    setErreur(null);
    setResultat(null);
    void voirObligation(session.sessionId, groupId.trim(), obligationId.trim())
      .then(setObligation)
      .catch((err: unknown) => {
        setObligation(null);
        setErreur(messageErreur(err));
      })
      .finally(() => setEnCours(false));
  };

  const declarer = () => {
    setTouche(true);
    if (!obligation || !montantSaisiValide) return;
    setEnCours(true);
    setErreur(null);
    setResultat(null);
    void declarerCotisation(
      session.sessionId,
      groupId.trim(),
      { obligationId: obligation.obligationId, amount: montant, channel: canal, allegedDate: dateAlleguee },
      obligation.version,
      crypto.randomUUID(),
    )
      .then((receipt) => {
        setResultat(receipt);
        return voirObligation(session.sessionId, groupId.trim(), obligationId.trim());
      })
      .then(setObligation)
      .catch((err: unknown) => setErreur(messageErreur(err)))
      .finally(() => setEnCours(false));
  };

  return (
    <section aria-labelledby="cotisation-titre">
      <h2 id="cotisation-titre">{t("cotisation.titre")}</h2>
      <p className="aide-champ">{t("cotisation.consigne")}</p>

      <div>
        <ChampTexte libelle={t("champ.groupe")} valeur={groupId} requis onChange={setGroupId} />
        <ChampTexte libelle={t("champ.obligation")} valeur={obligationId} requis onChange={setObligationId} />
        <button type="button" className="bouton bouton-secondaire" onClick={charger} disabled={enCours}>
          {t("bouton.charger")}
        </button>
      </div>

      {obligation ? (
        <dl className="recapitulatif">
          <dt>{t("obligation.du")}</dt>
          <dd>{t("recap.montantValeur", { montant: obligation.due })}</dd>
          <dt>{t("obligation.restant")}</dt>
          <dd>{t("recap.montantValeur", { montant: obligation.remainingDue })}</dd>
          <dt>{t("obligation.disponible")}</dt>
          <dd>{t("recap.montantValeur", { montant: obligation.availableToDeclare })}</dd>
          <dt>{t("obligation.nombreDeclarations")}</dt>
          <dd>{obligation.contributionCount}</dd>
        </dl>
      ) : null}

      {obligation ? (
        <div>
          <ChampTexte
            libelle={t("champ.montantCotisation")}
            erreur={touche && !montantSaisiValide ? t("erreur.montant") : undefined}
            valeur={montant}
            type="number"
            entier
            min={1}
            inputMode="numeric"
            requis
            onChange={setMontant}
          />
          <ChampSelect
            libelle={t("champ.canal")}
            valeur={canal}
            onChange={(v) => setCanal(v === "electronic" ? "electronic" : "cash")}
            options={[
              { valeur: "cash", libelle: t("canal.cash") },
              { valeur: "electronic", libelle: t("canal.electronic") },
            ]}
          />
          <ChampTexte
            libelle={t("champ.dateAlleguee")}
            valeur={dateAlleguee}
            type="text"
            placeholder="AAAA-MM-JJ"
            requis
            onChange={setDateAlleguee}
          />
          <button type="button" className="bouton" onClick={declarer} disabled={enCours}>
            {t("bouton.declarer")}
          </button>
        </div>
      ) : null}

      {enCours ? <ZoneEtat etat="chargement" /> : null}
      {erreur ? (
        <p className="erreur-champ" role="alert">
          {erreur}
        </p>
      ) : null}
      {resultat ? (
        <p role="status">
          {resultat.status === "applied" ? t("cotisation.declaree") : t("cotisation.rejouee")}
        </p>
      ) : null}
    </section>
  );
}
