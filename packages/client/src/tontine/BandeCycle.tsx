/** Signature de KÓMBE : le rang de perles du cycle. Une perle par tour : or si passé, cerclée pour le tour en cours, vide à venir. */
export function BandeCycle({ courant, total, libelle, clair = false }: { readonly courant: number; readonly total: number; readonly libelle: string; readonly clair?: boolean }) {
  if (total <= 0) return null;
  return (
    <span className={clair ? "bande-cycle bande-cycle--clair" : "bande-cycle"} role="img" aria-label={libelle}>
      {Array.from({ length: total }, (_, i) => (
        <i key={i} className={i + 1 < courant ? "est-passe" : i + 1 === courant ? "est-courant" : undefined} style={{ animationDelay: `${Math.min(i, 20) * 35}ms` }} />
      ))}
    </span>
  );
}
