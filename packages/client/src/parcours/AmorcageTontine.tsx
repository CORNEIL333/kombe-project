/* KÓMBE — amorçage RÉEL des tontines dans la PWA (C03, migration 0024).
   Parité avec le mobile : après connexion, l'utilisateur peut CRÉER une
   tontine (nom + modèle + typologie de rotation + parent de supervision),
   REJOINDRE avec un code, DÉCOUVRIR les tontines publiques et DEMANDER UN
   PARRAINAGE. Chaque action appelle une route RÉELLEMENT prouvée base réelle
   (`packages/api/test/pgOnboardingStore.proof.mjs`) via `kombeApi`. Aucune
   décision métier n'est prise ici : devise/fuseau/identités/typologie P1
   restent SERVEUR ; la session (Bearer) est ouverte par `Connexion`. */

import { useState } from "react";
import { useLangue } from "../i18n/ContexteLangue.js";
import type { CleI18n } from "../i18n/dictionnaires.js";
import { ChampTexte, ChampSelect } from "../composants/Champs.js";
import { ZoneEtat } from "../composants/Etats.js";
import {
  ApiError,
  creerTontine,
  demanderParrainage,
  rejoindreParCode,
  repertorierTontines,
  type ModeleTontine,
  type TontineDecouvrable,
  type TypologieRotation,
} from "../api/kombeApi.js";
import type { SessionOuverte } from "../connexion/Connexion.js";

export interface AmorcageTontineProps {
  readonly session: SessionOuverte;
}

type Mode = "creer" | "rejoindre" | "decouvrir" | "parrainage";

const MODELES: ReadonlyArray<{ readonly valeur: ModeleTontine; readonly cle: CleI18n }> = [
  { valeur: "famille", cle: "modele.famille" },
  { valeur: "collegues", cle: "modele.collegues" },
  { valeur: "fetes", cle: "modele.fetes" },
  { valeur: "construction", cle: "modele.construction" },
  { valeur: "etudiant", cle: "modele.etudiant" },
  { valeur: "personnalise", cle: "modele.personnalise" },
];

const TYPOLOGIES: ReadonlyArray<{ readonly valeur: TypologieRotation; readonly cle: CleI18n }> = [
  { valeur: "rotative_fermee", cle: "typologie.rotativeFermee" },
  { valeur: "tirage", cle: "typologie.tirage" },
  { valeur: "negocie", cle: "typologie.negocie" },
];

const clePourModele = (m: string): CleI18n =>
  MODELES.find((x) => x.valeur === m)?.cle ?? "modele.personnalise";
const clePourTypologie = (r: string): CleI18n =>
  TYPOLOGIES.find((x) => x.valeur === r)?.cle ?? "typologie.rotativeFermee";

function messageErreur(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return err instanceof Error ? err.message : String(err);
}

/** Génération d'une CLÉ MÉTIER locale (le `groupId`/`sponsorshipId` fait partie
 *  du contrat d'API) — ce n'est PAS une identité : l'acteur, lui, est toujours
 *  résolu serveur depuis la session. */
function genererCle(prefixe: string): string {
  const r = Math.floor(Math.random() * 1_000_000_000);
  return `${prefixe}-${Date.now()}-${r}`;
}

export function AmorcageTontine({ session }: AmorcageTontineProps) {
  const { t } = useLangue();
  const [mode, setMode] = useState<Mode>("creer");

  // Créer
  const [nom, setNom] = useState("");
  const [modele, setModele] = useState<ModeleTontine>("famille");
  const [typologie, setTypologie] = useState<TypologieRotation>("rotative_fermee");
  const [parent, setParent] = useState("");

  // Rejoindre / parrainage
  const [code, setCode] = useState("");
  const [groupeId, setGroupeId] = useState("");
  const [parrain, setParrain] = useState("");

  // Découvrir
  const [liste, setListe] = useState<readonly TontineDecouvrable[] | null>(null);

  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const maj = (prochain: Mode) => {
    setMode(prochain);
    setErreur(null);
    setSucces(null);
  };

  const lancer = (action: () => Promise<void>) => {
    setEnCours(true);
    setErreur(null);
    setSucces(null);
    void action().catch((err: unknown) => setErreur(messageErreur(err))).finally(() => setEnCours(false));
  };

  const soumettreCreation = () => {
    if (nom.trim() === "") {
      setErreur(t("erreur.nomGroupe"));
      return;
    }
    lancer(async () => {
      await creerTontine(session.sessionId, {
        groupId: genererCle("grp"),
        displayName: nom.trim(),
        tontineModel: modele,
        rotationType: typologie,
        ...(parent.trim() ? { parentGroupId: parent.trim() } : {}),
      });
      setSucces(t("amorce.creee"));
    });
  };

  const soumettreRejoindre = () => {
    if (code.trim() === "") return;
    lancer(async () => {
      await rejoindreParCode(session.sessionId, code.trim());
      setSucces(t("amorce.rejointe"));
    });
  };

  const soumettreParrainage = () => {
    if (groupeId.trim() === "" || parrain.trim() === "") return;
    lancer(async () => {
      await demanderParrainage(session.sessionId, {
        groupId: groupeId.trim(),
        sponsorshipId: genererCle("spn"),
        candidateId: session.identityId,
        sponsorId: parrain.trim(),
      });
      setSucces(t("amorce.parrainDemande"));
    });
  };

  const chargerListe = () => {
    lancer(async () => {
      setListe(await repertorierTontines());
    });
  };

  const ONGLETS: ReadonlyArray<{ valeur: Mode; cle: CleI18n }> = [
    { valeur: "creer", cle: "amorce.creer" },
    { valeur: "rejoindre", cle: "amorce.rejoindre" },
    { valeur: "decouvrir", cle: "amorce.decouvrir" },
    { valeur: "parrainage", cle: "amorce.parrainage" },
  ];

  return (
    <section aria-labelledby="amorce-titre">
      <h2 id="amorce-titre">{t("amorce.titre")}</h2>
      <p className="aide-champ">{t("amorce.consigne")}</p>

      <div role="group" aria-label={t("amorce.titre")} className="nav-parcours">
        {ONGLETS.map((o) => (
          <button
            key={o.valeur}
            type="button"
            aria-pressed={mode === o.valeur}
            className={mode === o.valeur ? "bouton" : "bouton bouton-secondaire"}
            onClick={() => maj(o.valeur)}
          >
            {t(o.cle)}
          </button>
        ))}
      </div>

      {mode === "creer" ? (
        <div role="group" aria-label={t("amorce.creer")}>
          <ChampTexte
            libelle={t("champ.nomGroupe")}
            aide={t("aide.nomGroupe")}
            valeur={nom}
            requis
            onChange={setNom}
          />
          <ChampSelect
            libelle={t("champ.modeleTontine")}
            valeur={modele}
            onChange={(v) => setModele(v as ModeleTontine)}
            options={MODELES.map((m) => ({ valeur: m.valeur, libelle: t(m.cle) }))}
          />
          <ChampSelect
            libelle={t("champ.typologie")}
            valeur={typologie}
            onChange={(v) => setTypologie(v as TypologieRotation)}
            options={TYPOLOGIES.map((r) => ({ valeur: r.valeur, libelle: t(r.cle) }))}
          />
          {typologie !== "rotative_fermee" ? (
            <p className="aide-champ" role="status">{t("amorce.typologieP1")}</p>
          ) : null}
          <ChampTexte
            libelle={t("champ.parentGroupe")}
            aide={t("aide.parentGroupe")}
            valeur={parent}
            onChange={setParent}
          />
          <button type="button" className="bouton" onClick={soumettreCreation} disabled={enCours}>
            {t("bouton.creerTontine")}
          </button>
        </div>
      ) : null}

      {mode === "rejoindre" ? (
        <div role="group" aria-label={t("amorce.rejoindre")}>
          <ChampTexte libelle={t("champ.codeInvitation")} valeur={code} onChange={setCode} />
          <button type="button" className="bouton" onClick={soumettreRejoindre} disabled={enCours}>
            {t("bouton.rejoindre")}
          </button>
        </div>
      ) : null}

      {mode === "parrainage" ? (
        <div role="group" aria-label={t("amorce.parrainage")}>
          <ChampTexte libelle={t("champ.groupe")} valeur={groupeId} onChange={setGroupeId} />
          <ChampTexte libelle={t("champ.identifiantParrain")} valeur={parrain} onChange={setParrain} />
          <button type="button" className="bouton" onClick={soumettreParrainage} disabled={enCours}>
            {t("bouton.demanderParrainage")}
          </button>
        </div>
      ) : null}

      {mode === "decouvrir" ? (
        <div role="group" aria-label={t("amorce.decouvrir")}>
          <button type="button" className="bouton bouton-secondaire" onClick={chargerListe} disabled={enCours}>
            {t("amorce.chargerListe")}
          </button>
          {liste ? (
            liste.length === 0 ? (
              <p role="status" className="aide-champ">{t("amorce.listeVide")}</p>
            ) : (
              <ul>
                {liste.map((g) => (
                  <li key={g.groupId}>
                    <strong>{g.groupName}</strong>{" "}
                    — {t(clePourModele(g.tontineModel))} · {t(clePourTypologie(g.rotationType))}
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </div>
      ) : null}

      {enCours ? <ZoneEtat etat="chargement" /> : null}
      {erreur ? (
        <p className="erreur-champ" role="alert">
          {erreur}
        </p>
      ) : null}
      {succes ? (
        <p role="status" className="aide-champ">
          {succes}
        </p>
      ) : null}
    </section>
  );
}
