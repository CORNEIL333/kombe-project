/* KÓMBE — connexion RÉELLE (ADR-0024, Piste A3 suite). Code à 6 chiffres par
   email, jamais de mot de passe. Refonte immersive : UNE action à la fois —
   l'étape « code » n'existe tant que l'email n'est pas envoyé, et vice versa.
   Contrat HTTP prouvé par `docs/PREUVES_PISTE_A3_SERVEUR.md` (A3-LOGIN). */

import { useState } from "react";
import { useLangue } from "../i18n/ContexteLangue.js";
import { ChampTexte } from "../composants/Champs.js";
import { ChampCode } from "../composants/ChampCode.js";
import { ZoneEtat } from "../composants/Etats.js";
import { ImmersiveBackdrop } from "../composants/ImmersiveBackdrop.js";
import { MotifAfricain } from "../composants/MotifAfricain.js";
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
    <section className="scene-immersive" aria-labelledby="connexion-titre">
      <ImmersiveBackdrop variante={etape === "email" ? "email" : "code"} />
      <div className="carte-etape">
        <PointsEtape etape={etape === "email" ? 0 : 1} />
        <header className="carte-etape__entete">
          <img className="carte-etape__symbole" src="/brand/logo-emblem.png" alt="" aria-hidden="true" />
          <h2 id="connexion-titre">{t("connexion.titre")}</h2>
          <p className="aide-champ">{t("connexion.consigne")}</p>
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
            <button type="button" className="bouton" style={{ width: "100%" }} onClick={envoyerCode} disabled={enCours}>
              {t("bouton.envoyerCode")}
            </button>
          </>
        ) : (
          <>
            <p role="status" className="aide-champ" style={{ textAlign: "center" }}>
              {t("connexion.codeEnvoye")}
            </p>
            <ChampCode libelle={t("champ.code")} valeur={code} onChange={setCode} erreur={touche && !codeValide ? t("erreur.code") : undefined} />
            <button type="button" className="bouton" style={{ width: "100%" }} onClick={confirmer} disabled={enCours}>
              {t("bouton.confirmerCode")}
            </button>
            <p className="carte-etape__pied">
              <button type="button" className="bouton-secondaire bouton" onClick={() => setEtape("email")} disabled={enCours}>
                {t("bouton.changerEmail")}
              </button>
            </p>
          </>
        )}

        {enCours ? <ZoneEtat etat="chargement" /> : null}
        {erreur ? (
          <p className="erreur-champ" role="alert">
            {erreur}
          </p>
        ) : null}
      </div>
      <MotifAfricain />
    </section>
  );
}
