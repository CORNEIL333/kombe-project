/**
 * Parts multiples et parts partagées (lot L-14, ADR-0031).
 *
 * Un membre peut cotiser pour deux « noms » (deux mains) et bouffer deux
 * fois ; deux personnes peuvent partager un nom (demi-part) et se partager
 * la cagnotte. On distingue donc MEMBRE et PART :
 *  - une part a un ou plusieurs titulaires, avec une clé de répartition ;
 *  - un membre détient une ou plusieurs parts ;
 *  - le nombre de tours est égal au nombre de parts ;
 *  - le pot d'un tour = nombre de parts × cotisation par part.
 *
 * Le cas historique (une part, un membre) reste le chemin par défaut.
 */
import { DomainError } from "../errors.js";
import { perAmount } from "../money.js";

export interface ShareHolder {
  readonly membershipId: string;
  /** Poids entier (ex. 1 et 1 pour une demi-part chacun). */
  readonly weight: number;
}

export interface Share {
  readonly shareId: string;
  readonly holders: readonly ShareHolder[];
}

export function assertShares(shares: readonly Share[], activeMembers: readonly string[]): void {
  if (shares.length < 2) throw new DomainError("SHARES_INVALID", "Au moins deux parts");
  const ids = new Set<string>();
  const active = new Set(activeMembers);
  const holding = new Set<string>();
  for (const s of shares) {
    if (ids.has(s.shareId)) throw new DomainError("SHARES_INVALID", "Part en double");
    ids.add(s.shareId);
    if (s.holders.length < 1 || s.holders.length > 4) {
      throw new DomainError("SHARES_INVALID", "Une part a de 1 à 4 titulaires");
    }
    const inShare = new Set<string>();
    for (const h of s.holders) {
      if (!active.has(h.membershipId)) throw new DomainError("SHARES_INVALID", "Titulaire non actif");
      if (inShare.has(h.membershipId)) throw new DomainError("SHARES_INVALID", "Titulaire en double dans une part");
      inShare.add(h.membershipId);
      if (!Number.isInteger(h.weight) || h.weight < 1 || h.weight > 100) {
        throw new DomainError("SHARES_INVALID", "Poids de 1 à 100");
      }
      holding.add(h.membershipId);
    }
  }
  for (const m of activeMembers) {
    if (!holding.has(m)) throw new DomainError("SHARES_INVALID", "Chaque membre actif détient au moins une part");
  }
}

/** Parts par défaut : une part par membre, un seul titulaire. */
export function oneSharePerMember(memberIds: readonly string[]): Share[] {
  return memberIds.map((m, i) => ({ shareId: `part-${i + 1}`, holders: [{ membershipId: m, weight: 1 }] }));
}

/**
 * Répartition entière d'un montant entre les titulaires selon leurs poids ;
 * le reste de la division va au premier titulaire (règle visible).
 */
export function splitByWeight(amount: bigint, holders: readonly ShareHolder[]): readonly { readonly membershipId: string; readonly amount: bigint }[] {
  perAmount(amount);
  const total = BigInt(holders.reduce((s, h) => s + h.weight, 0));
  if (total === 0n) throw new DomainError("SHARES_INVALID", "Poids nuls");
  const parts = holders.map((h) => ({ membershipId: h.membershipId, amount: (amount * BigInt(h.weight)) / total }));
  const distributed = parts.reduce((s, p) => s + p.amount, 0n);
  const rest = amount - distributed;
  return parts.map((p, i) => (i === 0 ? { ...p, amount: p.amount + rest } : p));
}

/** Cotisation due par chaque membre pour une séance : somme de ses quotes-parts. */
export function memberDueForRound(shares: readonly Share[], contributionPerShare: bigint): ReadonlyMap<string, bigint> {
  perAmount(contributionPerShare, { positive: true });
  const due = new Map<string, bigint>();
  for (const s of shares) {
    for (const p of splitByWeight(contributionPerShare, s.holders)) {
      due.set(p.membershipId, (due.get(p.membershipId) ?? 0n) + p.amount);
    }
  }
  return due;
}

export function potPerRound(shares: readonly Share[], contributionPerShare: bigint): bigint {
  perAmount(contributionPerShare, { positive: true });
  return BigInt(shares.length) * contributionPerShare;
}
