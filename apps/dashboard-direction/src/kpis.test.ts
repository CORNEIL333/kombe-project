// @vitest-environment jsdom
/** Indicateurs de la Direction : calculs entiers (BigInt) sur les vraies séries. */
import { describe, expect, it } from "vitest";
import { sommeXaf, tauxConfirmation } from "./App";
import type { WeeklyKpi } from "./api";

const k = (d: number, c: number): WeeklyKpi => ({ weekStart: "2026-10-12", groupsCreated: 0, identitiesCreated: 0, membersAdmitted: 0, movementsDeclared: d, movementsConfirmed: c, amountDeclared: "0", amountConfirmed: "0", payoutsReceived: 0, meetingsClosed: 0, medianConfirmHours: null });

describe("indicateurs direction", () => {
  it("taux de confirmation borné, null sans déclaration", () => {
    expect(tauxConfirmation([k(0, 0)])).toBeNull();
    expect(tauxConfirmation([k(10, 7), k(10, 9)])).toBe(80);
    expect(tauxConfirmation([k(1, 3)])).toBe(100);
  });
  it("somme XAF sans flottant", () => expect(sommeXaf(["9007199254740993", "7", "x"])).toBe("9007199254741000"));
});
