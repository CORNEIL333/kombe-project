/**
 * Fournisseur des codes de connexion : la production démarre SANS compte SMS
 * (voie SMS fermée, refus explicite, e-mail ouvert) ; le simulateur y est
 * interdit ; aucun envoi n'est jamais prétendu réussi.
 */
import { describe, expect, it } from "vitest";
import { AfricasTalkingSender, DisabledCodeSender, SimulatorCodeSender, WebhookSender, codeSenderFromEnv } from "../src/tontine/sms.js";

describe("codeSenderFromEnv", () => {
  it("développement : simulateur (SMS + WhatsApp)", () => {
    const s = codeSenderFromEnv({ NODE_ENV: "development" } as NodeJS.ProcessEnv);
    expect(s).toBeInstanceOf(SimulatorCodeSender);
    expect(s.channels).toEqual(["sms", "whatsapp"]);
  });
  it("production sans fournisseur : démarre, voie SMS fermée avec un refus clair", async () => {
    const s = codeSenderFromEnv({ NODE_ENV: "production" } as NodeJS.ProcessEnv);
    expect(s).toBeInstanceOf(DisabledCodeSender);
    expect(s.channels).toEqual([]);
    await expect(s.send({ to: "+237677000000", text: "x", channel: "sms" })).rejects.toMatchObject({ code: "SMS_DELIVERY_FAILED" });
  });
  it("production : simulateur refusé", () => {
    expect(() => codeSenderFromEnv({ NODE_ENV: "production", KOMBE_SMS_PROVIDER: "simulator" } as NodeJS.ProcessEnv)).toThrow(/interdit en production/);
  });
  it("Africa's Talking : SMS seulement ; webhook : SMS et WhatsApp", () => {
    expect(codeSenderFromEnv({ NODE_ENV: "production", KOMBE_SMS_PROVIDER: "africastalking", AFRICASTALKING_USERNAME: "u", AFRICASTALKING_API_KEY: "k" } as NodeJS.ProcessEnv)).toBeInstanceOf(AfricasTalkingSender);
    const w = codeSenderFromEnv({ NODE_ENV: "production", KOMBE_SMS_PROVIDER: "webhook", KOMBE_SMS_WEBHOOK_URL: "https://sms.example" } as NodeJS.ProcessEnv);
    expect(w).toBeInstanceOf(WebhookSender);
    expect(w.channels).toContain("whatsapp");
  });
  it("fournisseur inconnu : erreur de configuration", () => {
    expect(() => codeSenderFromEnv({ NODE_ENV: "production", KOMBE_SMS_PROVIDER: "twilio" } as NodeJS.ProcessEnv)).toThrow(/inconnu/);
  });
});

import { appUrl } from "../src/tontine/groups.js";
describe("appUrl (liens d'invitation)", () => {
  it("explicite > domaine Vercel > local", () => {
    expect(appUrl({ KOMBE_PUBLIC_APP_URL: "https://kombe.cm/" } as NodeJS.ProcessEnv)).toBe("https://kombe.cm");
    expect(appUrl({ VERCEL_PROJECT_PRODUCTION_URL: "kombe.vercel.app" } as NodeJS.ProcessEnv)).toBe("https://kombe.vercel.app");
    expect(appUrl({} as NodeJS.ProcessEnv)).toBe("http://localhost:5173");
  });
});
