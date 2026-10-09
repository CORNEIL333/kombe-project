/* KÓMBE — trajectoire de pied de scène. Remplace l'ancien bandeau à
   triangles (décoratif, sans lien avec la grammaire de marque) par un
   filet ponctué de nœuds : la « trajectoire = historique » de la charte.
   Purement décoratif (aria-hidden). Nom conservé pour la compatibilité. */

export function MotifAfricain({ hauteur = 28 }: { readonly hauteur?: number }) {
  return (
    <svg className="motif-africain" style={{ height: hauteur }} viewBox="0 0 400 28" preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" y1="14" x2="400" y2="14" stroke="var(--k-line-strong)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
