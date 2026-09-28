/**
 * Recette C11 via l'application Fastify (fastify.inject, sans base). Prouve les
 * DÉCISIONS serveur du journal : vérification indépendante de la chaîne,
 * reconstruction des projections par replay réconciliée avec la référence
 * (C11-REBUILD), détection d'altération sur une COPIE (C11-TAMPER) avec absence
 * d'effet sur la chaîne interne, timeline filtrée par droits sans payload brut,
 * checkpoint réservé aux rôles autorisés. Ne prétend PAS prouver l'append-only
 * ni l'atomicité événement/projection/outbox en base : contrat
 * `0007_event_journal.sql`, **BLOCKED** sans PostgreSQL.
 */
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/server.js";
import { FictitiousJournalStore } from "../src/journalStore.js";

const json = { "content-type": "application/json" };

function actorHeader(role: string, handle = "idn_a") {
  return { "x-actor": JSON.stringify({ handle, role, groupIds: ["grpA"] }) };
}

function newApp(journal = new FictitiousJournalStore()) {
  return buildApp({ journal });
}

/** Injecte une petite chaîne d'événements de cotisation dans le journal. */
async function seed(app: ReturnType<typeof newApp>) {
  const decl = {
    method: "POST" as const,
    url: "/v1/groups/grpA/journal-appends",
    headers: { ...json, ...actorHeader("member") },
    payload: {
      actorIdentityId: "idn_m1",
      actorRole: "member",
      serverDate: "2028-01-31",
      commandId: "cmd_1",
      type: "contribution.declared",
      body: { obligationId: "obl_1", amount: 3000 },
    },
  };
  const val = {
    ...decl,
    payload: {
      ...decl.payload,
      actorIdentityId: "idn_t1",
      actorRole: "treasurer",
      serverDate: "2028-02-01",
      commandId: "cmd_2",
      type: "contribution.validated",
    },
  };
  await app.inject(decl);
  await app.inject(val);
}

describe("C11 journal — vérification et checkpoints", () => {
  it("GET verify sur chaîne intacte → intact = true", async () => {
    const app = newApp();
    await seed(app);
    const res = await app.inject({ method: "GET", url: "/v1/groups/grpA/journal/verify" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ intact: true, throughSeq: 2 });
  });

  it("POST checkpoint réservé (auditor OK, member refusé 403)", async () => {
    const app = newApp();
    await seed(app);
    const body = { issuedBy: "auditeur_externe", issuedAt: "2028-02-02T10:00:00Z" };
    const denied = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/journal-checkpoints",
      headers: { ...json, ...actorHeader("member") },
      payload: body,
    });
    expect(denied.statusCode).toBe(403);

    const ok = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/journal-checkpoints",
      headers: { ...json, ...actorHeader("auditor") },
      payload: body,
    });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().hash).toMatch(/^[0-9a-f]{64}$/);
    expect(ok.json().seq).toBe(2);
  });
});

describe("C11-REBUILD — projections reconstruites depuis le journal (9.5)", () => {
  it("rebuild → projection_matches = true, à l'identique rejouée", async () => {
    const journal = new FictitiousJournalStore();
    const app = newApp(journal);
    await seed(app);
    // Projection de référence cohérente avec le replay (validé net = 3000).
    journal.setReferenceProjection("grpA", "obl_1", 3000n);
    const res = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/projections-rebuild",
      headers: json,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ projectionMatches: true, throughSeq: 2 });
  });

  it("rebuild sur référence divergente → projection_matches = false puis reconcile", async () => {
    const journal = new FictitiousJournalStore();
    const app = newApp(journal);
    await seed(app);
    journal.setReferenceProjection("grpA", "obl_1", 999n); // fausse référence
    const first = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/projections-rebuild",
      headers: json,
      payload: {},
    });
    expect(first.json().projectionMatches).toBe(false);
    // Après reconciliation, la référence est corrigée → match au second appel.
    const second = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/projections-rebuild",
      headers: json,
      payload: {},
    });
    expect(second.json().projectionMatches).toBe(true);
  });
});

describe("C11-TAMPER — altération détectée sur copie, chaîne interne intacte", () => {
  it("modifier un montant d'une copie → tamper_detected = true, internal intact", async () => {
    const app = newApp();
    await seed(app);
    const res = await app.inject({
      method: "POST",
      url: "/v1/groups/grpA/journal-tamper-tests",
      headers: json,
      payload: { seq: 1, amount: 9999 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.tamper_detected).toBe(true);
    expect(body.error).toBe("EVENT_HASH_MISMATCH");
    // Absence d'effet : la vraie chaîne n'a pas bougé.
    expect(body.internal_chain_intact).toBe(true);
  });
});

describe("C11 timeline — langage clair, filtrée par droits (9.1/9.3)", () => {
  it("les libellés ne contiennent pas le jargon technique brut", async () => {
    const app = newApp();
    await seed(app);
    const res = await app.inject({
      method: "GET",
      url: "/v1/groups/grpA/timeline",
      headers: actorHeader("member"),
    });
    expect(res.statusCode).toBe(200);
    const labels: string[] = res.json().entries.map((e: { label: string }) => e.label);
    expect(labels).toContain("Cotisation déclarée");
    expect(labels).toContain("Cotisation validée");
    expect(labels.every((l) => !l.includes("."))).toBe(true);
  });

  it("filtre par type d'événement", async () => {
    const app = newApp();
    await seed(app);
    const res = await app.inject({
      method: "GET",
      url: "/v1/groups/grpA/timeline?type=contribution.validated",
      headers: actorHeader("member"),
    });
    const entries = res.json().entries;
    expect(entries.length).toBe(1);
    expect(entries[0].type).toBe("contribution.validated");
  });

  it("aucune divulgation : le payload brut (obligationId) n'apparaît pas", async () => {
    const app = newApp();
    await seed(app);
    const res = await app.inject({
      method: "GET",
      url: "/v1/groups/grpA/timeline",
      headers: actorHeader("member"),
    });
    expect(JSON.stringify(res.json())).not.toContain("obl_1");
  });
});
