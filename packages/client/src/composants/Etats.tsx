/* KÓMBE C14 — indicateur d'étapes et zones d'état accessibles (12.1, 12.4).
   La position est exprimée par du TEXTE (« Étape N sur M », aria-current="step",
   badge « en cours »/« terminée ») — jamais par la couleur seule. Les zones
   d'état (chargement/vide/erreur/permission/hors-ligne) portent chacune un
   rôle sémantique (status/alert) lu par les lecteurs d'écran. */

import type { CleI18n } from "../i18n/dictionnaires.js";
import { useLangue } from "../i18n/ContexteLangue.js";

export interface EtapeInfo {
  readonly cle: CleI18n;
}

export function IndicateurEtapes({
  etapes,
  indexCourant,
}: {
  readonly etapes: readonly EtapeInfo[];
  readonly indexCourant: number;
}) {
  const { t } = useLangue();
  return (
    <>
      <p className="aide-champ" role="status">
        {t("parcours.etapeSur", { etape: indexCourant + 1, total: etapes.length })}
      </p>
      <ol className="etapes">
        {etapes.map((etape, index) => {
          const enCours = index === indexCourant;
          const terminee = index < indexCourant;
          return (
            <li
              key={etape.cle}
              aria-current={enCours ? "step" : undefined}
            >
              {t(etape.cle)}
              {enCours ? ` — ${t("parcours.etapeEncours")}` : ""}
              {terminee ? ` — ${t("parcours.etapeTerminee")}` : ""}
            </li>
          );
        })}
      </ol>
    </>
  );
}

export type EtatZone = "chargement" | "vide" | "erreur" | "permission" | "hors-ligne";

const CLE_POUR_ETAT: Record<EtatZone, CleI18n> = {
  chargement: "etat.chargement",
  vide: "etat.vide",
  erreur: "etat.erreur",
  permission: "etat.permission",
  "hors-ligne": "etat.horsLigne",
};

export function ZoneEtat({ etat }: { readonly etat: EtatZone }) {
  const { t } = useLangue();
  // erreur/hors-ligne ⇒ alerte (role=alert) ; les autres ⇒ status (poli).
  const role = etat === "erreur" ? "alert" : "status";
  return (
    <div className="zone-etat" role={role}>
      {t(CLE_POUR_ETAT[etat])}
    </div>
  );
}
