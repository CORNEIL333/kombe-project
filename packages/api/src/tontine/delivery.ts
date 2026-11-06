/**
 * Livraison des notifications hors application (ADR-0044).
 *
 * La boîte de réception reste la source ; `notification_outbox` (0038) porte
 * une ligne par canal consenti. Le répartiteur réclame des lignes par BAIL
 * (`kombe_outbox_claim`, FOR UPDATE SKIP LOCKED), appelle le fournisseur HORS
 * transaction, puis consigne l'issue (`kombe_outbox_complete`). Une instance
 * qui meurt en plein envoi laisse un bail qui expire : la ligne est reprise.
 *
 * Jamais de faux succès : sans fournisseur configuré, ou tant que l'envoi
 * externe n'est pas ouvert (KOMBE_NOTIFY_EXTERNAL=on), la ligne finit
 * « suppressed » avec son motif. Le simulateur n'existe qu'hors production
 * et marque ses envois « SIMULATED ».
 *
 * Le texte hors application est GÉNÉRIQUE (ADR-0016) : ni montant, ni nom de
 * personne, ni nom de groupe ; le détail se lit après connexion, via le lien.
 */
import { createSign } from "node:crypto";
import type pg from "pg";
import type { EmailSender } from "../email/emailSender.js";
import type { CodeSender } from "./sms.js";
import { inTx } from "./infra.js";

export type Channel = "push" | "sms" | "email";
export type Outcome = "sent" | "retry" | "suppressed" | "dead";

export interface DeliveryMessage {
  readonly outboxId: number;
  readonly notificationId: number;
  readonly identityId: string;
  readonly channel: Channel;
  readonly kind: string;
  readonly groupId: string | null;
  readonly target: string | null;
  readonly attempt: number;
  readonly title: string;
  readonly body: string;
  readonly link: string;
}

export interface DeliveryResult {
  readonly outcome: Outcome;
  readonly code: string;
  readonly ref?: string | null;
}

export interface PushToken {
  readonly deviceId: number;
  readonly platform: string;
  readonly token: string;
}

export interface ChannelProvider {
  readonly channel: Channel;
  readonly simulated: boolean;
  send(m: DeliveryMessage, ctx: { readonly tokens: () => Promise<readonly PushToken[]>; readonly revoke: (deviceId: number) => Promise<void> }): Promise<DeliveryResult>;
}

/* ── Textes génériques (FR) ─────────────────────────────────────────── */

const TITRES: Readonly<Record<string, string>> = {
  meeting_reminder: "Séance à venir",
  meeting_opened: "La séance est ouverte",
  due_reminder: "Cotisation à déclarer",
  validation_waiting: "Une déclaration attend votre contrôle",
  payout_recorded: "Remise de la cagnotte enregistrée",
  payout_to_confirm: "Une remise attend votre confirmation",
  fine_issued: "Nouvelle amende dans votre groupe",
  fine_cancelled: "Une amende a été annulée",
  fine_contested: "Une amende est contestée",
  fine_refunded: "Un remboursement d'amende est enregistré",
  poll_opened: "Nouveau vote dans votre groupe",
  meeting_updated: "Une séance a été modifiée",
  aid_requested: "Nouvelle demande de secours",
  aid_decided: "Une demande de secours a été tranchée",
  order_change: "L'ordre des tours a changé",
  membership: "Du nouveau parmi les membres",
  join_request: "Nouvelle demande d'adhésion",
  admitted: "Votre adhésion est acceptée",
  rejected: "Réponse à votre demande d'adhésion",
  role_proposed: "Une fonction vous est proposée",
  role_reminder: "Une fonction attend votre réponse",
  minutes_ready: "Le compte rendu est disponible",
  decision: "Un vote est ouvert",
  vote_reminder: "Un vote se termine bientôt",
  statutes_published: "De nouveaux statuts sont publiés",
  statutes_reminder: "Les statuts attendent votre accord",
  statutes_excluded: "Statuts non acceptés à l'échéance",
  statutes_expired: "L'échéance des statuts est passée",
  cycle_started: "Un nouveau cycle commence",
  draw_committed: "Le tirage au sort est engagé",
  fund_created: "Nouvelle caisse dans votre groupe",
  movement_rejected: "Une déclaration a été refusée",
  general: "Nouvelle notification",
};

export function genericText(kind: string): { title: string; body: string } {
  return { title: TITRES[kind] ?? TITRES.general!, body: "Ouvrez KÓMBE pour voir le détail." };
}

/* ── Fournisseurs ───────────────────────────────────────────────────── */

/** Développement seulement : rien ne part, chaque envoi est retenu et marqué SIMULATED. */
export class SimulatorProvider implements ChannelProvider {
  readonly simulated = true;
  readonly sent: DeliveryMessage[] = [];
  constructor(readonly channel: Channel, private readonly script?: (m: DeliveryMessage) => DeliveryResult | null) {}
  async send(m: DeliveryMessage): Promise<DeliveryResult> {
    const forced = this.script?.(m);
    if (forced) return forced;
    this.sent.push(m);
    return { outcome: "sent", code: "SIMULATED", ref: `simulator:${this.sent.length}` };
  }
}

/** SMS via la frontière d'envoi des codes (Africa's Talking, passerelle). */
export class SmsProvider implements ChannelProvider {
  readonly channel = "sms" as const;
  constructor(private readonly sender: CodeSender) {}
  get simulated(): boolean { return this.sender.simulated; }
  async send(m: DeliveryMessage): Promise<DeliveryResult> {
    if (!this.sender.channels.includes("sms")) return { outcome: "suppressed", code: "CHANNEL_NOT_CONFIGURED" };
    try {
      await this.sender.send({ to: m.identityId, text: `KÓMBE : ${m.title}. ${m.link}`, channel: "sms" });
      return { outcome: "sent", code: this.sender.simulated ? "SIMULATED" : "OK" };
    } catch {
      return { outcome: "retry", code: "PROVIDER_ERROR" };
    }
  }
}

export class EmailProvider implements ChannelProvider {
  readonly channel = "email" as const;
  constructor(private readonly sender: EmailSender, readonly simulated: boolean, private readonly available: boolean) {}
  async send(m: DeliveryMessage): Promise<DeliveryResult> {
    if (!this.available) return { outcome: "suppressed", code: "CHANNEL_NOT_CONFIGURED" };
    try {
      await this.sender.send({ to: m.identityId, subject: `KÓMBE — ${m.title}`, text: `${m.title}.\n\n${m.body}\n${m.link}\n\nVous recevez ce message parce que vous l'avez demandé dans vos préférences KÓMBE.` });
      return { outcome: "sent", code: this.simulated ? "SIMULATED" : "OK" };
    } catch {
      return { outcome: "retry", code: "PROVIDER_ERROR" };
    }
  }
}

interface ServiceAccount { readonly project_id: string; readonly client_email: string; readonly private_key: string }

/** Firebase Cloud Messaging (API HTTP v1), compte de service fourni par l'environnement. */
export class FcmProvider implements ChannelProvider {
  readonly channel = "push" as const;
  readonly simulated = false;
  private token: { value: string; until: number } | null = null;
  constructor(private readonly sa: ServiceAccount, private readonly fetchImpl: typeof fetch = fetch) {}

  private async accessToken(): Promise<string> {
    if (this.token && this.token.until > Date.now() + 60_000) return this.token.value;
    const iat = Math.floor(Date.now() / 1000);
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: this.sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat, exp: iat + 3600 })}`;
    const sig = createSign("RSA-SHA256").update(unsigned).sign(this.sa.private_key).toString("base64url");
    const r = await this.fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sig}` }),
    });
    if (!r.ok) throw new Error(`oauth ${r.status}`);
    const j = (await r.json()) as { access_token: string; expires_in: number };
    this.token = { value: j.access_token, until: Date.now() + j.expires_in * 1000 };
    return j.access_token;
  }

  async send(m: DeliveryMessage, ctx: { tokens: () => Promise<readonly PushToken[]>; revoke: (deviceId: number) => Promise<void> }): Promise<DeliveryResult> {
    const tokens = await ctx.tokens();
    if (tokens.length === 0) return { outcome: "suppressed", code: "NO_DEVICE" };
    let bearer: string;
    try { bearer = await this.accessToken(); } catch { return { outcome: "retry", code: "PROVIDER_AUTH" }; }
    let delivered = 0;
    let transient = 0;
    let lastRef: string | null = null;
    for (const t of tokens) {
      const r = await this.fetchImpl(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(this.sa.project_id)}/messages:send`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${bearer}` },
        body: JSON.stringify({
          message: {
            token: t.token,
            notification: { title: m.title, body: m.body },
            data: { notificationId: String(m.notificationId), kind: m.kind, target: m.target ?? "", link: m.link },
            android: { priority: "high", collapse_key: m.kind },
            apns: { payload: { aps: { "thread-id": m.groupId ?? "kombe" } } },
          },
        }),
      }).catch(() => null);
      if (r && r.ok) {
        delivered += 1;
        lastRef = ((await r.json().catch(() => ({}))) as { name?: string }).name?.slice(0, 200) ?? null;
      } else if (r && (r.status === 404 || r.status === 400)) {
        await ctx.revoke(t.deviceId); // jeton désinscrit ou invalide : retiré, jamais réessayé
      } else {
        transient += 1;
      }
    }
    if (delivered > 0) return { outcome: "sent", code: "OK", ref: lastRef };
    if (transient > 0) return { outcome: "retry", code: "PROVIDER_ERROR" };
    return { outcome: "suppressed", code: "NO_DEVICE" };
  }
}

/* ── Répartiteur ────────────────────────────────────────────────────── */

export interface DispatcherOptions {
  /** Envoi externe ouvert (KOMBE_NOTIFY_EXTERNAL=on) ; sinon tout finit « suppressed ». */
  readonly enabled: boolean;
  readonly publicUrl: string;
  readonly providers: Partial<Record<Channel, ChannelProvider>>;
  readonly leaseSeconds?: number;
}

export interface DrainReport {
  claimed: number;
  sent: number;
  retry: number;
  suppressed: number;
  dead: number;
}

export class NotificationDispatcher {
  private running: Promise<DrainReport> | null = null;
  private again = false;
  constructor(private readonly pool: pg.Pool, private readonly now: () => number, private readonly opts: DispatcherOptions) {}

  /**
   * Déclenchement après une écriture, REGROUPÉ : au plus un traitement en cours
   * par instance ; une écriture qui arrive pendant ce temps demande UN
   * traitement de plus, 500 ms après (jamais oubliée). Mesuré à 5 000 personnes :
   * 27 000 réclamations vides en 3 min sans regroupement ; avec, au plus ~2
   * par seconde et par instance, et une notification part en moins d'une
   * seconde environ.
   */
  kick(o: { batch?: number; budgetMs?: number } = {}): Promise<DrainReport> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      let rep: DrainReport;
      do {
        this.again = false;
        rep = await this.drain({ rounds: 1, batch: o.batch ?? 20, budgetMs: o.budgetMs ?? 3000 });
        if (this.again) await new Promise((r) => setTimeout(r, 500));
      } while (this.again);
      return rep;
    })().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  linkFor(notificationId: number): string {
    return `${this.opts.publicUrl.replace(/\/+$/, "")}/#/notifications/${notificationId}`;
  }

  /** Traite les lignes dues, par lots, dans la limite d'un budget de temps. */
  async drain(o: { batch?: number; rounds?: number; budgetMs?: number } = {}): Promise<DrainReport> {
    const rep: DrainReport = { claimed: 0, sent: 0, retry: 0, suppressed: 0, dead: 0 };
    const started = Date.now();
    for (let round = 0; round < (o.rounds ?? 5); round += 1) {
      if (Date.now() - started > (o.budgetMs ?? 8000)) break;
      const rows = await inTx(this.pool, async (db) =>
        (await db.query("SELECT * FROM kombe_outbox_claim($1, $2, $3)", [o.batch ?? 50, this.opts.leaseSeconds ?? 60, new Date(this.now())])).rows,
      );
      if (rows.length === 0) break;
      rep.claimed += rows.length;
      for (const row of rows) {
        const res = await this.deliver(row);
        const final = await inTx(this.pool, async (db) =>
          String((await db.query("SELECT kombe_outbox_complete($1,$2,$3,$4,$5) AS f", [row.outbox_id, res.outcome, res.code, res.ref ?? null, new Date(this.now())])).rows[0]?.f),
        );
        if (final === "sent" || final === "retry" || final === "suppressed" || final === "dead") rep[final] += 1;
      }
    }
    return rep;
  }

  private async deliver(row: Record<string, unknown>): Promise<DeliveryResult> {
    const channel = String(row.channel) as Channel;
    if (!this.opts.enabled) return { outcome: "suppressed", code: "EXTERNAL_DISABLED" };
    const provider = this.opts.providers[channel];
    if (!provider) return { outcome: "suppressed", code: "CHANNEL_NOT_CONFIGURED" };
    const kind = String(row.kind);
    const t = genericText(kind);
    const m: DeliveryMessage = {
      outboxId: Number(row.outbox_id),
      notificationId: Number(row.notification_id),
      identityId: String(row.identity_id),
      channel,
      kind,
      groupId: row.group_id ? String(row.group_id) : null,
      target: row.target ? String(row.target) : null,
      attempt: Number(row.attempts),
      title: t.title,
      body: t.body,
      link: this.linkFor(Number(row.notification_id)),
    };
    try {
      return await provider.send(m, {
        tokens: () => inTx(this.pool, async (db) => (await db.query("SELECT * FROM kombe_push_tokens($1)", [m.identityId])).rows.map((r) => ({ deviceId: Number(r.device_id), platform: String(r.platform), token: String(r.token) }))),
        revoke: (deviceId) => inTx(this.pool, async (db) => { await db.query("SELECT kombe_push_token_revoke($1, $2)", [deviceId, new Date(this.now())]); }),
      });
    } catch {
      return { outcome: "retry", code: "PROVIDER_ERROR" };
    }
  }
}

/** Fournisseurs depuis l'environnement. Le simulateur est refusé en production. */
export function dispatcherOptionsFromEnv(
  deps: { readonly codeSender: CodeSender; readonly emailSender: EmailSender; readonly emailSimulated: boolean; readonly emailAvailable: boolean },
  env: NodeJS.ProcessEnv = process.env,
): DispatcherOptions {
  const production = env.NODE_ENV === "production" || env.VERCEL_ENV === "production";
  const providers: Partial<Record<Channel, ChannelProvider>> = {};
  if (env.KOMBE_PUSH_PROVIDER === "fcm" && env.FCM_SERVICE_ACCOUNT_JSON) {
    try {
      const sa = JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON) as ServiceAccount;
      if (sa.project_id && sa.client_email && sa.private_key) providers.push = new FcmProvider(sa);
    } catch { /* configuration invalide : canal fermé, jamais un faux envoi */ }
  } else if (env.KOMBE_PUSH_PROVIDER === "simulator" && !production) {
    providers.push = new SimulatorProvider("push");
  }
  if (!deps.codeSender.simulated || !production) providers.sms = new SmsProvider(deps.codeSender);
  providers.email = new EmailProvider(deps.emailSender, deps.emailSimulated, deps.emailAvailable);
  return {
    enabled: env.KOMBE_NOTIFY_EXTERNAL === "on",
    publicUrl: env.KOMBE_PUBLIC_URL ?? "https://kombe.vercel.app",
    providers,
  };
}

/**
 * Prolonge le traitement après la réponse quand la plateforme le permet
 * (Vercel : contexte de requête `waitUntil`) ; sinon tâche détachée dont
 * l'échec est ignoré — la tâche planifiée reprend toujours les lignes dues.
 */
export function afterResponse(task: () => Promise<unknown>): void {
  const p = task().catch(() => undefined);
  const ctx = (globalThis as Record<symbol, { get?: () => { waitUntil?: (p: Promise<unknown>) => void } } | undefined>)[Symbol.for("@vercel/request-context")]?.get?.();
  ctx?.waitUntil?.(p);
}
