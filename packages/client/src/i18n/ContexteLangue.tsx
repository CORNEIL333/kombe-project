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
  // La langue choisie est gardée sur ce téléphone (sinon chaque ouverture
  // repartait en français).
  const [langue, setLangue] = useState<Langue>(() => {
    try {
      const l = window.localStorage.getItem("kombe.langue");
      return l === "fr" || l === "en" || l === "pcm" ? l : langueInitiale;
    } catch {
      return langueInitiale;
    }
  });

  // Miroir `document.lang` pour la prononciation des lecteurs d'écran.
  useEffect(() => {
    document.documentElement.lang = langue;
  }, [langue]);

  const definirLangue = useCallback((prochaine: Langue) => {
    setLangue(prochaine);
    try {
      window.localStorage.setItem("kombe.langue", prochaine);
    } catch {
      /* stockage indisponible : la langue vaut pour cette visite */
    }
  }, []);

  const t = useCallback<ValeurLangue["t"]>(
    (cle, variables) =>
      interpoler(dictionnaires[langue][cle] ?? (langue === "pcm" ? dictionnaires.en[cle] : undefined) ?? (dictionnaires.fr[cle] as string), variables),
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
    { valeur: "pcm", libelle: t("langue.pcm") },
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
          aria-label={option.libelle}
          onClick={() => definirLangue(option.valeur)}
        >
          {/* Libellé complet sur grand écran, code court sur téléphone. */}
          <span className="saut-langue__long">{option.libelle}</span>
          <span className="saut-langue__court" aria-hidden="true">
            {option.valeur.toUpperCase()}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Sélecteur de langue compact (liste déroulante native, accessible),
    utilisé sur l'écran de connexion — maquette « Connectez-vous ». */
export function SelecteurLangue() {
  const { langue, definirLangue, t } = useLangue();
  return (
    <label className="selecteur-langue">
      <span className="visuellement-cache">{t("langue.bascule")}</span>
      <svg className="selecteur-langue__globe" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M3.5 12h17M12 3.5c2.4 2.5 3.4 5.3 3.4 8.5s-1 6-3.4 8.5c-2.4-2.5-3.4-5.3-3.4-8.5s1-6 3.4-8.5z" />
      </svg>
      <select value={langue} onChange={(e) => definirLangue(e.target.value as Langue)}>
        <option value="fr">{t("langue.fr")}</option>
        <option value="en">{t("langue.en")}</option>
        <option value="pcm">{t("langue.pcm")}</option>
      </select>
    </label>
  );
}
