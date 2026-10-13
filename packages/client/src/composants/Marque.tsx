/* KÓMBE — logotype « L'Orbite » (direction créative v2, oct. 2026). Le Ó du
   nom est un cercle et son accent aigu devient « l'Accent », le marqueur or qui
   désigne partout la personne concernée (bénéficiaire du tour, membre qui doit
   agir). Vectoriel, net à toute taille, couleur héritée (`currentColor`) pour
   s'adapter aux fonds sombres et clairs. Le nom est lu par les lecteurs d'écran
   via `aria-label` ; la forme elle-même ne porte aucune donnée. */

export function SymboleOrbite({ taille = 32, className }: { readonly taille?: number; readonly className?: string }) {
  return (
    <svg
      className={className}
      width={taille}
      height={taille}
      viewBox="0 0 40 40"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="20" cy="22" r="13" fill="none" stroke="currentColor" strokeWidth="4.5" />
      <path d="M23.5 3.5 L30 1" stroke="var(--k-or-500)" strokeWidth="4.5" strokeLinecap="round" />
    </svg>
  );
}

export function LogoKombe({ hauteur = 28, className }: { readonly hauteur?: number; readonly className?: string }) {
  return (
    <span className={`logo-kombe ${className ?? ""}`} role="img" aria-label="KÓMBE" style={{ fontSize: hauteur }}>
      <span aria-hidden="true">K</span>
      <SymboleOrbite className="logo-kombe__o" taille={Math.round(hauteur * 0.92)} />
      <span aria-hidden="true">MBE</span>
    </span>
  );
}
