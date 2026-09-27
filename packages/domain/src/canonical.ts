/**
 * Canonicalisation JSON — RFC 8785 (JCS), profil du journal KÓMBE.
 *
 * Décision C00 : on NE réimplémente PAS JCS à partir d'un simple tri de
 * clés (avertissement explicite d'ARCHITECTURE_CIBLE §Journal et preuves).
 * On délègue à une bibliothèque RFC 8785 épinglée par version (`canonicalize`,
 * 2.1.0). Conformité prouvée par des vecteurs de test officiels JCS.
 *
 * Profil KÓMBE : uniquement des entiers sûrs (pas de flottant, pas de -0,
 * pas de nombre hors MAX_SAFE) et aucune clé dupliquée. Les montants bigint
 * du domaine doivent passer par toSafeNumber avant canonicalisation ; si
 * l'entier n'est pas sûr, on refuse au lieu de corrompre le hash.
 */
import canonicalize from "canonicalize";
import { createHash } from "node:crypto";
import { DomainError } from "./errors.js";
import { MAX_SAFE, toSafeNumber } from "./money.js";

/** Hash de genèse explicite du journal (convention C00). */
export const GENESIS_HASH = "0".repeat(64);

/** Convertit récursivement les bigint en entiers sûrs pour le profil JCS. */
function toJcsValue(value: unknown): unknown {
  if (typeof value === "bigint") {
    if (value < 0n || value > MAX_SAFE) {
      throw new DomainError(
        "CANONICAL_HORS_ENTIER_SUR",
        "Entier hors plage sûre pour la canonicalisation",
      );
    }
    return toSafeNumber(value);
  }
  if (Array.isArray(value)) return value.map(toJcsValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue; // une propriété optionnelle absente n'est pas sérialisée
      out[k] = toJcsValue(v);
    }
    return out;
  }
  if (typeof value === "number" && !Number.isInteger(value)) {
    throw new DomainError("CANONICAL_HORS_ENTIER_SUR", "Flottant interdit dans le journal");
  }
  return value;
}

/**
 * Représentation canonique RFC 8785 d'un objet du journal. Lève si la
 * valeur n'est pas canoniquable (flottant, entier non sûr, non-JSON).
 */
export function canonicalizeJson(value: unknown): string {
  const prepared = toJcsValue(value);
  const text = canonicalize(prepared);
  if (text === undefined) {
    throw new DomainError("CANONICAL_HORS_ENTIER_SUR", "Valeur non canonicalisable");
  }
  return text;
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Hash SHA-256 sur les octets UTF-8 de la forme canonique. */
export function canonicalHash(value: unknown): string {
  return sha256Hex(canonicalizeJson(value));
}
