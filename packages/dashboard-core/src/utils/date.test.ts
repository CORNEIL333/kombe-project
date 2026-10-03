/**
 * Formatage des dates serveur (fuseau Africa/Douala, Intl).
 * On n'assertionne pas la graphie exacte (dépendante de l'ICU) mais les
 * invariants : repli « — » sur date invalide, et présence de l'année.
 */
import { describe, expect, it } from "vitest";
import { formatServerDate } from "./date";

describe("formatServerDate", () => {
  it("renvoie un tiret sur une date invalide", () => {
    expect(formatServerDate("not-a-date")).toBe("—");
    expect(formatServerDate("zzz")).toBe("—");
  });

  it("formate une date valide (année présente) dans les deux locales", () => {
    expect(formatServerDate("2026-01-15T12:00:00Z")).toContain("2026");
    expect(formatServerDate("2026-01-15T12:00:00Z", "en")).toContain("2026");
  });

  it("applique le fuseau Africa/Douala (UTC+1) : l'epoch tombe en 1970", () => {
    expect(formatServerDate(0)).toContain("1970");
  });
});
