/**
 * Store d'accès FICTIF en mémoire pour la recette du squelette C02. Il héberge
 * comptes, jetons de vérification et sessions, et délègue TOUTE décision aux
 * fonctions pures de `@kombe/domain` (access.ts). Comme le pipeline de
 * commande C00/C01, il ne prétend NI stocker durablement, NI envoyer un
 * message réel, NI verrouiller : la persistance (unicité d'usage du jeton en
 * base, révocation en cascade des sessions, RLS) est le contrat de
 * `packages/db/migrations/0003_access.sql` et sa preuve base réelle, **BLOCKED**
 * sans PostgreSQL. L'horloge est injectée (`setNow`) — la cliente n'est jamais
 * de confiance.
 */
import {
  DomainError,
  newAccount,
  issueVerificationToken,
  completeRegistration,
  issueSession,
  assertSessionUsable,
  applyAccountRecovery,
  operatorAccessFromServerState,
  type AccessAccount,
  type Channel,
  type Session,
  type VerificationToken,
} from "@kombe/domain";

const TOKEN_TTL_SECONDS = 900;
const SESSION_TTL_SECONDS = 3600;
const DEFAULT_RECOVERY_SUSPENSION_SECONDS = 3600;

export interface AccessReceipt {
  readonly accepted: true;
}

export class FictitiousAccessStore {
  private readonly accounts = new Map<string, AccessAccount>();
  private readonly tokens = new Map<string, VerificationToken>();
  private readonly tokensBySubject = new Map<string, string>();
  private readonly sessions = new Map<string, Session>();
  private now = 1_700_000_000;

  setNow(now: number): void {
    this.now = now;
  }

  /** Amorçage de test : dépose explicite d'un compte et d'un jeton. */
  seedAccount(account: AccessAccount): void {
    this.accounts.set(account.identityId, account);
  }

  seedToken(token: VerificationToken): void {
    this.tokens.set(token.tokenId, token);
    this.tokensBySubject.set(`${token.identityId}:${token.purpose}`, token.tokenId);
  }

  pendingAccount(identityId: string): AccessAccount {
    const account = newAccount(identityId);
    this.accounts.set(identityId, account);
    return account;
  }

  /**
   * Demande d'inscription : crée le compte en attente et un jeton
   * d'inscription côté serveur (remis par frontière externe). Réponse
   * **anti-énumération** : identique quel que soit l'état du canal.
   */
  requestRegistration(identityId: string, channel: Channel): AccessReceipt {
    const account = this.accounts.get(identityId) ?? this.pendingAccount(identityId);
    const token = issueVerificationToken({
      tokenId: `tok_reg_${account.identityId}`,
      identityId: account.identityId,
      purpose: "registration",
      channel,
      now: this.now,
      ttlSeconds: TOKEN_TTL_SECONDS,
    });
    this.seedToken(token);
    return { accepted: true };
  }

  verifyRegistration(identityId: string, tokenId: string): { state: AccessAccount["state"] } {
    const account = this.accounts.get(identityId);
    if (!account) throw new DomainError("TOKEN_INVALID", "Demande non applicable");
    const token = this.tokens.get(tokenId);
    if (!token) throw new DomainError("TOKEN_INVALID", "Demande non applicable");
    const out = completeRegistration(account, token, this.now);
    this.accounts.set(identityId, out.account);
    this.tokens.set(tokenId, out.token);
    return { state: out.account.state };
  }

  /**
   * Demande de récupération **anti-énumération** : un compte connu reçoit un
   * jeton (remis hors bande), un compte inconnu n'en reçoit aucun — mais la
   * RÉPONSE est identique dans les deux cas, sans divulgation.
   */
  requestRecovery(identityId: string): AccessReceipt {
    const account = this.accounts.get(identityId);
    if (account) {
      const token = issueVerificationToken({
        tokenId: `tok_rec_${account.identityId}`,
        identityId: account.identityId,
        purpose: "recovery",
        channel: "email",
        now: this.now,
        ttlSeconds: TOKEN_TTL_SECONDS,
      });
      this.seedToken(token);
    }
    return { accepted: true };
  }

  /** Lecture de contrôle indépendante : quel jeton de récupération a été émis. */
  recoveryTokenIdFor(identityId: string): string | null {
    return this.tokensBySubject.get(`${identityId}:recovery`) ?? null;
  }

  /**
   * Achève la récupération : consomme le jeton (usage unique), révoque toutes
   * les sessions antérieures (génération + 1) et suspend les privilèges. Une
   * seconde consommation lève `TOKEN_ALREADY_USED` (C02-RECOVERY).
   */
  completeRecovery(
    identityId: string,
    tokenId: string,
    suspensionSeconds = DEFAULT_RECOVERY_SUSPENSION_SECONDS,
  ): { sessionGeneration: number; recoveryLockUntil: number | null } {
    const account = this.accounts.get(identityId);
    if (!account) throw new DomainError("TOKEN_INVALID", "Demande non applicable");
    const token = this.tokens.get(tokenId);
    if (!token) throw new DomainError("TOKEN_INVALID", "Demande non applicable");
    const out = applyAccountRecovery(account, token, this.now, suspensionSeconds);
    this.accounts.set(identityId, out.account);
    this.tokens.set(tokenId, out.token);
    return {
      sessionGeneration: out.account.sessionGeneration,
      recoveryLockUntil: out.account.recoveryLockUntil,
    };
  }

  login(identityId: string, sessionId: string): { expiresAt: number } {
    const account = this.accounts.get(identityId);
    if (!account || account.state !== "active") {
      throw new DomainError("SESSION_INVALID", "Session non délivrée");
    }
    const session = issueSession({
      sessionId,
      identityId,
      generation: account.sessionGeneration,
      now: this.now,
      ttlSeconds: SESSION_TTL_SECONDS,
    });
    this.sessions.set(sessionId, session);
    return { expiresAt: session.expiresAt };
  }

  useSession(sessionId: string): { usable: true } {
    const session = this.sessions.get(sessionId);
    const account = session ? this.accounts.get(session.identityId) : undefined;
    // Non-divulgation : session inconnue et session d'un compte retiré répondent pareil.
    if (!session || !account) throw new DomainError("SESSION_INVALID", "Session non applicable");
    assertSessionUsable(account, session, this.now);
    return { usable: true };
  }

  revokeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) this.sessions.set(sessionId, { ...session, revokedAt: this.now });
  }

  /** Décision serveur (jamais depuis le jeton client) : `operator_access`. */
  operatorAccess(identityId: string): { operator_access: boolean } {
    const account = this.accounts.get(identityId);
    if (!account) return { operator_access: false };
    return { operator_access: operatorAccessFromServerState(account, this.now) };
  }
}
