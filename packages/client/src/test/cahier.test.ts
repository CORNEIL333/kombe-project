/* Lecture des lignes du cahier (L-20) : formats réels, jamais de devinette. */
import { describe, expect, it } from "vitest";
import { lireCahier } from "../tontine/Historique.js";

describe("lireCahier", () => {
  it("lit les séparateurs, dates et montants du terrain", () => {
    const { lignes, erreurs } = lireCahier(
      ["Nom ; Date ; Montant", "Awa Ndongo ; 05/01/2025 ; 5 000", "Paul\t2025-01-12\t10000", "Chantal, 3/2/2025, 2.500 FCFA", "Daniel ; hier ; 5000", "Esther ; 05/01/2025 ; 12,5"].join("\n"),
    );
    expect(lignes).toEqual([
      { memberName: "Awa Ndongo", date: "2025-01-05", amount: 5000 },
      { memberName: "Paul", date: "2025-01-12", amount: 10000 },
      { memberName: "Chantal", date: "2025-02-03", amount: 2500 },
    ]);
    expect(erreurs).toEqual(["Daniel ; hier ; 5000", "Esther ; 05/01/2025 ; 12,5"]);
  });
});
