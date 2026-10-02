/* KÓMBE C14 — contexte de langue + bascule accessible (12.6). La bascule est
   un groupe de boutons avec `aria-pressed` (jamais la couleur seule), atteignable
   au clavier, et disponible à tout moment dans l'en-tête. Changer la langue met
   aussi à jour `lang` du document (les lecteurs d'écran prononcent correctement). */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  dictionnaires,
  interpoler,
  type CleI18n,
  type Langue,
} from "./dictionnaires.js";

interface ValeurLangue {
  readonly langue: Langue;
  readonly definirLangue: (langue: Langue) => void;
  readonly t: (cle: CleI18n, variables?: Record<string, string | number>) => string;
}

const ContexteLangue = createContext<ValeurLangue | null>(null);

export function FournisseurLangue({
  langueInitiale = "fr",
  children,
}: {
  readonly langueInitiale?: Langue;
  readonly children: ReactNode;
}) {
  const [langue, setLangue] = useState<Langue>(langueInitiale);

  // Miroir `document.lang` pour la prononciation des lecteurs d'écran.
  useEffect(() => {
    document.documentElement.lang = langue;
  }, [langue]);

  const definirLangue = useCallback((prochaine: Langue) => {
    setLangue(prochaine);
  }, []);

  const t = useCallback<ValeurLangue["t"]>(
    (cle, variables) =>
      interpoler(dictionnaires[langue][cle] ?? dictionnaires.fr[cle], variables),
    [langue],
  );

  const valeur = useMemo<ValeurLangue>(
    () => ({ langue, definirLangue, t }),
    [langue, definirLangue, t],
  );

  return (
    <ContexteLangue.Provider value={valeur}>{children}</ContexteLangue.Provider>
  );
}

export function useLangue(): ValeurLangue {
  const valeur = useContext(ContexteLangue);
  if (valeur === null) {
    throw new Error("useLangue doit être utilisé dans un FournisseurLangue.");
  }
  return valeur;
}

/** Bascule FR/EN — role=groupe, boutons avec aria-pressed (aucune info par
 * couleur seule), chaque bouton restant atteignable au tab. */
export function BasculeLangue() {
  const { langue, definirLangue, t } = useLangue();
  const options: ReadonlyArray<{ valeur: Langue; libelle: string }> = [
    { valeur: "fr", libelle: t("langue.fr") },
    { valeur: "en", libelle: t("langue.en") },
  ];
  return (
    <div
      className="saut-langue"
      role="group"
      aria-label={t("langue.bascule")}
    >
      {options.map((option) => (
        <button
          key={option.valeur}
          type="button"
          aria-pressed={langue === option.valeur}
          onClick={() => definirLangue(option.valeur)}
        >
          {option.libelle}
        </button>
      ))}
    </div>
  );
}
