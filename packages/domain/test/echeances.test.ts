import { describe, expect, it } from "vitest";
import { dayReminderStage, effectiveStatutesDeadline, reminderStage } from "../src/index.js";

const H = 3_600_000;
const D = 24 * H;

describe("reminderStage — relances de plus en plus rapprochées", () => {
  const deadline = Date.parse("2026-11-10T18:00:00Z");
  it("rien quand l'échéance est à plus d'une semaine", () => {
    expect(reminderStage(deadline - 8 * D, deadline)).toBeNull();
  });
  it("une semaine, puis chaque jour les trois derniers jours, puis six heures avant", () => {
    expect(reminderStage(deadline - 6 * D, deadline)).toBe("j7");
    expect(reminderStage(deadline - 3 * D, deadline)).toBe("j3");
    expect(reminderStage(deadline - 47 * H, deadline)).toBe("j2");
    expect(reminderStage(deadline - 20 * H, deadline)).toBe("j1");
    expect(reminderStage(deadline - 5 * H, deadline)).toBe("h6");
  });
  it("échue à l'instant même de l'échéance", () => {
    expect(reminderStage(deadline, deadline)).toBe("expired");
    expect(reminderStage(deadline + 1, deadline)).toBe("expired");
  });
});

describe("effectiveStatutesDeadline", () => {
  it("garde l'échéance de la version pour qui était déjà là", () => {
    expect(effectiveStatutesDeadline(1_000 * D, 7, null)).toBe(1_000 * D);
    expect(effectiveStatutesDeadline(1_000 * D, 7, 990 * D)).toBe(1_000 * D);
  });
  it("donne le même délai à qui est admis après la publication", () => {
    expect(effectiveStatutesDeadline(1_000 * D, 7, 999 * D)).toBe(1_006 * D);
  });
});

describe("dayReminderStage", () => {
  it("avant-veille, veille, jour même ; rien sinon", () => {
    expect(dayReminderStage("2026-11-08", "2026-11-10")).toBe("j2");
    expect(dayReminderStage("2026-11-09", "2026-11-10")).toBe("j1");
    expect(dayReminderStage("2026-11-10", "2026-11-10")).toBe("j0");
    expect(dayReminderStage("2026-11-05", "2026-11-10")).toBeNull();
    expect(dayReminderStage("2026-11-11", "2026-11-10")).toBeNull();
  });
});
