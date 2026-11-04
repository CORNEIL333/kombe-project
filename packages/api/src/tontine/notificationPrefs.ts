/**
 * Préférences de notification et appareils push de la personne connectée
 * (ADR-0044). Tout passe sous sa propre portée RLS (`kombe.identity_id`).
 */
import type pg from "pg";
import { DomainError } from "@kombe/domain";
import { inTx, sessionIdentity } from "./infra.js";

export interface NotificationPreferences {
  readonly pushEnabled: boolean;
  readonly smsEnabled: boolean;
  readonly emailEnabled: boolean;
  /** « HH:MM » (heure du Cameroun) ; null : pas d'heures de silence. */
  readonly quietStart: string | null;
  readonly quietEnd: string | null;
  readonly mutedKinds: readonly string[];
}

export interface NotificationPreferencesView extends NotificationPreferences {
  /** Canaux ouverts à CE compte : SMS pour un numéro, e-mail pour une adresse. */
  readonly available: { readonly push: boolean; readonly sms: boolean; readonly email: boolean };
  readonly devices: number;
  readonly unread: number;
}

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  pushEnabled: true,
  smsEnabled: false,
  emailEnabled: false,
  quietStart: "21:00",
  quietEnd: "07:00",
  mutedKinds: [],
};

const hhmm = (v: unknown): string | null => (v === null || v === undefined ? null : String(v).slice(0, 5));

export class NotificationPrefs {
  constructor(private readonly pool: pg.Pool, private readonly now: () => number) {}

  async get(headers: Record<string, unknown>): Promise<NotificationPreferencesView> {
    return inTx(this.pool, async (db) => {
      const id = await sessionIdentity(db, headers, this.now());
      const r = await db.query(
        `SELECT push_enabled, sms_enabled, email_enabled, quiet_start, quiet_end, muted_kinds,
                (SELECT count(*) FROM push_device WHERE identity_id = $1 AND revoked_at IS NULL) AS devices,
                (SELECT count(*) FROM inbox_notification WHERE identity_id = $1 AND read_at IS NULL) AS unread
           FROM (SELECT 1) one LEFT JOIN member_notification_preference p ON p.identity_id = $1`,
        [id],
      );
      const x = r.rows[0] ?? {};
      const has = x.push_enabled !== null && x.push_enabled !== undefined;
      return {
        pushEnabled: has ? x.push_enabled === true : DEFAULT_PREFERENCES.pushEnabled,
        smsEnabled: has ? x.sms_enabled === true : DEFAULT_PREFERENCES.smsEnabled,
        emailEnabled: has ? x.email_enabled === true : DEFAULT_PREFERENCES.emailEnabled,
        quietStart: has ? hhmm(x.quiet_start) : DEFAULT_PREFERENCES.quietStart,
        quietEnd: has ? hhmm(x.quiet_end) : DEFAULT_PREFERENCES.quietEnd,
        mutedKinds: has ? ((x.muted_kinds as string[] | null) ?? []) : [],
        available: { push: true, sms: id.startsWith("+"), email: id.includes("@") },
        devices: Number(x.devices ?? 0),
        unread: Number(x.unread ?? 0),
      };
    });
  }

  async put(headers: Record<string, unknown>, p: NotificationPreferences): Promise<NotificationPreferencesView> {
    if ((p.quietStart === null) !== (p.quietEnd === null)) {
      throw new DomainError("PREFERENCE_INVALID", "Indiquez le début et la fin des heures de silence, ou aucune des deux");
    }
    await inTx(this.pool, async (db) => {
      const id = await sessionIdentity(db, headers, this.now());
      if (p.smsEnabled && !id.startsWith("+")) throw new DomainError("PREFERENCE_INVALID", "Le SMS demande un compte ouvert avec un numéro de téléphone");
      if (p.emailEnabled && !id.includes("@")) throw new DomainError("PREFERENCE_INVALID", "L'e-mail demande un compte ouvert avec une adresse e-mail");
      await db.query(
        `INSERT INTO member_notification_preference (identity_id, push_enabled, sms_enabled, email_enabled, quiet_start, quiet_end, muted_kinds, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (identity_id) DO UPDATE SET push_enabled = EXCLUDED.push_enabled, sms_enabled = EXCLUDED.sms_enabled,
           email_enabled = EXCLUDED.email_enabled, quiet_start = EXCLUDED.quiet_start, quiet_end = EXCLUDED.quiet_end,
           muted_kinds = EXCLUDED.muted_kinds, updated_at = EXCLUDED.updated_at`,
        [id, p.pushEnabled, p.smsEnabled, p.emailEnabled, p.quietStart, p.quietEnd, [...new Set(p.mutedKinds)], new Date(this.now())],
      );
    });
    return this.get(headers);
  }

  async registerDevice(headers: Record<string, unknown>, platform: "android" | "ios" | "web", token: string): Promise<{ deviceId: string }> {
    return inTx(this.pool, async (db) => {
      await sessionIdentity(db, headers, this.now());
      const r = await db.query("SELECT kombe_push_register($1, $2, $3) AS id", [platform, token, new Date(this.now())]);
      return { deviceId: String(r.rows[0]?.id) };
    });
  }

  async revokeDevice(headers: Record<string, unknown>, deviceId: string): Promise<{ revoked: boolean }> {
    if (!/^\d{1,18}$/.test(deviceId)) throw new DomainError("OBJET_INTROUVABLE", "Appareil introuvable");
    return inTx(this.pool, async (db) => {
      await sessionIdentity(db, headers, this.now());
      const r = await db.query(`UPDATE push_device SET revoked_at = $2 WHERE device_id = $1 AND revoked_at IS NULL`, [deviceId, new Date(this.now())]);
      if (r.rowCount === 0) throw new DomainError("OBJET_INTROUVABLE", "Appareil introuvable");
      return { revoked: true };
    });
  }

  async unreadCount(headers: Record<string, unknown>): Promise<{ unread: number }> {
    return inTx(this.pool, async (db) => {
      const id = await sessionIdentity(db, headers, this.now());
      const r = await db.query(`SELECT count(*) AS n FROM inbox_notification WHERE identity_id = $1 AND read_at IS NULL`, [id]);
      return { unread: Number(r.rows[0]?.n ?? 0) };
    });
  }
}
