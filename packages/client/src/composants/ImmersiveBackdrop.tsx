/* KÓMBE — toile de fond des scènes (direction v2 « L'Orbite », sombre).
   Purement décorative (aria-hidden) : forêt de nuit, deux lueurs chaudes, un
   grain très léger et deux orbites concentriques en filigrane qui reprennent
   la forme du logotype. Chaque variante déplace la lumière pour distinguer
   les parcours, sans jamais porter d'information fonctionnelle (le texte de
   la carte fait foi). `prefers-reduced-motion` gèle tout mouvement. */

export type VarianteImmersive = "email" | "code" | "cotisation" | "groupe" | "neutre";

export function ImmersiveBackdrop({ variante = "neutre" }: { readonly variante?: VarianteImmersive }) {
  return (
    <div className={`fond-immersif fond-immersif--${variante}`} aria-hidden="true">
      <span className="fond-immersif-lueur fond-immersif-lueur-1" />
      <span className="fond-immersif-lueur fond-immersif-lueur-2" />
      <svg className="fond-immersif-orbites" viewBox="0 0 400 400" focusable="false">
        <circle cx="200" cy="200" r="150" />
        <circle cx="200" cy="200" r="196" />
      </svg>
      <span className="fond-immersif-grain" />
    </div>
  );
}
