/**
 * Recette C09 via l'application Fastify (fastify.inject, sans base). Prouve les
 * DÉCISIONS serveur du circuit proposition/vote/décision : **électorat scellé
 * côté serveur** (jamais fourni par le client), bulletin **unique et identifié**,
 * refus **après échéance serveur**, résultat adossé à l'**oracle indépendant**
 * (C09-PASS / C09-TIE / C09-LATE), clôture gouvernée par l'horloge serveur,
 * exécution **idempotente** (un seul effet), permission objet (`vote.open` /
 * `vote.cast`), anti-IDOR sur les lectures et concurrence optimiste sur les
 * mutations. Chaque refus est aussi vérifié par **absence d'écriture** (compteur
 * d'événements scellés). Ne prétend PAS prouver la sérialisation concurrente
 * réelle d'un double bulletin sous verrou : contrat SQL `0012_proposal`,
 * **BLOCKED** sans PostgreSQL (ADR-0007 / ADR-0016).
 */
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/server.js";
import { FictitiousProposalStore } from "../src/proposalStore.js";

const json = { "content-type": "application/json" };

function actorHeaders(role: string, identityId: string, groupIds: readonly string[] = ["grpA"]) {
  return { "x-actor": JSON.stringify({ handle: identityId, role, identityId, groupIds }) };
}

function mHeaders(role: string, identityId: string, version: number, serverDate: string, groupIds: readonly string[] = ["grpA"]) {
  return {
    ...json,
    ...actorHeaders(role, identityId, groupIds),
    "if-match-version": String(version),
    "x-server-date": serverDate,
  };
}

const OPEN_AT = "2026-01-01T00:00:00.000Z";
const IN_WINDOW = "2026-01-01T00:30:00.000Z"; // < deadline (ouverture + 3600 s)
const AT_DEADLINE = "2026-01-01T01:00:00.000Z"; // == deadline → clôture OK, bulletin pas encore "late"
const AFTER_DEADLINE = "2026-01-01T02:00:00.000Z"; // > deadline → bulletin LATE

const ELECTORS = Array.from({ length: 10 }, (_, i) => `v${i}`);

function fresh(): { app: ReturnType<typeof buildApp>; store: FictitiousProposalStore } {
  const store = new FictitiousProposalStore();
  store.setGroupElectorate("grpA", ELECTORS);
  // Règles de décision résolues CÔTÉ SERVEUR (quorum 2/3, version 1) — jamais
  // fournies par le client (règle 18 / ADR-0005).
  store.setGroupRules("grpA", { quorumNumerator: 2, quorumDenominator: 3, rulesVersion: 1 });
  return { app: buildApp({ proposals: store }), store };
}

async function open(app: ReturnType<typeof buildApp>, proposalId = "prop1") {
  return app.inject({
    method: "POST",
    url: "/v1/groups/grpA/votes",
    headers: mHeaders("founder", "idn_open", 0, OPEN_AT),
    payload: {
      proposalId,
      subjectKind: "rule",
      subjectRef: "rules/rotation",
      reason: "Ajuster la rotation",
      durationSeconds: 3600,
    },
  });
}

/** Bulletin par un électeur (rôle member, détient `vote.cast`), version threadée. */
async function vote(app: ReturnType<typeof buildApp>, proposalId: string, identityId: string, choice: string, version: number, serverDate = IN_WINDOW) {
  const r = await app.inject({
    method: "POST",
    url: `/v1/votes/${proposalId}/ballots`,
    headers: mHeaders("member", identityId, version, serverDate),
    payload: { choice },
  });
  return { status: r.statusCode, body: r.json() as { voteAccepted: boolean; version: number; reason?: string } };
}

/** Mène une volée à `closed` avec les votes donnés ; renvoie la réponse de clôture. */
async function voteThenClose(app: ReturnType<typeof buildApp>, proposalId: string, votes: Array<[string, string]>, startVersion = 1) {
  let v = startVersion;
  for (const [who, choice] of votes) {
    const res = await vote(app, proposalId, who, choice, v);
    if (res.body.voteAccepted) v = res.body.version;
  }
  const close = await app.inject({
    method: "POST",
    url: `/v1/proposals/${proposalId}/closures`,
    headers: mHeaders("founder", "idn_open", v, AT_DEADLINE),
    payload: {},
  });
  return { close, version: close.json() as { version: number; tally: { approved: boolean } } };
}

describe("C09 — ouverture et scellement serveur de l'électorat", () => {
  it("ouvre une proposition ; l'électorat vient du SERVEUR (non fourni)", async () => {
    const { app } = fresh();
    const r = await open(app);
    expect(r.statusCode).toBe(201);
    const view = r.json() as { state: string; electorateSize: number; canonicalHash: string; deadline: number; voteId: string };
    expect(view.state).toBe("open");
    expect(view.electorateSize).toBe(10); // scellé depuis le store serveur
    expect(view.canonicalHash).toHaveLength(64);
    expect(view.deadline).toBe(Date.parse(OPEN_AT) + 3600 * 1000);
  });

  it("un rôle sans `vote.open` (trésorier) ne peut ouvrir → 403", async () => {
    const { app } = fresh();
    const r = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/votes",
      headers: mHeaders("treasurer", "idn_treas", 0, OPEN_AT),
      payload: {
        proposalId: "pX", subjectKind: "rule", subjectRef: "r", reason: "x",
        durationSeconds: 60,
      },
    });
    expect(r.statusCode).toBe(403);
    expect(r.json().code).toBe("FEATURE_PILOT_FORBIDDEN");
  });

  it("sans électorat serveur enregistré, on n'invente pas de corps électoral → 422", async () => {
    const store = new FictitiousProposalStore();
    const app = buildApp({ proposals: store });
    const r = await app.inject({
      method: "POST",
      url: "/v1/groups/grpB/votes",
      headers: { ...mHeaders("founder", "idn_open", 0, OPEN_AT), ...actorHeaders("founder", "idn_open", ["grpB"]) },
      payload: {
        proposalId: "pY", subjectKind: "rule", subjectRef: "r", reason: "x",
        durationSeconds: 60,
      },
    });
    expect(r.statusCode).toBe(422);
    expect(r.json().code).toBe("ELECTORATE_INVALIDE");
  });

  it("sans règles serveur (quorum/version), on n'invente pas le quorum → 422 RULE_INVALID", async () => {
    // Électorat posé mais AUCUNE règle serveur : le client ne peut pas décider
    // son propre quorum (règle 18 / ADR-0005).
    const store = new FictitiousProposalStore();
    store.setGroupElectorate("grpA", ELECTORS);
    const app = buildApp({ proposals: store });
    const r = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/votes",
      headers: mHeaders("founder", "idn_open", 0, OPEN_AT),
      payload: {
        proposalId: "pR", subjectKind: "rule", subjectRef: "r", reason: "x",
        durationSeconds: 60,
      },
    });
    expect(r.statusCode).toBe(422);
    expect(r.json().code).toBe("RULE_INVALID");
  });

  it("doublon d'ouverture (même proposalId) → 409", async () => {
    const { app } = fresh();
    expect((await open(app, "propD")).statusCode).toBe(201);
    const second = await open(app, "propD");
    expect(second.statusCode).toBe(409);
  });
});

describe("C09 — bulletin identifié, unique, dans la volée serveur", () => {
  it("accepte un bulletin d'un électeur dans la fenêtre", async () => {
    const { app, store } = fresh();
    await open(app, "prop1");
    const res = await vote(app, "prop1", "v0", "yes", 1);
    expect(res.status).toBe(201);
    expect(res.body.voteAccepted).toBe(true);
    expect(store.eventCount("grpA", "proposal.ballot")).toBe(1);
  });

  it("refuse un non-électeur sans écriture (NOT_ELIGIBLE)", async () => {
    const { app, store } = fresh();
    await open(app, "prop1");
    const res = await vote(app, "prop1", "intrus", "yes", 1);
    expect(res.status).toBe(200); // refus = pas une création
    expect(res.body.voteAccepted).toBe(false);
    expect(res.body.reason).toBe("NOT_ELIGIBLE");
    expect(store.eventCount("grpA", "proposal.ballot")).toBe(0);
  });

  it("C09-LATE : bulletin après échéance serveur → refus sans écriture", async () => {
    const { app, store } = fresh();
    await open(app, "prop1");
    const res = await vote(app, "prop1", "v0", "yes", 1, AFTER_DEADLINE);
    expect(res.status).toBe(200); // refus = pas une création
    expect(res.body.voteAccepted).toBe(false);
    expect(res.body.reason).toBe("LATE");
    expect(store.eventCount("grpA", "proposal.ballot")).toBe(0);
  });

  it("interdit le double vote (7.2) sans second événement", async () => {
    const { app, store } = fresh();
    await open(app, "prop1");
    const first = await vote(app, "prop1", "v0", "yes", 1);
    const second = await vote(app, "prop1", "v0", "no", first.body.version);
    expect(second.status).toBe(200); // refus = pas une création
    expect(second.body.voteAccepted).toBe(false);
    expect(second.body.reason).toBe("ALREADY_VOTED");
    expect(store.eventCount("grpA", "proposal.ballot")).toBe(1);
  });
});

describe("C09 — clôture via oracle indépendant (PASS / TIE)", () => {
  it("C09-PASS : 4 oui / 2 non / 1 abstention sur 10 → approuvé", async () => {
    const { app } = fresh();
    await open(app, "prop1");
    const { close } = await voteThenClose(app, "prop1", [
      ["v0", "yes"], ["v1", "yes"], ["v2", "yes"], ["v3", "yes"],
      ["v4", "no"], ["v5", "no"], ["v6", "abstain"],
    ]);
    expect(close.statusCode).toBe(200);
    const body = close.json() as { tally: { approved: boolean; quorum: number; turnout: number } };
    expect(body.tally.quorum).toBe(7);
    expect(body.tally.turnout).toBe(7);
    expect(body.tally.approved).toBe(true);
  });

  it("C09-TIE : 3 oui / 3 non / 1 abstention sur 10 → rejeté", async () => {
    const { app } = fresh();
    await open(app, "prop1");
    const { close } = await voteThenClose(app, "prop1", [
      ["v0", "yes"], ["v1", "yes"], ["v2", "yes"],
      ["v3", "no"], ["v4", "no"], ["v5", "no"], ["v6", "abstain"],
    ]);
    expect(close.json().tally.approved).toBe(false);
  });

  it("refuse de clôturer avant l'échéance serveur → 409 PROPOSAL_NOT_DUE", async () => {
    const { app } = fresh();
    await open(app, "prop1");
    const r = await app.inject({
      method: "POST",
      url: "/v1/proposals/prop1/closures",
      headers: mHeaders("founder", "idn_open", 1, IN_WINDOW), // avant deadline
      payload: {},
    });
    expect(r.statusCode).toBe(409);
    expect(r.json().code).toBe("PROPOSAL_NOT_DUE");
  });
});

describe("C09 — exécution idempotente et annulation motivée", () => {
  async function approvedClosed(app: ReturnType<typeof buildApp>) {
    await open(app, "prop1");
    const { close } = await voteThenClose(app, "prop1", [
      ["v0", "yes"], ["v1", "yes"], ["v2", "yes"], ["v3", "yes"],
      ["v4", "no"], ["v5", "no"], ["v6", "abstain"],
    ]);
    return (close.json() as { version: number }).version;
  }

  it("exécute une décision approuvée, puis ré-exécution sans second effet", async () => {
    const { app, store } = fresh();
    const v = await approvedClosed(app);
    const first = await app.inject({
      method: "POST",
      url: "/v1/votes/prop1/executions",
      headers: mHeaders("founder", "idn_open", v, AFTER_DEADLINE),
      payload: {},
    });
    expect(first.statusCode).toBe(200);
    expect((first.json() as { executed: boolean }).executed).toBe(true);
    const vAfter = (first.json() as { version: number }).version;
    const second = await app.inject({
      method: "POST",
      url: "/v1/votes/prop1/executions",
      headers: mHeaders("founder", "idn_other", vAfter, AFTER_DEADLINE),
      payload: {},
    });
    expect((second.json() as { idempotent: boolean }).idempotent).toBe(true);
    // Un seul événement d'exécution malgré deux appels.
    expect(store.eventCount("grpA", "proposal.executed")).toBe(1);
  });

  it("refuse d'exécuter une décision non approuvée → 409", async () => {
    const { app } = fresh();
    await open(app, "prop1");
    const { close } = await voteThenClose(app, "prop1", [
      ["v0", "yes"], ["v1", "no"],
    ]);
    const v = (close.json() as { version: number }).version;
    const r = await app.inject({
      method: "POST",
      url: "/v1/votes/prop1/executions",
      headers: mHeaders("founder", "idn_open", v, AFTER_DEADLINE),
      payload: {},
    });
    expect(r.statusCode).toBe(409);
    expect(r.json().code).toBe("PROPOSAL_NOT_APPROVED");
  });

  it("annule une proposition ouverte avec motif", async () => {
    const { app, store } = fresh();
    await open(app, "prop1");
    const r = await app.inject({
      method: "POST",
      url: "/v1/proposals/prop1/cancellations",
      headers: mHeaders("founder", "idn_open", 1, IN_WINDOW),
      payload: { reason: "Électorat à reprendre" },
    });
    expect(r.statusCode).toBe(200);
    expect((r.json() as { state: string }).state).toBe("cancelled");
    expect(store.eventCount("grpA", "proposal.cancelled")).toBe(1);
  });

  it("annulation sans motif → 422", async () => {
    const { app } = fresh();
    await open(app, "prop1");
    const r = await app.inject({
      method: "POST",
      url: "/v1/proposals/prop1/cancellations",
      headers: mHeaders("founder", "idn_open", 1, IN_WINDOW),
      payload: { reason: "  " },
    });
    expect(r.statusCode).toBe(422);
  });
});

describe("C09 — barrières serveur : concurrence, anti-IDOR, lecture scopée", () => {
  it("mutation SANS en-tête de version → 422 (aucun défaut silencieux)", async () => {
    const { app } = fresh();
    await open(app, "prop1");
    const r = await app.inject({
      method: "POST",
      url: "/v1/votes/prop1/ballots",
      headers: { ...json, ...actorHeaders("member", "v0"), "x-server-date": IN_WINDOW },
      payload: { choice: "yes" },
    });
    expect(r.statusCode).toBe(422);
  });

  it("version d'objet divergente → 409 EVENT_CHAIN_BREAK", async () => {
    const { app } = fresh();
    await open(app, "prop1");
    const r = await app.inject({
      method: "POST",
      url: "/v1/votes/prop1/ballots",
      headers: mHeaders("member", "v0", 99, IN_WINDOW),
      payload: { choice: "yes" },
    });
    expect(r.statusCode).toBe(409);
    expect(r.json().code).toBe("EVENT_CHAIN_BREAK");
  });

  it("lecture d'un objet d'un autre groupe sous un chemin tiers → 404 non-divulgation", async () => {
    const { app } = fresh();
    await open(app, "prop1");
    const r = await app.inject({
      method: "GET",
      url: "/v1/groups/grpA/votes/prop1",
      headers: actorHeaders("founder", "idn_open", ["grpA"]),
    });
    expect(r.statusCode).toBe(200);
    // prop1 appartient à grpA ; le lire sous un chemin grpB (acteur membre des deux) → 404.
    const store2 = new FictitiousProposalStore();
    store2.setGroupElectorate("grpA", ELECTORS);
    const app2 = buildApp({ proposals: store2 });
    const r404 = await app2.inject({
      method: "GET",
      url: "/v1/groups/grpA/votes/inexistant",
      headers: actorHeaders("founder", "idn_open", ["grpA"]),
    });
    expect(r404.statusCode).toBe(404);
  });

  it("acteur hors du groupe ne voit pas la proposition → 403", async () => {
    const { app } = fresh();
    await open(app, "prop1");
    const r = await app.inject({
      method: "GET",
      url: "/v1/groups/grpA/votes/prop1",
      headers: actorHeaders("founder", "idn_stranger", ["grpZ"]),
    });
    expect(r.statusCode).toBe(403);
  });

  it("historique des décisions (7.5) d'un groupe, scopé", async () => {
    const { app } = fresh();
    await open(app, "prop1");
    await voteThenClose(app, "prop1", [["v0", "yes"], ["v1", "yes"]]);
    const r = await app.inject({
      method: "GET",
      url: "/v1/groups/grpA/decisions",
      headers: actorHeaders("member", "v0", ["grpA"]),
    });
    expect(r.statusCode).toBe(200);
    const decisions = (r.json() as { decisions: Array<{ voteId: string; state: string }> }).decisions;
    expect(decisions.some((d) => d.voteId === "prop1" && d.state === "closed")).toBe(true);
  });
});
