/* KÓMBE — scène v2 (couche produit) : un récit à gauche (surtitre, titre dont
   un seul mot « résout » en Newsreader italique, texte, orbite de marque
   autour de la photo de communauté) et la carte fonctionnelle à droite. Sur
   mobile, le récit se réduit à un bandeau compact au-dessus de la carte.
   La scène ne contient aucune donnée métier : seule la carte en affiche. */

import type { ReactNode } from "react";
import { ImmersiveBackdrop, type VarianteImmersive } from "./ImmersiveBackdrop.js";
import { Orbite } from "./Orbite.js";

export interface SceneProps {
  readonly variante: VarianteImmersive;
  readonly surtitre: string;
  readonly titre: string;
  readonly accent: string;
  readonly texte: string;
  readonly etiquette?: string;
  readonly etiquetteId?: string;
  readonly children: ReactNode;
}

export function Scene({ variante, surtitre, titre, accent, texte, etiquette, etiquetteId, children }: SceneProps) {
  return (
    <section
      className={`scene-immersive scene-immersive--${variante}`}
      {...(etiquetteId ? { "aria-labelledby": etiquetteId } : { "aria-label": etiquette })}
    >
      <ImmersiveBackdrop variante={variante} />
      <div className="scene-recit">
        <p className="surtitre">{surtitre}</p>
        <p className="scene-recit__titre">
          {titre} <em>{accent}</em>
        </p>
        <p className="scene-recit__texte">{texte}</p>
        <Orbite className="scene-recit__orbite" total={8} courant={3} variante="marque" photo="/brand/hero-communaute.jpg" taille={300} />
      </div>
      <div className="carte-etape">{children}</div>
    </section>
  );
}
