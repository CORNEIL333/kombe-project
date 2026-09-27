/**
 * Tests C02 — accès des comptes : jetons à usage unique/expirants, politique
 * de mot de passe, sessions révocables, récupération et privilège recalculé
 * serveur (logique pure, horloge injectée). La persistance durable (sessions,
 * jetons, unicité en base) relève du lot C02 d'exécution et reste BLOCKED sans
 * PostgreSQL.
 */
import { describe, expect, it } from "vitest";
import {
  DomainError,
  newAccount,
  issueVerificationToken,
  consumeVerificationToken,
  completeRegistration,
  assertPasswordPolicy,
  issueSession,
  revokeSession,
  assertSessionUsable,
  applyAccountRecovery,
  assertOperatorPrivilege,
  operatorAccessFromServerState,
  requestRecovery,
  type VerificationToken,
} from "../src/index.js";

const codes = (fn: () => unknown): string | null => {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof DomainError ? e.code : "NOT_DOMAIN";
  }
};

const T0 = 1_700_000_000; // instant fictif (horloge injectée)

const regToken = (over: Partial<VerificationToken> = {}): VerificationToken =>
  issueVerificationToken({
    tokenId: "tok_1",
    identityId: "idn_alice",
    purpose: "registration",
    channel: "email",
    now: T0,
    ttlSeconds: 900,
    ...over,
  });

describe("password policy — 1.2", () => {
  it("accepte un mot de passe long avec lettre et chiffre", () => {
    expect(codes(() => assertPasswordPolicy("bonjour-2026x"))).toBeNull();
  });
  it("refuse trop court et sans chiffre", () => {
    expect(codes(() => assertPasswordPolicy("court1"))).toBe("PASSWORD_TOO_WEAK");
    expect(codes(() => assertPasswordPolicy("sanschiffrexxxxx"))).toBe("PASSWORD_TOO_WEAK");
  });
  it("refuse un mot de passe de la liste compromise", () => {
    expect(codes(() => assertPasswordPolicy("azertyuiop12"))).toBe("PASSWORD_COMPROMISED");
  });
});

describe("verification token — usage unique et expiration (C02-RECOVERY)", () => {
  it("un jeton consommé une première fois est refusé à la seconde", () => {
    const consumed = consumeVerificationToken(regToken(), T0 + 10);
    expect(consumed.consumedAt).toBe(T0 + 10);
    // seconde utilisation → refus (second_use_accepted = false)
    expect(codes(() => consumeVerificationToken(consumed, T0 + 20))).toBe("TOKEN_ALREADY_USED");
  });
  it("un jeton expiré est refusé", () => {
    expect(codes(() => consumeVerificationToken(regToken(), T0 + 900))).toBe("TOKEN_EXPIRED");
  });
});

describe("registration — achèvement par vérification du canal (1.1)", () => {
  it("consomme le jeton d'inscription et active le compte", () => {
    const account = newAccount("idn_alice");
    const out = completeRegistration(account, regToken(), T0 + 5);
    expect(out.account.state).toBe("active");
    expect(out.account.channelVerified).toBe(true);
    expect(out.token.consumedAt).toBe(T0 + 5);
  });
  it("un jeton de mauvaise finalité ou d'autrui est refusé sans effet", () => {
    const account = newAccount("idn_alice");
    const wrongPurpose = regToken({ purpose: "recovery" });
    expect(codes(() => completeRegistration(account, wrongPurpose, T0 + 5))).toBe("TOKEN_INVALID");
    const other = regToken({ identityId: "idn_bob" });
    expect(codes(() => completeRegistration(account, other, T0 + 5))).toBe("TOKEN_INVALID");
    // absence d'effet : le compte reste en attente
    expect(account.state).toBe("pending_verification");
  });
});

describe("session — révocation par génération (C02-SESSION)", () => {
  const activeAlice = { ...newAccount("idn_alice"), state: "active" as const, channelVerified: true };
  const sess = () =>
    issueSession({
      sessionId: "ses_1",
      identityId: "idn_alice",
      generation: activeAlice.sessionGeneration,
      now: T0,
      ttlSeconds: 3600,
    });

  it("une session valide est utilisable avant expiration", () => {
    expect(codes(() => assertSessionUsable(activeAlice, sess(), T0 + 10))).toBeNull();
  });
  it("une session expirée ou révoquée est refusée", () => {
    expect(codes(() => assertSessionUsable(activeAlice, sess(), T0 + 3600))).toBe("SESSION_INVALID");
    const revoked = revokeSession(sess(), T0 + 5);
    expect(codes(() => assertSessionUsable(activeAlice, revoked, T0 + 10))).toBe("SESSION_INVALID");
  });
  it("après récupération, la session antérieure est rejetée", () => {
    const oldSession = sess();
    const recToken = issueVerificationToken({
      tokenId: "tok_rec",
      identityId: "idn_alice",
      purpose: "recovery",
      channel: "email",
      now: T0 + 100,
      ttlSeconds: 900,
    });
    const { account } = applyAccountRecovery(activeAlice, recToken, T0 + 110, 3600);
    // old_session_accepted = false
    expect(codes(() => assertSessionUsable(account, oldSession, T0 + 120))).toBe("SESSION_INVALID");
  });
});

describe("recovery — sessions toutes révoquées + suspension (1.4)", () => {
  const activeAlice = { ...newAccount("idn_alice"), state: "active" as const, channelVerified: true };
  const recToken = issueVerificationToken({
    tokenId: "tok_rec",
    identityId: "idn_alice",
    purpose: "recovery",
    channel: "email",
    now: T0,
    ttlSeconds: 900,
  });
  it("réactive le compte, incrémente la génération, suspend les privilèges", () => {
    const out = applyAccountRecovery(activeAlice, recToken, T0 + 10, 600);
    expect(out.account.sessionGeneration).toBe(activeAlice.sessionGeneration + 1);
    expect(out.account.recoveryLockUntil).toBe(T0 + 610);
    expect(out.securityNotification.deliveredAt).toBeNull();
  });
  it("deux consommations du même jeton de récupération : la seconde est refusée", () => {
    const first = applyAccountRecovery(activeAlice, recToken, T0 + 10, 600);
    expect(
      codes(() => applyAccountRecovery(first.account, first.token, T0 + 20, 600)),
    ).toBe("TOKEN_ALREADY_USED");
  });
});

describe("privilege — recalcul serveur, jamais depuis le jeton (C02-PRIVILEGE)", () => {
  it("un compte nouveau n'a pas l'accès opérateur", () => {
    const fresh = newAccount("idn_new");
    expect(operatorAccessFromServerState(fresh, T0)).toBe(false);
    expect(codes(() => assertOperatorPrivilege(fresh, T0))).toBe("CHANNEL_NOT_VERIFIED");
  });
  it("un opérateur exige canal vérifié, MFA et aucune suspension", () => {
    const opNoMfa = {
      ...newAccount("idn_op"),
      state: "active" as const,
      channelVerified: true,
      isOperator: true,
    };
    expect(codes(() => assertOperatorPrivilege(opNoMfa, T0))).toBe("PRIVILEGE_NOT_GRANTED");
    const opReady = { ...opNoMfa, mfaEnrolled: true };
    expect(operatorAccessFromServerState(opReady, T0)).toBe(true);
  });
  it("sous suspension post-récupération, l'opérateur est refusé puis accordé", () => {
    const op = {
      ...newAccount("idn_op"),
      state: "active" as const,
      channelVerified: true,
      isOperator: true,
      mfaEnrolled: true,
      recoveryLockUntil: T0 + 600,
    };
    expect(operatorAccessFromServerState(op, T0 + 10)).toBe(false);
    expect(operatorAccessFromServerState(op, T0 + 601)).toBe(true);
  });
});

describe("anti-énumération — gabarit identique, aucun effet sur compte inconnu (1.4)", () => {
  const build = (identityId: string): VerificationToken =>
    issueVerificationToken({
      tokenId: "tok_x",
      identityId,
      purpose: "recovery",
      channel: "email",
      now: T0,
      ttlSeconds: 900,
    });
  it("compte existant vs inexistant renvoient le même gabarit", () => {
    const known = requestRecovery(newAccount("idn_alice"), build);
    const unknown = requestRecovery(null, build);
    expect(known.response).toEqual(unknown.response);
    // aucun jeton créé pour un compte inconnu (pas de divulgation, pas d'effet)
    expect(unknown.token).toBeNull();
    expect(known.token).not.toBeNull();
  });
});
