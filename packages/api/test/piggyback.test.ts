/** R-05 : relève des envois différés au passage d'un membre (au plus une par intervalle). */
import { describe, expect, it } from "vitest";
import { createPiggyback, piggybackInterval } from "../src/tontine/delivery.js";

describe("relève des envois différés (R-05)", () => {
  it("au plus une relève par intervalle, seulement sur un GET avec session", () => {
    let t = 1_000_000;
    let kicks = 0;
    const releve = createPiggyback(60_000, () => t, () => (kicks += 1));
    expect(releve("GET", false)).toBe(false); // sans session : jamais
    expect(releve("POST", true)).toBe(false); // une écriture relève déjà d'elle-même
    expect(releve("GET", true)).toBe(true);
    t += 30_000;
    expect(releve("GET", true)).toBe(false);
    t += 30_000;
    expect(releve("GET", true)).toBe(true);
    expect(kicks).toBe(2);
  });

  it("intervalle : 60 s par défaut, 0 désactive, désactivé en test sauf réglage explicite", () => {
    expect(piggybackInterval({ NODE_ENV: "production" })).toBe(60_000);
    expect(piggybackInterval({ NODE_ENV: "test" })).toBe(0);
    expect(piggybackInterval({ KOMBE_DELIVERY_PIGGYBACK_MS: "0" })).toBe(0);
    expect(piggybackInterval({ KOMBE_DELIVERY_PIGGYBACK_MS: "15000" })).toBe(15_000);
    expect(piggybackInterval({ KOMBE_DELIVERY_PIGGYBACK_MS: "n'importe quoi" })).toBe(60_000);
    let kicks = 0;
    const off = createPiggyback(0, () => 0, () => (kicks += 1));
    expect(off("GET", true)).toBe(false);
    expect(kicks).toBe(0);
  });
});
