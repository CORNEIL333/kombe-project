// @vitest-environment jsdom
/**
 * CRM unifié : navigation selon les fonctions (moindre privilège), entrée
 * active pour les fiches, priorité ITIL identique au déclencheur SQL, et
 * routes réellement appelées (préfixe /v1, verrou optimiste en PATCH).
 */
import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "@kombe/dashboard-core";
import { CrmApi, priorite } from "./api";
import { autorise, entreeActive, navigationPour } from "../App";

function stubFetch() {
  const calls: { url: string; method: string; headers: Record<string, string>; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const h: Record<string, string> = {};
      new Headers(init.headers).forEach((v, k) => (h[k] = v));
      calls.push({ url: String(url), method: init.method ?? "GET", headers: h, body: init.body ? JSON.parse(String(init.body)) : undefined });
      return { ok: true, status: 200, headers: { get: (k: string) => (k === "content-type" ? "application/json" : null) }, json: async () => ({}) } as unknown as Response;
    }),
  );
  return calls;
}

describe("navigation par fonction", () => {
  const chemins = (roles: Parameters<typeof navigationPour>[0], gw = false) => navigationPour(roles, gw).map((e) => e.path);

  it("le support voit le CRM et les opérations, jamais la direction, la technique ni le journal", () => {
    const p = chemins(["support"]);
    expect(p).toContain("/demandes");
    expect(p).toContain("/contacts");
    expect(p).toContain("/ops/acces");
    expect(p.some((x) => x.startsWith("/direction"))).toBe(false);
    expect(p.some((x) => x.startsWith("/technique"))).toBe(false);
    expect(p).not.toContain("/journal");
    expect(p).not.toContain("/conformite");
  });

  it("la direction voit le pilotage et la conformité, pas les demandes ni les contacts", () => {
    const p = chemins(["direction"]);
    expect(p).toEqual(expect.arrayContaining(["/", "/comptes", "/segments", "/direction", "/direction/risques", "/conformite"]));
    expect(p).not.toContain("/demandes");
    expect(p).not.toContain("/contacts");
    expect(p).not.toContain("/journal");
  });

  it("l'engineering voit la technique ; les pages dépôt seulement avec la passerelle locale", () => {
    expect(chemins(["engineering"])).toEqual(["/ops/runbooks", "/technique", "/technique/integration"]);
    expect(chemins(["engineering"], true)).toContain("/technique/lots");
  });

  it("l'administration ouvre tout, journal compris", () => {
    const p = chemins(["admin"]);
    expect(p).toContain("/journal");
    expect(p).toContain("/demandes");
    expect(p).toContain("/direction/gates");
    expect(autorise(["admin"], ["engineering"])).toBe(true);
  });

  it("aucune fonction : aucune page", () => {
    expect(chemins([])).toEqual([]);
  });

  it("une fiche reste sous son entrée ; un chemin hors fonction n'a pas d'entrée", () => {
    const nav = navigationPour(["support"], false);
    expect(entreeActive("/demandes/tk_0123456789abcdef0123", nav)?.path).toBe("/demandes");
    expect(entreeActive("/comptes/grp_1?x=1", nav)?.path).toBe("/comptes");
    expect(entreeActive("/demandes?assignee=moi", nav)?.path).toBe("/demandes");
    expect(entreeActive("/ops/acces", nav)?.path).toBe("/ops/acces");
    expect(entreeActive("/direction/risques", nav)).toBeUndefined();
    expect(entreeActive("/inconnu", nav)).toBeUndefined();
  });
});

describe("priorité ITIL (impact × urgence)", () => {
  it("identique au déclencheur kombe_crm_ticket_sla", () => {
    expect(priorite(1, 1)).toBe(1);
    expect(priorite(1, 2)).toBe(2);
    expect(priorite(2, 2)).toBe(3);
    expect(priorite(3, 2)).toBe(4);
    expect(priorite(3, 3)).toBe(4);
  });
});

describe("CrmApi — routes réelles", () => {
  it("lit et écrit sous /v1/crm, PATCH avec if-match-version", async () => {
    const calls = stubFetch();
    const api = new CrmApi(new ApiClient({ baseUrl: "https://api.example.invalid" }));
    await api.dashboard();
    await api.tickets({ status: "ouvertes", assignee: "moi" });
    await api.updateTicket("tk_0123456789abcdef0123", { status: "resolu" }, 3);
    await api.reveal("ct_0123456789abcdef0123", "Rappel demandé par la personne");
    await api.updateTask("42", "fait", 2);
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "GET https://api.example.invalid/v1/crm/dashboard",
      "GET https://api.example.invalid/v1/crm/tickets?status=ouvertes&assignee=moi",
      "PATCH https://api.example.invalid/v1/crm/tickets/tk_0123456789abcdef0123",
      "POST https://api.example.invalid/v1/crm/contacts/ct_0123456789abcdef0123/reveal",
      "PATCH https://api.example.invalid/v1/crm/tasks/42",
    ]);
    expect(calls[2]?.headers["if-match-version"]).toBe("3");
    expect(calls[2]?.body).toEqual({ status: "resolu" });
    expect(calls[3]?.body).toEqual({ motif: "Rappel demandé par la personne" });
    expect(calls[4]?.headers["if-match-version"]).toBe("2");
  });
});
