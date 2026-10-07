/* KÓMBE — saisie de code à 6 chiffres en cases séparées (refonte PWA).
   Chaque case est un <input> à part entière, correctement nommée pour un
   lecteur d'écran (« Chiffre N sur 6 »), avec avancement automatique du
   focus et gestion du retour arrière/collage d'un code complet. La valeur
   exposée à l'appelant reste une SEULE chaîne de 6 chiffres — ce composant
   ne change rien au contrat `onChange(valeur: string)` déjà utilisé partout
   ailleurs (ChampTexte), il ne fait que présenter la saisie autrement. */

import { useRef } from "react";

export interface ChampCodeProps {
  readonly valeur: string;
  readonly onChange: (valeur: string) => void;
  readonly erreur?: string | undefined;
  readonly libelle: string;
  readonly longueur?: number;
}

export function ChampCode({ valeur, onChange, erreur, libelle, longueur = 6 }: ChampCodeProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const chiffres = Array.from({ length: longueur }, (_, i) => valeur[i] ?? "");
  const idBase = "code-otp";

  function definirChiffre(index: number, brut: string) {
    const chiffre = brut.replace(/\D/g, "").slice(-1);
    const suivant = chiffres.slice();
    suivant[index] = chiffre;
    onChange(suivant.join(""));
    if (chiffre && index < longueur - 1) {
      refs.current[index + 1]?.focus();
    }
  }

  function surTouche(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !chiffres[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  }

  function surCollage(index: number, event: React.ClipboardEvent<HTMLInputElement>) {
    const colle = event.clipboardData.getData("text").replace(/\D/g, "");
    if (!colle) return;
    event.preventDefault();
    const suivant = chiffres.slice();
    for (let i = 0; i < colle.length && index + i < longueur; i += 1) {
      suivant[index + i] = colle[i] ?? "";
    }
    onChange(suivant.join(""));
    const dernierRempli = Math.min(index + colle.length, longueur) - 1;
    refs.current[Math.max(0, dernierRempli)]?.focus();
  }

  return (
    <div className="champ-code">
      <span className="champ-code-libelle" id={`${idBase}-libelle`}>
        {libelle}
      </span>
      <div
        className="champ-code-cases"
        role="group"
        aria-labelledby={`${idBase}-libelle`}
        aria-describedby={erreur ? `${idBase}-erreur` : undefined}
      >
        {chiffres.map((chiffre, index) => (
          <input
            // eslint-disable-next-line react/no-array-index-key -- position fixe, jamais réordonnée
            key={index}
            ref={(el) => {
              refs.current[index] = el;
            }}
            className="champ-code-case"
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            maxLength={1}
            value={chiffre}
            aria-label={`Chiffre ${index + 1} sur ${longueur}`}
            aria-invalid={erreur ? true : undefined}
            onChange={(e) => definirChiffre(index, e.target.value)}
            onKeyDown={(e) => surTouche(index, e)}
            onPaste={(e) => surCollage(index, e)}
          />
        ))}
      </div>
      {erreur ? (
        <span id={`${idBase}-erreur`} className="erreur-champ" role="alert">
          {erreur}
        </span>
      ) : null}
    </div>
  );
}
