/**
 * Résultat de vote avec quorum.
 *
 * Reproduit exactement l'oracle de référence (`vote_result`, Python
 * `fractions.Fraction`) : seuil = ceil(electorate · num/den), arrondi à
 * l'entier supérieur par arithmétique entière, sans flottant. Une motion
 * n'est approuvée que si la participation atteint le quorum, qu'il existe
 * un choix exprés (oui+non > 0) et que les oui strictement dominent les non.
 * Le dénominateur est figé à l'ouverture du vote (ARCHITECTURE_CIBLE §Snapshot).
 */
import { DomainError } from "./errors.js";

export interface VoteResult {
  readonly quorum: number;
  readonly approved: boolean;
}

function ceilDiv(numerator: number, denominator: number): number {
  // Arithmétique entière uniquement : numérateur et dénominateur positifs.
  return Math.floor((numerator + denominator - 1) / denominator);
}

export function voteResult(
  electorate: number,
  yes: number,
  no: number,
  abstain: number,
  quorumNum = 2,
  quorumDen = 3,
): VoteResult {
  const vals = [electorate, yes, no, abstain, quorumNum, quorumDen];
  if (
    vals.some((v) => !Number.isInteger(v) || v < 0) ||
    electorate === 0 ||
    quorumDen === 0
  ) {
    throw new DomainError("ELECTORATE_INVALIDE", "Électorat et votes invalides");
  }
  if (quorumNum > quorumDen || yes + no + abstain > electorate) {
    throw new DomainError("VOTE_HORS_LIMITES", "Hors limites");
  }
  const quorum = ceilDiv(electorate * quorumNum, quorumDen);
  const turnout = yes + no + abstain;
  const approved = turnout >= quorum && yes + no > 0 && yes > no;
  return { quorum, approved };
}
