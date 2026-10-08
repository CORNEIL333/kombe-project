/**
 * KÓMBE @kombe/api — store RÉEL (PostgreSQL) pour le journal d'événements et
 * ses checkpoints (C11, Piste A4). Même esprit que `pgContributionStore.ts` :
 * TOUTE décision reste dans les fonctions pures de `@kombe/domain`
 * (`journal.ts`/`events.ts`) — replay versionné, vérification indépendante,
 * checkpoints scellés, timeline filtrée par droits. Ce fichier ne fait que
 * lire/écrire ces décisions dans Postgres sous les contraintes déjà posées
 * par la migration `0007_event_journal.sql` (append-only par trigger,
 * `checkpoint` hors privilèges applicatifs).
 *
 * Reconstruction des événements : `pgContributionStore.declare` (et tout
 * futur écrivain du journal) insère `payload = jsonSafe(sealedEventV1)` —
 * c'est-à-dire l'enveloppe COMPLÈTE (y compris son propre hash et les
 * colonnes dédiées group_id/seq/...). La colonne `journal.payload` contient
 * donc un objet dont le champ `.payload` interne est EXACTEMENT ce qui a été
 * haché par `computeEventHash` (groupId/seq/type/version/previousHash/
 * payload). `events()` extrait ce `.payload` interne pour reconstruire un
 * `JournalEvent` dont l'intégrité est vérifiable par `verifyJournal` — les
 * colonnes dédiées (group_id/seq/event_type/version/previous_hash/hash)
 * restent la source de vérité pour l'enveloppe externe.
 *
 * `checkpoint` : la migration 0007 RÉVOQUE INSERT/UPDATE/DELETE à `kombe_app`
 * sur cette table (checkpoint posé par un vérificateur HORS privilèges
 * applicatifs, 9.2). `checkpoint()` exige donc un second pool connecté avec
 * un rôle qui possède ce droit (ex. `kombe_migrateur`, propriétaire de la
 * table) — jamais un contournement du `pool` applicatif. Sans ce second
 * pool, l'opération échoue explicitement (jamais un faux succès silencieux).
 *
 * BUG RÉEL trouvé par exécution (pas en relecture statique) : `jsonSafe()`
 * (`pgContributionStore.ts`) sérialise les montants bigint du `body` en
 * CHAÎNES pour le stockage JSONB, alors que `canonicalHash`
 * (`canonical.ts`, `toJcsValue`) les convertit en NOMBRES (`toSafeNumber`)
 * pour le calcul du hash scellé. Une relecture naïve de `journal.payload`
 * produit donc un `body.amount` de type STRING, qui ne canonicalise PAS à
 * la même forme que l'original (nombre) → `EVENT_HASH_MISMATCH` systématique
 * à la revérification, et `replayJournal`/`payloadAmount` rejette la chaîne
 * (« Montant de payload invalide au replay »). `rowToEvent` corrige cette
 * désérialisation pour les champs bigint connus du seul type d'événement
 * réellement émis aujourd'hui (`contribution.declared` : `amount`,
 * `reserved`, écrits par `pgContributionStore.declare`). Limite assumée :
 * tout futur écrivain de journal émettant un AUTRE type d'événement avec
 * des champs bigint devra soit enregistrer ses noms de champs ici, soit
 * (correctif de fond préférable, hors scope de ce fichier) aligner
 * `pgContributionStore.ts`/les futurs écrivains sur une sérialisation par
 * NOMBRE plutôt que par chaîne, pour que stockage et hash concordent
 * nativement sans reconversion côté lecture.
 */
const BIGINT_BODY_FIELDS_BY_TYPE: Record<string, readonly string[]> = {
  "contribution.declared": ["amount", "reserved"],
};

/** Convertit en nombre les champs `body` connus pour avoir été des bigint
 *  côté écriture (stockés en chaîne par `jsonSafe`, mais hachés comme
 *  nombre par `canonicalHash`) — seul moyen, sans toucher l'écrivain, de
 *  reconstruire une valeur qui canonicalise à l'identique de l'original. */
function restoreBigintBodyFields(eventType: string, body: Record<string, unknown>): Record<string, unknown> {
  const fields = BIGINT_BODY_FIELDS_BY_TYPE[eventType];
  if (!fields) return body;
  const out = { ...body };
  for (const field of fields) {
    const raw = out[field];
    if (typeof raw === "string" && /^\d+$/.test(raw)) {
      out[field] = Number(raw);
    }
  }
  return out;
}
import type pg from "pg";
import {
  DomainError,
  assertAllowed,
  buildTimeline,
  replayJournal,
  sealCheckpoint,
  verifyJournal,
  type Checkpoint,
  type JournalEvent,
  type JournalRole,
  type ReplayState,
  type TimelineEntry,
  type VerifyResult,
} from "@kombe/domain";
import { withGroupTx } from "./txContext.js";

function rowToEvent(row: Record<string, unknown>): JournalEvent {
  const stored = row.payload as Record<string, unknown>;
  const innerPayload = { ...((stored["payload"] ?? stored) as Record<string, unknown>) };
  const eventType = String(row.event_type);
  if (innerPayload["body"] && typeof innerPayload["body"] === "object") {
    innerPayload["body"] = restoreBigintBodyFields(eventType, innerPayload["body"] as Record<string, unknown>);
  }
  return {
    groupId: String(row.group_id),
    seq: Number(row.seq),
    type: eventType,
    version: Number(row.version),
    previousHash: String(row.previous_hash),
    payload: innerPayload,
    hash: String(row.hash),
  };
}

function rowToCheckpoint(row: Record<string, unknown>): Checkpoint {
  return {
    groupId: String(row.group_id),
    seq: Number(row.seq),
    headHash: String(row.head_hash),
    issuedAt: (row.issued_at as Date).toISOString(),
    issuedBy: String(row.issued_by),
    hash: String(row.hash),
  };
}

export class PgJournalStore {
  constructor(
    private readonly pool: pg.Pool,
    /** Pool séparé, rôle propriétaire (ex. kombe_migrateur) — seul autorisé à
     *  écrire `checkpoint` (0007 : INSERT révoqué à kombe_app). */
    private readonly verifierPool?: pg.Pool,
  ) {}

  /** Journal brut réservé au vérificateur interne (jamais servi tel quel en HTTP). */
  async events(groupId: string): Promise<JournalEvent[]> {
    return withGroupTx(this.pool, groupId, async (client) => {
      const res = await client.query(
        `SELECT group_id, seq, event_type, version, previous_hash, hash, payload
         FROM journal WHERE group_id = $1 ORDER BY seq ASC`,
        [groupId],
      );
      if (res.rows.length === 0) {
        throw new DomainError("RESERVATION_INCOHERENTE", "Journal absent");
      }
      return res.rows.map(rowToEvent);
    });
  }

  private async checkpointsFor(groupId: string): Promise<Checkpoint[]> {
    return withGroupTx(this.pool, groupId, async (client) => {
      const res = await client.query(
        `SELECT group_id, seq, head_hash, issued_at, issued_by, hash
         FROM checkpoint WHERE group_id = $1 ORDER BY seq ASC`,
        [groupId],
      );
      return res.rows.map(rowToCheckpoint);
    });
  }

  /** Vérification indépendante de la chaîne + checkpoints (9.2/9.4). */
  async verify(groupId: string): Promise<VerifyResult> {
    const [events, checkpoints] = await Promise.all([this.events(groupId), this.checkpointsFor(groupId)]);
    return verifyJournal(events, { checkpoints });
  }

  /** Timeline en langage clair, filtrée par les droits du rôle (9.1/9.3). */
  async timeline(groupId: string, role: JournalRole): Promise<TimelineEntry[]> {
    assertAllowed(role, "journal.read");
    const events = await this.events(groupId);
    return buildTimeline(events, role);
  }

  /** Émet un checkpoint externe scellé sur le hash de tête (9.2). Exige le
   *  pool vérificateur (rôle propriétaire) — `kombe_app` ne peut pas écrire
   *  `checkpoint` (REVOKE structurel, migration 0007). */
  async checkpoint(groupId: string, role: JournalRole, issuedBy: string, issuedAt: string): Promise<Checkpoint> {
    assertAllowed(role, "journal.checkpoint");
    if (!this.verifierPool) {
      throw new DomainError(
        "RESERVATION_INCOHERENTE",
        "Aucun pool vérificateur configuré : impossible de poser un checkpoint (kombe_app n'a pas ce droit par construction)",
      );
    }
    const events = await this.events(groupId);
    const head = events[events.length - 1] as JournalEvent;
    const cp = sealCheckpoint({ groupId, seq: head.seq, headHash: head.hash, issuedAt, issuedBy });
    const client = await this.verifierPool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO checkpoint (group_id, seq, head_hash, issued_at, issued_by, hash) VALUES ($1,$2,$3,$4,$5,$6)`,
        [cp.groupId, cp.seq, cp.headHash, cp.issuedAt, cp.issuedBy, cp.hash],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    return cp;
  }

  /**
   * Rejoue le journal et réconcilie la projection reconstruite avec l'état
   * RÉEL de l'obligation (`validated_net`, écrit par les stores de
   * validation/contribution) — jamais une projection de référence inventée
   * en mémoire : la réconciliation porte sur ce que la base contient déjà.
   */
  async rebuild(groupId: string): Promise<{ projectionMatches: boolean; throughSeq: number }> {
    const events = await this.events(groupId);
    const state: ReplayState = replayJournal(events);
    return withGroupTx(this.pool, groupId, async (client) => {
      let matches = true;
      for (const [obligationId, proj] of state.obligations) {
        const res = await client.query(`SELECT validated_net FROM obligation WHERE obligation_id = $1`, [obligationId]);
        const real = res.rows[0] ? BigInt(res.rows[0].validated_net as string) : null;
        if (real === null || real !== proj.validatedNet) {
          matches = false;
          break;
        }
      }
      return { projectionMatches: matches, throughSeq: state.throughSeq };
    });
  }

  /** Vérifie une COPIE fournie (le vérificateur reste indépendant du stock). */
  verifyCopy(copy: readonly JournalEvent[], checkpoints: readonly Checkpoint[] = []): VerifyResult {
    return verifyJournal(copy, { checkpoints });
  }

  /** C11-TAMPER — altère une COPIE de la chaîne (montant d'un événement) ;
   *  la chaîne réelle en base reste intacte, seule la copie fournie change. */
  tamperCopyOf(events: readonly JournalEvent[], seq: number, amount: unknown): JournalEvent[] {
    return events.map((ev) =>
      ev.seq === seq
        ? {
            ...ev,
            payload: {
              ...(ev.payload as Record<string, unknown>),
              body: {
                ...((ev.payload as Record<string, unknown>)["body"] as Record<string, unknown>),
                amount,
              },
            },
          }
        : ev,
    );
  }
}
