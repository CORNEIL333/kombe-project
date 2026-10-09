/* KÓMBE — fond de scène (couche B : parcours guidés). Purement décoratif
   (aria-hidden) : surface sable et grand anneau de marque recadré, statique.
   Ni dégradé saturé, ni lueur floue, ni dérive : l'attention reste sur la
   carte d'étape, qui seule porte l'information. */

export type VarianteImmersive = "email" | "code" | "cotisation" | "groupe" | "neutre";

export function ImmersiveBackdrop({ variante = "neutre" }: { readonly variante?: VarianteImmersive }) {
  return (
    <div className={`fond-immersif fond-immersif--${variante}`} aria-hidden="true">
      <svg className="fond-immersif-anneau" viewBox="0 0 400 400">
        <circle cx="200" cy="200" r="150" fill="none" stroke="currentColor" strokeWidth="22" />
        <path d="M50 200A150 150 0 0 1 200 50" fill="none" stroke="var(--k-gold-500)" strokeWidth="22" />
        <circle cx="200" cy="50" r="30" fill="var(--k-sand-100)" stroke="var(--k-surface-sunken)" strokeWidth="8" />
        <circle cx="50" cy="200" r="30" fill="var(--k-gold-500)" stroke="var(--k-surface-sunken)" strokeWidth="8" />
        <circle cx="350" cy="200" r="30" fill="currentColor" stroke="var(--k-surface-sunken)" strokeWidth="8" />
        <circle cx="200" cy="350" r="30" fill="var(--k-sand-100)" stroke="var(--k-surface-sunken)" strokeWidth="8" />
      </svg>
    </div>
  );
}
