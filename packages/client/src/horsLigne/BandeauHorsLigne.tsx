/* KÓMBE C15 — bandeau d'état hors-ligne (accessible). Il rend la connexivité,
   l'horodatage de la dernière synchronisation (autorité serveur) et le compte des
   BROUILLONS en attente — formulé pour ne JAMAIS suggérer une validation serveur
   (C15-OFFLINE, 18.7 « brouillon non assimilé à déclaration acceptée »).
   `role=status` (information non urgente, polie) ; changement d'état annoncé ;
   aucune information portée par la couleur seule (texte explicite). */

import { useLangue } from "../i18n/ContexteLangue.js";

export interface EtatBandeau {
  readonly horsLigne: boolean;
  readonly derniereSync: number | undefined; // secondes, horodatage SERVEUR
  readonly brouillonsEnAttente: number;
}

function formaterDate(secondes: number): string {
  return new Date(secondes * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export function BandeauHorsLigne({ etat }: { etat: EtatBandeau }) {
  const { t } = useLangue();

  if (!etat.horsLigne) {
    return (
      <p className="bandeau bandeau--enLigne" role="status">
        {etat.derniereSync !== undefined
          ? t("horsLigne.derniereSync", {
              date: formaterDate(etat.derniereSync),
            })
          : t("etat.vide")}
      </p>
    );
  }

  return (
    <div className="bandeau bandeau--horsLigne" role="status" aria-live="polite">
      <p className="bandeau--badge">
        <span aria-hidden="true">●</span> {t("horsLigne.badge")}
      </p>
      <p className="aide-champ">{t("etat.horsLigne")}</p>
      {etat.brouillonsEnAttente > 0 && (
        <p className="bandeau--attente">
          {t("horsLigne.brouillonsEnAttente", {
            nombre: etat.brouillonsEnAttente,
          })}
        </p>
      )}
      <p className="aide-champ">{t("horsLigne.jamaisValide")}</p>
    </div>
  );
}
