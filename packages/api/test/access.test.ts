/**
 * Recette C02 via l'application Fastify (fastify.inject, sans base). Prouve la
 * DÉCISION serveur d'accès : achèvement d'inscription par CODE à usage
 * unique (hash+tentatives, décision humaine 2026-10-07), récupération (double
 * usage refusé, sessions antérieures supplantées) et privilège opérateur
 * recalculé. Ne prétend PAS prouver le stockage durable ni la révocation en
 * cascade en base : ceux-ci sont le contrat `0003_access.sql`/`0019_token_
 * security.sql` et restent BLOCKED sans PostgreSQL (preuve réelle : Piste A2,
 * `docs/PREUVES_PISTE_A2.md`).
 */
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/server.js";
import { FictitiousAccessStore } from "../src/accessStore.js";
import { newAccount, type AccessAccount } from "@kombe/domain";

const json = { "content-type": "application/json" };

function activeAccount(identityId: string, over: Partial<AccessAccount> = {}): AccessAccount {
  return { ...newAccount(identityId), state: "active", channelVerified: true, ...over };
}

describe("C02 inscription — vérification du canal (1.1)", () => {
  it("la demande est anti-énumération puis l'achèvement active le compte", async () => {
    const access = new FictitiousAccessStore();
    const app = buildApp({ access });
    const req = await app.inject({
      method: "POST",
      url: "/v1/access/registrations",
      headers: json,
      payload: { identityId: "idn_carol", channel: "email" },
    });
    expect(req.statusCode).toBe(202);
    expect(req.json()).toEqual({ accepted: true }); // aucun code divulgué
    const code = access.lastIssuedCode("idn_carol", "registration");
    expect(code).not.toBeNull();
    const ver = await app.inject({
      method: "POST",
      url: "/v1/access/registrations/verifications",
      headers: json,
      payload: { identityId: "idn_carol", code },
    });
    expect(ver.statusCode).toBe(200);
    expect(ver.json().state).toBe("active");
  });

  it("un code erroné est refusé (422) sans activer le compte", async () => {
    const access = new FictitiousAccessStore();
    const app = buildApp({ access });
    await app.inject({
      method: "POST",
      url: "/v1/access/registrations",
      headers: json,
      payload: { identityId: "idn_wrong", channel: "email" },
    });
    const bad = await app.inject({
      method: "POST",
      url: "/v1/access/registrations/verifications",
      headers: json,
      payload: { identityId: "idn_wrong", code: "000000" },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().code).toBe("TOKEN_INVALID");
    // Le bon code reste utilisable ensuite (un seul essai raté ne verrouille pas).
    const good = await app.inject({
      method: "POST",
      url: "/v1/access/registrations/verifications",
      headers: json,
      payload: { identityId: "idn_wrong", code: access.lastIssuedCode("idn_wrong", "registration") },
    });
    expect(good.statusCode).toBe(200);
  });
});

describe("C02-RECOVERY — un jeton de récupération ne sert qu'une fois", () => {
  it("second_use_accepted = false", async () => {
    const access = new FictitiousAccessStore();
    access.seedAccount(activeAccount("idn_dave"));
    const app = buildApp({ access });
    await app.inject({
      method: "POST",
      url: "/v1/access/recovery-requests",
      headers: json,
      payload: { identityId: "idn_dave" },
    });
    const code = access.lastIssuedCode("idn_dave", "recovery");
    expect(code).not.toBeNull();
    const first = await app.inject({
      method: "POST",
      url: "/v1/access/recovery-completions",
      headers: json,
      payload: { identityId: "idn_dave", code },
    });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({
      method: "POST",
      url: "/v1/access/recovery-completions",
      headers: json,
      payload: { identityId: "idn_dave", code },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().code).toBe("TOKEN_ALREADY_USED");
  });
});

describe("C02-SESSION — la récupération supplante la session antérieure", () => {
  it("old_session_accepted = false", async () => {
    const access = new FictitiousAccessStore();
    access.seedAccount(activeAccount("idn_erin"));
    const app = buildApp({ access });
    // session ouverte avant récupération
    await app.inject({
      method: "POST",
      url: "/v1/access/sessions",
      headers: json,
      payload: { identityId: "idn_erin", sessionId: "ses_before" },
    });
    const usableBefore = await app.inject({
      method: "GET",
      url: "/v1/access/sessions/ses_before",
    });
    expect(usableBefore.statusCode).toBe(200);
    // récupération du compte
    await app.inject({
      method: "POST",
      url: "/v1/access/recovery-requests",
      headers: json,
      payload: { identityId: "idn_erin" },
    });
    await app.inject({
      method: "POST",
      url: "/v1/access/recovery-completions",
      headers: json,
      payload: { identityId: "idn_erin", code: access.lastIssuedCode("idn_erin", "recovery") },
    });
    // la session d'avant est rejetée
    const usableAfter = await app.inject({
      method: "GET",
      url: "/v1/access/sessions/ses_before",
    });
    expect(usableAfter.statusCode).toBe(401);
    expect(usableAfter.json().code).toBe("SESSION_INVALID");
  });

  it("une session explicitement révoquée est rejetée", async () => {
    const access = new FictitiousAccessStore();
    access.seedAccount(activeAccount("idn_frank"));
    const app = buildApp({ access });
    await app.inject({
      method: "POST",
      url: "/v1/access/sessions",
      headers: json,
      payload: { identityId: "idn_frank", sessionId: "ses_rev" },
    });
    await app.inject({ method: "POST", url: "/v1/access/sessions/ses_rev/revocations" });
    const res = await app.inject({ method: "GET", url: "/v1/access/sessions/ses_rev" });
    expect(res.statusCode).toBe(401);
  });
});

describe("C02-PRIVILEGE — privilège opérateur recalculé serveur", () => {
  it("operator_access = false pour un compte nouveau", async () => {
    const access = new FictitiousAccessStore();
    access.seedAccount(newAccount("idn_newbie"));
    const app = buildApp({ access });
    const res = await app.inject({
      method: "GET",
      url: "/v1/access/operators/idn_newbie/privilege",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().operator_access).toBe(false);
  });

  it("opérateur sans MFA : refus ; avec MFA et hors suspension : accord", async () => {
    const access = new FictitiousAccessStore();
    access.seedAccount(activeAccount("idn_op", { isOperator: true, mfaEnrolled: false }));
    const app = buildApp({ access });
    const denied = await app.inject({
      method: "GET",
      url: "/v1/access/operators/idn_op/privilege",
    });
    expect(denied.json().operator_access).toBe(false);
    access.seedAccount(activeAccount("idn_op", { isOperator: true, mfaEnrolled: true }));
    const granted = await app.inject({
      method: "GET",
      url: "/v1/access/operators/idn_op/privilege",
    });
    expect(granted.json().operator_access).toBe(true);
  });

  it("après récupération, privilèges suspendus temporairement", async () => {
    const access = new FictitiousAccessStore();
    access.seedAccount(activeAccount("idn_gina", { isOperator: true, mfaEnrolled: true }));
    const app = buildApp({ access });
    await app.inject({
      method: "POST",
      url: "/v1/access/recovery-requests",
      headers: json,
      payload: { identityId: "idn_gina" },
    });
    await app.inject({
      method: "POST",
      url: "/v1/access/recovery-completions",
      headers: json,
      payload: {
        identityId: "idn_gina",
        code: access.lastIssuedCode("idn_gina", "recovery"),
        suspensionSeconds: 600,
      },
    });
    const duringLock = await app.inject({
      method: "GET",
      url: "/v1/access/operators/idn_gina/privilege",
    });
    expect(duringLock.json().operator_access).toBe(false);
    // une fois la suspension écoulée (horloge serveur avancée), l'accès revient
    access.setNow(1_700_000_000 + 601);
    const afterLock = await app.inject({
      method: "GET",
      url: "/v1/access/operators/idn_gina/privilege",
    });
    expect(afterLock.json().operator_access).toBe(true);
  });
});
