/* KÓMBE — toile de fond immersive (refonte PWA). Purement décorative
   (aria-hidden) : formes organiques + motif botanique inspiré du symbole
   KÓMBE (feuille), dérive très lente (prefers-reduced-motion gèle tout,
   cf. styles.css). Chaque variante change l'agencement des couleurs pour
   distinguer visuellement les étapes d'un parcours à une seule action à la
   fois (connexion email → code → cotisation → groupe), sans jamais porter
   d'information fonctionnelle par la couleur seule (le texte reste la seule
   source de vérité, ceci n'est qu'une ambiance). */

export type VarianteImmersive = "email" | "code" | "cotisation" | "groupe" | "neutre";

const MOTIF_FEUILLE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Cg fill='none' stroke='%23ffffff' stroke-width='1.1' opacity='0.35'%3E%3Cpath d='M20 90 C20 50 50 20 90 20 C90 60 60 90 20 90 Z'/%3E%3Cpath d='M20 90 C45 70 65 45 90 20'/%3E%3C/g%3E%3C/svg%3E";

export function ImmersiveBackdrop({ variante = "neutre" }: { readonly variante?: VarianteImmersive }) {
  return (
    <div className={`fond-immersif fond-immersif--${variante}`} aria-hidden="true">
      <span className="fond-immersif-tache fond-immersif-tache-1" />
      <span className="fond-immersif-tache fond-immersif-tache-2" />
      <span className="fond-immersif-tache fond-immersif-tache-3" />
      <span className="fond-immersif-motif" style={{ backgroundImage: `url("${MOTIF_FEUILLE}")` }} />
    </div>
  );
}
