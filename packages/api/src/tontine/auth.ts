/**
 * Connexion par téléphone d'abord (L-01, ADR-0025 qui remplace ADR-0024) :
 * le numéro +237 est l'identité de référence, l'e-mail une seconde voie.
 * Un code à 6 chiffres, à usage unique, expirant, limité en essais ; la
 * réponse ne révèle jamais si le compte existe (le compte naît au premier
 * code vérifié). Le code n'est jamais journalisé ni renvoyé, sauf par le
 * simulateur de développement.
 */
import { randomInt, randomUUID } from "node:crypto";
import type pg from "pg";
import {
  DomainError,
  issueSession,
  issueVerificationToken,
  normalizePhone,
  tokenVerificationError,
  verifyTokenCode,
  type AuthCodeRequestResult,
  type AuthSessionResult,
  type Language,
  type MeView,
  type VerificationToken,
} from "@kombe/domain";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { inTx, sessionIdentity, bearerOf, type Db } from "./infra.js";
import type { CodeSender } from "./sms.js";

const CODE_TTL_MS = 10 * 60_000;
/** Délai minimal entre deux envois pour un même numéro (anti-spam SMS). */
const RESEND_COOLDOWN_MS = 45_000;

export function sessionTtlMs(env: NodeJS.ProcessEnv = process.env): number {
  const hours = Number(env.KOMBE_SESSION_TTL_HOURS ?? "720");
  return Number.isFinite(hours) && hours >= 1 && hours <= 24 * 90 ? Math.round(hours * 3_600_000) : 720 * 3_600_000;
}

/** Numéro (formats camerounais usuels) ou e-mail → identifiant canonique. */
export function canonicalLogin(raw: string): { readonly login: string; readonly kind: "phone" | "email" } {
  const s = raw.trim();
  if (s.includes("@")) {
    const e = s.toLowerCase();
    if (!/^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(e) || e.length > 120) {
      throw new DomainError("PHONE_INVALID", "Adresse e-mail invalide");
    }
    return { login: e, kind: "email" };
  }
  return { login: normalizePhone(s), kind: "phone" };
}

async function asIdentity(db: Db, identityId: string): Promise<void> {
  await db.query("SELECT set_config('kombe.identity_id', $1, true)", [identityId]);
}

function rowToToken(row: Record<string, unknown>): VerificationToken {
  return {
    tokenId: String(row.token_id),
    identityId: String(row.identity_id),
    purpose: "login",
    channel: row.channel as "email" | "phone",
    codeHash: String(row.token_hash),
    issuedAt: new Date(row.issued_at as string).getTime(),
    expiresAt: new Date(row.expires_at as string).getTime(),
    consumedAt: row.consumed_at ? new Date(row.consumed_at as string).getTime() : null,
    failedAttempts: Number(row.failed_attempts),
  };
}

/**
 * Neon Auth (Managed Better Auth) pour le MVP sans domaine e-mail (ADR-0040) :
 * Neon envoie et vérifie le code e-mail, puis l'API échange le jeton Neon
 * (JWT signé, vérifié contre le JWKS du projet) contre une session KÓMBE.
 * Actif seulement si `NEON_AUTH_JWKS_URL` est posé ; `NEON_AUTH_BASE_URL`
 * est l'adresse publique du service (renvoyée au client, et émetteur attendu).
 */
export interface NeonAuthConfig {
  readonly baseUrl: string;
  readonly jwks: JWTVerifyGetKey;
}

export function neonAuthFromEnv(env: NodeJS.ProcessEnv = process.env): NeonAuthConfig | null {
  const jwksUrl = env.NEON_AUTH_JWKS_URL?.trim();
  const baseUrl = env.NEON_AUTH_BASE_URL?.trim();
  if (!jwksUrl || !baseUrl) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ""), jwks: createRemoteJWKSet(new URL(jwksUrl)) };
}

export class TontineAuth {
  constructor(
    private readonly pool: pg.Pool,
    private readonly sender: CodeSender,
    private readonly emailSender: CodeSender,
    private readonly now: () => number,
    private readonly neonAuth: NeonAuthConfig | null = null,
  ) {}

  /** Canaux de connexion réellement ouverts sur ce déploiement. */
  channels(): { sms: boolean; whatsapp: boolean; email: boolean; neonAuthUrl: string | null } {
    return {
      sms: this.sender.channels.includes("sms"),
      whatsapp: this.sender.channels.includes("whatsapp"),
      email: this.emailSender.channels.includes("email") || this.neonAuth !== null,
      neonAuthUrl: this.neonAuth?.baseUrl ?? null,
    };
  }

  /**
   * Échange un jeton Neon Auth (e-mail prouvé par Neon) contre une session
   * KÓMBE. Signature, expiration et émetteur vérifiés ; une adresse non
   * vérifiée est refusée. Réponse uniforme en cas d'échec (401).
   */
  async exchangeNeonToken(input: { token: string }): Promise<AuthSessionResult> {
    if (!this.neonAuth) throw new DomainError("EMAIL_DELIVERY_FAILED", "Connexion Neon Auth non configurée sur ce déploiement");
    let email: string;
    try {
      const { payload } = await jwtVerify(input.token, this.neonAuth.jwks, { clockTolerance: 30 });
      const iss = typeof payload.iss === "string" ? payload.iss : "";
      if (iss && new URL(iss).origin !== new URL(this.neonAuth.baseUrl).origin) throw new Error("issuer");
      const verified = payload.emailVerified ?? payload.email_verified;
      if (verified === false) throw new Error("unverified");
      if (typeof payload.email !== "string") throw new Error("email");
      email = payload.email;
    } catch {
      throw new DomainError("SESSION_INVALID", "Session non délivrée");
    }
    const { login, kind } = canonicalLogin(email);
    if (kind !== "email") throw new DomainError("SESSION_INVALID", "Session non délivrée");
    await inTx(this.pool, async (db) => {
      await asIdentity(db, login);
      await db.query(`INSERT INTO identity (identity_id) VALUES ($1) ON CONFLICT DO NOTHING`, [login]);
      await db.query(`INSERT INTO identity_access (identity_id) VALUES ($1) ON CONFLICT DO NOTHING`, [login]);
    });
    return this.openSession(login);
  }

  async requestCode(input: { login: string; channel?: "sms" | "whatsapp" | "email" | undefined }): Promise<AuthCodeRequestResult> {
    const { login, kind } = canonicalLogin(input.login);
    const channel: "sms" | "whatsapp" | "email" = kind === "email" ? "email" : input.channel === "whatsapp" ? "whatsapp" : "sms";
    const sender = channel === "email" ? this.emailSender : this.sender;
    if (!sender.channels.includes(channel)) {
      throw new DomainError(
        channel === "email" ? "EMAIL_DELIVERY_FAILED" : "SMS_DELIVERY_FAILED",
        channel === "email"
          ? "Connexion par e-mail pas encore ouverte : utilisez votre numéro de téléphone"
          : channel === "whatsapp"
            ? "Envoi par WhatsApp pas encore ouvert : choisissez le SMS ou l'e-mail"
            : "Envoi par SMS pas encore ouvert : connectez-vous par e-mail",
      );
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const nowMs = this.now();
    const shouldSend = await inTx(this.pool, async (db) => {
      await asIdentity(db, login);
      await db.query(`INSERT INTO identity (identity_id) VALUES ($1) ON CONFLICT DO NOTHING`, [login]);
      await db.query(`INSERT INTO identity_access (identity_id) VALUES ($1) ON CONFLICT DO NOTHING`, [login]);
      const acc = await db.query(`SELECT state FROM identity_access WHERE identity_id = $1`, [login]);
      const state = String(acc.rows[0]?.state ?? "pending_verification");
      if (state === "suspended" || state === "closed") return false; // même réponse (non-divulgation)
      const last = await db.query(
        `SELECT issued_at FROM verification_token
          WHERE identity_id = $1 AND purpose = 'login' AND consumed_at IS NULL
          ORDER BY issued_at DESC LIMIT 1`,
        [login],
      );
      if (last.rows[0] && nowMs - new Date(last.rows[0].issued_at as string).getTime() < RESEND_COOLDOWN_MS) {
        return false; // code encore frais : pas de second SMS
      }
      await db.query(`DELETE FROM verification_token WHERE identity_id = $1 AND purpose = 'login' AND consumed_at IS NULL`, [login]);
      const token = issueVerificationToken({
        tokenId: randomUUID(),
        identityId: login,
        purpose: "login",
        channel: kind,
        code,
        now: nowMs,
        ttlSeconds: CODE_TTL_MS,
      });
      await db.query(
        `INSERT INTO verification_token (token_id, identity_id, purpose, channel, token_hash, issued_at, expires_at, failed_attempts)
         VALUES ($1,$2,'login',$3,$4,$5,$6,0)`,
        [token.tokenId, login, token.channel, token.codeHash, new Date(token.issuedAt), new Date(token.expiresAt)],
      );
      return true;
    });
    let devCode: string | undefined;
    if (shouldSend) {
      const text = `KOMBE : votre code est ${code}. Il expire dans 10 minutes. Ne le partagez avec personne.`;
      try {
        await sender.send({ to: login, text, channel });
      } catch (err) {
        // Envoi échoué : le code n'a jamais été reçu, on le retire pour que la
        // personne puisse redemander sans attendre le délai anti-répétition.
        await inTx(this.pool, async (db) => {
          await asIdentity(db, login);
          await db.query(`DELETE FROM verification_token WHERE identity_id = $1 AND purpose = 'login' AND consumed_at IS NULL`, [login]);
        }).catch(() => undefined);
        throw err;
      }
      if (sender.simulated && process.env.NODE_ENV !== "production") devCode = code;
    }
    return { accepted: true, login, channel, ...(devCode ? { devCode } : {}) };
  }

  async verifyCode(input: { login: string; code: string }): Promise<AuthSessionResult> {
    const { login } = canonicalLogin(input.login);
    if (!/^\d{6}$/.test(input.code)) throw new DomainError("TOKEN_INVALID", "Code invalide");
    // Phase 1 : vérification durable (le compteur d'essais survit à l'échec).
    const outcome = await inTx(this.pool, async (db) => {
      await asIdentity(db, login);
      const r = await db.query(
        `SELECT token_id, identity_id, channel, token_hash, issued_at, expires_at, consumed_at, failed_attempts
           FROM verification_token
          WHERE identity_id = $1 AND purpose = 'login' AND consumed_at IS NULL
          ORDER BY issued_at DESC LIMIT 1 FOR UPDATE`,
        [login],
      );
      if (!r.rows[0]) return { kind: "mismatch" as const };
      const token = rowToToken(r.rows[0]);
      const out = verifyTokenCode(token, input.code, this.now());
      if (out.kind === "mismatch" || out.kind === "locked") {
        await db.query(`UPDATE verification_token SET failed_attempts = $2 WHERE token_id = $1`, [token.tokenId, out.token.failedAttempts]);
      } else if (out.kind === "verified") {
        await db.query(`UPDATE verification_token SET consumed_at = $2 WHERE token_id = $1`, [
          token.tokenId,
          new Date(out.token.consumedAt as number),
        ]);
      }
      return { kind: out.kind };
    });
    if (outcome.kind !== "verified") throw tokenVerificationError(outcome.kind === "mismatch" ? "mismatch" : outcome.kind);
    return this.openSession(login);
  }

  /** Phase 2 : compte activé (canal prouvé) et vraie session serveur. */
  private async openSession(login: string): Promise<AuthSessionResult> {
    return inTx(this.pool, async (db) => {
      await asIdentity(db, login);
      const acc = await db.query(`SELECT state, session_generation FROM identity_access WHERE identity_id = $1 FOR UPDATE`, [login]);
      const row = acc.rows[0];
      if (!row || row.state === "suspended" || row.state === "closed") {
        throw new DomainError("SESSION_INVALID", "Session non délivrée");
      }
      if (row.state !== "active") {
        await db.query(
          `UPDATE identity_access SET state = 'active', channel_verified = true, updated_at = now() WHERE identity_id = $1`,
          [login],
        );
      }
      await db.query(`INSERT INTO identity_profile (identity_id) VALUES ($1) ON CONFLICT DO NOTHING`, [login]);
      const session = issueSession({
        sessionId: randomUUID(),
        identityId: login,
        generation: Number(row.session_generation),
        now: this.now(),
        ttlSeconds: sessionTtlMs(),
      });
      await db.query(
        `INSERT INTO access_session (session_id, identity_id, generation, issued_at, expires_at) VALUES ($1,$2,$3,$4,$5)`,
        [session.sessionId, login, session.generation, new Date(session.issuedAt), new Date(session.expiresAt)],
      );
      return { sessionId: session.sessionId, expiresAt: session.expiresAt, identityId: login };
    });
  }

  async logout(headers: Record<string, unknown>): Promise<void> {
    const sid = bearerOf(headers);
    await inTx(this.pool, async (db) => {
      await sessionIdentity(db, headers, this.now());
      await db.query(`UPDATE access_session SET revoked_at = now() WHERE session_id = $1 AND revoked_at IS NULL`, [sid]);
    });
  }

  async me(headers: Record<string, unknown>): Promise<MeView> {
    return inTx(this.pool, async (db) => meOf(db, await sessionIdentity(db, headers, this.now())));
  }

  async updateMe(headers: Record<string, unknown>, patch: { displayName?: string | undefined; language?: Language | undefined }): Promise<MeView> {
    return inTx(this.pool, async (db) => {
      const id = await sessionIdentity(db, headers, this.now());
      await db.query(`INSERT INTO identity_profile (identity_id) VALUES ($1) ON CONFLICT DO NOTHING`, [id]);
      if (patch.displayName !== undefined) {
        const name = patch.displayName.trim();
        if (name.length < 1 || name.length > 80) throw new DomainError("GROUP_NAME_INVALID", "Nom de 1 à 80 caractères");
        await db.query(`UPDATE identity_profile SET display_name = $2, updated_at = now() WHERE identity_id = $1`, [id, name]);
      }
      if (patch.language !== undefined) {
        await db.query(`UPDATE identity_profile SET language = $2, updated_at = now() WHERE identity_id = $1`, [id, patch.language]);
      }
      return meOf(db, id);
    });
  }
}

export async function meOf(db: Db, identityId: string): Promise<MeView> {
  const r = await db.query(`SELECT display_name, language FROM identity_profile WHERE identity_id = $1`, [identityId]);
  return {
    identityId,
    login: identityId,
    displayName: r.rows[0]?.display_name ? String(r.rows[0].display_name) : null,
    language: (r.rows[0]?.language as Language | undefined) ?? "fr",
  };
}
