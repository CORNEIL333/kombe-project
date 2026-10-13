/* KÓMBE — icônes linéaires de la marque (trait 1,75, coins ronds), en
   remplacement des emojis : rendu identique sur tous les téléphones et couleur
   héritée du texte. Toujours décoratives (aria-hidden) : le libellé voisin
   porte le sens. */

export type NomIcone = "validation" | "registre" | "horsLigne" | "trace" | "fleche";

const TRACES: Record<NomIcone, string> = {
  // Anneau à trois segments : déclarée → confirmée → validée.
  validation: "M12 3a9 9 0 0 1 7.8 4.5M20.6 13.5A9 9 0 0 1 12 21M6.2 18.9A9 9 0 0 1 4.6 7.2M8.5 12.2l2.4 2.4 4.6-4.8",
  // Cercle de membres partageant un même registre.
  registre: "M12 4.5a2 2 0 1 0 0 .01M5 15.5a2 2 0 1 0 0 .01M19 15.5a2 2 0 1 0 0 .01M8.6 6.6a8 8 0 0 0-3.5 6.6M15.4 6.6a8 8 0 0 1 3.5 6.6M7.2 18.6a8 8 0 0 0 9.6 0",
  // Téléphone avec brouillon pointillé.
  horsLigne: "M7.5 3h9a1.5 1.5 0 0 1 1.5 1.5v15a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19.5v-15A1.5 1.5 0 0 1 7.5 3zM9.5 9h5M9.5 12h5M9.5 15h3M11 18h2",
  // Ligne de temps.
  trace: "M6 4v16M6 6.5h.01M6 12h.01M6 17.5h.01M10 6.5h8M10 12h6M10 17.5h8",
  fleche: "M5 12h14M13 6l6 6-6 6",
};

export function Icone({ nom, taille = 20 }: { readonly nom: NomIcone; readonly taille?: number }) {
  return (
    <svg
      className="icone-kombe"
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={TRACES[nom]} />
    </svg>
  );
}
