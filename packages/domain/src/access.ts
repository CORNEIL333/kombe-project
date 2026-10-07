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
import { createHash, timingSafeEqual } from "node:crypto";
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

/** Finalité d'un jeton de vérification. `login` : lien magique de connexion
 *  (décision humaine 2026-10-07, D06 jugé non nécessaire — pas de mot de
 *  passe à gérer), même mécanique que registration/recovery. */
export type TokenPurpose = "registration" | "recovery" | "login";

/** Nombre d'essais de code erronés tolérés avant verrouillage du jeton
 *  (anti brute-force : un code à 6 chiffres n'a que 10^6 possibilités). */
export const MAX_TOKEN_ATTEMPTS = 5;

/** Empreinte déterministe d'un code de vérification. Jamais le code en
 *  clair n'est stocké (contrat déjà posé par `packages/db/migrations/
 *  0003_access.sql`, colonne `token_hash` — resté inexploité jusqu'ici). */
export function hashVerificationCode(code: string): string {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

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

/** Jeton de vérification à usage unique et expirant (1.1 inscription, 1.4
 *  récupération, login). `codeHash` : empreinte du code envoyé hors bande
 *  (email) — jamais le code lui-même. `failedAttempts` : compteur durable
 *  d'essais erronés (verrouillage après `MAX_TOKEN_ATTEMPTS`). */
export interface VerificationToken {
  readonly tokenId: string;
  readonly identityId: string;
  readonly purpose: TokenPurpose;
  readonly channel: Channel;
  readonly codeHash: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly consumedAt: number | null;
  readonly failedAttempts: number;
}

export function issueVerificationToken(input: {
  tokenId: string;
  identityId: string;
  purpose: TokenPurpose;
  channel: Channel;
  /** Code en clair, généré par l'appelant (aléatoire, hors de ce module
   *  pur — la génération n'est jamais testable/déterministe). Haché ici,
   *  jamais retourné ni stocké en clair. */
  code: string;
  now: number;
  ttlSeconds: number;
}): VerificationToken {
  if (!Number.isInteger(input.ttlSeconds) || input.ttlSeconds < 1) {
    throw new DomainError("TOKEN_INVALID", "Durée de jeton invalide");
  }
  if (!input.code || input.code.length < 4) {
    throw new DomainError("TOKEN_INVALID", "Code invalide");
  }
  return {
    tokenId: input.tokenId,
    identityId: input.identityId,
    purpose: input.purpose,
    channel: input.channel,
    codeHash: hashVerificationCode(input.code),
    issuedAt: input.now,
    expiresAt: input.now + input.ttlSeconds,
    consumedAt: null,
    failedAttempts: 0,
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

/** Décision de vérification d'un code soumis — jamais un `throw` direct :
 *  le compteur d'essais (cas `mismatch`) doit être persisté par l'appelant
 *  MÊME EN ÉCHEC (durable, jamais réinitialisé par un redémarrage), donc la
 *  décision ET la donnée à persister voyagent ensemble. */
export type TokenVerificationOutcome =
  | { readonly kind: "verified"; readonly token: VerificationToken }
  | { readonly kind: "mismatch"; readonly token: VerificationToken }
  | { readonly kind: "locked"; readonly token: VerificationToken }
  | { readonly kind: "expired" }
  | { readonly kind: "already_used" };

/**
 * Vérifie un code soumis contre `token.codeHash` (comparaison à temps
 * constant, `timingSafeEqual` — jamais une comparaison de chaînes naïve qui
 * fuiterait la position du premier caractère différent). Verrouille après
 * `MAX_TOKEN_ATTEMPTS` échecs (même réponse `TOKEN_INVALID` que `mismatch` :
 * non-divulgation, un attaquant ne doit pas distinguer "encore un essai" de
 * "verrouillé"). Ne lève JAMAIS — voir `TokenVerificationOutcome`.
 */
export function verifyTokenCode(
  token: VerificationToken,
  submittedCode: string,
  now: number,
): TokenVerificationOutcome {
  if (token.consumedAt !== null) return { kind: "already_used" };
  if (now >= token.expiresAt) return { kind: "expired" };
  if (token.failedAttempts >= MAX_TOKEN_ATTEMPTS) return { kind: "locked", token };

  const submittedHash = hashVerificationCode(submittedCode ?? "");
  const submittedBuf = Buffer.from(submittedHash, "hex");
  const storedBuf = Buffer.from(token.codeHash, "hex");
  const matches =
    submittedBuf.length === storedBuf.length && timingSafeEqual(submittedBuf, storedBuf);

  if (!matches) {
    return { kind: "mismatch", token: { ...token, failedAttempts: token.failedAttempts + 1 } };
  }
  return { kind: "verified", token: consumeVerificationToken(token, now) };
}

/** Mappe une issue NON `verified` vers l'erreur stable correspondante —
 *  centralisé ici pour que le store n'ait jamais à dupliquer les codes. */
export function tokenVerificationError(
  kind: Exclude<TokenVerificationOutcome["kind"], "verified">,
): DomainError {
  switch (kind) {
    case "already_used":
      return new DomainError("TOKEN_ALREADY_USED", "Jeton déjà consommé");
    case "expired":
      return new DomainError("TOKEN_EXPIRED", "Jeton expiré");
    case "mismatch":
    case "locked":
      // Non-divulgation : code erroné et jeton verrouillé répondent à l'identique.
      return new DomainError("TOKEN_INVALID", "Code invalide");
  }
}

/** Précondition structurelle (indépendante du code soumis) : le jeton doit
 *  être du bon `purpose` et du bon compte. Une incohérence ici est une
 *  erreur de routage applicatif (mauvaise ligne sélectionnée), jamais un
 *  essai de code à comptabiliser — vérifiée à part, avant `verifyTokenCode`. */
export function assertTokenApplicable(
  token: VerificationToken,
  identityId: string,
  purpose: TokenPurpose,
): void {
  if (token.purpose !== purpose || token.identityId !== identityId) {
    throw new DomainError("TOKEN_INVALID", "Jeton non applicable à ce compte");
  }
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

/**
 * Achève l'inscription : prend un jeton DÉJÀ VÉRIFIÉ (`verifyTokenCode` →
 * `kind: "verified"`, consommé par cette fonction), active le compte et
 * vérifie le canal (1.1). Le code soumis n'est plus un paramètre ici — la
 * vérification du code est la responsabilité de `verifyTokenCode`, en
 * amont, dont le store persiste le résultat (compteur d'essais y compris)
 * avant même d'appeler cette fonction.
 */
export function completeRegistration(
  account: AccessAccount,
  verifiedToken: VerificationToken,
): { account: AccessAccount; token: VerificationToken } {
  assertTokenApplicable(verifiedToken, account.identityId, "registration");
  return {
    account: { ...account, state: "active", channelVerified: true },
    token: verifiedToken,
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
 * Récupération de compte (1.4) : prend un jeton `recovery` DÉJÀ VÉRIFIÉ
 * (voir `completeRegistration`), **révoque toutes les sessions antérieures**
 * (génération + 1), réactive le compte et suspend temporairement les
 * privilèges jusqu'à `suspensionSeconds`. Produit une intention de
 * notification, jamais un envoi réel.
 */
export function applyAccountRecovery(
  account: AccessAccount,
  verifiedToken: VerificationToken,
  now: number,
  suspensionSeconds: number,
): RecoveryResult {
  assertTokenApplicable(verifiedToken, account.identityId, "recovery");
  const updated: AccessAccount = {
    ...account,
    state: "active",
    sessionGeneration: account.sessionGeneration + 1,
    recoveryLockUntil: now + suspensionSeconds,
  };
  return {
    account: updated,
    token: verifiedToken,
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
