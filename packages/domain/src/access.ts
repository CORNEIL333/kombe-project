/**
 * Accès des comptes — inscription par canal, jetons de vérification à usage
 * unique et expirants, politique de mot de passe, sessions révocables et
 * récupération de compte (C02, stories 1.1 → 1.5).
 *
 * Logique **pure** et **horloge injectée** (`now` en secondes d'époque) :
 * aucune dépendance à la persistance ni à un fournisseur d'identité. L'envoi
 * réel d'un courriel/SMS (OTP) est une **frontière externe** (adaptateur
 * mockable, jamais un succès simulé) et le stockage durable des jetons/
 * sessions relève de la base réelle (lot C02 d'exécution, `packages/db`),
 * **BLOCKED** sans PostgreSQL. Ici ne vivent que les **décisions** — validité,
 * unicité d'usage, expiration, révocation, privilège — testables maintenant.
 *
 * Deux règles transverses du maître prompt sont honorées :
 *  - le privilège est **recalculé côté serveur** à partir de l'état du compte ;
 *    un rôle revendiqué dans un jeton (JWT) ne vaut JAMAIS autorisation
 *    (1.2 « ne pas se fier au rôle dans JWT ») ;
 *  - les réponses d'inscription/récupération sont **anti-énumération** : même
 *    gabarit que le compte existe ou non, sans divulgation (1.1, 1.4).
 */
import { DomainError } from "./errors.js";

/** Canaux d'inscription/vérification (1.1). Aucun autre canal n'est accepté. */
export const CHANNELS = ["email", "phone"] as const;
export type Channel = (typeof CHANNELS)[number];

/** États d'un compte au niveau identité (distincts des adhésions C01). */
export const ACCOUNT_STATES = [
  "pending_verification",
  "active",
  "suspended",
  "closed",
] as const;
export type AccountState = (typeof ACCOUNT_STATES)[number];

/** Finalité d'un jeton de vérification. */
export type TokenPurpose = "registration" | "recovery";

/**
 * Project de la politique de mot de passe issu de l'audit (1.2) : minimum 12
 * caractères, au moins une lettre et un chiffre, absent d'une liste de mots de
 * passe compromis. À revoir selon le mécanisme réellement retenu (fuite hors
 * du domaine ; la liste ici est **fictive**, purely for the decision path).
 */
export const PASSWORD_MIN_LENGTH = 12;
const COMPROMISED_PASSWORDS: readonly string[] = [
  "123456789012",
  "azertyuiop12",
  "motdepasse12",
];

export function assertPasswordPolicy(password: string): void {
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
    throw new DomainError("PASSWORD_TOO_WEAK", "Mot de passe trop faible");
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new DomainError("PASSWORD_TOO_WEAK", "Mot de passe trop faible");
  }
  if (COMPROMISED_PASSWORDS.includes(password)) {
    throw new DomainError("PASSWORD_COMPROMISED", "Mot de passe compromis");
  }
}

/** Jeton de vérification à usage unique et expirant (1.1 inscription, 1.4 récupération). */
export interface VerificationToken {
  readonly tokenId: string;
  readonly identityId: string;
  readonly purpose: TokenPurpose;
  readonly channel: Channel;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly consumedAt: number | null;
}

export function issueVerificationToken(input: {
  tokenId: string;
  identityId: string;
  purpose: TokenPurpose;
  channel: Channel;
  now: number;
  ttlSeconds: number;
}): VerificationToken {
  if (!Number.isInteger(input.ttlSeconds) || input.ttlSeconds < 1) {
    throw new DomainError("TOKEN_INVALID", "Durée de jeton invalide");
  }
  return {
    tokenId: input.tokenId,
    identityId: input.identityId,
    purpose: input.purpose,
    channel: input.channel,
    issuedAt: input.now,
    expiresAt: input.now + input.ttlSeconds,
    consumedAt: null,
  };
}

/**
 * Consomme un jeton : refus si déjà consommé (usage unique) ou expiré. Ne
 * modifie PAS l'original (immuable) ; renvoie une copie marquée `consumedAt`.
 * C'est le cœur de C02-RECOVERY : une seconde consommation lève
 * `TOKEN_ALREADY_USED` (donc `second_use_accepted = false`).
 */
export function consumeVerificationToken(
  token: VerificationToken,
  now: number,
): VerificationToken {
  if (token.consumedAt !== null) {
    throw new DomainError("TOKEN_ALREADY_USED", "Jeton déjà consommé");
  }
  if (now >= token.expiresAt) {
    throw new DomainError("TOKEN_EXPIRED", "Jeton expiré");
  }
  return { ...token, consumedAt: now };
}

/** Gabarit de réponse anti-énumération : identique quel que soit le cas. */
export interface UniformAccessResponse {
  readonly accepted: true;
}
function uniformResponse(): UniformAccessResponse {
  return { accepted: true };
}

/**
 * Demande de récupération **anti-énumération** : qu'une identité existe ou non,
 * la réponse est identique. Un jeton réel n'est créé QUE si le compte existe ;
 * sinon `token = null` (aucun effet, aucune divulgation), mais le client voit
 * le même gabarit (1.4).
 */
export function requestRecovery(
  account: AccessAccount | null,
  buildToken: (identityId: string) => VerificationToken,
): { token: VerificationToken | null; response: UniformAccessResponse } {
  const token = account ? buildToken(account.identityId) : null;
  return { token, response: uniformResponse() };
}

/**
 * Demande d'inscription **anti-énumération** : la réponse ne révèle pas si un
 * canal est déjà pris ; la création du jeton et son envoi sont externes
 * (frontière adaptateur, aucun message réel dans le pilote).
 */
export function requestRegistration(
  buildToken: () => VerificationToken,
): { token: VerificationToken; response: UniformAccessResponse } {
  return { token: buildToken(), response: uniformResponse() };
}

/** Session révocable. La `generation` lie la session à un instant de confiance du compte. */
export interface Session {
  readonly sessionId: string;
  readonly identityId: string;
  readonly generation: number;
  readonly issuedAt: number;
  readonly expiresAt: number;
  revokedAt: number | null;
}

export function issueSession(input: {
  sessionId: string;
  identityId: string;
  generation: number;
  now: number;
  ttlSeconds: number;
}): Session {
  if (!Number.isInteger(input.ttlSeconds) || input.ttlSeconds < 1) {
    throw new DomainError("SESSION_INVALID", "Durée de session invalide");
  }
  return {
    sessionId: input.sessionId,
    identityId: input.identityId,
    generation: input.generation,
    issuedAt: input.now,
    expiresAt: input.now + input.ttlSeconds,
    revokedAt: null,
  };
}

export function revokeSession(session: Session, now: number): Session {
  return session.revokedAt === null ? { ...session, revokedAt: now } : session;
}

/**
 * Compte d'accès (identité globale ; story 1.5 profil). Les privilèges
 * opérationnels (`isOperator`) et l'adhésion au canal sont des FAITS SERVEUR,
 * recalculés, jamais fournis par un jeton client.
 */
export interface AccessAccount {
  readonly identityId: string;
  state: AccountState;
  channelVerified: boolean;
  mfaEnrolled: boolean;
  isOperator: boolean;
  /**
   * Génération de sessions : incrémentée pour **révoquer d'office** toute
   * session antérieure (récupération, 1.4). Une session n'est valide que si sa
   * `generation` égale la génération courante du compte.
   */
  sessionGeneration: number;
  /** Suspension temporaire des privilèges après récupération (ADR-0012). */
  recoveryLockUntil: number | null;
}

export function newAccount(identityId: string): AccessAccount {
  return {
    identityId,
    state: "pending_verification",
    channelVerified: false,
    mfaEnrolled: false,
    isOperator: false,
    sessionGeneration: 1,
    recoveryLockUntil: null,
  };
}

/** Achève l'inscription : le jeton `registration`, consommé, vérifie le canal et active le compte (1.1). */
export function completeRegistration(
  account: AccessAccount,
  token: VerificationToken,
  now: number,
): { account: AccessAccount; token: VerificationToken } {
  if (token.purpose !== "registration" || token.identityId !== account.identityId) {
    throw new DomainError("TOKEN_INVALID", "Jeton non applicable à ce compte");
  }
  const consumed = consumeVerificationToken(token, now);
  return {
    account: { ...account, state: "active", channelVerified: true },
    token: consumed,
  };
}

/**
 * Une session est utilisable si le compte est actif, si la session n'est ni
 * révoquée ni expirée, et si sa génération égale la génération courante du
 * compte. Après récupération (génération incrémentée), TOUTE session antérieure
 * est rejetée → cœur de C02-SESSION (`old_session_accepted = false`).
 */
export function assertSessionUsable(
  account: AccessAccount,
  session: Session,
  now: number,
): void {
  if (account.state !== "active") {
    throw new DomainError("SESSION_INVALID", "Session non applicable");
  }
  if (session.generation !== account.sessionGeneration) {
    throw new DomainError("SESSION_INVALID", "Session révoquée");
  }
  if (session.revokedAt !== null) {
    throw new DomainError("SESSION_INVALID", "Session révoquée");
  }
  if (now >= session.expiresAt) {
    throw new DomainError("SESSION_INVALID", "Session expirée");
  }
}

export interface RecoveryResult {
  readonly account: AccessAccount;
  readonly token: VerificationToken;
  /**
   * INTENTION de notification de sécurité sur le canal vérifié (1.4). Le
   * domaine ne DELIVRE RIEN : `deliveredAt = null`. L'envoi est une frontière
   * externe (hors pilote, aucun message réel).
   */
  readonly securityNotification: {
    readonly identityId: string;
    readonly type: "account_recovery";
    readonly deliveredAt: null;
  };
}

/**
 * Récupération de compte (1.4) : consomme le jeton `recovery` (usage unique,
 * non expiré, du bon compte), **révoque toutes les sessions antérieures**
 * (génération + 1), réactive le compte et suspend temporairement les
 * privilèges jusqu'à `suspensionSeconds`. Produit une intention de
 * notification, jamais un envoi réel.
 */
export function applyAccountRecovery(
  account: AccessAccount,
  token: VerificationToken,
  now: number,
  suspensionSeconds: number,
): RecoveryResult {
  if (token.purpose !== "recovery" || token.identityId !== account.identityId) {
    throw new DomainError("TOKEN_INVALID", "Jeton non applicable à ce compte");
  }
  const consumed = consumeVerificationToken(token, now);
  const updated: AccessAccount = {
    ...account,
    state: "active",
    sessionGeneration: account.sessionGeneration + 1,
    recoveryLockUntil: now + suspensionSeconds,
  };
  return {
    account: updated,
    token: consumed,
    securityNotification: {
      identityId: account.identityId,
      type: "account_recovery",
      deliveredAt: null,
    },
  };
}

/**
 * Privilège opérateur **recalculé serveur** (C02-PRIVILEGE ; 1.2/1.3) : un
 * compte nouveau (non opérateur, canal non vérifié) ou sous suspension, ou
 * sans MFA pour les opérateurs, n'obtient PAS l'accès opérateur. Le rôle
 * revendiqué par le client est ignoré — seule l'état serveur décide.
 */
export function assertOperatorPrivilege(account: AccessAccount, now: number): void {
  if (!account.channelVerified) {
    throw new DomainError("CHANNEL_NOT_VERIFIED", "Canal non vérifié");
  }
  if (account.state !== "active") {
    throw new DomainError("PRIVILEGE_NOT_GRANTED", "Compte non actif");
  }
  if (!account.isOperator) {
    throw new DomainError("PRIVILEGE_NOT_GRANTED", "Fonction opérateur non accordée");
  }
  if (account.recoveryLockUntil !== null && now < account.recoveryLockUntil) {
    throw new DomainError("PRIVILEGE_NOT_GRANTED", "Privilèges suspendus après récupération");
  }
  if (!account.mfaEnrolled) {
    throw new DomainError("PRIVILEGE_NOT_GRANTED", "Authentification forte opérateur requise");
  }
}

/** Décision booléenne (sans lever) pour l'observation `operator_access`. */
export function operatorAccessFromServerState(
  account: AccessAccount,
  now: number,
): boolean {
  try {
    assertOperatorPrivilege(account, now);
    return true;
  } catch (e) {
    if (e instanceof DomainError) return false;
    throw e;
  }
}
