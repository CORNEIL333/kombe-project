/**
 * Couverture de la logique monétaire XAF de dashboard-core.
 * Règle clé (ADR-0002) : les montants sont des entiers stricts (^[\d]+$),
 * manipulés via BigInt pour ne jamais perdre de précision au-delà de
 * Number.MAX_SAFE_INTEGER.
 */
import { describe, expect, it } from "vitest";
import { assertXafInteger, formatXaf } from "./money";

describe("assertXafInteger — entiers XAF stricts", () => {
  it("accepte et normalise (trim) les chaînes de chiffres", () => {
    expect(assertXafInteger("1000")).toBe("1000");
    expect(assertXafInteger("  500  ")).toBe("500");
    expect(assertXafInteger("0")).toBe("0");
  });

  it("refuse tout ce qui n'est pas un entier de chiffres", () => {
    for (const bad of ["", "   ", "12,50", "5.5", "1 000", "-5", "abc", "1e3", "12x"]) {
      expect(() => assertXafInteger(bad)).toThrow("Montant XAF invalide.");
    }
  });
});

describe("formatXaf — rendu Intl à 0 décimale", () => {
  it("conserve uniquement les chiffres du montant (groupes/symboles ignorés)", () => {
    expect(formatXaf("1000").replace(/\D/g, "")).toBe("1000");
    expect(formatXaf("1000", "en").replace(/\D/g, "")).toBe("1000");
  });

  it("utilise BigInt : précision au-delà de 2^53 préservée", () => {
    const huge = "9007199254740993"; // 2^53 + 1 — imprécis en Number, exact en BigInt
    expect(formatXaf(huge).replace(/\D/g, "")).toBe(huge);
  });

  it("propage l'erreur sur un montant invalide", () => {
    expect(() => formatXaf("12,50")).toThrow("Montant XAF invalide.");
  });
});
