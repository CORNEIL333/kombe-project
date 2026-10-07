/* KÓMBE — recette unitaire du parcours RÉEL « connexion + déclaration/vue de
   cotisation » (Piste A3 suite). `fetch` est stubbé (aucun serveur requis,
   même convention que `@kombe/dashboard-core/api/client.test.ts`) mais la
   FORME exacte des requêtes/réponses reproduit le contrat déjà prouvé en
   base réelle par `docs/PREUVES_PISTE_A3_SERVEUR.md` (A3-LOGIN/DECLARE/VIEW) :
   - A3UI-LOGIN   : code demandé puis confirmé → session ouverte, écran de
                    cotisation affiché.
   - A3UI-DECLARE : obligation chargée, cotisation déclarée avec la version
                    lue (jamais une valeur par défaut), résultat affiché.
   - A3UI-ERREUR  : une réponse non-OK (ApiError) affiche le message serveur,
                    jamais une page blanche. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FournisseurLangue } from "../i18n/ContexteLangue.js";
import { App } from "../App.js";

type FakeResponse = { ok: boolean; status: number; json: unknown };

function stubFetch(responder: (url: string, init: RequestInit) => FakeResponse) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init: RequestInit = {}) => {
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

function monter() {
  return render(
    <FournisseurLangue>
      <App />
    </FournisseurLangue>,
  );
}

function allerACotisation() {
  fireEvent.click(screen.getByRole("tab", { name: "Ma cotisation" }));
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.restoreAllMocks());

describe("A3UI-LOGIN — connexion réelle par code email", () => {
  it("demande le code puis confirme la connexion, sans mot de passe", async () => {
    let dernierCorpsLogin: unknown = null;
    stubFetch((url, init) => {
      if (url.endsWith("/kombe-dashboard-config.json")) {
        return { ok: true, status: 200, json: { apiBaseUrl: "https://api.kombe.invalid" } };
      }
      if (url.endsWith("/v1/access/login-requests")) {
        return { ok: true, status: 202, json: { accepted: true } };
      }
      if (url.endsWith("/v1/access/login-completions")) {
        dernierCorpsLogin = JSON.parse(String(init.body));
        return { ok: true, status: 201, json: { sessionId: "sess-reel-123", expiresAt: 999 } };
      }
      throw new Error(`URL inattendue en test : ${url}`);
    });

    monter();
    allerACotisation();

    fireEvent.change(screen.getByLabelText(/Adresse email/), { target: { value: "alice@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer le code" }));

    await screen.findByText("Code envoyé — vérifiez votre boîte de réception.");

    fireEvent.change(screen.getByLabelText(/Code reçu par email/), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmer et se connecter" }));

    await screen.findByText("Connecté — session réelle ouverte.");
    expect(dernierCorpsLogin).toEqual({ identityId: "alice@example.test", code: "123456" });
  });
});

describe("A3UI-DECLARE — déclaration/vue réelle d'une cotisation", () => {
  it("charge l'obligation, déclare avec la version lue, affiche le résultat", async () => {
    let appelsDeclare = 0;
    let enTeteDeclare: Headers = new Headers();
    stubFetch((url, init) => {
      if (url.endsWith("/kombe-dashboard-config.json")) {
        return { ok: true, status: 200, json: { apiBaseUrl: "https://api.kombe.invalid" } };
      }
      if (url.endsWith("/v1/access/login-requests")) return { ok: true, status: 202, json: { accepted: true } };
      if (url.endsWith("/v1/access/login-completions")) {
        return { ok: true, status: 201, json: { sessionId: "sess-reel-123", expiresAt: 999 } };
      }
      if (url.includes("/obligations/ob_1")) {
        const apres = appelsDeclare > 0;
        return {
          ok: true,
          status: 200,
          json: {
            obligationId: "ob_1",
            groupId: "grp_1",
            due: "100000",
            validatedNet: "0",
            activeReserved: apres ? "40000" : "0",
            remainingDue: "100000",
            availableToDeclare: apres ? "60000" : "100000",
            contributionCount: apres ? 1 : 0,
            version: apres ? 2 : 1,
          },
        };
      }
      if (url.endsWith("/v1/groups/grp_1/declarations")) {
        appelsDeclare += 1;
        enTeteDeclare = new Headers(init.headers);
        return {
          ok: true,
          status: 201,
          json: {
            commandId: "cmd-1",
            status: "applied",
            resultVersion: 2,
            eventHash: "abc",
            obligationId: "ob_1",
            remainingDue: "100000",
            availableToDeclare: "60000",
          },
        };
      }
      throw new Error(`URL inattendue en test : ${url}`);
    });

    monter();
    allerACotisation();
    fireEvent.change(screen.getByLabelText(/Adresse email/), { target: { value: "alice@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer le code" }));
    await screen.findByText("Code envoyé — vérifiez votre boîte de réception.");
    fireEvent.change(screen.getByLabelText(/Code reçu par email/), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmer et se connecter" }));
    await screen.findByText("Connecté — session réelle ouverte.");

    fireEvent.change(screen.getByLabelText(/Identifiant du groupe/), { target: { value: "grp_1" } });
    fireEvent.change(screen.getByLabelText(/Identifiant de l'obligation/), { target: { value: "ob_1" } });
    fireEvent.click(screen.getByRole("button", { name: "Charger l'obligation" }));

    await screen.findByText("Cotisations déclarées");
    expect(await screen.findAllByText("100000 XAF")).toHaveLength(3);

    fireEvent.change(screen.getByLabelText(/Montant à déclarer/), { target: { value: "40000" } });
    fireEvent.click(screen.getByRole("button", { name: "Déclarer la cotisation" }));

    await screen.findByText("Cotisation déclarée et scellée au journal.");
    await waitFor(() => expect(appelsDeclare).toBe(1));
    expect(enTeteDeclare.get("if-match-version")).toBe("1");
  });
});

describe("A3UI-ERREUR — un refus serveur est affiché, jamais masqué", () => {
  it("affiche le message d'erreur si la connexion échoue", async () => {
    stubFetch((url) => {
      if (url.endsWith("/kombe-dashboard-config.json")) {
        return { ok: true, status: 200, json: { apiBaseUrl: "https://api.kombe.invalid" } };
      }
      if (url.endsWith("/v1/access/login-requests")) return { ok: true, status: 202, json: { accepted: true } };
      if (url.endsWith("/v1/access/login-completions")) {
        return { ok: false, status: 400, json: { code: "TOKEN_INVALID", message: "Code invalide." } };
      }
      throw new Error(`URL inattendue en test : ${url}`);
    });

    monter();
    allerACotisation();
    fireEvent.change(screen.getByLabelText(/Adresse email/), { target: { value: "alice@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer le code" }));
    await screen.findByText("Code envoyé — vérifiez votre boîte de réception.");
    fireEvent.change(screen.getByLabelText(/Code reçu par email/), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmer et se connecter" }));

    await screen.findByText("Code invalide.");
  });
});
