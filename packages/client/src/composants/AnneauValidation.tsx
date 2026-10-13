/* KÓMBE — anneau de validation (grammaire v2). Trois segments = les trois
   actes de la machine à états d'une cotisation (domaine 6.2/6.3) : déclarée →
   confirmée par une autre personne → validée. Un segment plein = acte
   accompli ; arc or ouvert = en attente ; anneau fermé + coche = validé par le
   serveur ; anneau rompu rouge = contesté. Toujours accompagné d'un libellé
   texte explicite (BadgeStatut) : la forme ne porte jamais l'information seule. */

export type EtatAnneau = "en-cours" | "valide" | "erreur";

const SEGMENTS = [0, 1, 2] as const;

function arc(i: number, r: number): string {
  // Segment i sur trois, avec un petit écart entre segments.
  const ecart = 0.22;
  const debut = (i / 3) * 2 * Math.PI - Math.PI / 2 + ecart / 2;
  const fin = ((i + 1) / 3) * 2 * Math.PI - Math.PI / 2 - ecart / 2;
  const p = (a: number) => `${(12 + r * Math.cos(a)).toFixed(2)} ${(12 + r * Math.sin(a)).toFixed(2)}`;
  return `M ${p(debut)} A ${r} ${r} 0 0 1 ${p(fin)}`;
}

export function AnneauValidation({ etat, taille = 18 }: { readonly etat: EtatAnneau; readonly taille?: number }) {
  return (
    <svg className={`anneau anneau--${etat}`} width={taille} height={taille} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {etat === "valide" ? (
        <>
          <circle className="anneau__plein" cx="12" cy="12" r="9" />
          <path className="anneau__coche" d="M8 12.4 l2.6 2.6 L16 9.6" />
        </>
      ) : (
        SEGMENTS.map((i) => (
          <path
            key={i}
            className={`anneau__segment ${etat === "en-cours" && i === 0 ? "anneau__segment--fait" : ""}`}
            d={arc(i, 9)}
          />
        ))
      )}
    </svg>
  );
}
