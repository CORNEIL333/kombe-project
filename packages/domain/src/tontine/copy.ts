/**
 * Règles de copie produit (I-01, I-08 ; ADR-0025).
 *
 * KÓMBE ne garde pas l'argent : aucun texte affiché ne doit laisser croire
 * le contraire, ni promettre une sécurité qu'il n'apporte pas. Le serveur ne
 * valide jamais une cotisation : ce sont des personnes. Ces motifs servent
 * aux tests des dictionnaires (PWA, mobile, tableaux de bord).
 */

/** Motifs interdits dans tout texte affiché (insensibles à la casse). */
export const FORBIDDEN_COPY: readonly RegExp[] = [
  /[ée]pargne/i,
  /\bsavings?\b/i,
  /\bsolde\b/i,
  /\bbalance\b/i,
  /\bretrait\b/i,
  /\bwithdraw/i,
  /d[ée]bit[ée]/i,
  /\bdebited\b/i,
  /fonds\s+(sont\s+)?prot[ée]g[ée]s/i,
  /funds\s+(are\s+)?protected/i,
  /valid[ée]e?s?\s+par\s+le\s+serveur/i,
  /confirm[ée]e?s?\s+par\s+le\s+serveur/i,
  /(validated|confirmed)\s+by\s+the\s+server/i,
  /(the\s+)?server\s+validates/i,
  /chiffr(é|e)\s+de\s+bout\s+en\s+bout/i,
  /end[-\s]to[-\s]end/i,
  /\bwallet\b/i,
  /portefeuille/i,
  // Promesses que KÓMBE ne peut pas tenir (section 6.4) : « chiffres » (digits)
  // reste permis, seuls « chiffré » / « chiffrement » sont visés.
  /\bs[ée]curis[ée]e?s?\b/i,
  /\bsecured?\b/i,
  /\bgaranti(e|es|s)?\b/i,
  /\bguarantee[ds]?\b/i,
  /chiffr(é|ée|és|ées|ement)/i,
  /\bencrypt/i,
];

/** Retourne les motifs interdits trouvés dans un texte. */
export function forbiddenCopyIn(text: string): string[] {
  return FORBIDDEN_COPY.filter((re) => re.test(text)).map((re) => re.source);
}

/** Phrase de positionnement unique (I-17). */
export const POSITIONING = {
  fr: "KÓMBE tient le registre de votre tontine et de votre association. Il ne garde pas votre argent.",
  en: "KÓMBE keeps the record of your tontine and your association. It does not hold your money.",
} as const;

/** Vocabulaire unique du circuit de validation (I-08). */
export const VALIDATION_VOCABULARY = {
  fr: { declared: "Déclarée", confirmed: "Confirmée par le trésorier", validated: "Validée", rejected: "Rejetée", disputed: "Contestée" },
  en: { declared: "Declared", confirmed: "Confirmed by the treasurer", validated: "Validated", rejected: "Rejected", disputed: "Disputed" },
} as const;
