/* KÓMBE — A13 : la PWA annonce sa langue au serveur, qui rédige alors ses
   motifs d'erreur en anglais. Réseau simulé (fetch stubbé). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acces, langueDemandee, reinitialiserClient } from "../tontine/api.js";

const vus: (string | null)[] = [];

beforeEach(() => {
  reinitialiserClient();
  vus.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input).split("?")[0] as string;
      const json = (status: number, b: unknown) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
      if (url.endsWith("/kombe-dashboard-config.json")) return json(200, { apiBaseUrl: "https://api.test" });
      vus.push(new Headers(init?.headers).get("accept-language"));
      return json(200, { sms: false, whatsapp: false, email: true });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.removeItem("kombe.langue");
});

describe("A13 : langue annoncée au serveur", () => {
  it("français par défaut", async () => {
    await acces.canaux();
    expect(vus).toEqual(["fr"]);
  });

  it("anglais quand l'interface est en anglais ; le pidgin lit l'anglais", async () => {
    window.localStorage.setItem("kombe.langue", "en");
    await acces.canaux();
    window.localStorage.setItem("kombe.langue", "pcm");
    expect(langueDemandee()).toBe("en");
    await acces.canaux();
    expect(vus).toEqual(["en", "en"]);
  });
});
