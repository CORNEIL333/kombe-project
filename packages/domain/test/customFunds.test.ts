/**
 * Caisses personnalisées : chaque tontine crée ses cotisations et leurs
 * règles, sans jamais rendre une règle rétroactive.
 */
import { describe, expect, it } from "vitest";
import { DomainError, customFundDue, newCustomFundRules, parseCustomFundRules, updateCustomFundRules } from "../src/index.js";

const TODAY = "2026-10-17";

describe("newCustomFundRules", () => {
  it("crée une cotisation par séance à partir d'aujourd'hui", () => {
    const r = newCustomFundRules({ name: "Fête de fin d'année", mode: "each_meeting", amount: "2000" }, TODAY);
    expect(r.schedule).toEqual([{ from: TODAY, amount: "2000" }]);
    expect(r.closedOn).toBeNull();
  });
  it("refuse une date d'effet passée (pas de rétroactivité)", () => {
    expect(() => newCustomFundRules({ name: "Projet", mode: "each_meeting", amount: "1000", from: "2026-10-01" }, TODAY)).toThrow(DomainError);
  });
  it("une caisse libre n'a ni montant ni barème", () => {
    const r = newCustomFundRules({ name: "Urgences", mode: "free", amount: "5000" }, TODAY);
    expect(r.schedule).toEqual([]);
  });
  it("exige un montant positif hors caisse libre et un nom lisible", () => {
    expect(() => newCustomFundRules({ name: "Projet", mode: "one_time" }, TODAY)).toThrow(DomainError);
    expect(() => newCustomFundRules({ name: "Projet", mode: "one_time", amount: "0" }, TODAY)).toThrow(DomainError);
    expect(() => newCustomFundRules({ name: " x ", mode: "free" }, TODAY)).toThrow(DomainError);
  });
});

describe("customFundDue", () => {
  const each = newCustomFundRules({ name: "Projet", mode: "each_meeting", amount: "1000", from: "2026-11-01" }, TODAY);
  it("ne réclame rien avant la date d'effet", () => {
    expect(customFundDue(each, "2026-10-25", null)).toBe(0n);
    expect(customFundDue(each, "2026-11-01", null)).toBe(1000n);
  });
  it("un changement de montant ne vaut que pour l'avenir", () => {
    const up = updateCustomFundRules(each, { amount: "1500", from: "2026-12-01" }, "2026-11-10");
    expect(customFundDue(up, "2026-11-15", null)).toBe(1000n);
    expect(customFundDue(up, "2026-12-06", null)).toBe(1500n);
  });
  it("la cotisation unique n'est due qu'à la première séance concernée", () => {
    const once = newCustomFundRules({ name: "Achat groupé", mode: "one_time", amount: "10000", from: "2026-11-01" }, TODAY);
    expect(customFundDue(once, "2026-11-08", "2026-11-08")).toBe(10000n);
    expect(customFundDue(once, "2026-11-15", "2026-11-08")).toBe(0n);
  });
  it("la clôture arrête les échéances futures, pas les passées", () => {
    const closed = updateCustomFundRules(each, { close: true }, "2026-12-01");
    expect(customFundDue(closed, "2026-11-15", null)).toBe(1000n);
    expect(customFundDue(closed, "2026-12-01", null)).toBe(1000n);
    expect(customFundDue(closed, "2026-12-06", null)).toBe(0n);
    expect(() => updateCustomFundRules(closed, { purpose: "x" }, "2026-12-02")).toThrow(DomainError);
  });
  it("refuse un nouveau montant rétroactif ou sur une caisse libre", () => {
    expect(() => updateCustomFundRules(each, { amount: "3000", from: "2026-10-01" }, TODAY)).toThrow(DomainError);
    const free = newCustomFundRules({ name: "Urgences", mode: "free" }, TODAY);
    expect(() => updateCustomFundRules(free, { amount: "3000" }, TODAY)).toThrow(DomainError);
  });
});

describe("parseCustomFundRules", () => {
  it("retombe sur une caisse libre devant des règles illisibles", () => {
    const r = parseCustomFundRules({ mode: "??", schedule: [{ from: "bad", amount: "1" }] });
    expect(r.mode).toBe("free");
    expect(r.schedule).toEqual([]);
  });
  it("trie le barème par date", () => {
    const r = parseCustomFundRules({ mode: "each_meeting", schedule: [{ from: "2026-12-01", amount: "2" }, { from: "2026-11-01", amount: "1" }] });
    expect(r.schedule.map((s) => s.amount)).toEqual(["1", "2"]);
  });
});
