/* KÓMBE — l'Orbite, forme centrale de la grammaire visuelle v2. Chaque forme
   correspond à une donnée réelle, jamais à un décor :
     - le cercle = le groupe (ou le parcours) ;
     - un nœud = un membre (ou une étape) ;
     - l'arc forêt depuis le premier nœud = progression (courant / total) ;
     - le nœud or + l'Accent = la position courante (« c'est ici / à vous »).
   Variante « marque » : rotation lente réservée aux scènes d'accueil, gelée
   sous `prefers-reduced-motion` (styles.css). Par défaut la forme est
   décorative (aria-hidden) car le texte voisin porte déjà l'information ;
   passer `libelle` la rend lisible (role=img). */

import { useId } from "react";

export interface OrbiteProps {
  readonly total: number;
  readonly courant: number;
  readonly taille?: number;
  readonly photo?: string;
  readonly variante?: "produit" | "marque";
  readonly libelle?: string;
  readonly className?: string;
}

export function Orbite({ total, courant, taille = 200, photo, variante = "produit", libelle, className }: OrbiteProps) {
  const idClip = useId();
  const c = 100;
  const r = 84;
  const n = Math.max(1, total);
  const position = Math.min(Math.max(0, courant), n - 1);
  const angle = (i: number) => (i / n) * 2 * Math.PI - Math.PI / 2;
  const noeuds = Array.from({ length: n }, (_, i) => ({
    i,
    x: c + r * Math.cos(angle(i)),
    y: c + r * Math.sin(angle(i)),
    etat: i < position ? "fait" : i === position ? "courant" : "avenir",
  }));
  // L'Accent : petit trait or tangent à l'orbite, à l'extérieur du nœud courant.
  const a = angle(position);
  const ax = c + (r + 15) * Math.cos(a);
  const ay = c + (r + 15) * Math.sin(a);
  const tx = -Math.sin(a) * 6;
  const ty = Math.cos(a) * 6;
  // Sur une petite orbite (indicateur d'étapes), les nœuds grossissent pour
  // rester lisibles ; sur une grande, ils restent fins.
  const rayonNoeud = taille < 120 ? 15 : n > 10 ? 6 : 10;

  return (
    <svg
      className={`orbite orbite--${variante} ${className ?? ""}`}
      width={taille}
      height={taille}
      viewBox="-12 -12 224 224"
      {...(libelle ? { role: "img", "aria-label": libelle } : { "aria-hidden": true })}
      focusable="false"
    >
      {photo ? (
        <>
          <clipPath id={idClip}>
            <circle cx={c} cy={c} r={r - 18} />
          </clipPath>
          <image
            href={photo}
            x={c - (r - 18)}
            y={c - (r - 18)}
            width={(r - 18) * 2}
            height={(r - 18) * 2}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${idClip})`}
          />
        </>
      ) : null}
      <circle className="orbite__piste" cx={c} cy={c} r={r} />
      <circle
        className="orbite__arc"
        cx={c}
        cy={c}
        r={r}
        pathLength={100}
        strokeDasharray={`${(position / n) * 100} 100`}
        transform={`rotate(-90 ${c} ${c})`}
      />
      <g className="orbite__noeuds">
        {noeuds.map((p) => (
          <circle key={p.i} className={`orbite__noeud orbite__noeud--${p.etat}`} cx={p.x} cy={p.y} r={p.etat === "courant" ? rayonNoeud + 3 : rayonNoeud} />
        ))}
      </g>
      <line
        className="orbite__accent"
        x1={ax - tx}
        y1={ay - ty}
        x2={ax + tx}
        y2={ay + ty}
      />
    </svg>
  );
}
