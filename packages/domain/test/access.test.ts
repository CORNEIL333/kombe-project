/**
 * Tests C02 — accès des comptes : jetons à usage unique/expirants (code+hash,
 * décision humaine 2026-10-07), politique de mot de passe, sessions
 * révocables, récupération et privilège recalculé serveur (logique pure,
 * horloge injectée). La persistance durable (sessions, jetons, unicité en
 * base) relève du lot C02 d'exécution et reste BLOCKED sans PostgreSQL —
 * sauf la vérification de code elle-même, prouvée réelle en Piste A2
 * (`docs/PREUVES_PISTE_A2.md`).
 */
import { describe, expect, it } from "vitest";
import {
  DomainError,
  newAccount,
  issueVerificationToken,
  consumeVerificationToken,
  verifyTokenCode,
  tokenVerificationError,
  assertTokenApplicable,
  completeRegistration,
  assertPasswordPolicy,
  issueSession,
  revokeSession,
  assertSessionUsable,
  applyAccountRecovery,
  assertOperatorPrivilege,
  operatorAccessFromServerState,
  requestRecovery,
  MAX_TOKEN_ATTEMPTS,
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
const CODE = "123456";

const regToken = (over: Partial<Parameters<typeof issueVerificationToken>[0]> = {}): VerificationToken =>
  issueVerificationToken({
    tokenId: "tok_1",
    identityId: "idn_alice",
    purpose: "registration",
    channel: "email",
    code: CODE,
    now: T0,
    ttlSeconds: 900,
    ...over,
  });

/** Vérifie et lève immédiatement l'erreur stable si l'issue n'est pas
 *  "verified" — raccourci de test pour le chemin heureux. */
function verifyOrThrow(token: VerificationToken, submitted: string, now: number): VerificationToken {
  const outcome = verifyTokenCode(token, submitted, now);
  if (outcome.kind !== "verified") throw tokenVerificationError(outcome.kind);
  return outcome.token;
}

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

describe("verifyTokenCode — hash à temps constant, compteur durable (2026-10-07)", () => {
  it("le code correct vérifie et consomme le jeton", () => {
    const outcome = verifyTokenCode(regToken(), CODE, T0 + 5);
    expect(outcome.kind).toBe("verified");
    if (outcome.kind === "verified") {
      expect(outcome.token.consumedAt).toBe(T0 + 5);
      expect(outcome.token.failedAttempts).toBe(0);
    }
  });
  it("un code erroné incrémente le compteur d'essais SANS consommer le jeton", () => {
    const outcome = verifyTokenCode(regToken(), "000000", T0 + 5);
    expect(outcome.kind).toBe("mismatch");
    if (outcome.kind === "mismatch") {
      expect(outcome.token.failedAttempts).toBe(1);
      expect(outcome.token.consumedAt).toBeNull();
    }
    expect(codes(() => { throw tokenVerificationError("mismatch"); })).toBe("TOKEN_INVALID");
  });
  it(`après ${MAX_TOKEN_ATTEMPTS} essais erronés, le jeton se verrouille — même code que mismatch (non-divulgation)`, () => {
    let token = regToken();
    for (let i = 0; i < MAX_TOKEN_ATTEMPTS; i++) {
      const outcome = verifyTokenCode(token, "000000", T0 + 1 + i);
      expect(outcome.kind).toBe("mismatch");
      if (outcome.kind === "mismatch") token = outcome.token;
    }
    expect(token.failedAttempts).toBe(MAX_TOKEN_ATTEMPTS);
    // Même le BON code est désormais refusé — verrouillé, pas juste "faux".
    const locked = verifyTokenCode(token, CODE, T0 + 10);
    expect(locked.kind).toBe("locked");
    expect(codes(() => { throw tokenVerificationError("locked"); })).toBe("TOKEN_INVALID");
  });
  it("un jeton déjà consommé ou expiré est détecté avant même de comparer le code", () => {
    const consumed = verifyOrThrow(regToken(), CODE, T0 + 5);
    expect(verifyTokenCode(consumed, CODE, T0 + 6).kind).toBe("already_used");
    expect(verifyTokenCode(regToken(), CODE, T0 + 900).kind).toBe("expired");
  });
});

describe("assertTokenApplicable — précondition de routage, indépendante du code", () => {
  it("refuse une mauvaise finalité ou un jeton d'autrui, sans toucher aux essais", () => {
    expect(codes(() => assertTokenApplicable(regToken({ purpose: "recovery" }), "idn_alice", "registration"))).toBe(
      "TOKEN_INVALID",
    );
    expect(
      codes(() => assertTokenApplicable(regToken({ identityId: "idn_bob" }), "idn_alice", "registration")),
    ).toBe("TOKEN_INVALID");
  });
});

describe("registration — achèvement par vérification du canal (1.1)", () => {
  it("vérifie le code, consomme le jeton d'inscription et active le compte", () => {
    const account = newAccount("idn_alice");
    const verified = verifyOrThrow(regToken(), CODE, T0 + 5);
    const out = completeRegistration(account, verified);
    expect(out.account.state).toBe("active");
    expect(out.account.channelVerified).toBe(true);
    expect(out.token.consumedAt).toBe(T0 + 5);
  });
  it("un jeton de mauvaise finalité ou d'autrui est refusé sans effet", () => {
    const account = newAccount("idn_alice");
    const wrongPurpose = regToken({ purpose: "recovery" });
    expect(codes(() => completeRegistration(account, wrongPurpose))).toBe("TOKEN_INVALID");
    const other = regToken({ identityId: "idn_bob" });
    expect(codes(() => completeRegistration(account, other))).toBe("TOKEN_INVALID");
    // absence d'effet : le compte reste en attente
    expect(account.state).toBe("pending_verification");
  });
});

describe("login — lien magique, même mécanique (purpose 'login', 2026-10-07)", () => {
  it("un jeton login se vérifie comme les autres finalités, sans effet de compte", () => {
    const loginToken = issueVerificationToken({
      tokenId: "tok_login",
      identityId: "idn_alice",
      purpose: "login",
      channel: "email",
      code: CODE,
      now: T0,
      ttlSeconds: 900,
    });
    const verified = verifyOrThrow(loginToken, CODE, T0 + 5);
    expect(verified.purpose).toBe("login");
    expect(codes(() => assertTokenApplicable(verified, "idn_alice", "login"))).toBeNull();
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
      code: CODE,
      now: T0 + 100,
      ttlSeconds: 900,
    });
    const verified = verifyOrThrow(recToken, CODE, T0 + 110);
    const { account } = applyAccountRecovery(activeAlice, verified, T0 + 110, 3600);
    // old_session_accepted = false
    expect(codes(() => assertSessionUsable(account, oldSession, T0 + 120))).toBe("SESSION_INVALID");
  });
});

describe("recovery — sessions toutes révoquées + suspension (1.4)", () => {
  const activeAlice = { ...newAccount("idn_alice"), state: "active" as const, channelVerified: true };
  const freshRecToken = () =>
    issueVerificationToken({
      tokenId: "tok_rec",
      identityId: "idn_alice",
      purpose: "recovery",
      channel: "email",
      code: CODE,
      now: T0,
      ttlSeconds: 900,
    });
  it("réactive le compte, incrémente la génération, suspend les privilèges", () => {
    const verified = verifyOrThrow(freshRecToken(), CODE, T0 + 10);
    const out = applyAccountRecovery(activeAlice, verified, T0 + 10, 600);
    expect(out.account.sessionGeneration).toBe(activeAlice.sessionGeneration + 1);
    expect(out.account.recoveryLockUntil).toBe(T0 + 610);
    expect(out.securityNotification.deliveredAt).toBeNull();
  });
  it("deux consommations du même jeton de récupération : la seconde est refusée", () => {
    const token = freshRecToken();
    const verified = verifyOrThrow(token, CODE, T0 + 10);
    applyAccountRecovery(activeAlice, verified, T0 + 10, 600);
    // Rejouer la vérification sur le MÊME jeton (déjà consommé) → refus.
    expect(verifyTokenCode(verified, CODE, T0 + 20).kind).toBe("already_used");
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
      code: CODE,
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
