/**
 * Boîte de notifications de l'application et registre lisible (journal
 * chaîné, vérifié à chaque lecture), plus l'idempotence des écritures.
 */
import type pg from "pg";
import { DomainError, verifyJournal, type JournalEntryView, type JournalEvent, type NotificationView } from "@kombe/domain";
import { canonicalHash } from "@kombe/domain";
import { type Db, groupActor, inTx, isoInstant, scopeGroup, sessionIdentity } from "./infra.js";
import { loadNames } from "./views.js";
import { processGroupDeadlines } from "./echeances.js";

/**
 * Relances de l'application, produites à la lecture de la boîte (dédupliquées)
 * pour la personne qui lit ; l'échéance des statuts est appliquée au groupe.
 * La tâche planifiée quotidienne fait le même travail pour tout le monde.
 */
async function produceReminders(db: Db, identityId: string, nowMs: number): Promise<void> {
  const mine = await db.query(`SELECT DISTINCT group_id FROM kombe_my_memberships() WHERE membership_state IN ('active','pending')`);
  for (const row of mine.rows) {
    const gid = String(row.group_id);
    await db.query("SAVEPOINT rappel");
    try {
      await scopeGroup(db, gid);
      await processGroupDeadlines(db, gid, nowMs, { onlyIdentity: identityId });
      await db.query("RELEASE SAVEPOINT rappel");
    } catch {
      // Une relance ratée ne doit jamais empêcher de lire ses notifications.
      await db.query("ROLLBACK TO SAVEPOINT rappel");
    }
  }
}

const EVENT_LABELS: Readonly<Record<string, string>> = {
  "tontine.created": "Association créée",
  "tontine.settings_changed": "Règlement modifié",
  "member.requested": "Demande d'adhésion",
  "member.admitted": "Membre admis",
  "member.rejected": "Adhésion refusée",
  "member.offline_added": "Membre sans téléphone ajouté",
  "member.shares_set": "Nombre de parts modifié",
  "role.proposed": "Fonction proposée",
  "role.accepted": "Fonction acceptée",
  "invitation.created": "Invitation créée",
  "invitation.revoked": "Invitation retirée",
  "statutes.published": "Statuts publiés",
  "statutes.accepted": "Statuts acceptés",
  "statutes.deadline_set": "Échéance d'acceptation des statuts fixée",
  "statutes.reminded": "Relance envoyée aux retardataires",
  "statutes.deadline_exclusion": "Retardataire exclu à l'échéance des statuts",
  "draw.committed": "Tirage scellé",
  "cycle.started": "Cycle démarré",
  "cycle.renewed": "Nouveau cycle démarré",
  "reserve.distributed": "Réserve de fin d'année rendue aux membres",
  "payout.declared": "Remise déclarée",
  "payout.received": "Remise reçue par le bénéficiaire",
  "round.closed": "Tour clos",
  "order.swap_requested": "Échange de tour demandé",
  "order.swap_accepted": "Échange de tour accepté",
  "order.swap_applied": "Échange de tour appliqué",
  "order.priority_requested": "Tour prioritaire demandé",
  "order.priority_applied": "Tour prioritaire appliqué",
  "meeting.opened": "Séance ouverte",
  "meeting.attendance": "Appel noté",
  "meeting.closed": "Séance close, PV généré",
  "meeting.minutes_approved": "PV approuvé",
  "fund.created": "Nouvelle caisse créée",
  "fund.updated": "Règles d’une caisse modifiées",
  "fund.closed": "Caisse clôturée",
  "movement.declared": "Versement déclaré",
  "movement.confirmed": "Versements confirmés par la trésorerie",
  "movement.validated": "Mouvement validé par le commissaire",
  "movement.rejected": "Mouvement rejeté",
  "fine.issued": "Amende constatée",
  "fine.contested": "Amende contestée",
  "fine.cancelled": "Amende annulée",
  "fine.maintained": "Amende maintenue",
  "aid.requested": "Secours demandé",
  "aid.approved": "Secours accordé",
  "aid.rejected": "Secours refusé",
  "aid.paid": "Secours remis",
  "debt.written_off": "Dette abandonnée",
  "member.share_shared": "Part partagée entre deux membres",
  "decision.opened": "Vote ouvert",
  "decision.ballot_cast": "Bulletin déposé",
  "decision.adopted": "Décision adoptée par vote",
  "decision.rejected": "Décision rejetée par vote",
  "decision.cancelled": "Vote annulé",
  "decision.lifted": "Suspension levée",
  "schedule.paused": "Séances décalées (pause votée)",
  "order.place_taken_over": "Reprise de place",
  "history.imported": "Historique repris (cahier ou ancienne application)",
};

export class InboxService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly now: () => number,
  ) {}

  async notifications(headers: Record<string, unknown>, opts: { unreadOnly?: boolean | undefined } = {}): Promise<NotificationView[]> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const id = await sessionIdentity(db, headers, nowMs);
      await produceReminders(db, id, nowMs);
      const groups = await db.query(`SELECT group_id, group_name FROM kombe_my_memberships()`);
      const nameOf = new Map(groups.rows.map((x) => [String(x.group_id), String(x.group_name ?? "")]));
      const r = await db.query(
        `SELECT notification_id, group_id, kind, target, params, created_at, read_at FROM inbox_notification
          WHERE identity_id = $1 ${opts.unreadOnly ? "AND read_at IS NULL" : ""} ORDER BY created_at DESC, notification_id DESC LIMIT 100`,
        [id],
      );
      return r.rows.map((row) => ({
        notificationId: String(row.notification_id),
        groupId: row.group_id ? String(row.group_id) : null,
        groupName: row.group_id ? (nameOf.get(String(row.group_id)) ?? (typeof row.params?.groupName === "string" ? row.params.groupName : null)) : null,
        kind: String(row.kind),
        target: row.target ?? null,
        params: (row.params as NotificationView["params"]) ?? null,
        createdAt: isoInstant(row.created_at) as string,
        read: row.read_at !== null,
      }));
    });
  }

  async markRead(headers: Record<string, unknown>, ids: readonly string[] | "all"): Promise<{ updated: number }> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const id = await sessionIdentity(db, headers, nowMs);
      if (ids === "all") {
        const r = await db.query(`UPDATE inbox_notification SET read_at = now() WHERE identity_id = $1 AND read_at IS NULL`, [id]);
        return { updated: r.rowCount ?? 0 };
      }
      const nums = ids.filter((x) => /^\d{1,18}$/.test(x));
      const r = await db.query(
        `UPDATE inbox_notification SET read_at = now() WHERE identity_id = $1 AND read_at IS NULL AND notification_id = ANY($2::bigint[])`,
        [id, nums],
      );
      return { updated: r.rowCount ?? 0 };
    });
  }

  /** Registre de l'association : chaîne d'empreintes revérifiée à chaque lecture. */
  async journal(headers: Record<string, unknown>, groupId: string): Promise<{ valid: boolean; entries: JournalEntryView[] }> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      await groupActor(db, await sessionIdentity(db, headers, nowMs), groupId);
      const r = await db.query(`SELECT seq, event_type, hash, payload FROM journal WHERE group_id = $1 ORDER BY seq`, [groupId]);
      const events = r.rows.map((x) => x.payload as JournalEvent);
      let valid = false;
      try {
        valid = verifyJournal(events).intact;
      } catch {
        valid = false;
      }
      const names = await loadNames(db, groupId);
      const entries = r.rows
        .slice(-300)
        .reverse()
        .map((row) => {
          const p = row.payload as { payload?: { actorIdentityId?: string; serverDate?: string } };
          const actor = p.payload?.actorIdentityId;
          return {
            seq: Number(row.seq),
            type: String(row.event_type),
            at: p.payload?.serverDate ?? new Date(0).toISOString(),
            actorName: actor ? (names.byIdentity.get(actor) ?? null) : null,
            summary: EVENT_LABELS[String(row.event_type)] ?? String(row.event_type),
            hash: String(row.hash),
          };
        });
      return { valid, entries };
    });
  }

  /**
   * Idempotence des écritures (en-tête `Idempotency-Key`) : la réponse
   * mémorisée est rejouée ; même clé avec un autre corps ⇒ 409.
   */
  async replay(headers: Record<string, unknown>, key: string, route: string, body: unknown): Promise<{ status: number; body: unknown } | null> {
    const nowMs = this.now();
    if (key.length < 8 || key.length > 120) throw new DomainError("STATE_CONFLICT", "Clé d'idempotence invalide");
    return inTx(this.pool, async (db) => {
      const id = await sessionIdentity(db, headers, nowMs);
      const r = await db.query(`SELECT body_hash, status_code, response FROM api_idempotency WHERE identity_id = $1 AND idempotency_key = $2`, [id, key]);
      const row = r.rows[0];
      if (!row) return null;
      if (row.body_hash !== canonicalHash({ route, body: body ?? null })) {
        throw new DomainError("IDEMPOTENCY_BODY_CONFLICT", "Clé déjà utilisée pour une autre requête");
      }
      return { status: Number(row.status_code), body: row.response };
    });
  }

  async remember(headers: Record<string, unknown>, key: string, route: string, body: unknown, status: number, response: unknown): Promise<void> {
    const nowMs = this.now();
    await inTx(this.pool, async (db) => {
      const id = await sessionIdentity(db, headers, nowMs);
      await db.query(
        `INSERT INTO api_idempotency (identity_id, idempotency_key, route, body_hash, status_code, response)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT DO NOTHING`,
        [id, key, route, canonicalHash({ route, body: body ?? null }), status, JSON.stringify(response ?? null)],
      );
    });
  }
}
