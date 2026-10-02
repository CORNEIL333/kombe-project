/* KÓMBE C14 — statut d'une contribution (story 12.1 / scénario C14-MONEY).
   Règle métier affichée : une contribution **déclarée mais non validée**
   (« en cours ») ne doit JAMAIS laisser entendre que le paiement est vérifié /
   reçu. Le libellé et l'oracle `revendiquePaiementVerifie` renvoient false pour
   « en_cours » et « conteste » ; seul « valide » l'affirme. La distinction ne
   repose pas sur la couleur seule : le TEXTE du badge est explicite. */

import type { CleI18n } from "../i18n/dictionnaires.js";
import { useLangue } from "../i18n/ContexteLangue.js";

export type StatutContribution = "en_cours" | "valide" | "conteste";

const CLE_POUR_STATUT: Record<StatutContribution, CleI18n> = {
  en_cours: "statut.enCours",
  valide: "statut.valide",
  conteste: "statut.conteste",
};

// `valide` = validation serveur effective (tiers indépendant, story 6.x côté
// serveur). Les autres statuts sont des déclarations/contestations, jamais une
// affirmation de paiement vérifié.
export function revendiquePaiementVerifie(statut: StatutContribution): boolean {
  return statut === "valide";
}

export function BadgeStatut({ statut }: { readonly statut: StatutContribution }) {
  const { t } = useLangue();
  const etatVisuel =
    statut === "valide" ? "valide" : statut === "conteste" ? "erreur" : "en-cours";
  return (
    <span className="badge" data-état={etatVisuel}>
      {/* Le texte porte l'information (jamais la couleur seule) : un lecteur
          d'écran lit « Déclaré — en cours de validation », pas un pastille. */}
      {t(CLE_POUR_STATUT[statut])}
    </span>
  );
}
