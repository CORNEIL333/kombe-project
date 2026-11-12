/* KÓMBE — A14 : Push Web sur ce navigateur. Navigateur et réseau simulés :
   autorisation, abonnement avec la clé VAPID du serveur, enregistrement de
   l'appareil `web`, puis désactivation. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reinitialiserClient, type Session } from "../tontine/api.js";
import { activerPushWeb, cleEnOctets, desactiverPushWeb, etatPushWeb } from "../tontine/pushWeb.js";

const session = { sessionId: "sess_1", identityId: "+237677123456", expiresAt: Date.now() + 3_600_000 } as Session;
const appels: { method: string; url: string; body: unknown }[] = [];
let cleServeur: string | null = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";
let abonnement: { endpoint: string; toJSON: () => unknown; unsubscribe: () => Promise<boolean> } | null = null;
let permission: NotificationPermission = "default";

beforeEach(() => {
  reinitialiserClient();
  appels.length = 0;
  abonnement = null;
  permission = "default";
  cleServeur = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input).split("?")[0] as string;
      const method = init?.method ?? "GET";
      appels.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const json = (status: number, b: unknown) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
      if (url.endsWith("/kombe-dashboard-config.json")) return json(200, { apiBaseUrl: "https://api.test" });
      if (url.endsWith("/v1/push/web-key")) return json(200, { publicKey: cleServeur });
      if (url.endsWith("/v1/me/push-devices") && method === "POST") return json(201, { deviceId: "41" });
      if (url.endsWith("/v1/me/push-devices/41") && method === "DELETE") return json(200, { revoked: true });
      return json(404, { code: "NOT_FOUND", message: "?" });
    }),
  );
  const pushManager = {
    getSubscription: async () => abonnement,
    subscribe: vi.fn(async (o: { applicationServerKey: Uint8Array }) => {
      expect(o.applicationServerKey.length).toBe(65); // clé publique P-256 non compressée
      abonnement = {
        endpoint: "https://push.example/abc",
        toJSON: () => ({ endpoint: "https://push.example/abc", keys: { p256dh: "BPk", auth: "au" } }),
        unsubscribe: async () => { abonnement = null; return true; },
      };
      return abonnement;
    }),
  };
  const reg = { pushManager };
  vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { serviceWorker: { register: vi.fn(async () => reg), getRegistration: vi.fn(async () => reg) } }));
  vi.stubGlobal("PushManager", function PushManager() {});
  vi.stubGlobal("Notification", { get permission() { return permission; }, requestPermission: async () => { permission = "granted"; return permission; } });
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.removeItem("kombe.pushWeb.appareil");
});

describe("A14 : Push Web", () => {
  it("indisponible tant que le serveur n'offre pas de clé", async () => {
    cleServeur = null;
    expect((await etatPushWeb()).etat).toBe("indisponible");
  });

  it("active : autorisation, abonnement, appareil web enregistré ; puis désactive", async () => {
    const e = await etatPushWeb();
    expect(e.etat).toBe("inactif");
    expect(await activerPushWeb(session, e.cle!)).toBe("actif");
    const post = appels.find((a) => a.method === "POST");
    expect(post?.url).toBe("https://api.test/v1/me/push-devices");
    expect(post?.body).toEqual({ platform: "web", token: JSON.stringify({ endpoint: "https://push.example/abc", keys: { p256dh: "BPk", auth: "au" } }) });
    expect((await etatPushWeb()).etat).toBe("actif");
    expect(await desactiverPushWeb(session)).toBe("inactif");
    expect(appels.some((a) => a.method === "DELETE" && a.url.endsWith("/v1/me/push-devices/41"))).toBe(true);
    expect((await etatPushWeb()).etat).toBe("inactif");
  });

  it("refus de l'utilisateur : rien n'est enregistré", async () => {
    vi.stubGlobal("Notification", { get permission() { return permission; }, requestPermission: async () => { permission = "denied"; return permission; } });
    expect(await activerPushWeb(session, cleServeur!)).toBe("refuse");
    expect(appels.some((a) => a.method === "POST")).toBe(false);
  });

  it("décode la clé VAPID base64url", () => {
    expect(Array.from(cleEnOctets("AQID"))).toEqual([1, 2, 3]);
  });
});
