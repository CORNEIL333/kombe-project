/**
 * Accès des opérateurs de la plateforme (ADR-0043) : fonctions distinctes et
 * second facteur TOTP.
 *
 * - Fonctions : `support` (accès JIT), `operations` (console d'exploitation),
 *   `direction` (pilotage), `engineering` (santé technique), `admin` (tout).
 *   Un simple « est opérateur » ne suffit plus.
 * - Second facteur : TOTP RFC 6238 (SHA-1, 30 s, 6 chiffres, ±1 pas), secret
 *   chiffré AES-256-GCM avec `KOMBE_MFA_KEY` (hors base), anti-rejeu par pas,
 *   10 codes de secours à usage unique (empreintes HMAC). La session est
 *   « élevée » 12 h après vérification.
 * - Politique : `KOMBE_OPERATOR_MFA=off` n'est accepté QU'HORS production.
 *   En production sans `KOMBE_MFA_KEY`, l'accès opérateur est refusé (fail
 *   closed) — jamais ouvert faute de configuration.
 * - Tout refus est journalisé dans `operator_audit_log` dans une transaction
 *   distincte (durable malgré le 403).
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type pg from "pg";
import { DomainError } from "@kombe/domain";
import { bearerOf, inTx, sessionIdentity, type Db } from "../tontine/infra.js";

export const OPERATOR_ROLES = ["support", "operations", "direction", "engineering", "admin"] as const;
export type OperatorRole = (typeof OPERATOR_ROLES)[number];

const STEP_SECONDS = 30;
const DIGITS = 6;
export const MFA_SESSION_HOURS = 12;

/* ── Base32 (RFC 4648, sans remplissage) ─────────────────────────────── */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/* ── TOTP (RFC 6238 / RFC 4226) ──────────────────────────────────────── */

export function hotp(secret: Buffer, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", secret).update(msg).digest();
  const off = (h[h.length - 1] as number) & 0x0f;
  const bin = (((h[off] as number) & 0x7f) << 24) | ((h[off + 1] as number) << 16) | ((h[off + 2] as number) << 8) | (h[off + 3] as number);
  return String(bin % 10 ** DIGITS).padStart(DIGITS, "0");
}

export function totpAt(secret: Buffer, nowMs: number): string {
  return hotp(secret, Math.floor(nowMs / 1000 / STEP_SECONDS));
}

/** Pas TOTP accepté (±1 pas de dérive), ou null. Refuse un pas déjà utilisé (rejeu). */
export function verifyTotp(secret: Buffer, code: string, nowMs: number, lastStep: number | null): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const now = Math.floor(nowMs / 1000 / STEP_SECONDS);
  for (const step of [now, now - 1, now + 1]) {
    if (lastStep !== null && step <= lastStep) continue;
    const expected = Buffer.from(hotp(secret, step));
    if (timingSafeEqual(expected, Buffer.from(code))) return step;
  }
  return null;
}

/* ── Chiffrement du secret ───────────────────────────────────────────── */

function isProduction(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "production" || env.VERCEL_ENV === "production";
}

function mfaKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const raw = env.KOMBE_MFA_KEY?.trim();
  if (raw) {
    const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
    if (key.length === 32) return key;
    throw new DomainError("PRIVILEGE_NOT_GRANTED", "Configuration du second facteur invalide");
  }
  if (isProduction(env)) throw new DomainError("PRIVILEGE_NOT_GRANTED", "Second facteur non configuré sur ce déploiement");
  // Hors production uniquement : clé de développement déterministe.
  return createHash("sha256").update("kombe-dev-mfa-key-not-for-production").digest();
}

export function sealSecret(secret: Buffer, env: NodeJS.ProcessEnv = process.env): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", mfaKey(env), iv);
  const ct = Buffer.concat([c.update(secret), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), ct.toString("base64")].join(".");
}

export function openSecret(sealed: string, env: NodeJS.ProcessEnv = process.env): Buffer {
  const [v, iv, tag, ct] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new DomainError("PRIVILEGE_NOT_GRANTED", "Second facteur illisible");
  const d = createDecipheriv("aes-256-gcm", mfaKey(env), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]);
}

function recoveryHash(code: string, env: NodeJS.ProcessEnv = process.env): string {
  return createHmac("sha256", mfaKey(env)).update(code.replace(/[^A-Z0-9]/gi, "").toUpperCase()).digest("hex");
}

export function mfaRequired(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.KOMBE_OPERATOR_MFA === "off" && !isProduction(env)) return false;
  return true;
}

/* ── Statut et porte d'accès ─────────────────────────────────────────── */

export interface OperatorStatus {
  readonly identityId: string;
  readonly operator: boolean;
  readonly roles: readonly OperatorRole[];
  readonly mfa: { readonly required: boolean; readonly enrolled: boolean; readonly verified: boolean };
}

export async function operatorStatus(db: Db, headers: Record<string, unknown>, nowMs: number): Promise<OperatorStatus> {
  const identityId = await sessionIdentity(db, headers, nowMs);
  const r = await db.query("SELECT * FROM kombe_operator_status($1)", [bearerOf(headers)]);
  const row = r.rows[0] ?? {};
  const verifiedAt = row.mfa_verified_at ? new Date(row.mfa_verified_at as string).getTime() : null;
  return {
    identityId,
    operator: row.is_operator === true,
    roles: ((row.roles as string[] | null) ?? []).filter((x): x is OperatorRole => (OPERATOR_ROLES as readonly string[]).includes(x)),
    mfa: {
      required: mfaRequired(),
      enrolled: row.mfa_enabled === true,
      verified: verifiedAt !== null && nowMs - verifiedAt < MFA_SESSION_HOURS * 3_600_000,
    },
  };
}

async function audit(pool: pg.Pool, headers: Record<string, unknown>, nowMs: number, event: string, detail: string): Promise<void> {
  try {
    await inTx(pool, async (db) => {
      const id = await sessionIdentity(db, headers, nowMs);
      await db.query(`INSERT INTO operator_audit_log (identity_id, event_type, detail) VALUES ($1,$2,$3)`, [id, event, detail.slice(0, 200)]);
    });
  } catch {
    /* une trace manquée ne change jamais la décision */
  }
}

/**
 * Exige un opérateur actif tenant l'une des fonctions demandées (ou `admin`),
 * avec second facteur vérifié dans cette session. Refus → 403 typé :
 * `PRIVILEGE_NOT_GRANTED` (pas opérateur / pas la fonction) ou
 * `OPERATOR_MFA_REQUIRED` (à inscrire ou à vérifier), journalisé durablement.
 */
export async function assertOperator(
  pool: pg.Pool,
  headers: Record<string, unknown>,
  nowMs: number,
  roles: readonly OperatorRole[],
): Promise<string> {
  const st = await inTx(pool, (db) => operatorStatus(db, headers, nowMs));
  let refus: DomainError | null = null;
  if (!st.operator) refus = new DomainError("PRIVILEGE_NOT_GRANTED", "Réservé aux opérateurs de la plateforme");
  else if (!st.roles.includes("admin") && !roles.some((x) => st.roles.includes(x))) {
    refus = new DomainError("PRIVILEGE_NOT_GRANTED", "Cette console demande une autre fonction d'opérateur");
  } else if (st.mfa.required && !(st.mfa.enrolled && st.mfa.verified)) {
    refus = new DomainError("OPERATOR_MFA_REQUIRED", st.mfa.enrolled ? "Code du second facteur requis" : "Second facteur à activer");
  }
  if (refus) {
    if (st.operator) await audit(pool, headers, nowMs, "console_denied", `${roles.join("|")} : ${refus.code}`);
    throw refus;
  }
  return st.identityId;
}

/* ── Inscription, activation, vérification ───────────────────────────── */

export async function enrollMfa(pool: pg.Pool, headers: Record<string, unknown>, nowMs: number): Promise<{ secret: string; otpauthUri: string }> {
  const out = await inTx(pool, async (db) => {
    const st = await operatorStatus(db, headers, nowMs);
    if (!st.operator) throw new DomainError("PRIVILEGE_NOT_GRANTED", "Réservé aux opérateurs de la plateforme");
    // Réinscrire un facteur déjà actif exige d'abord une session vérifiée.
    if (st.mfa.enrolled && !st.mfa.verified) throw new DomainError("OPERATOR_MFA_REQUIRED", "Vérifiez d'abord le facteur actuel");
    const secret = randomBytes(20);
    await db.query(
      `INSERT INTO operator_mfa (identity_id, secret_ciphertext, enabled_at, last_step, recovery_hashes, updated_at)
       VALUES ($1,$2,NULL,NULL,'{}',now())
       ON CONFLICT (identity_id) DO UPDATE SET secret_ciphertext = EXCLUDED.secret_ciphertext, enabled_at = NULL, last_step = NULL, recovery_hashes = '{}', updated_at = now()`,
      [st.identityId, sealSecret(secret)],
    );
    const b32 = base32Encode(secret);
    const label = encodeURIComponent(`KÓMBE:${st.identityId}`);
    return { secret: b32, otpauthUri: `otpauth://totp/${label}?secret=${b32}&issuer=K%C3%93MBE&algorithm=SHA1&digits=6&period=30` };
  });
  await audit(pool, headers, nowMs, "mfa_enrolled", "");
  return out;
}

/** Second facteur : au plus 5 ÉCHECS par 10 minutes et par opérateur (les succès ne comptent pas). */
async function mfaAttemptAllowed(db: Db, key: string, nowMs: number): Promise<boolean> {
  const r = await db.query("SELECT kombe_rate_peek($1, 600, 5, $2) AS ok", [key, new Date(nowMs)]);
  return r.rows[0]?.ok === true;
}
async function mfaFailure(db: Db, key: string, nowMs: number): Promise<void> {
  await db.query("SELECT kombe_rate_hit($1, 600, 5, $2)", [key, new Date(nowMs)]);
}

/** Active le facteur avec un premier code ; renvoie 10 codes de secours (affichés UNE fois). */
export async function activateMfa(pool: pg.Pool, headers: Record<string, unknown>, nowMs: number, code: string): Promise<{ recoveryCodes: string[] }> {
  let failed = false;
  const out = await inTx(pool, async (db) => {
    const st = await operatorStatus(db, headers, nowMs);
    if (!st.operator) throw new DomainError("PRIVILEGE_NOT_GRANTED", "Réservé aux opérateurs de la plateforme");
    if (!(await mfaAttemptAllowed(db, `mfa:${st.identityId}`, nowMs))) throw new DomainError("AUTH_THROTTLED", "Trop d'essais : patientez quelques minutes");
    const m = await db.query(`SELECT secret_ciphertext, enabled_at FROM operator_mfa WHERE identity_id = $1 FOR UPDATE`, [st.identityId]);
    const row = m.rows[0];
    if (!row || row.enabled_at) throw new DomainError("STATE_CONFLICT", "Aucune inscription en attente");
    const step = verifyTotp(openSecret(String(row.secret_ciphertext)), code, nowMs, null);
    if (step === null) {
      failed = true;
      await mfaFailure(db, `mfa:${st.identityId}`, nowMs);
      return null;
    }
    const codes = Array.from({ length: 10 }, () => base32Encode(randomBytes(6)).slice(0, 10));
    await db.query(`UPDATE operator_mfa SET enabled_at = now(), last_step = $2, recovery_hashes = $3, updated_at = now() WHERE identity_id = $1`, [
      st.identityId,
      step,
      codes.map((c) => recoveryHash(c)),
    ]);
    await db.query(`UPDATE access_session SET mfa_verified_at = $2 WHERE session_id = $1`, [bearerOf(headers), new Date(nowMs)]);
    return { recoveryCodes: codes };
  });
  if (failed || !out) {
    await audit(pool, headers, nowMs, "mfa_failed", "activation");
    throw new DomainError("TOKEN_INVALID", "Code incorrect");
  }
  await audit(pool, headers, nowMs, "mfa_enabled", "");
  return out;
}

/** Vérifie un code TOTP (ou un code de secours) et élève la session 12 h. */
export async function verifyMfa(
  pool: pg.Pool,
  headers: Record<string, unknown>,
  nowMs: number,
  input: { code?: string | undefined; recoveryCode?: string | undefined },
): Promise<{ verifiedUntil: string }> {
  let outcome: "ok" | "recovery" | "failed" = "failed";
  const until = new Date(nowMs + MFA_SESSION_HOURS * 3_600_000).toISOString();
  await inTx(pool, async (db) => {
    const st = await operatorStatus(db, headers, nowMs);
    if (!st.operator) throw new DomainError("PRIVILEGE_NOT_GRANTED", "Réservé aux opérateurs de la plateforme");
    if (!(await mfaAttemptAllowed(db, `mfa:${st.identityId}`, nowMs))) throw new DomainError("AUTH_THROTTLED", "Trop d'essais : patientez quelques minutes");
    const m = await db.query(`SELECT secret_ciphertext, enabled_at, last_step, recovery_hashes FROM operator_mfa WHERE identity_id = $1 FOR UPDATE`, [st.identityId]);
    const row = m.rows[0];
    if (!row?.enabled_at) throw new DomainError("OPERATOR_MFA_REQUIRED", "Second facteur à activer");
    if (input.code) {
      const step = verifyTotp(openSecret(String(row.secret_ciphertext)), input.code, nowMs, row.last_step === null ? null : Number(row.last_step));
      if (step === null) return mfaFailure(db, `mfa:${st.identityId}`, nowMs);
      await db.query(`UPDATE operator_mfa SET last_step = $2, updated_at = now() WHERE identity_id = $1`, [st.identityId, step]);
      outcome = "ok";
    } else if (input.recoveryCode) {
      const h = recoveryHash(input.recoveryCode);
      const left = (row.recovery_hashes as string[]).filter((x) => x !== h);
      if (left.length === (row.recovery_hashes as string[]).length) return mfaFailure(db, `mfa:${st.identityId}`, nowMs);
      await db.query(`UPDATE operator_mfa SET recovery_hashes = $2, updated_at = now() WHERE identity_id = $1`, [st.identityId, left]);
      outcome = "recovery";
    } else return mfaFailure(db, `mfa:${st.identityId}`, nowMs);
    await db.query(`UPDATE access_session SET mfa_verified_at = $2 WHERE session_id = $1`, [bearerOf(headers), new Date(nowMs)]);
  });
  if (outcome === "failed") {
    await audit(pool, headers, nowMs, "mfa_failed", "verification");
    throw new DomainError("TOKEN_INVALID", "Code incorrect");
  }
  await audit(pool, headers, nowMs, outcome === "recovery" ? "mfa_recovery_used" : "mfa_verified", "");
  return { verifiedUntil: until };
}
