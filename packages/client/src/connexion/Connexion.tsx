/* KÓMBE — connexion RÉELLE (ADR-0024, Piste A3 suite). Code à 6 chiffres par
   email, jamais de mot de passe. Deux étapes : demander le code, puis le
   confirmer — exactement le contrat HTTP prouvé par
   `docs/PREUVES_PISTE_A3_SERVEUR.md` (A3-LOGIN). `sessionId` est TOUJOURS
   celui renvoyé par le serveur, jamais choisi ici. */

import { useState } from "react";
import { useLangue } from "../i18n/ContexteLangue.js";
import { ChampTexte } from "../composants/Champs.js";
import { ZoneEtat } from "../composants/Etats.js";
import { ApiError, confirmerConnexion, demanderConnexion } from "../api/kombeApi.js";

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

export function Connexion({ onConnecte }: ConnexionProps) {
  const { t } = useLangue();
  const [etape, setEtape] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [touche, setTouche] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const emailValide = email.trim() !== "";
  const codeValide = /^\d{6}$/.test(code);

  const envoyerCode = () => {
    setTouche(true);
    if (!emailValide) return;
    setEnCours(true);
    setErreur(null);
    void demanderConnexion(email.trim())
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
    void confirmerConnexion(email.trim(), code)
      .then(({ sessionId }) => onConnecte({ sessionId, identityId: email.trim() }))
      .catch((err: unknown) => setErreur(messageErreur(err)))
      .finally(() => setEnCours(false));
  };

  return (
    <section aria-labelledby="connexion-titre">
      <h2 id="connexion-titre">{t("connexion.titre")}</h2>
      <p className="aide-champ">{t("connexion.consigne")}</p>

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
          <button type="button" className="bouton" onClick={envoyerCode} disabled={enCours}>
            {t("bouton.envoyerCode")}
          </button>
        </>
      ) : (
        <>
          <p role="status">{t("connexion.codeEnvoye")}</p>
          <ChampTexte
            libelle={t("champ.code")}
            aide={t("aide.code")}
            erreur={touche && !codeValide ? t("erreur.code") : undefined}
            valeur={code}
            inputMode="numeric"
            requis
            onChange={setCode}
          />
          <button type="button" className="bouton" onClick={confirmer} disabled={enCours}>
            {t("bouton.confirmerCode")}
          </button>
        </>
      )}

      {enCours ? <ZoneEtat etat="chargement" /> : null}
      {erreur ? (
        <p className="erreur-champ" role="alert">
          {erreur}
        </p>
      ) : null}
    </section>
  );
}
