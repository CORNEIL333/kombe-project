/** A14 — Push Web (PWA) : seuls les appareils `web` reçoivent, l'abonnement
 *  expiré est retiré, le téléphone garde FCM, rien n'est inventé sans clés. */
import { describe, expect, it } from "vitest";
import {
  CombinedPushProvider,
  WebPushProvider,
  parseWebSubscription,
  vapidFromEnv,
  type ChannelProvider,
  type DeliveryMessage,
  type PushToken,
  type WebPushSender,
} from "../src/tontine/delivery.js";

const msg: DeliveryMessage = {
  outboxId: 1, notificationId: 9, identityId: "+237677000001", channel: "push", kind: "due_reminder",
  groupId: "grp_1", target: null, attempt: 0, title: "Cotisation à déclarer", body: "Ouvrez KÓMBE pour voir le détail.", link: "https://kombe.vercel.app/#/notifications/9", locale: "fr",
};
const sub = (n: number) => JSON.stringify({ endpoint: `https://push.example/abc${n}`, keys: { p256dh: "BPk", auth: "au" } });

function ctx(tokens: PushToken[]) {
  const revoked: number[] = [];
  return { revoked, c: { tokens: async () => tokens, revoke: async (id: number) => { revoked.push(id); } } };
}

function fakeSender(status: (endpoint: string) => number): WebPushSender & { sent: { endpoint: string; payload: string }[] } {
  const sent: { endpoint: string; payload: string }[] = [];
  return { sent, async send(s, payload) { sent.push({ endpoint: s.endpoint, payload }); return { statusCode: status(s.endpoint) }; } };
}

describe("A14 — Push Web", () => {
  it("n'envoie qu'aux navigateurs, avec un texte générique", async () => {
    const sender = fakeSender(() => 201);
    const { c } = ctx([{ deviceId: 1, platform: "android", token: "fcm-token-xxxxxxxx" }, { deviceId: 2, platform: "web", token: sub(2) }]);
    const r = await new WebPushProvider(sender).send(msg, c);
    expect(r.outcome).toBe("sent");
    expect(sender.sent.map((x) => x.endpoint)).toEqual(["https://push.example/abc2"]);
    const payload = JSON.parse(sender.sent[0]!.payload);
    expect(payload).toEqual({ title: msg.title, body: msg.body, link: msg.link, kind: "due_reminder", notificationId: 9 });
  });

  it("retire l'abonnement expiré (410) ou illisible, réessaie sur erreur passagère", async () => {
    const gone = ctx([{ deviceId: 3, platform: "web", token: sub(3) }, { deviceId: 4, platform: "web", token: "pas du json" }]);
    expect(await new WebPushProvider(fakeSender(() => 410)).send(msg, gone.c)).toEqual({ outcome: "suppressed", code: "NO_DEVICE" });
    expect(gone.revoked.sort()).toEqual([3, 4]);
    const flaky = ctx([{ deviceId: 5, platform: "web", token: sub(5) }]);
    expect((await new WebPushProvider(fakeSender(() => 503)).send(msg, flaky.c)).outcome).toBe("retry");
    expect(flaky.revoked).toEqual([]);
  });

  it("le fournisseur combiné partage les appareils : téléphones d'un côté, navigateurs de l'autre", async () => {
    const seen: string[][] = [];
    const native: ChannelProvider = {
      channel: "push", simulated: false,
      async send(_m, c) { seen.push((await c.tokens()).map((t) => t.platform)); return { outcome: "retry", code: "PROVIDER_ERROR" }; },
    };
    const { c } = ctx([{ deviceId: 1, platform: "ios", token: "apns-like-token-xxxx" }, { deviceId: 2, platform: "web", token: sub(2) }]);
    const r = await new CombinedPushProvider(native, new WebPushProvider(fakeSender(() => 201))).send(msg, c);
    expect(seen).toEqual([["ios"]]);
    expect(r.outcome).toBe("sent"); // au moins un appareil a reçu
    const onlyWeb = ctx([{ deviceId: 2, platform: "web", token: sub(2) }]);
    expect((await new CombinedPushProvider(native, null).send(msg, onlyWeb.c)).outcome).toBe("suppressed");
  });

  it("abonnement : https obligatoire, clés présentes", () => {
    expect(parseWebSubscription(sub(1))).not.toBeNull();
    expect(parseWebSubscription(JSON.stringify({ endpoint: "http://x", keys: { p256dh: "a", auth: "b" } }))).toBeNull();
    expect(parseWebSubscription(JSON.stringify({ endpoint: "https://x" }))).toBeNull();
  });

  it("sans clés VAPID, le canal reste fermé et la clé publique vaut null", async () => {
    expect(vapidFromEnv({})).toBeNull();
    expect(vapidFromEnv({ KOMBE_WEBPUSH_PUBLIC_KEY: "pub" })).toBeNull();
    expect(vapidFromEnv({ KOMBE_WEBPUSH_PUBLIC_KEY: "pub", KOMBE_WEBPUSH_PRIVATE_KEY: "priv" })).toEqual({ publicKey: "pub", privateKey: "priv", subject: "https://kombe.vercel.app" });
  });
});
