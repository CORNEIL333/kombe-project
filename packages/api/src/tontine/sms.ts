/**
 * KÓMBE @kombe/api — frontière d'envoi SMS (lot L-01, ADR connexion par
 * téléphone). Même idiome que `email/emailSender.ts` : le store ne connaît
 * que cette interface. Aucun fournisseur réel n'est branché dans ce dépôt
 * (choix du porteur : opérateur local, agrégateur…) ; tant qu'il ne l'est
 * pas, le mode réel REFUSE explicitement l'envoi (`SMS_DELIVERY_FAILED`),
 * jamais un faux succès.
 */
import { DomainError } from "@kombe/domain";

export interface SmsMessage {
  /** Numéro E.164 (+237…). */
  readonly to: string;
  readonly text: string;
}

export interface SmsSender {
  send(message: SmsMessage): Promise<void>;
}

/** Double de test : n'envoie rien, retient les messages pour inspection. */
export class NullSmsSender implements SmsSender {
  readonly sent: SmsMessage[] = [];
  async send(message: SmsMessage): Promise<void> {
    this.sent.push(message);
  }
}

/** Fournisseur non configuré : refus explicite et stable. */
export class UnconfiguredSmsSender implements SmsSender {
  async send(): Promise<void> {
    throw new DomainError("SMS_DELIVERY_FAILED", "Envoi SMS non configuré");
  }
}

/**
 * Passerelle HTTP générique (agrégateur SMS) : POST JSON `{to, text}` vers
 * `KOMBE_SMS_WEBHOOK_URL` avec `Authorization: Bearer KOMBE_SMS_WEBHOOK_TOKEN`.
 * Jamais exercée par un test automatisé (aucun SMS réel avant la mise en
 * service décidée par le porteur).
 */
export class WebhookSmsSender implements SmsSender {
  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  async send(message: SmsMessage): Promise<void> {
    let ok = false;
    try {
      const res = await fetch(this.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ to: message.to, text: message.text }),
      });
      ok = res.ok;
    } catch {
      ok = false;
    }
    if (!ok) throw new DomainError("SMS_DELIVERY_FAILED", "Envoi SMS impossible");
  }
}

/** Expéditeur depuis l'environnement : webhook si configuré, sinon refus. */
export function smsSenderFromEnv(env: NodeJS.ProcessEnv = process.env): SmsSender {
  const url = env.KOMBE_SMS_WEBHOOK_URL;
  const token = env.KOMBE_SMS_WEBHOOK_TOKEN;
  if (url && token) return new WebhookSmsSender(url, token);
  return new UnconfiguredSmsSender();
}
