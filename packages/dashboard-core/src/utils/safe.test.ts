/**
 * Garde-fous d'identifiants et d'affichage texte (dashboard-core).
 */
import { describe, expect, it } from "vitest";
import { encodePath, safeText } from "./safe";

describe("encodePath — identifiant d'URL", () => {
  it("nettoie puis encode", () => {
    expect(encodePath("abc123")).toBe("abc123");
    expect(encodePath("  id 1 ")).toBe("id%201");
    expect(encodePath("a/b")).toBe("a%2Fb");
  });

  it("refuse un identifiant vide", () => {
    expect(() => encodePath("")).toThrow("Identifiant requis.");
    expect(() => encodePath("   ")).toThrow("Identifiant requis.");
  });
});

describe("safeText — rendu non cassé", () => {
  it("affiche les primitifs", () => {
    expect(safeText("hi")).toBe("hi");
    expect(safeText(0)).toBe("0");
    expect(safeText(42)).toBe("42");
    expect(safeText(true)).toBe("true");
  });

  it("remplace vide et objets par un tiret", () => {
    expect(safeText(null)).toBe("—");
    expect(safeText(undefined)).toBe("—");
    expect(safeText({})).toBe("—");
    expect(safeText([])).toBe("—");
  });
});
