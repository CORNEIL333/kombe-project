/**
 * Ordre de passage (lot L-13, ADR-0031).
 *
 * Pratiques couvertes :
 *  - ordre fixé d'avance (socle C05) ;
 *  - TIRAGE AU SORT vérifiable à la première séance : la graine est engagée
 *    (empreinte publiée) AVANT le tirage puis révélée ; chacun peut rejouer
 *    le résultat ;
 *  - ÉCHANGE de tour entre deux titulaires consentants, validé par le bureau ;
 *  - TOUR PRIORITAIRE pour un besoin urgent, avec l'accord de chaque
 *    personne déplacée ;
 *  - « les nouveaux bouffent en dernier » (ordre de confiance) ;
 *  - ENCHÈRES (drapeau fermé) : prime proposée pour bouffer plus tôt.
 *
 * Aucun de ces mécanismes ne modifie un montant de cotisation.
 */
import { DomainError } from "../errors.js";
import { sha256Hex } from "../canonical.js";
import { perAmount } from "../money.js";

/** Engagement de tirage : empreinte publiée avant le tirage. */
export function drawCommitment(seed: string): string {
  if (seed.length < 16) throw new DomainError("DRAW_INVALID", "Graine trop courte (16 caractères minimum)");
  return sha256Hex(`kombe-draw:${seed}`);
}

/**
 * Ordre tiré : tri des titulaires par empreinte(graine + identifiant). Le
 * résultat ne dépend que de la graine révélée et de la liste figée : il est
 * rejouable par n'importe quel membre.
 */
export function drawOrder(seed: string, commitment: string, holders: readonly string[]): string[] {
  if (drawCommitment(seed) !== commitment) {
    throw new DomainError("DRAW_INVALID", "La graine révélée ne correspond pas à l'engagement");
  }
  if (new Set(holders).size !== holders.length || holders.length < 2) {
    throw new DomainError("DRAW_INVALID", "Liste de titulaires invalide");
  }
  return [...holders]
    .map((h) => ({ h, k: sha256Hex(`${seed}|${h}`) }))
    .sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0))
    .map((x) => x.h);
}

/** Tirage partiel : les places déjà fixées restent, seules les libres sont tirées. */
export function drawWithFixed(
  seed: string,
  commitment: string,
  slots: readonly (string | null)[],
  undecided: readonly string[],
): string[] {
  if (drawCommitment(seed) !== commitment) {
    throw new DomainError("DRAW_INVALID", "La graine révélée ne correspond pas à l'engagement");
  }
  const drawn = undecided.length >= 2 ? drawOrder(seed, commitment, undecided) : [...undecided];
  const free = slots.filter((s) => s === null).length;
  if (free !== undecided.length) throw new DomainError("DRAW_INVALID", "Places libres ≠ titulaires à tirer");
  let i = 0;
  return slots.map((s) => (s === null ? (drawn[i++] as string) : s));
}

export interface RoundSlot {
  readonly seq: number;
  readonly holder: string;
  /** Tour déjà remis (passé) : il ne bouge plus. */
  readonly paid: boolean;
}

/** Échange de deux tours non encore remis ; titulaires distincts. */
export function swapRounds(slots: readonly RoundSlot[], seqA: number, seqB: number): RoundSlot[] {
  if (seqA === seqB) throw new DomainError("ORDER_CHANGE_INVALID", "Échange d'un tour avec lui-même");
  const a = slots.find((s) => s.seq === seqA);
  const b = slots.find((s) => s.seq === seqB);
  if (!a || !b) throw new DomainError("ORDER_CHANGE_INVALID", "Tour inconnu");
  if (a.paid || b.paid) throw new DomainError("ORDER_CHANGE_INVALID", "Un tour déjà remis ne s'échange plus");
  if (a.holder === b.holder) throw new DomainError("ORDER_CHANGE_INVALID", "Même titulaire");
  return slots.map((s) => {
    if (s.seq === seqA) return { ...s, holder: b.holder };
    if (s.seq === seqB) return { ...s, holder: a.holder };
    return s;
  });
}

/** Les accords requis pour un échange : les deux titulaires, puis le bureau. */
export function swapApprovalsComplete(input: {
  readonly holderA: string;
  readonly holderB: string;
  readonly acceptedBy: readonly string[];
  readonly bureauApproverId: string | null;
}): boolean {
  const ok = input.acceptedBy.includes(input.holderA) && input.acceptedBy.includes(input.holderB);
  return ok && input.bureauApproverId !== null && input.bureauApproverId !== input.holderA && input.bureauApproverId !== input.holderB;
}

/**
 * Tour prioritaire : le titulaire `holder` passe au tour `targetSeq` ; les
 * titulaires entre la cible et sa place reculent d'un rang. Retourne aussi
 * la liste des personnes déplacées, dont l'accord est requis.
 */
export function priorityMove(slots: readonly RoundSlot[], holder: string, targetSeq: number): { readonly slots: RoundSlot[]; readonly displaced: string[] } {
  const ordered = [...slots].sort((x, y) => x.seq - y.seq);
  const from = ordered.findIndex((s) => s.holder === holder && !s.paid);
  const to = ordered.findIndex((s) => s.seq === targetSeq);
  if (from < 0 || to < 0) throw new DomainError("ORDER_CHANGE_INVALID", "Titulaire ou tour inconnu");
  if (to >= from) throw new DomainError("ORDER_CHANGE_INVALID", "Un tour prioritaire avance, il ne recule pas");
  if (ordered.slice(to, from + 1).some((s) => s.paid)) {
    throw new DomainError("ORDER_CHANGE_INVALID", "On ne déplace pas un tour déjà remis");
  }
  const holders = ordered.map((s) => s.holder);
  const [moved] = holders.splice(from, 1);
  holders.splice(to, 0, moved as string);
  const displaced = ordered.slice(to, from).map((s) => s.holder);
  return { slots: ordered.map((s, i) => ({ ...s, holder: holders[i] as string })), displaced };
}

/**
 * Ordre de confiance : les membres admis après `cutoff` (date ISO) passent
 * après les anciens, sans changer l'ordre relatif à l'intérieur de chaque bloc.
 */
export function newcomersLast(order: readonly string[], joinedAt: Readonly<Record<string, string>>, cutoff: string): string[] {
  const seniors = order.filter((h) => (joinedAt[h] ?? "0000-00-00") <= cutoff);
  const newcomers = order.filter((h) => (joinedAt[h] ?? "0000-00-00") > cutoff);
  return [...seniors, ...newcomers];
}

/* ── Enchères (drapeau fermé, ADR-0032) ──────────────────────────────── */

export type AuctionPremiumDestination = "shared_by_others" | "fund";

/**
 * Adjudication d'un tour aux enchères : la plus forte prime gagne ; à prime
 * égale, l'offre la plus ancienne. La prime est soit répartie entre les
 * AUTRES membres, soit versée à une caisse. Le montant net remis est
 * explicite : pot − prime.
 */
export function settleAuction(input: {
  readonly pot: bigint;
  readonly bids: readonly { readonly holder: string; readonly premium: bigint; readonly at: number }[];
  readonly destination: AuctionPremiumDestination;
  readonly members: readonly string[];
}): {
  readonly winner: string;
  readonly premium: bigint;
  readonly netPayout: bigint;
  readonly shares: readonly { readonly holder: string; readonly amount: bigint }[];
} {
  if (input.bids.length === 0) throw new DomainError("ORDER_CHANGE_INVALID", "Aucune offre");
  for (const b of input.bids) perAmount(b.premium);
  const best = [...input.bids].sort((x, y) => (x.premium === y.premium ? x.at - y.at : x.premium > y.premium ? -1 : 1))[0]!;
  if (best.premium >= input.pot) throw new DomainError("ORDER_CHANGE_INVALID", "Prime supérieure au pot");
  let shares: { holder: string; amount: bigint }[] = [];
  if (input.destination === "shared_by_others") {
    const others = input.members.filter((m) => m !== best.holder);
    if (others.length === 0) throw new DomainError("ORDER_CHANGE_INVALID", "Aucun autre membre");
    const n = BigInt(others.length);
    const each = best.premium / n;
    const rest = best.premium - each * n;
    shares = others.map((holder, i) => ({ holder, amount: i === 0 ? each + rest : each }));
  }
  return { winner: best.holder, premium: best.premium, netPayout: input.pot - best.premium, shares };
}
