/**
 * Neutralisation d'un champ texte pour export CSV/feuille de calcul.
 *
 * Copie de l'oracle `csv_text` : un champ dont la forme, après suppression
 * des espaces de tête, commence par = + - @ — ou dont la valeur brute commence
 * par une tabulation / retour chariot / saut de ligne — est préfixé d'une
 * apostrophe pour empêcher l'injection de formule. Les types numériques
 * typés sont traités ailleurs (montants en bigint).
 */
import { DomainError } from "./errors.js";

const FORMULA_LEADERS = ["=", "+", "-", "@"];
const CONTROL_LEADERS = ["\t", "\r", "\n"];

export function csvText(value: string): string {
  if (typeof value !== "string") {
    throw new DomainError("CSV_TEXTE_REQUIS", "Texte requis");
  }
  const stripped = value.replace(/^[ \t\r\n]+/, "");
  const startsFormula = FORMULA_LEADERS.some((c) => stripped.startsWith(c));
  const startsControl = CONTROL_LEADERS.some((c) => value.startsWith(c));
  return startsFormula || startsControl ? `'${value}` : value;
}
