/* KÓMBE C14 — primitives de formulaire accessibles (12.4). Chaque champ lie
   son <label> (htmlFor/id), son texte d'aide et son erreur via aria-describedby,
   et signale aria-invalid. L'erreur est un TEXTE explicite (« Erreur : … ») dans
   une role=alert — jamais la couleur seule. Les identifiants viennent de
   useId (stables, uniques, sans collisions d'ID entre instances). */

import { useId, type ReactNode } from "react";

interface BaseChamp {
  readonly libelle: string;
  readonly aide?: string | undefined;
  readonly erreur?: string | undefined;
  readonly children?: ReactNode;
}

function DescriptionsChamp({
  idBase,
  aide,
  erreur,
}: {
  readonly idBase: string;
  readonly aide: string | undefined;
  readonly erreur: string | undefined;
}) {
  return (
    <>
      {aide ? (
        <span id={`${idBase}-aide`} className="aide-champ">
          {aide}
        </span>
      ) : null}
      {erreur ? (
        <span id={`${idBase}-erreur`} className="erreur-champ" role="alert">
          {erreur}
        </span>
      ) : null}
    </>
  );
}

function decrire(
  idBase: string,
  aide: string | undefined,
  erreur: string | undefined,
): string {
  const parties: string[] = [];
  if (aide) parties.push(`${idBase}-aide`);
  if (erreur) parties.push(`${idBase}-erreur`);
  return parties.join(" ");
}

export interface ChampTexteProps extends BaseChamp {
  readonly valeur: string;
  readonly onChange: (valeur: string) => void;
  readonly type?: "text" | "number";
  readonly entier?: boolean;
  readonly min?: number;
  readonly max?: number;
  readonly requis?: boolean;
  readonly placeholder?: string;
  readonly inputMode?: "text" | "numeric";
}

export function ChampTexte({
  libelle,
  aide,
  erreur,
  valeur,
  onChange,
  type = "text",
  entier = false,
  min,
  max,
  requis = false,
  placeholder,
  inputMode,
}: ChampTexteProps) {
  const idBase = useId();
  const idChamp = `${idBase}-champ`;
  return (
    <div className="champ">
      <label htmlFor={idChamp}>
        {libelle}
        {requis ? " *" : ""}
      </label>
      <input
        id={idChamp}
        name={idChamp}
        type={type}
        value={valeur}
        inputMode={inputMode}
        placeholder={placeholder}
        aria-required={requis}
        aria-invalid={erreur ? true : undefined}
        aria-describedby={decrire(idBase, aide, erreur)}
        {...(entier ? { min, max, step: 1 } : {})}
        onChange={(event) => onChange(event.target.value)}
      />
      <DescriptionsChamp idBase={idBase} aide={aide} erreur={erreur} />
    </div>
  );
}

export interface OptionSelect {
  readonly valeur: string;
  readonly libelle: string;
}

export interface ChampSelectProps extends BaseChamp {
  readonly valeur: string;
  readonly onChange: (valeur: string) => void;
  readonly options: readonly OptionSelect[];
}

export function ChampSelect({
  libelle,
  aide,
  erreur,
  valeur,
  onChange,
  options,
}: ChampSelectProps) {
  const idBase = useId();
  const idChamp = `${idBase}-champ`;
  return (
    <div className="champ">
      <label htmlFor={idChamp}>{libelle}</label>
      <select
        id={idChamp}
        name={idChamp}
        value={valeur}
        aria-invalid={erreur ? true : undefined}
        aria-describedby={decrire(idBase, aide, erreur)}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.valeur} value={option.valeur}>
            {option.libelle}
          </option>
        ))}
      </select>
      <DescriptionsChamp idBase={idBase} aide={aide} erreur={erreur} />
    </div>
  );
}
