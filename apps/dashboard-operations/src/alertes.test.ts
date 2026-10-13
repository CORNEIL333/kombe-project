// @vitest-environment jsdom
/** Les alertes de la vue d'ensemble se déduisent des seuls chiffres réels. */
import { describe, expect, it } from "vitest";
import { alertes } from "./App";
import type { OpsOverview } from "./api";

const base: OpsOverview = {
  groupsByState: {}, identities: 0, identitiesLast7d: 0, membershipsActive: 0, membershipsPending: 0, sessionsActive24h: 0,
  meetingsOpen: 0, meetingsNext7d: 0, meetingsClosedNoMinutesApproval: 0, movementsDeclared: 0, movementsDeclaredOver72h: 0,
  oldestDeclaredAt: null, payoutsAwaitingReceipt: 0, finesContested: 0, aidsRequested: 0, debtsOpen: 0, outboxPending: 0,
  outboxDead: 0, outboxOldestPendingAt: null, inboxLast24h: 0, supportRequestsPending: 0, securityEventsLast7d: 0, serverNow: "2026-10-13T10:00:00Z",
};

describe("alertes d'exploitation", () => {
  it("rien d'anormal → aucune alerte", () => expect(alertes(base)).toEqual([]));
  it("outbox en échec = urgent ; confirmations > 72 h = à suivre", () => {
    const a = alertes({ ...base, outboxDead: 2, movementsDeclaredOver72h: 3 });
    expect(a.map((x) => x.niveau)).toEqual(["danger", "warn"]);
    expect(a[1]?.texte).toMatch(/3 déclaration/);
  });
});
