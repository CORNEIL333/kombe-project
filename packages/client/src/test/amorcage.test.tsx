/* KÓMBE — recette du parcours RÉEL « amorçage des tontines » dans la PWA
   (C03, migration 0024). `fetch` est stubbé (aucun serveur requis, même
   convention que `connexionCotisation.test.tsx`) mais la FORME exacte des
   requêtes reproduit le contrat déjà prouvé en base réelle par
   `packages/api/test/pgOnboardingStore.proof.mjs` :
   - AMO-CREATE  : après session, « Créer une tontine » → POST /v1/groups porte
                   nom + modèle + typologie, avec l'Authorization Bearer serveur ;
   - AMO-JOIN    : « Rejoindre avec un code » → POST /v1/invitations/:code/redemptions ;
   - AMO-SPONSOR : « Demander un parrainage » → POST /v1/groups/:id/sponsorships,
                   candidateId = identité de session (jamais un acteur choisi) ;
   - AMO-DISCOVER: « Découvrir » → GET /v1/discoverable-groups (tableau public). */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FournisseurLangue } from "../i18n/ContexteLangue.js";
import { App } from "../App.js";

type FakeResponse = { ok: boolean; status: number; json: unknown };

interface Appel {
  url: string;
  init: RequestInit;
}

function stubFetch(
  responder: (url: string, init: RequestInit) => FakeResponse,
  journal: Appel[],
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init: RequestInit = {}) => {
      journal.push({ url: String(url), init });
      const r = responder(String(url), init);
      return {
        ok: r.ok,
        status: r.status,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => r.json,
        text: async () => JSON.stringify(r.json),
      } as unknown as Response;
    }),
  );
}

function configOk(url: string): FakeResponse | null {
  if (url.endsWith("/kombe-dashboard-config.json")) {
    return { ok: true, status: 200, json: { apiBaseUrl: "https://api.kombe.invalid" } };
  }
  return null;
}

function monter() {
  return render(<FournisseurLangue><App /></FournisseurLangue>);
}

function saisirCode(code: string) {
  const cases = screen.getAllByLabelText(/^Chiffre \d sur 6$/);
  code.split("").forEach((c, i) => {
    fireEvent.change(cases[i] as HTMLElement, { target: { value: c } });
  });
}

/** Ouvre une session réelle depuis l'onglet « Mes tontines ». */
async function ouvrirSession() {
  fireEvent.click(screen.getByRole("tab", { name: "Mes tontines" }));
  fireEvent.change(screen.getByLabelText(/Adresse email/), { target: { value: "alice@example.test" } });
  fireEvent.click(screen.getByRole("button", { name: "Envoyer le code" }));
  await screen.findByText("Code envoyé — vérifiez votre boîte de réception.");
  saisirCode("123456");
  fireEvent.click(screen.getByRole("button", { name: "Confirmer et se connecter" }));
  await screen.findByText(/Créer, rejoindre ou découvrir une tontine/);
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.restoreAllMocks());

describe("AMO-CREATE — créer une tontine réelle (POST /v1/groups)", () => {
  it("ouvre une session puis POST /v1/groups avec nom, modèle, typologie et Bearer", async () => {
    const journal: Appel[] = [];
    stubFetch((url, init) => {
      const cfg = configOk(url);
      if (cfg) return cfg;
      if (url.endsWith("/v1/access/login-requests")) return { ok: true, status: 202, json: { accepted: true } };
      if (url.endsWith("/v1/access/login-completions")) return { ok: true, status: 201, json: { sessionId: "sess-reel-123", expiresAt: 999 } };
      if (url.endsWith("/v1/groups") && init.method === "POST") {
        return { ok: true, status: 201, json: { state: "configuration", groupId: "grp-serveur", tontineModel: "famille", rotationType: "rotative_fermee" } };
      }
      throw new Error(`URL inattendue en test : ${url}`);
    }, journal);

    monter();
    await ouvrirSession();

    // Étape « Créer » (mode par défaut) : on renseigne le nom puis on crée.
    fireEvent.change(screen.getByLabelText(/Nom du groupe/), { target: { value: "Tontine des artisans" } });
    fireEvent.click(screen.getByRole("button", { name: "Créer la tontine" }));

    await screen.findByText("Tontine créée sur le serveur.");

    const appel = journal.find((a) => a.url.endsWith("/v1/groups") && a.init.method === "POST");
    expect(appel, "POST /v1/groups attendu").toBeDefined();
    const corps = JSON.parse(String(appel!.init.body)) as Record<string, unknown>;
    expect(corps.displayName).toBe("Tontine des artisans");
    expect(corps.tontineModel).toBe("famille");
    expect(corps.rotationType).toBe("rotative_fermee");
    expect(corps.parentGroupId).toBeUndefined();
    const headers = new Headers(appel!.init.headers);
    expect(headers.get("authorization")).toBe("Bearer sess-reel-123");
  });
});

describe("AMO-JOIN — rejoindre par code (POST /v1/invitations/:code/redemptions)", () => {
  it("appelle la route de rachat d'invitation", async () => {
    const journal: Appel[] = [];
    stubFetch((url, init) => {
      const cfg = configOk(url);
      if (cfg) return cfg;
      if (url.endsWith("/v1/access/login-requests")) return { ok: true, status: 202, json: { accepted: true } };
      if (url.endsWith("/v1/access/login-completions")) return { ok: true, status: 201, json: { sessionId: "sess-reel-9", expiresAt: 1 } };
      if (/\/v1\/invitations\/CODE-7\/redemptions$/.test(url)) return { ok: true, status: 200, json: { state: "pending" } };
      throw new Error(`URL inattendue en test : ${url} (${init.method})`);
    }, journal);

    monter();
    await ouvrirSession();
    fireEvent.click(screen.getByRole("button", { name: "Rejoindre avec un code" }));
    fireEvent.change(screen.getByLabelText(/Code d'invitation reçu/), { target: { value: "CODE-7" } });
    fireEvent.click(screen.getByRole("button", { name: "Rejoindre" }));

    await screen.findByText(/Demande d'adhésion transmise/);
    expect(journal.some((a) => /\/v1\/invitations\/CODE-7\/redemptions$/.test(a.url))).toBe(true);
  });
});

describe("AMO-SPONSOR — parrainage (candidateId = identité de session)", () => {
  it("POST /v1/groups/:id/sponsorships avec le parrain ciblé et le candidat serveur", async () => {
    const journal: Appel[] = [];
    stubFetch((url, init) => {
      const cfg = configOk(url);
      if (cfg) return cfg;
      if (url.endsWith("/v1/access/login-requests")) return { ok: true, status: 202, json: { accepted: true } };
      if (url.endsWith("/v1/access/login-completions")) return { ok: true, status: 201, json: { sessionId: "sess-sp-1", expiresAt: 1 } };
      if (/\/v1\/groups\/grpA\/sponsorships$/.test(url)) return { ok: true, status: 201, json: { state: "requested" } };
      throw new Error(`URL inattendue en test : ${url}`);
    }, journal);

    monter();
    await ouvrirSession();
    fireEvent.click(screen.getByRole("button", { name: "Demander un parrainage" }));
    fireEvent.change(screen.getByLabelText(/Identifiant du groupe/), { target: { value: "grpA" } });
    fireEvent.change(screen.getByLabelText(/Identifiant du parrain/), { target: { value: "bob@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Demander le parrainage" }));

    await screen.findByText(/Demande de parrainage transmise/);
    const appel = journal.find((a) => /\/v1\/groups\/grpA\/sponsorships$/.test(a.url));
    expect(appel).toBeDefined();
    const corps = JSON.parse(String(appel!.init.body)) as Record<string, unknown>;
    expect(corps.sponsorId).toBe("bob@example.test");
    // Le candidat transmis reflète la session (le serveur le résoudra de toute façon).
    expect(corps.candidateId).toBe("alice@example.test");
  });
});

describe("AMO-DISCOVER — découvrabilité publique (GET /v1/discoverable-groups)", () => {
  it("charge et affiche le tableau des tontines publiques", async () => {
    const journal: Appel[] = [];
    stubFetch((url, init) => {
      const cfg = configOk(url);
      if (cfg) return cfg;
      if (url.endsWith("/v1/access/login-requests")) return { ok: true, status: 202, json: { accepted: true } };
      if (url.endsWith("/v1/access/login-completions")) return { ok: true, status: 201, json: { sessionId: "sess-d-1", expiresAt: 1 } };
      if (url.endsWith("/v1/discoverable-groups")) {
        return { ok: true, status: 200, json: [{ groupId: "grpX", groupName: "Tontine Horizon", tontineModel: "collegues", rotationType: "rotative_fermee", revealsRegistry: false }] };
      }
      throw new Error(`URL inattendue en test : ${url} (${init.method})`);
    }, journal);

    monter();
    await ouvrirSession();
    fireEvent.click(screen.getByRole("button", { name: "Découvrir des tontines" }));
    fireEvent.click(screen.getByRole("button", { name: "Charger la liste publique" }));

    await screen.findByText(/Tontine Horizon/);
    const appel = journal.find((a) => a.url.endsWith("/v1/discoverable-groups"));
    expect(appel?.init.method).toBe("GET");
    await waitFor(() => expect(screen.getByText(/Collègues/)).toBeInTheDocument());
  });
});
