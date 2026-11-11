/* KÓMBE — écran Aide : mes demandes au support (CRM). Réseau simulé (fetch
   stubbé, aucun serveur) : liste, nouvelle demande, fil, réponse, note. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FournisseurLangue } from "../i18n/ContexteLangue.js";
import { Aide } from "../tontine/Aide.js";
import { reinitialiserClient, type Session } from "../tontine/api.js";

const TK = "tk_0123456789abcdef0123";
const session = { sessionId: "sess_1", identityId: "+237677123456", expiresAt: Date.now() + 3_600_000 } as Session;
const appels: { method: string; url: string; body: unknown }[] = [];
let statut = "en_cours";
let note: number | null = null;

beforeEach(() => {
  reinitialiserClient();
  appels.length = 0;
  statut = "en_cours";
  note = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input).split("?")[0] as string;
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      appels.push({ method, url, body });
      const json = (status: number, b: unknown) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
      if (url.endsWith("/kombe-dashboard-config.json")) return json(200, { apiBaseUrl: "https://api.test" });
      if (url.endsWith("/v1/me/support-tickets") && method === "GET")
        return json(200, [{ ticketId: TK, ref: "KMB-000001", subject: "Ma cotisation n'apparaît pas", category: "cotisation", status: statut, groupName: "Njangi Akwa", createdAt: "2026-11-11T08:00:00Z", updatedAt: "2026-11-11T09:00:00Z", satisfaction: note }]);
      if (url.endsWith("/v1/me/support-tickets") && method === "POST") return json(201, { ticketId: "tk_ffffffffffffffffffff", ref: "KMB-000002" });
      if (url.endsWith(`/v1/me/support-tickets/${TK}`))
        return json(200, {
          ticketId: TK, ref: "KMB-000001", subject: "Ma cotisation n'apparaît pas", category: "cotisation", status: statut, satisfaction: note,
          createdAt: "2026-11-11T08:00:00Z", updatedAt: "2026-11-11T09:00:00Z",
          messages: [
            { messageId: "1", from: "moi", body: "J'ai versé 5000 XAF mardi.", createdAt: "2026-11-11T08:00:00Z" },
            { messageId: "2", from: "support", body: "Le trésorier doit confirmer.", createdAt: "2026-11-11T09:00:00Z" },
          ],
        });
      if (url.endsWith(`/v1/me/support-tickets/${TK}/messages`)) return json(201, { messageId: "3" });
      if (url.endsWith(`/v1/me/support-tickets/${TK}/satisfaction`)) {
        note = (body as { score: number }).score;
        return json(200, { rated: true });
      }
      return json(404, { code: "NOT_FOUND", message: "?" });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const aide = (demande: string | null, aller = vi.fn()) =>
  render(
    <FournisseurLangue>
      <Aide session={session} groupes={[{ groupId: "grp_1", name: "Njangi Akwa" } as never]} demande={demande} aller={aller} />
    </FournisseurLangue>,
  );

describe("Aide : mes demandes au support", () => {
  it("liste mes demandes (référence, état) et ouvre une demande", async () => {
    const aller = vi.fn();
    aide(null, aller);
    expect(await screen.findByText("Ma cotisation n'apparaît pas")).toBeTruthy();
    expect(screen.getByText(/KMB-000001/)).toBeTruthy();
    expect(screen.getByText("En cours")).toBeTruthy();
    fireEvent.click(screen.getByText("Ma cotisation n'apparaît pas"));
    expect(aller).toHaveBeenCalledWith({ ecran: "aide", demande: TK });
  });

  it("nouvelle demande : envoyée avec sujet, tontine et message, accusé de réception par référence", async () => {
    aide(null);
    fireEvent.click(await screen.findByRole("button", { name: /Contacter le support/ }));
    fireEvent.change(screen.getByLabelText("Sujet"), { target: { value: "connexion" } });
    fireEvent.change(screen.getByLabelText("Tontine concernée"), { target: { value: "grp_1" } });
    fireEvent.change(screen.getByLabelText("Objet"), { target: { value: "Je ne reçois pas le code" } });
    fireEvent.change(screen.getByLabelText("Votre message"), { target: { value: "Le SMS de connexion n'arrive plus depuis hier." } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(await screen.findByText(/KMB-000002/)).toBeTruthy();
    const post = appels.find((a) => a.method === "POST" && a.url.endsWith("/v1/me/support-tickets"));
    expect(post?.body).toEqual({ subject: "Je ne reçois pas le code", category: "connexion", body: "Le SMS de connexion n'arrive plus depuis hier.", groupId: "grp_1" });
  });

  it("fil d'une demande : messages publics, réponse, puis note une fois résolue", async () => {
    aide(TK);
    expect(await screen.findByText("J'ai versé 5000 XAF mardi.")).toBeTruthy();
    expect(screen.getByText(/Support KÓMBE/)).toBeTruthy();
    expect(screen.queryByText("La réponse vous a-t-elle aidé ?")).toBeNull(); // pas encore résolue
    fireEvent.change(screen.getByLabelText("Répondre"), { target: { value: "Merci, j'attends." } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(appels.some((a) => a.url.endsWith("/messages") && (a.body as { body: string }).body === "Merci, j'attends.")).toBe(true));

    statut = "resolu";
    reinitialiserClient();
    aide(TK);
    const quatre = await screen.findAllByLabelText(/4 sur 5/);
    fireEvent.click(quatre[0] as HTMLElement);
    const boutons = screen.getAllByRole("button", { name: "Envoyer" });
    fireEvent.click(boutons[boutons.length - 1] as HTMLElement);
    await waitFor(() => expect(note).toBe(4));
    expect(await screen.findAllByText("Votre note : 4 sur 5")).toBeTruthy();
  });
});
