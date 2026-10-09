/* KÓMBE — recette de la CRÉATION DE COMPTE RÉELLE dans la PWA (C02, ADR-0024).
   Dérive corrigée : la PWA n'offrait que la CONNEXION ; un nouvel utilisateur
   ne pouvait pas créer de compte (`login-requests` répond `accepted` mais
   n'envoie AUCUN code et n'active AUCUN compte pour une email inconnue —
   anti-énumération serveur, `pgAccessStore.requestLogin`). Ce test exerce le
   vrai contrat d'inscription, le même que le mobile `HttpAuthRepository` :
   - INSC-REG   : « Créer un compte » → POST /v1/access/registrations {email, channel:"email"} ;
   - INSC-VERIF : code saisi → POST /v1/access/registrations/verifications (active le compte) ;
   - INSC-CHAIN : enchaînement automatique vers login-requests (second code) ;
   - INSC-SESSION : après le code de connexion, login-completions délivre le
                    sessionId SERVEUR et ouvre la session (on passe à l'amorçage).
   `fetch` est stubbé (aucun serveur), même convention que `amorcage.test.tsx` ;
   la FORME exacte reproduit le contrat prouvé en base réelle
   (`docs/PREUVES_PISTE_A3_SERVEUR.md`). */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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

function saisirCode(code: string) {
  const cases = screen.getAllByLabelText(/^Chiffre \d sur 6$/);
  code.split("").forEach((c, i) => {
    fireEvent.change(cases[i] as HTMLElement, { target: { value: c } });
  });
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.restoreAllMocks());

/** Ouvre l'onglet « Mes tontines » (aucune session → Connexion) puis bascule
 *  sur l'onglet d'inscription du panneau de connexion. */
function ouvrirInscription() {
  fireEvent.click(screen.getByRole("tab", { name: "Mes tontines" }));
  fireEvent.click(screen.getByRole("tab", { name: "Créer un compte" }));
}

describe("INSC — création de compte réelle jusqu'à l'ouverture de session", () => {
  it("registre, vérifie le canal, enchaîne sur la connexion et ouvre la session serveur", async () => {
    const journal: Appel[] = [];
    stubFetch((url, init) => {
      const cfg = configOk(url);
      if (cfg) return cfg;
      if (url.endsWith("/v1/access/registrations") && init.method === "POST") {
        return { ok: true, status: 202, json: { accepted: true } };
      }
      if (url.endsWith("/v1/access/registrations/verifications")) {
        return { ok: true, status: 200, json: { state: "active" } };
      }
      if (url.endsWith("/v1/access/login-requests")) {
        return { ok: true, status: 202, json: { accepted: true } };
      }
      if (url.endsWith("/v1/access/login-completions")) {
        return { ok: true, status: 201, json: { sessionId: "sess-insc-42", expiresAt: 999 } };
      }
      throw new Error(`URL inattendue en test : ${url} (${init.method})`);
    }, journal);

    render(
      <FournisseurLangue>
        <App />
      </FournisseurLangue>,
    );
    ouvrirInscription();

    // Étape email de l'inscription.
    fireEvent.change(screen.getByLabelText(/Adresse email/), { target: { value: "newcomer@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Créer mon compte" }));

    // Étape code de l'inscription (on attend la résolution async du POST).
    await screen.findByText("Code d'inscription envoyé — vérifiez votre boîte de réception.");

    // POST /v1/access/registrations porte l'email + le canal email.
    const reg = journal.find((a) => a.url.endsWith("/v1/access/registrations"));
    expect(reg, "POST /v1/access/registrations attendu").toBeDefined();
    expect(JSON.parse(String(reg!.init.body))).toEqual({
      identityId: "newcomer@example.test",
      channel: "email",
    });

    saisirCode("246810");
    fireEvent.click(screen.getByRole("button", { name: "Vérifier et activer mon compte" }));

    // Vérification du canal (active le compte SERVEUR) … puis enchaînement
    // AUTOMATIQUE vers une vraie demande de connexion (on attend le statut).
    await screen.findByText(
      "Compte vérifié — saisisez le code de connexion qui vient de vous être envoyé.",
    );
    const verif = journal.find((a) => a.url.endsWith("/v1/access/registrations/verifications"));
    expect(verif, "POST …/verifications attendu").toBeDefined();
    expect(JSON.parse(String(verif!.init.body))).toEqual({
      identityId: "newcomer@example.test",
      code: "246810",
    });
    expect(journal.some((a) => a.url.endsWith("/v1/access/login-requests"))).toBe(true);

    // Le panneau est revenu en mode connexion, à l'étape code : on saisit le
    // code de connexion et on obtient le sessionId délivré PAR LE SERVEUR.
    saisirCode("135790");
    fireEvent.click(screen.getByRole("button", { name: "Confirmer et se connecter" }));

    // Session ouverte → l'amorçage des tontines remplace la connexion.
    await screen.findByText(/Créer, rejoindre ou découvrir une tontine/);
    const login = journal.find((a) => a.url.endsWith("/v1/access/login-completions"));
    expect(login, "POST /v1/access/login-completions attendu").toBeDefined();
    expect(JSON.parse(String(login!.init.body))).toEqual({
      identityId: "newcomer@example.test",
      code: "135790",
    });
  });
});
