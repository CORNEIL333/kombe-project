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
 *
 * Décision humaine 2026-10-07 : vérification par CODE+hash (plus par
 * `tokenId` soumis directement par le client — jamais sécurisé, voir
 * `docs/PREUVES_PISTE_A2.md`). Le code est généré ICI (impur, aléatoire) ;
 * seul son empreinte (`codeHash`, `@kombe/domain`) vit dans le jeton.
 * `lastIssuedCode` expose le code en clair UNIQUEMENT pour les tests (joue
 * le rôle de la « boîte de réception email » fictive).
 */
import { randomInt } from "node:crypto";
import {
  DomainError,
  newAccount,
  issueVerificationToken,
  verifyTokenCode,
  tokenVerificationError,
  completeRegistration,
  issueSession,
  assertSessionUsable,
  applyAccountRecovery,
  operatorAccessFromServerState,
  type AccessAccount,
  type Channel,
  type Session,
  type TokenPurpose,
  type VerificationToken,
} from "@kombe/domain";

const TOKEN_TTL_SECONDS = 900;
const SESSION_TTL_SECONDS = 3600;
const DEFAULT_RECOVERY_SUSPENSION_SECONDS = 3600;

export interface AccessReceipt {
  readonly accepted: true;
}

/** Code numérique à 6 chiffres, aléatoire — jamais Math.random (prévisible). */
function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export class FictitiousAccessStore {
  private readonly accounts = new Map<string, AccessAccount>();
  private readonly tokens = new Map<string, VerificationToken>();
  private readonly tokensBySubject = new Map<string, string>();
  /** « Boîte de réception » fictive : code en clair par (identité, finalité),
   *  pour que les tests puissent le « lire » comme un email réel le ferait.
   *  N'existe PAS côté base réelle (PgAccessStore envoie, ne retient rien). */
  private readonly issuedCodes = new Map<string, string>();
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

  private issueAndFile(identityId: string, purpose: TokenPurpose, channel: Channel): void {
    const code = generateCode();
    const token = issueVerificationToken({
      tokenId: `tok_${purpose}_${identityId}_${this.tokens.size}`,
      identityId,
      purpose,
      channel,
      code,
      now: this.now,
      ttlSeconds: TOKEN_TTL_SECONDS,
    });
    this.seedToken(token);
    this.issuedCodes.set(`${identityId}:${purpose}`, code);
  }

  /** Lecture de contrôle indépendante : code en clair « reçu par email » pour
   *  les tests (jamais exposé par une route HTTP réelle). */
  lastIssuedCode(identityId: string, purpose: TokenPurpose): string | null {
    return this.issuedCodes.get(`${identityId}:${purpose}`) ?? null;
  }

  /** Persiste l'issue d'une vérification (compteur d'essais inclus, MÊME en
   *  échec — durable, jamais réinitialisé par un redémarrage), puis lève
   *  l'erreur stable correspondante si l'issue n'est pas "verified". */
  private persistAndAssertVerified(
    token: VerificationToken,
    outcome: ReturnType<typeof verifyTokenCode>,
  ): VerificationToken {
    if (outcome.kind === "mismatch" || outcome.kind === "locked") {
      this.tokens.set(token.tokenId, outcome.token);
    }
    if (outcome.kind !== "verified") throw tokenVerificationError(outcome.kind);
    this.tokens.set(token.tokenId, outcome.token);
    return outcome.token;
  }

  /**
   * Demande d'inscription : crée le compte en attente et un jeton
   * d'inscription côté serveur (remis par frontière externe). Réponse
   * **anti-énumération** : identique quel que soit l'état du canal.
   */
  requestRegistration(identityId: string, channel: Channel): AccessReceipt {
    const account = this.accounts.get(identityId) ?? this.pendingAccount(identityId);
    this.issueAndFile(account.identityId, "registration", channel);
    return { accepted: true };
  }

  /**
   * Vérifie le CODE soumis (jamais un tokenId) : résout le jeton EN ATTENTE
   * pour (identité, finalité) — un seul actif à la fois (index partiel
   * unique en base, `0003_access.sql`). Persiste le compteur d'essais MÊME
   * EN ÉCHEC (durable, jamais réinitialisé par un redémarrage).
   */
  verifyRegistration(identityId: string, code: string): { state: AccessAccount["state"] } {
    const account = this.accounts.get(identityId);
    if (!account) throw new DomainError("TOKEN_INVALID", "Demande non applicable");
    const tokenId = this.tokensBySubject.get(`${identityId}:registration`);
    const token = tokenId ? this.tokens.get(tokenId) : undefined;
    if (!token) throw new DomainError("TOKEN_INVALID", "Demande non applicable");

    const verified = this.persistAndAssertVerified(token, verifyTokenCode(token, code, this.now));
    const out = completeRegistration(account, verified);
    this.accounts.set(identityId, out.account);
    this.tokens.set(token.tokenId, out.token);
    return { state: out.account.state };
  }

  /**
   * Demande de récupération **anti-énumération** : un compte connu reçoit un
   * jeton (remis hors bande), un compte inconnu n'en reçoit aucun — mais la
   * RÉPONSE est identique dans les deux cas, sans divulgation.
   */
  requestRecovery(identityId: string): AccessReceipt {
    const account = this.accounts.get(identityId);
    if (account) this.issueAndFile(account.identityId, "recovery", "email");
    return { accepted: true };
  }

  /** Lecture de contrôle indépendante : quel jeton de récupération a été émis. */
  recoveryTokenIdFor(identityId: string): string | null {
    return this.tokensBySubject.get(`${identityId}:recovery`) ?? null;
  }

  /**
   * Achève la récupération par CODE : consomme le jeton (usage unique),
   * révoque toutes les sessions antérieures (génération + 1) et suspend les
   * privilèges. Une seconde consommation lève `TOKEN_ALREADY_USED`
   * (C02-RECOVERY).
   */
  completeRecovery(
    identityId: string,
    code: string,
    suspensionSeconds = DEFAULT_RECOVERY_SUSPENSION_SECONDS,
  ): { sessionGeneration: number; recoveryLockUntil: number | null } {
    const account = this.accounts.get(identityId);
    if (!account) throw new DomainError("TOKEN_INVALID", "Demande non applicable");
    const tokenId = this.tokensBySubject.get(`${identityId}:recovery`);
    const token = tokenId ? this.tokens.get(tokenId) : undefined;
    if (!token) throw new DomainError("TOKEN_INVALID", "Demande non applicable");

    const verified = this.persistAndAssertVerified(token, verifyTokenCode(token, code, this.now));
    const out = applyAccountRecovery(account, verified, this.now, suspensionSeconds);
    this.accounts.set(identityId, out.account);
    this.tokens.set(token.tokenId, out.token);
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
