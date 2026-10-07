/* KÓMBE — toile de fond immersive (refonte PWA). Purement décorative
   (aria-hidden) : dégradé de marque + filigrane du VRAI emblème officiel
   (packages/client/public/brand/logo-emblem.png, fourni par le porteur —
   jamais un symbole générique inventé), dérive très lente. Chaque variante
   change l'agencement des couleurs pour distinguer visuellement les étapes
   d'un parcours à une seule action à la fois, sans jamais porter
   d'information fonctionnelle par la couleur seule (le texte de la carte
   fait foi). `prefers-reduced-motion` gèle tout mouvement (styles.css). */

export type VarianteImmersive = "email" | "code" | "cotisation" | "groupe" | "neutre";

export function ImmersiveBackdrop({ variante = "neutre" }: { readonly variante?: VarianteImmersive }) {
  return (
    <div className={`fond-immersif fond-immersif--${variante}`} aria-hidden="true">
      <span className="fond-immersif-lueur fond-immersif-lueur-1" />
      <span className="fond-immersif-lueur fond-immersif-lueur-2" />
      <span className="fond-immersif-filigrane" />
    </div>
  );
}
