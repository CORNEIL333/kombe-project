/* KÓMBE — logo de la charte (anneau de confiance à quatre nœuds + nom +
   signature), dessiné depuis la géométrie partagée (@kombe/brand/logo) : net
   à toute taille, identique au site et à l'application mobile, sans police
   requise. Le nom est lu par les lecteurs d'écran via le role="img". */

import { logoSvg, symboleSvg, type Variante } from "@kombe/brand/logo";

/** Rapports largeur / hauteur des tracés générés (logo court et complet). */
const RATIO_COURT = 3.141;
const RATIO_COMPLET = 3.881;

export function LogoKombe({
  hauteur = 32,
  variante = "couleur",
  signature = false,
  anime = false,
  className,
}: {
  readonly hauteur?: number;
  readonly variante?: Variante;
  readonly signature?: boolean;
  readonly anime?: boolean;
  readonly className?: string;
}) {
  const largeur = Math.round(hauteur * (signature ? RATIO_COMPLET : RATIO_COURT));
  return (
    <span
      className={`logo-kombe ${className ?? ""}`}
      style={{ width: largeur, height: hauteur }}
      dangerouslySetInnerHTML={{ __html: logoSvg({ variante, signature, anime }) }}
    />
  );
}

/** Symbole seul (l'anneau). `attente` : les nœuds respirent (chargement). */
export function SymboleKombe({
  taille = 32,
  variante = "couleur",
  anime = false,
  attente = false,
  className,
}: {
  readonly taille?: number;
  readonly variante?: Variante;
  readonly anime?: boolean;
  readonly attente?: boolean;
  readonly className?: string;
}) {
  return (
    <span
      className={`symbole-kombe ${className ?? ""}`}
      style={{ width: taille, height: taille }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: symboleSvg({ variante, anime, classe: attente ? "k-attente" : "" }) }}
    />
  );
}

/** Compatibilité : ancien nom du symbole. */
export const SymboleOrbite = ({ taille = 32, className }: { readonly taille?: number; readonly className?: string }) => (
  <SymboleKombe taille={taille} {...(className ? { className } : {})} />
);
