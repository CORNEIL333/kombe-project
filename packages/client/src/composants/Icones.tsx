/* KÓMBE — icônes de la charte (trait arrondi, grille 24), source unique
   @kombe/brand/icons : mêmes dessins que le site et l'application mobile.
   Toujours décoratives (aria-hidden) : le libellé voisin porte le sens.
   Les anciens noms restent acceptés (validation, horsLigne, trace, sortie). */

import { ATTRIBUTS_ICONE, ICONES, type NomIcone as NomBrand } from "@kombe/brand/icons";

const ALIAS = { validation: "confirmer", horsLigne: "hors-ligne", trace: "document", sortie: "sortir" } as const;
export type NomIcone = NomBrand | keyof typeof ALIAS;

export function Icone({ nom, taille = 20, className }: { readonly nom: NomIcone; readonly taille?: number; readonly className?: string }) {
  const reel: NomBrand = nom in ALIAS ? ALIAS[nom as keyof typeof ALIAS] : (nom as NomBrand);
  return (
    <span
      className={`icone-kombe ${className ?? ""}`}
      style={{ width: taille, height: taille }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{
        __html: `<svg width="${taille}" height="${taille}" viewBox="0 0 24 24" ${ATTRIBUTS_ICONE} focusable="false">${ICONES[reel]}</svg>`,
      }}
    />
  );
}
