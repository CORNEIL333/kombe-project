/**
 * Identité par numéro de téléphone (lot L-01, ADR-0025).
 *
 * Au Cameroun, le numéro est l'identité de référence ; beaucoup de membres
 * n'ont pas d'e-mail actif. Un numéro est normalisé en E.164 (+237XXXXXXXXX
 * pour le Cameroun, tout E.164 valide pour la diaspora). L'opérateur est
 * INDICATIF (affichage, format de référence Mobile Money) : la portabilité
 * rend toute déduction faillible, il n'est jamais utilisé pour décider.
 */
import { DomainError } from "../errors.js";

export type CameroonOperator = "mtn" | "orange" | "nexttel" | "camtel" | "inconnu";

/** Normalise une saisie libre (espaces, tirets, 00, 237 sans +) en E.164. */
export function normalizePhone(input: string): string {
  const raw = input.trim().replace(/[\s.\-()]/g, "");
  let digits: string;
  if (raw.startsWith("+")) digits = raw.slice(1);
  else if (raw.startsWith("00")) digits = raw.slice(2);
  else if (/^[26]\d{8}$/.test(raw)) digits = `237${raw}`; // national camerounais
  else digits = raw;
  if (!/^\d{8,15}$/.test(digits) || digits.startsWith("0")) {
    throw new DomainError("PHONE_INVALID", "Numéro de téléphone invalide");
  }
  if (digits.startsWith("237")) {
    const national = digits.slice(3);
    if (!/^[26]\d{8}$/.test(national)) {
      throw new DomainError("PHONE_INVALID", "Numéro camerounais invalide (9 chiffres, commence par 6 ou 2)");
    }
  }
  return `+${digits}`;
}

export function isPhoneIdentity(identityId: string): boolean {
  return /^\+\d{8,15}$/.test(identityId);
}

export function isEmailIdentity(identityId: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identityId);
}

/** Canal de vérification déduit de la forme de l'identifiant. */
export function channelForIdentity(identityId: string): "phone" | "email" {
  if (isPhoneIdentity(identityId)) return "phone";
  if (isEmailIdentity(identityId)) return "email";
  throw new DomainError("PHONE_INVALID", "Identifiant ni téléphone ni e-mail");
}

/** Opérateur probable d'un numéro camerounais (indicatif seulement). */
export function cameroonOperator(e164: string): CameroonOperator {
  if (!e164.startsWith("+237")) return "inconnu";
  const n = e164.slice(4);
  const p3 = Number(n.slice(0, 3));
  const p2 = Number(n.slice(0, 2));
  if (p2 === 67 || (p3 >= 650 && p3 <= 654) || (p3 >= 680 && p3 <= 684)) return "mtn";
  if (p2 === 69 || (p3 >= 655 && p3 <= 659) || (p3 >= 685 && p3 <= 689) || p3 === 640) return "orange";
  if (p2 === 66) return "nexttel";
  if (p2 === 62 || n.startsWith("2")) return "camtel";
  return "inconnu";
}

/** Masque un numéro pour l'affichage aux autres membres : +237 6•• •• •• 12. */
export function maskPhone(e164: string): string {
  if (e164.length < 6) return "•••";
  return `${e164.slice(0, 5)}•• •• •• ${e164.slice(-2)}`;
}
