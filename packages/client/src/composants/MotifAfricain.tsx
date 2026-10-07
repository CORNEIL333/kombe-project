/* KÓMBE — bandeau à motif géométrique de la marque (triangles forêt/or),
   portage fidèle du motif déjà utilisé côté mobile
   (`packages/mobile/lib/core/widgets/african_pattern_band.dart`,
   `_PatternPainter`) : même construction géométrique (triangle extérieur
   forêt, triangle intérieur or, pas = 1.5× la hauteur), ici en SVG vectoriel
   net à toute résolution plutôt qu'un canvas peint. Purement décoratif
   (aria-hidden) — c'est un repère de marque, jamais un porteur
   d'information fonctionnelle. */

export function MotifAfricain({ hauteur = 36 }: { readonly hauteur?: number }) {
  const u = hauteur;
  const pas = u * 1.5;
  return (
    <svg
      className="motif-africain"
      style={{ height: hauteur }}
      viewBox={`0 0 ${pas} ${u}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <pattern id="motif-africain-tuile" width={pas} height={u} patternUnits="userSpaceOnUse">
          <path d={`M0,${u} L${u * 0.5},0 L${u},${u} Z`} fill="var(--couleur-primaire-fonce)" />
          <path
            d={`M${u * 0.28},${u} L${u * 0.5},${u * 0.35} L${u * 0.72},${u} Z`}
            fill="var(--couleur-or)"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#motif-africain-tuile)" />
    </svg>
  );
}
