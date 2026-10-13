/* KÓMBE — unités de l'espace tontine : routes (#/rejoindre/CODE), montants
   entiers XAF, première séance (même règle que le serveur), et connexion par
   téléphone avec un réseau simulé (fetch stubbé, aucun serveur). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ecrireRoute, lireRoute } from "../App.js";
import { formatXaf, somme } from "../tontine/textes.js";
import { dureeLisible, joursEntreSeances, premiereSeance, reglementParDefaut } from "../tontine/Creation.js";
import { FournisseurLangue } from "../i18n/ContexteLangue.js";
import { ConnexionTelephone } from "../tontine/Connexion.js";
import { reinitialiserClient } from "../tontine/api.js";

describe("routes par fragment", () => {
  it("lit un lien d'invitation WhatsApp", () => {
    expect(lireRoute("#/rejoindre/abcd2345")).toEqual({ ecran: "rejoindre", code: "ABCD2345" });
    expect(lireRoute("#/groupe/grp_1")).toEqual({ ecran: "groupe", groupId: "grp_1" });
    expect(lireRoute("")).toEqual({ ecran: "accueil" });
    expect(lireRoute("#/inconnu")).toEqual({ ecran: "accueil" });
  });
  it("aller-retour écrire/lire", () => {
    for (const r of [{ ecran: "creer" }, { ecran: "notifications" }, { ecran: "rejoindre", code: "K7P2MNQX" }, { ecran: "groupe", groupId: "g1" }] as const) {
      expect(lireRoute(ecrireRoute(r))).toEqual(r);
    }
  });
});

describe("montants XAF entiers", () => {
  it("formate sans flottant", () => {
    expect(formatXaf("25000")).toBe("25 000 FCFA");
    expect(formatXaf("1250000", "en")).toBe("1,250,000 FCFA");
    expect(formatXaf("0")).toBe("0 FCFA");
    expect(formatXaf("-500")).toBe("−500 FCFA");
  });
  it("additionne en BigInt", () => {
    expect(somme(["9007199254740993", "1"])).toBe("9007199254740994");
  });
});

describe("calendrier affiché à la création", () => {
  it("première séance = premier jour conforme à partir de la date choisie", () => {
    // 2026-10-13 est un mardi.
    expect(premiereSeance({ kind: "weekly", weekday: 0 }, "2026-10-13")).toBe("2026-10-18");
    expect(premiereSeance({ kind: "weekly", weekday: 2 }, "2026-10-13")).toBe("2026-10-13");
    expect(premiereSeance({ kind: "monthly_day", day: 31 }, "2026-11-05")).toBe("2026-11-30");
    expect(premiereSeance({ kind: "monthly_nth_weekday", nth: 2, weekday: 0 }, "2026-10-01")).toBe("2026-10-11");
    expect(premiereSeance({ kind: "monthly_nth_weekday", nth: -1, weekday: 6 }, "2026-10-01")).toBe("2026-10-31");
    expect(premiereSeance({ kind: "daily", excludedWeekdays: [0] }, "2026-10-18")).toBe("2026-10-19");
  });
  it("durée lisible du cycle", () => {
    expect(dureeLisible(joursEntreSeances({ kind: "weekly", weekday: 0 }) * 6, "fr")).toBe("6 semaines");
    expect(dureeLisible(joursEntreSeances({ kind: "weekly", weekday: 0 }) * 12, "fr")).toBe("3 mois");
    expect(dureeLisible(joursEntreSeances({ kind: "monthly_day", day: 5 }) * 12, "fr")).toBe("12 mois");
    expect(dureeLisible(joursEntreSeances({ kind: "every_n_days", n: 8 }) * 10, "en")).toBe("3 months");
  });
  it("règlement par défaut : bornes du serveur, montants entiers", () => {
    const r = reglementParDefaut("2026-10-13");
    expect(r.maxMembers).toBeGreaterThanOrEqual(2);
    expect(r.maxMembers).toBeLessThanOrEqual(60);
    for (const v of [r.contributionPerShare, r.solidarity.perMeeting, r.operating.perMeeting, ...Object.values(r.fines).filter((x) => typeof x === "string")]) {
      expect(v).toMatch(/^\d+$/);
    }
  });
});

describe("connexion par téléphone", () => {
  const appels: { url: string; body: unknown }[] = [];
  beforeEach(() => {
    reinitialiserClient();
    appels.length = 0;
    window.localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        appels.push({ url, body });
        const json = (status: number, b: unknown) =>
          new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
        if (url.endsWith("/kombe-dashboard-config.json")) return json(200, { apiBaseUrl: "https://api.test" });
        if (url.endsWith("/v1/auth/code-requests")) return json(202, { accepted: true, login: "+237677123456", channel: "sms", devCode: "123456" });
        if (url.endsWith("/v1/auth/code-verifications")) return json(201, { sessionId: "sess_1", identityId: "id_1", expiresAt: Date.now() + 3_600_000 });
        if (url.endsWith("/v1/me") && init?.method === "PATCH") return json(200, { identityId: "id_1", login: "+237677123456", displayName: "Awa", language: "fr" });
        if (url.endsWith("/v1/me")) return json(200, { identityId: "id_1", login: "+237677123456", displayName: null, language: "fr" });
        return json(404, { code: "NOT_FOUND", message: "?" });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("numéro → code → nom, puis session gardée sur l'appareil", async () => {
    const connecte = vi.fn();
    render(
      <FournisseurLangue>
        <ConnexionTelephone onConnecte={connecte} />
      </FournisseurLangue>,
    );
    fireEvent.change(screen.getByLabelText("Numéro de téléphone"), { target: { value: "6 77 12 34 56" } });
    fireEvent.click(screen.getByRole("button", { name: "Recevoir mon code" }));
    expect(await screen.findByText(/Code de test .*123456/)).toBeTruthy();
    expect(appels.find((a) => a.url.endsWith("/code-requests"))?.body).toEqual({ login: "6 77 12 34 56", channel: "sms" });

    fireEvent.change(screen.getByLabelText("Code à 6 chiffres"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Me connecter" }));
    fireEvent.change(await screen.findByLabelText("Votre nom"), { target: { value: "Awa" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    await waitFor(() => expect(connecte).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "sess_1" })));
    expect(JSON.parse(window.localStorage.getItem("kombe.session") ?? "{}").sessionId).toBe("sess_1");
    // Toute écriture porte une clé d'idempotence.
    const mutations = (vi.mocked(fetch).mock.calls as [RequestInfo | URL, RequestInit | undefined][]).filter(([, i]) => i?.method && i.method !== "GET");
    expect(mutations.every(([, i]) => new Headers(i?.headers).has("idempotency-key"))).toBe(true);
  });

  it("e-mail en seconde voie", async () => {
    render(
      <FournisseurLangue>
        <ConnexionTelephone onConnecte={vi.fn()} />
      </FournisseurLangue>,
    );
    fireEvent.click(screen.getByLabelText("Par e-mail"));
    fireEvent.change(screen.getByLabelText("Adresse e-mail"), { target: { value: "awa@example.cm" } });
    fireEvent.click(screen.getByRole("button", { name: "Recevoir mon code" }));
    await waitFor(() => expect(appels.find((a) => a.url.endsWith("/code-requests"))?.body).toEqual({ login: "awa@example.cm", channel: "email" }));
  });
});
