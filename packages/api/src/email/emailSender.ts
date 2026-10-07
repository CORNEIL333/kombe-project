/**
 * KÓMBE @kombe/api — frontière d'envoi email (D04, `ADR-0023` : Resend).
 *
 * Adaptateur injectable, exactement comme `Provider` pour
 * `packages/worker/src/pgWorker.ts` (outbox C13) : le store/domaine ne
 * connaît jamais le fournisseur concret, seulement cette interface.
 * `NullEmailSender` est le double utilisé par les scripts de preuve réelle
 * (jamais un envoi réel avant la porte G0, `STACK.md` §4) ; `ResendEmailSender`
 * est l'implémentation réelle, jamais exercée par un test automatisé.
 */
export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

/**
 * Double de test : n'envoie RIEN, retient les messages en mémoire pour
 * inspection (`sent`). Utilisé par les scripts `*.proof.mjs` — prouver la
 * logique de code/hash/tentatives sans jamais déclencher un message réel.
 */
export class NullEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
}

/**
 * Implémentation RÉELLE (Resend, `RESEND_API_KEY`). Jamais appelée par un
 * test automatisé ou un script de preuve (aucun message réel avant G0).
 * Ne fuite jamais le détail de l'erreur fournisseur au client : traduit
 * tout échec HTTP en `EMAIL_DELIVERY_FAILED` (erreur stable, non divulguante).
 */
export class ResendEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    let response: Response;
    try {
      response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
        }),
      });
    } catch {
      throw new EmailDeliveryError();
    }
    if (!response.ok) {
      throw new EmailDeliveryError();
    }
  }
}

/** Erreur de transport, traduite par l'appelant (store) en `DomainError`
 *  `EMAIL_DELIVERY_FAILED` — jamais le détail HTTP/fournisseur brut. */
export class EmailDeliveryError extends Error {
  constructor() {
    super("email_delivery_failed");
  }
}
