/**
 * Tests d'invariants purs du journal C11 : enveloppe scellée (acteur/rôle/
 * date serveur couverts par le hash), replay versionné reconstruisant les
 * totaux depuis les seuls événements (9.5), checkpoints scellés et vérifiés
 * (9.2), outil de vérification indépendant qui détecte altération, rupture de
 * chaîne et divergence de checkpoint, timeline filtrée par droits sans payload
 * brut (9.1/9.3/9.4). Aucune persistance : ces règles sont indépendantes de
 * PostgreSQL — l'append-only DB réel et l'atomicité transactionnelle restent
 * des preuves base BLOCKED (0007 + isolation.pg.mjs).
 */
import { describe, expect, it } from "vitest";
import {
  DomainError,
  GENESIS_HASH,
  canonicalHash,
  sealEvent,
  sealEventV1,
  sealCheckpoint,
  replayJournal,
  verifyJournal,
  buildTimeline,
  REPLAY_VERSION,
  type JournalEvent,
  type JournalRole,
} from "../src/index.js";

const codes = (fn: () => unknown): string | null => {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof DomainError ? e.code : "NOT_DOMAIN";
  }
};

/** Chaîne fictive d'événements scellés, chaînés depuis la genèse. */
function chain(events: readonly { type: string; payload: Record<string, unknown> }[]): JournalEvent[] {
  const out: JournalEvent[] = [];
  let prev = GENESIS_HASH;
  events.forEach((e, i) => {
    const sealed = sealEvent({
      groupId: "g1",
      seq: i + 1,
      type: e.type,
      version: 1,
      previousHash: prev,
      payload: e.payload,
    });
    out.push(sealed);
    prev = sealed.hash;
  });
  return out;
}

/* ── Enveloppe scellée (9.1) ─────────────────────────────────────────────── */

describe("C11 enveloppe d'événement", () => {
  const input = {
    groupId: "g1",
    seq: 1,
    type: "contribution.declared",
    version: 1,
    previousHash: GENESIS_HASH,
    actorIdentityId: "id_m1",
    actorRole: "member" as JournalRole,
    serverDate: "2028-01-31",
    commandId: "cmd_1",
    body: { obligationId: "obl_1", amount: 3000 },
  };

  it("scelle l'enveloppe dans le payload haché (hash = canonique du tout)", () => {
    const ev = sealEventV1(input);
    expect(ev.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(ev.payload).toMatchObject({ actorIdentityId: "id_m1", serverDate: "2028-01-31" });
    const recomputed = canonicalHash({
      groupId: ev.groupId,
      seq: ev.seq,
      type: ev.type,
      version: ev.version,
      previousHash: ev.previousHash,
      payload: ev.payload,
    });
    expect(recomputed).toBe(ev.hash);
  });

  it("deux acteurs différents produisent des hashes différents (traçabilité)", () => {
    const a = sealEventV1(input);
    const b = sealEventV1({ ...input, actorIdentityId: "id_m2" });
    expect(a.hash).not.toBe(b.hash);
  });

  it("une date serveur falsifiée change le hash (l'horodatage est couvert)", () => {
    const a = sealEventV1(input);
    const b = sealEventV1({ ...input, serverDate: "2028-02-01" });
    expect(a.hash).not.toBe(b.hash);
  });
});

/* ── Replay versionné et totaux (9.5) ────────────────────────────────────── */

describe("C11 replay et projections", () => {
  it("reconstruit validé net et réservation depuis les seuls événements", () => {
    const events = chain([
      { type: "contribution.declared", payload: { body: { obligationId: "obl_1", amount: 3000 } } },
      { type: "contribution.declared", payload: { body: { obligationId: "obl_1", amount: 1500 } } },
      { type: "contribution.validated", payload: { body: { obligationId: "obl_1", amount: 3000 } } },
    ]);
    const state = replayJournal(events);
    const proj = state.obligations.get("obl_1");
    expect(proj?.validatedNet).toBe(3000n);
    expect(proj?.declaredReserved).toBe(4500n);
    expect(proj?.version).toBe(3);
    expect(state.throughSeq).toBe(3);
    expect(state.replayVersion).toBe(REPLAY_VERSION);
  });

  it("la compensation retracte le validé net sans effacer l'événement", () => {
    const events = chain([
      { type: "contribution.validated", payload: { body: { obligationId: "obl_1", amount: 5000 } } },
      { type: "contribution.compensated", payload: { body: { obligationId: "obl_1", amount: 500 } } },
    ]);
    const proj = replayJournal(events).obligations.get("obl_1");
    expect(proj?.validatedNet).toBe(4500n);
  });

  it("les types hors projection sont ignorés sans total fantôme", () => {
    const events = chain([
      { type: "group.state_changed", payload: { body: { to: "active" } } },
      { type: "contribution.validated", payload: { body: { obligationId: "obl_2", amount: 100 } } },
    ]);
    const state = replayJournal(events);
    expect(state.obligations.has("obl_2")).toBe(true);
    expect(state.obligations.size).toBe(1);
    expect(state.throughSeq).toBe(2);
  });

  it("refuse une version d'événement future inconnue (replay versionné)", () => {
    const ev = sealEvent({
      groupId: "g1", seq: 1, type: "contribution.validated", version: 99,
      previousHash: GENESIS_HASH, payload: { obligationId: "obl_1", amount: 100 },
    });
    expect(codes(() => replayJournal([ev]))).toBe("REPLAY_VERSION_UNKNOWN");
  });

  it("refuse un montant de payload invalide (négatif au replay)", () => {
    const ev = sealEvent({
      groupId: "g1", seq: 1, type: "contribution.declared", version: 1,
      previousHash: GENESIS_HASH, payload: { body: { obligationId: "obl_1", amount: -5 } },
    });
    expect(codes(() => replayJournal([ev]))).toBe("REPLAY_VERSION_UNKNOWN");
  });
});

/* ── Checkpoints et vérification indépendante (9.2/9.4) ──────────────────── */

describe("C11 checkpoints et vérificateur", () => {
  const events = chain([
    { type: "contribution.declared", payload: { body: { obligationId: "obl_1", amount: 3000 } } },
    { type: "contribution.validated", payload: { body: { obligationId: "obl_1", amount: 3000 } } },
  ]);
  const goodCp = sealCheckpoint({
    groupId: "g1", seq: 2,
    headHash: (events[1] as JournalEvent).hash,
    issuedAt: "2028-02-01T00:00:00Z", issuedBy: "auditeur_externe",
  });

  it("scelle un checkpoint par hash canonique de ses champs", () => {
    expect(goodCp.hash).toBe(canonicalHash({
      groupId: "g1", seq: 2, headHash: goodCp.headHash,
      issuedAt: "2028-02-01T00:00:00Z", issuedBy: "auditeur_externe",
    }));
  });

  it("chaîne intacte + checkpoint conforme → intact (C11-TAMPER négatif)", () => {
    const r = verifyJournal(events, { checkpoints: [goodCp] });
    expect(r).toEqual({ intact: true, throughSeq: 2 });
  });

  it("montant altéré dans une copie du journal → tamper détecté", () => {
    const tampered = events.map((ev, i) =>
      i === 0
        ? { ...ev, payload: { body: { obligationId: "obl_1", amount: 9999 } } }
        : ev,
    );
    const r = verifyJournal(tampered);
    expect(r.intact).toBe(false);
    expect(r.error).toBe("EVENT_HASH_MISMATCH");
    expect(r.throughSeq).toBe(0);
  });

  it("maillon déchaîné (previousHash remplacé) → rupture détectée", () => {
    // Le second événement est rescellé avec un previousHash faux mais un
    // hash interne cohérent : seule la chaînage trahit la déconnexion.
    const dechaîne = sealEvent({
      groupId: "g1", seq: 2, type: "contribution.validated", version: 1,
      previousHash: GENESIS_HASH,
      payload: { body: { obligationId: "obl_1", amount: 3000 } },
    });
    const r = verifyJournal([events[0] as JournalEvent, dechaîne]);
    expect(r.intact).toBe(false);
    expect(r.error).toBe("EVENT_CHAIN_BREAK");
  });

  it("séquence discontinüe (événement inséré) → rupture détectée", () => {
    const saute = sealEvent({
      groupId: "g1", seq: 3, type: "contribution.validated", version: 1,
      previousHash: (events[0] as JournalEvent).hash,
      payload: { body: { obligationId: "obl_1", amount: 3000 } },
    });
    const r = verifyJournal([events[0] as JournalEvent, saute]);
    expect(r.intact).toBe(false);
    expect(r.error).toBe("EVENT_CHAIN_BREAK");
  });

  it("checkpoint divergent du hash effectif → CHECKPOINT_MISMATCH", () => {
    const lyingCp = sealCheckpoint({ ...goodCp, headHash: "f".repeat(64) });
    const r = verifyJournal(events, { checkpoints: [lyingCp] });
    expect(r.intact).toBe(false);
    expect(r.error).toBe("CHECKPOINT_MISMATCH");
  });

  it("le vérificateur ne recalcule jamais la chaîne pour masquer une altération", () => {
    // Un recalcul « réparant » le hash du premier événement rend la chaîne
    // de nouveau cohérente : c'est exactement ce que le hash seul ne peut
    // empêcher — d'où le checkpoint externe, qui lui, reste divergent.
    const altéré = { ...(events[0] as JournalEvent), payload: { body: { obligationId: "obl_1", amount: 9999 } } };
    const repare = sealEvent({
      groupId: altéré.groupId,
      seq: altéré.seq,
      type: altéré.type,
      version: altéré.version,
      previousHash: altéré.previousHash,
      payload: altéré.payload,
    });
    expect(verifyJournal([repare]).intact).toBe(true);
    expect(verifyJournal([repare], { checkpoints: [{ ...goodCp, seq: 1, headHash: (events[0] as JournalEvent).hash }] }).error)
      .toBe("CHECKPOINT_MISMATCH");
  });
});

/* ── Timeline filtrée par droits, langage clair (9.1/9.3) ────────────────── */

describe("C11 timeline", () => {
  const events = chain([
    { type: "contribution.validated", payload: { serverDate: "2028-02-01", body: { obligationId: "obl_1", amount: 3000 } } },
    { type: "dispute.opened", payload: { serverDate: "2028-02-02", body: { disputeId: "dsp_1", privateDetail: "salaire de Kambou" } } },
  ]);

  it("libellés en langage clair, jamais le jargon technique brut", () => {
    const t = buildTimeline(events, "member");
    expect(t.every((e) => /^[^._]+$/.test(e.label))).toBe(true);
    expect(t[0]?.label).toBe("Cotisation validée");
  });

  it("événement privé masqué pour member/animator, visible auditeur/secretary", () => {
    expect(buildTimeline(events, "member").length).toBe(1);
    expect(buildTimeline(events, "animator").length).toBe(1);
    expect(buildTimeline(events, "auditor").length).toBe(2);
    expect(buildTimeline(events, "secretary").length).toBe(2);
  });

  it("aucune divulgation : pas de payload brut, ni pour un rôle autorisé", () => {
    const t = buildTimeline(events, "auditor");
    const dispute = t[1]!;
    expect(dispute.summary).toBeUndefined();
    expect(JSON.stringify(t)).not.toContain("privateDetail");
    expect(JSON.stringify(t)).not.toContain("salaire");
  });

  it("le résumé public n'expose que des champs entiers sûrs", () => {
    const t = buildTimeline(events, "member");
    expect(t[0]?.summary).toEqual({ amount: 3000 });
  });
});
