/**
 * Réserve de fin d'année : chacun reprend ce qu'il a versé, au prorata si la
 * caisse ne couvre pas tout, sans jamais rendre plus que le disponible.
 */
import { describe, expect, it } from "vitest";
import { planReserveDistribution } from "../src/index.js";

describe("planReserveDistribution", () => {
  it("rend à chacun ce qu'il a versé quand la caisse couvre tout", () => {
    const plan = planReserveDistribution(30_000n, [
      { membershipId: "b", contributed: 10_000n, returned: 0n },
      { membershipId: "a", contributed: 20_000n, returned: 0n },
    ]);
    expect(plan).toEqual([
      { membershipId: "a", owed: 20_000n, amount: 20_000n },
      { membershipId: "b", owed: 10_000n, amount: 10_000n },
    ]);
  });

  it("partage au prorata au franc près quand la caisse est courte", () => {
    const plan = planReserveDistribution(10_000n, [
      { membershipId: "a", contributed: 10_000n, returned: 0n },
      { membershipId: "b", contributed: 10_000n, returned: 0n },
      { membershipId: "c", contributed: 10_000n, returned: 0n },
    ]);
    expect(plan.reduce((s, e) => s + e.amount, 0n)).toBe(10_000n);
    expect(plan.map((e) => e.amount)).toEqual([3_334n, 3_333n, 3_333n]);
  });

  it("ignore ce qui a déjà été rendu et les membres sans reste", () => {
    const plan = planReserveDistribution(50_000n, [
      { membershipId: "a", contributed: 10_000n, returned: 10_000n },
      { membershipId: "b", contributed: 8_000n, returned: 3_000n },
    ]);
    expect(plan).toEqual([{ membershipId: "b", owed: 5_000n, amount: 5_000n }]);
    expect(planReserveDistribution(0n, [{ membershipId: "a", contributed: 1n, returned: 0n }])).toEqual([]);
  });
});
