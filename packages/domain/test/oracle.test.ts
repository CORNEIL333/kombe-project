/**
 * Tests de croisement avec l'oracle INDÉPENDANT de référence.
 *
 * Les « expected » ci-dessous proviennent de l'exécution réelle de
 * KOMBE_Audit_Construction/04_Harness/reference_oracles.py (Python), PAS des
 * fonctions de production testées. Si une fonction diverge, ce test échoue :
 * c'est l'oracle qui a autorité, conformément à 00_PROMPT_MAITRE et HC/RA
 * (« les montants et votes ont un oracle indépendant des fonctions de production »).
 */
import { describe, expect, it } from "vitest";
import { rotation } from "../src/rotation.js";
import { remaining } from "../src/balance.js";
import { reconciliation } from "../src/reconciliation.js";
import { voteResult } from "../src/vote.js";
import { dueDate } from "../src/calendar.js";
import { csvText } from "../src/csv.js";

const asNum = (b: bigint): number => Number(b);

describe("rotation — croisé avec reference_oracles.rotation", () => {
  const cases = [
    { n: 10, c: 5000, roundPot: 50000, rounds: 10, cycleTotal: 500000 },
    { n: 2, c: 1, roundPot: 2, rounds: 2, cycleTotal: 4 },
    { n: 12, c: 25000, roundPot: 300000, rounds: 12, cycleTotal: 3600000 },
  ] as const;
  for (const t of cases) {
    it(`rotation(${t.n}, ${t.c})`, () => {
      const r = rotation(t.n, BigInt(t.c));
      expect({
        round_pot: asNum(r.roundPot),
        rounds: r.rounds,
        cycle_total: asNum(r.cycleTotal),
      }).toEqual({ round_pot: t.roundPot, rounds: t.rounds, cycle_total: t.cycleTotal });
    });
  }
});

describe("remaining — croisé avec reference_oracles.remaining", () => {
  const cases = [
    { due: 5000, validated: 2000, activeReserved: 3000, remainingDue: 3000, available: 2000 },
    { due: 100, validated: 0, activeReserved: 100, remainingDue: 100, available: 0 },
  ] as const;
  for (const t of cases) {
    it(`remaining(${t.due}, ${t.validated}, ${t.activeReserved})`, () => {
      const r = remaining(BigInt(t.due), BigInt(t.validated), BigInt(t.activeReserved));
      expect({
        remaining_due: asNum(r.remainingDue),
        available_to_declare: asNum(r.availableToDeclare),
      }).toEqual({ remaining_due: t.remainingDue, available_to_declare: t.available });
    });
  }
});

describe("reconciliation — croisé avec reference_oracles.reconciliation", () => {
  const cases = [
    { c: 50000, d: 49000, f: 1000, disputed: false, gap: 0, canClose: true },
    { c: 50000, d: 49000, f: 999, disputed: false, gap: 1, canClose: false },
    { c: 50000, d: 49000, f: 1000, disputed: true, gap: 0, canClose: false },
  ] as const;
  for (const t of cases) {
    it(`reconciliation(${t.c}, ${t.d}, ${t.f}, disputed=${t.disputed})`, () => {
      const r = reconciliation(BigInt(t.c), BigInt(t.d), BigInt(t.f), t.disputed);
      expect({ gap: asNum(r.gap), can_close_if_obligations_complete: r.canCloseIfObligationsComplete }).toEqual({
        gap: t.gap,
        can_close_if_obligations_complete: t.canClose,
      });
    });
  }
});

describe("vote_result — croisé avec reference_oracles.vote_result", () => {
  const cases = [
    { e: 10, yes: 4, no: 2, ab: 1, quorum: 7, approved: true },
    { e: 10, yes: 3, no: 3, ab: 1, quorum: 7, approved: false },
    { e: 7, yes: 5, no: 0, ab: 0, quorum: 5, approved: true },
    { e: 9, yes: 3, no: 3, ab: 3, quorum: 6, approved: false },
  ] as const;
  for (const t of cases) {
    it(`vote_result(${t.e}, ${t.yes}, ${t.no}, ${t.ab})`, () => {
      expect(voteResult(t.e, t.yes, t.no, t.ab)).toEqual({ quorum: t.quorum, approved: t.approved });
    });
  }
});

describe("due_date — croisé avec reference_oracles.due_date (bords mensuels, bissextile)", () => {
  const cases = [
    { y: 2028, m: 2, d: 31, expected: "2028-02-29" },
    { y: 2026, m: 2, d: 31, expected: "2026-02-28" },
    { y: 2026, m: 4, d: 31, expected: "2026-04-30" },
    { y: 2026, m: 12, d: 15, expected: "2026-12-15" },
  ] as const;
  for (const t of cases) {
    it(`due_date(${t.y}, ${t.m}, ${t.d})`, () => {
      expect(dueDate(t.y, t.m, t.d)).toBe(t.expected);
    });
  }
});

describe("csv_text — croisé avec reference_oracles.csv_text (anti-injection)", () => {
  const cases = [
    { value: "=1+1", expected: "'=1+1" },
    { value: "Alice", expected: "Alice" },
    { value: "+44", expected: "'+44" },
    { value: "@x", expected: "'@x" },
    { value: "-5", expected: "'-5" },
  ] as const;
  for (const t of cases) {
    it(`csv_text(${JSON.stringify(t.value)})`, () => {
      expect(csvText(t.value)).toBe(t.expected);
    });
  }
});
