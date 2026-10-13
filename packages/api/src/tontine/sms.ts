/**
 * Frontière d'envoi des codes de connexion (L-01, ADR-0025) : SMS d'abord,
 * WhatsApp en option, e-mail en seconde voie. Le fournisseur est injecté ;
 * le code n'est JAMAIS journalisé.
 *
 * Fournisseurs (`KOMBE_SMS_PROVIDER`) :
 *  - `simulator` (développement) : n'envoie rien, garde le dernier code en
 *    mémoire pour l'afficher dans la réponse de développement ;
 *  - `africastalking` : API SMS Africa's Talking (couvre le Cameroun),
 *    `AFRICASTALKING_USERNAME`, `AFRICASTALKING_API_KEY`, `KOMBE_SMS_SENDER_ID` facultatif ;
 *  - `webhook` : POST JSON `{ to, text, channel }` vers `KOMBE_SMS_WEBHOOK_URL`
 *    (passerelle maison, Twilio via fonction, etc.), en-tête `authorization`
 *    = `KOMBE_SMS_WEBHOOK_TOKEN` si présent.
 */
import { DomainError } from "@kombe/domain";
import type { EmailSender } from "../email/emailSender.js";

export interface CodeMessage {
  readonly to: string;
  readonly text: string;
  readonly channel: "sms" | "whatsapp" | "email";
}

export interface CodeSender {
  readonly simulated: boolean;
  /** Canaux réellement servis par ce fournisseur (vide : voie fermée). */
  readonly channels: readonly ("sms" | "whatsapp" | "email")[];
  send(message: CodeMessage): Promise<void>;
}

/**
 * Production sans fournisseur SMS configuré : l'API démarre quand même (la
 * connexion par e-mail reste ouverte) et la voie SMS répond un refus clair.
 * Jamais un faux envoi : rien n'est prétendu parti.
 */
export class DisabledCodeSender implements CodeSender {
  readonly simulated = false;
  readonly channels = [] as const;
  async send(): Promise<void> {
    throw new DomainError("SMS_DELIVERY_FAILED", "Envoi par SMS pas encore ouvert : connectez-vous par e-mail");
  }
}

export class SimulatorCodeSender implements CodeSender {
  readonly simulated = true;
  readonly channels = ["sms", "whatsapp"] as const;
  readonly sent: CodeMessage[] = [];
  async send(message: CodeMessage): Promise<void> {
    this.sent.push(message);
    if (this.sent.length > 200) this.sent.shift();
  }
}

export class AfricasTalkingSender implements CodeSender {
  readonly simulated = false;
  readonly channels = ["sms"] as const;
  constructor(
    private readonly username: string,
    private readonly apiKey: string,
    private readonly senderId: string | undefined,
  ) {}
  async send(message: CodeMessage): Promise<void> {
    const body = new URLSearchParams({ username: this.username, to: message.to, message: message.text });
    if (this.senderId) body.set("from", this.senderId);
    let res: Response;
    try {
      res = await fetch("https://api.africastalking.com/version1/messaging", {
        method: "POST",
        headers: { apiKey: this.apiKey, accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
        body,
      });
    } catch {
      throw new DomainError("SMS_DELIVERY_FAILED", "Envoi impossible");
    }
    if (!res.ok) throw new DomainError("SMS_DELIVERY_FAILED", "Envoi impossible");
  }
}

export class WebhookSender implements CodeSender {
  readonly simulated = false;
  readonly channels = ["sms", "whatsapp"] as const;
  constructor(
    private readonly url: string,
    private readonly token: string | undefined,
  ) {}
  async send(message: CodeMessage): Promise<void> {
    let res: Response;
    try {
      res = await fetch(this.url, {
        method: "POST",
        headers: { "content-type": "application/json", ...(this.token ? { authorization: this.token } : {}) },
        body: JSON.stringify(message),
      });
    } catch {
      throw new DomainError("SMS_DELIVERY_FAILED", "Envoi impossible");
    }
    if (!res.ok) throw new DomainError("SMS_DELIVERY_FAILED", "Envoi impossible");
  }
}

/** Adapte l'expéditeur e-mail existant (Resend) au contrat d'envoi de code. */
export class EmailCodeSender implements CodeSender {
  readonly channels: readonly "email"[];
  constructor(
    private readonly email: EmailSender,
    readonly simulated: boolean,
    available = true,
  ) {
    this.channels = available ? ["email"] : [];
  }
  async send(message: CodeMessage): Promise<void> {
    try {
      await this.email.send({ to: message.to, subject: "Votre code KÓMBE", text: message.text });
    } catch {
      throw new DomainError("EMAIL_DELIVERY_FAILED", "Envoi impossible");
    }
  }
}

/**
 * Choisit le fournisseur depuis l'environnement. En production, le
 * simulateur est refusé au démarrage (jamais un faux envoi silencieux).
 */
export function codeSenderFromEnv(env: NodeJS.ProcessEnv = process.env): CodeSender {
  const provider = env.KOMBE_SMS_PROVIDER ?? (env.NODE_ENV === "production" ? "" : "simulator");
  switch (provider) {
    case "simulator":
      if (env.NODE_ENV === "production" && env.KOMBE_ALLOW_SIMULATED_DELIVERY !== "1") {
        throw new Error("KOMBE_SMS_PROVIDER=simulator interdit en production (aucun SMS ne partirait).");
      }
      return new SimulatorCodeSender();
    case "africastalking": {
      const username = env.AFRICASTALKING_USERNAME;
      const apiKey = env.AFRICASTALKING_API_KEY;
      if (!username || !apiKey) throw new Error("AFRICASTALKING_USERNAME et AFRICASTALKING_API_KEY sont requis.");
      return new AfricasTalkingSender(username, apiKey, env.KOMBE_SMS_SENDER_ID);
    }
    case "webhook": {
      const url = env.KOMBE_SMS_WEBHOOK_URL;
      if (!url || !/^https:\/\//.test(url)) throw new Error("KOMBE_SMS_WEBHOOK_URL (https://…) est requise.");
      return new WebhookSender(url, env.KOMBE_SMS_WEBHOOK_TOKEN);
    }
    case "":
      // Production sans fournisseur : voie SMS fermée, e-mail ouvert (DEPLOY.md).
      return new DisabledCodeSender();
    default:
      throw new Error("KOMBE_SMS_PROVIDER inconnu (simulator | africastalking | webhook).");
  }
}
