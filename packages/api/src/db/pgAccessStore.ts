/**
 * KÓMBE @kombe/api — store RÉEL (PostgreSQL) pour l'accès des comptes (C02,
 * Piste A2 suite). Même esprit que `pgContributionStore.ts` (Piste A1) :
 * TOUTE décision reste dans les fonctions pures de `@kombe/domain`
 * (`access.ts`), ce fichier ne fait que les exécuter contre des lignes
 * Postgres réelles sous verrou, et orchestrer l'envoi (frontière externe,
 * `EmailSender` injecté — jamais un envoi réel dans un script de preuve).
 *
 * Décisions humaines 2026-10-07 (voir `docs/PREUVES_PISTE_A2.md`) :
 * - vérification par CODE+hash, jamais un tokenId soumis par le client ;
 * - `sessionId` est GÉNÉRÉ PAR LE SERVEUR (haute entropie), jamais fourni
 *   par le client — contrairement au squelette fictif C00 (`sessionLogin`
 *   accepte encore un `sessionId` client pour la recette HTTP existante,
 *   volontairement non touché ici, cf. limites du commit) ;
 * - purpose `login` : lien magique par email, pas de mot de passe (D06).
 *
 * Transactions : écritures (identité déjà connue de l'appelant) via
 * `withIdentityTx` (`txContext.ts`) ; résolution de session opaque (login
 * useSession-like) via `resolveSession`/`pgSessionResolver.ts` (fonction
 * SECURITY DEFINER — bootstrap structurellement différent, voir ce fichier).
 *
 * L'envoi email a lieu APRÈS le COMMIT de la transaction d'écriture, jamais
 * à l'intérieur : un appel HTTP externe lent ne doit jamais tenir un verrou
 * ni risquer `idle_in_transaction_session_timeout`.
 */
import { randomInt, randomUUID } from "node:crypto";
import type pg from "pg";
import {
  DomainError,
  issueVerificationToken,
  verifyTokenCode,
  tokenVerificationError,
  completeRegistration,
  applyAccountRecovery,
  assertTokenApplicable,
  issueSession,
  operatorAccessFromServerState,
  type AccessAccount,
  type Channel,
  type TokenPurpose,
  type VerificationToken,
} from "@kombe/domain";
import { withIdentityTx } from "./txContext.js";
import type { EmailSender } from "../email/emailSender.js";
import type { AccessReceipt } from "../accessStore.js";

// `this.now` est `Date.now()` par défaut (MILLISECONDES) — contrairement au
// modèle fictif (`accessStore.ts`) dont l'horloge injectée est en SECONDES.
// Le paramètre `ttlSeconds` des fonctions domaine est unit-agnostique (pure
// addition à `now`) : ici il reçoit une durée en MILLISECONDES, cohérente
// avec `this.now()` — jamais les deux unités mélangées dans ce fichier.
const TOKEN_TTL_MS = 900_000; // 15 min
const SESSION_TTL_MS = 3_600_000; // 1 h
const DEFAULT_RECOVERY_SUSPENSION_SECONDS = 3600;

function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** `sessionId` haute entropie, généré SERVEUR — jamais un identifiant
 *  prévisible ou fourni par le client (contrairement au squelette fictif). */
function generateSessionId(): string {
  return randomUUID();
}

function rowToToken(row: Record<string, unknown>): VerificationToken {
  return {
    tokenId: String(row.token_id),
    identityId: String(row.identity_id),
    purpose: row.purpose as TokenPurpose,
    channel: row.channel as Channel,
    codeHash: String(row.token_hash),
    issuedAt: new Date(row.issued_at as string).getTime(),
    expiresAt: new Date(row.expires_at as string).getTime(),
    consumedAt: row.consumed_at ? new Date(row.consumed_at as string).getTime() : null,
    failedAttempts: Number(row.failed_attempts),
  };
}

export class PgAccessStore {
  constructor(
    private readonly pool: pg.Pool,
    private readonly emailSender: EmailSender,
    private readonly now: () => number = Date.now,
  ) {}

  private async issueAndStore(
    client: pg.PoolClient,
    identityId: string,
    purpose: TokenPurpose,
    channel: Channel,
    code: string,
  ): Promise<void> {
    // « Un nouveau code évince l'ancien » (commentaire 0003_access.sql) :
    // au plus un jeton non consommé par (identité, finalité) — l'index
    // partiel unique l'impose de toute façon, mais on évince explicitement
    // plutôt que de laisser échouer l'INSERT sur un conflit.
    await client.query(
      `DELETE FROM verification_token WHERE identity_id=$1 AND purpose=$2 AND consumed_at IS NULL`,
      [identityId, purpose],
    );
    const token = issueVerificationToken({
      tokenId: randomUUID(),
      identityId,
      purpose,
      channel,
      code,
      now: this.now(),
      ttlSeconds: TOKEN_TTL_MS,
    });
    await client.query(
      `INSERT INTO verification_token
         (token_id, identity_id, purpose, channel, token_hash, issued_at, expires_at, failed_attempts)
       VALUES ($1,$2,$3,$4,$5,$6,$7,0)`,
      [
        token.tokenId,
        identityId,
        token.purpose,
        token.channel,
        token.codeHash,
        new Date(token.issuedAt),
        new Date(token.expiresAt),
      ],
    );
  }

  /** Charge le jeton EN ATTENTE (non consommé) pour (identité, finalité),
   *  verrouillé pour la durée de la transaction. `null` si aucun — même
   *  réponse que « code erroné » côté appelant (non-divulgation : on ne
   *  distingue pas « pas de demande en cours » de « mauvais code »). */
  private async loadPending(
    client: pg.PoolClient,
    identityId: string,
    purpose: TokenPurpose,
  ): Promise<VerificationToken | null> {
    const res = await client.query(
      `SELECT token_id, identity_id, purpose, channel, token_hash, issued_at, expires_at, consumed_at, failed_attempts
       FROM verification_token
       WHERE identity_id=$1 AND purpose=$2 AND consumed_at IS NULL
       ORDER BY issued_at DESC LIMIT 1
       FOR UPDATE`,
      [identityId, purpose],
    );
    return res.rows[0] ? rowToToken(res.rows[0]) : null;
  }

  /**
   * Vérifie le code contre le jeton en attente, dans SA PROPRE transaction,
   * qui COMMIT TOUJOURS (jamais de throw à l'intérieur). Piège évité : si
   * cette méthode levait une erreur DANS la transaction appelante, le
   * ROLLBACK de `withIdentityTx` annulerait le compteur d'essais qu'on
   * cherche justement à rendre durable — exactement le contraire de l'effet
   * voulu. En isolant la vérification dans sa propre transaction qui
   * COMMIT quel que soit le résultat, le compteur (ou la consommation)
   * survit même quand l'appelant lève ensuite l'erreur correspondante.
   */
  private async verifyPendingDurable(
    identityId: string,
    purpose: TokenPurpose,
    code: string,
  ): Promise<ReturnType<typeof verifyTokenCode>> {
    return withIdentityTx(this.pool, identityId, async (client) => {
      const token = await this.loadPending(client, identityId, purpose);
      if (!token) return { kind: "already_used" } as const;
      const outcome = verifyTokenCode(token, code, this.now());
      if (outcome.kind === "mismatch" || outcome.kind === "locked") {
        await client.query(`UPDATE verification_token SET failed_attempts=$2 WHERE token_id=$1`, [
          token.tokenId,
          outcome.token.failedAttempts,
        ]);
      } else if (outcome.kind === "verified") {
        await client.query(`UPDATE verification_token SET consumed_at=$2 WHERE token_id=$1`, [
          token.tokenId,
          new Date(outcome.token.consumedAt as number),
        ]);
      }
      return outcome;
    });
  }

  /** Vérifie (durable, voir `verifyPendingDurable`) puis lève l'erreur stable
   *  SI non vérifié — ce `throw` est hors de toute transaction, donc rien à
   *  rollback : le compteur d'essais déjà commité reste acquis. */
  private async verifyPending(
    identityId: string,
    purpose: TokenPurpose,
    code: string,
  ): Promise<VerificationToken> {
    const outcome = await this.verifyPendingDurable(identityId, purpose, code);
    if (outcome.kind !== "verified") throw tokenVerificationError(outcome.kind);
    return outcome.token;
  }

  private async sendCode(to: string, code: string, subject: string): Promise<void> {
    try {
      await this.emailSender.send({ to, subject, text: `Votre code KÓMBE : ${code}` });
    } catch {
      throw new DomainError("EMAIL_DELIVERY_FAILED", "Envoi impossible");
    }
  }

  async requestRegistration(identityId: string, channel: Channel): Promise<AccessReceipt> {
    const code = generateCode();
    await withIdentityTx(this.pool, identityId, async (client) => {
      await client.query(`INSERT INTO identity (identity_id) VALUES ($1) ON CONFLICT DO NOTHING`, [
        identityId,
      ]);
      await client.query(
        `INSERT INTO identity_access (identity_id) VALUES ($1) ON CONFLICT (identity_id) DO NOTHING`,
        [identityId],
      );
      await this.issueAndStore(client, identityId, "registration", channel, code);
    });
    if (channel === "email") await this.sendCode(identityId, code, "Vérifiez votre compte KÓMBE");
    return { accepted: true };
  }

  async verifyRegistration(identityId: string, code: string): Promise<{ state: AccessAccount["state"] }> {
    // Phase 1 (sa propre transaction, commit toujours) : vérifie le code,
    // persiste le compteur d'essais même en échec. Throw HORS transaction.
    const verified = await this.verifyPending(identityId, "registration", code);
    // Phase 2 : effet (activation), seulement atteint si phase 1 a réussi.
    return withIdentityTx(this.pool, identityId, async (client) => {
      const accountRes = await client.query(
        `SELECT identity_id, state, channel_verified, mfa_enrolled, is_operator, session_generation, recovery_lock_until
         FROM identity_access WHERE identity_id=$1 FOR UPDATE`,
        [identityId],
      );
      if (!accountRes.rows[0]) throw new DomainError("TOKEN_INVALID", "Demande non applicable");
      const account = rowToAccount(accountRes.rows[0]);
      assertTokenApplicable(verified, identityId, "registration");
      const out = completeRegistration(account, verified);
      await client.query(
        `UPDATE identity_access SET state=$2, channel_verified=true, updated_at=now() WHERE identity_id=$1`,
        [identityId, out.account.state],
      );
      return { state: out.account.state };
    });
  }

  async requestRecovery(identityId: string): Promise<AccessReceipt> {
    const code = generateCode();
    // Anti-énumération : même réponse, compte connu ou non. L'EFFET (email
    // envoyé) ne se produit que si le compte existe — limite assumée (pas de
    // temps constant côté E/S réseau), identique au modèle fictif.
    const exists = await withIdentityTx(this.pool, identityId, async (client) => {
      const res = await client.query(`SELECT 1 FROM identity_access WHERE identity_id=$1`, [identityId]);
      if (res.rows.length === 0) return false;
      await this.issueAndStore(client, identityId, "recovery", "email", code);
      return true;
    });
    if (exists) await this.sendCode(identityId, code, "Récupération de compte KÓMBE");
    return { accepted: true };
  }

  async completeRecovery(
    identityId: string,
    code: string,
    suspensionSeconds = DEFAULT_RECOVERY_SUSPENSION_SECONDS,
  ): Promise<{ sessionGeneration: number; recoveryLockUntil: number | null }> {
    const verified = await this.verifyPending(identityId, "recovery", code);
    return withIdentityTx(this.pool, identityId, async (client) => {
      const accountRes = await client.query(
        `SELECT identity_id, state, channel_verified, mfa_enrolled, is_operator, session_generation, recovery_lock_until
         FROM identity_access WHERE identity_id=$1 FOR UPDATE`,
        [identityId],
      );
      if (!accountRes.rows[0]) throw new DomainError("TOKEN_INVALID", "Demande non applicable");
      const account = rowToAccount(accountRes.rows[0]);
      // suspensionSeconds est un contrat PUBLIC (route HTTP, secondes) ; converti
      // en millisecondes ici pour rester cohérent avec this.now() (Date.now()).
      const out = applyAccountRecovery(account, verified, this.now(), suspensionSeconds * 1000);
      await client.query(
        `UPDATE identity_access
           SET state=$2, session_generation=$3, recovery_lock_until=$4, updated_at=now()
         WHERE identity_id=$1`,
        [identityId, out.account.state, out.account.sessionGeneration, new Date(out.account.recoveryLockUntil as number)],
      );
      // Révocation en cascade des sessions antérieures : la GÉNÉRATION a
      // changé (ci-dessus) — assertSessionUsable les rejette déjà toutes
      // (resolveSession, Piste A2) ; aucune UPDATE supplémentaire requise.
      return {
        sessionGeneration: out.account.sessionGeneration,
        recoveryLockUntil: out.account.recoveryLockUntil,
      };
    });
  }

  /** Lien magique de connexion (purpose `login`) : pas de mot de passe. */
  async requestLogin(identityId: string): Promise<AccessReceipt> {
    const code = generateCode();
    const exists = await withIdentityTx(this.pool, identityId, async (client) => {
      const res = await client.query(
        `SELECT 1 FROM identity_access WHERE identity_id=$1 AND state='active'`,
        [identityId],
      );
      if (res.rows.length === 0) return false;
      await this.issueAndStore(client, identityId, "login", "email", code);
      return true;
    });
    if (exists) await this.sendCode(identityId, code, "Votre lien de connexion KÓMBE");
    return { accepted: true };
  }

  /** Vérifie le code de connexion et ISSUE UNE VRAIE SESSION : `sessionId`
   *  généré serveur (haute entropie), jamais fourni par le client. */
  async completeLogin(identityId: string, code: string): Promise<{ sessionId: string; expiresAt: number }> {
    const verified = await this.verifyPending(identityId, "login", code);
    return withIdentityTx(this.pool, identityId, async (client) => {
      const accountRes = await client.query(
        `SELECT identity_id, state, session_generation FROM identity_access WHERE identity_id=$1 FOR UPDATE`,
        [identityId],
      );
      if (!accountRes.rows[0]) throw new DomainError("SESSION_INVALID", "Session non délivrée");
      if (accountRes.rows[0].state !== "active") {
        throw new DomainError("SESSION_INVALID", "Session non délivrée");
      }
      assertTokenApplicable(verified, identityId, "login");

      const sessionId = generateSessionId();
      const session = issueSession({
        sessionId,
        identityId,
        generation: Number(accountRes.rows[0].session_generation),
        now: this.now(),
        ttlSeconds: SESSION_TTL_MS,
      });
      await client.query(
        `INSERT INTO access_session (session_id, identity_id, generation, issued_at, expires_at)
         VALUES ($1,$2,$3,$4,$5)`,
        [session.sessionId, identityId, session.generation, new Date(session.issuedAt), new Date(session.expiresAt)],
      );
      return { sessionId: session.sessionId, expiresAt: session.expiresAt };
    });
  }

  async operatorAccess(identityId: string): Promise<{ operator_access: boolean }> {
    return withIdentityTx(this.pool, identityId, async (client) => {
      const res = await client.query(`SELECT * FROM identity_access WHERE identity_id=$1`, [identityId]);
      if (!res.rows[0]) return { operator_access: false };
      return { operator_access: operatorAccessFromServerState(rowToAccount(res.rows[0]), this.now()) };
    });
  }
}

function rowToAccount(row: Record<string, unknown>): AccessAccount {
  return {
    identityId: String(row.identity_id),
    state: row.state as AccessAccount["state"],
    channelVerified: row.channel_verified === true,
    mfaEnrolled: row.mfa_enrolled === true,
    isOperator: row.is_operator === true,
    sessionGeneration: Number(row.session_generation),
    recoveryLockUntil: row.recovery_lock_until ? new Date(row.recovery_lock_until as string).getTime() : null,
  };
}
