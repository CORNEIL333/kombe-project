/**
 * Boîte de notifications de l'application et registre lisible (journal
 * chaîné, vérifié à chaque lecture), plus l'idempotence des écritures.
 */
import type pg from "pg";
import { DomainError, verifyJournal, type JournalEntryView, type JournalEvent, type NotificationView } from "@kombe/domain";
import { canonicalHash } from "@kombe/domain";
import { type Db, groupActor, inTx, isoInstant, notify, scopeGroup, sessionIdentity, todayDouala } from "./infra.js";
import { type GroupRow, computeDues, loadGroup, loadNames } from "./views.js";

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Rappels de l'application, produits à la lecture de la boîte (dédupliqués) :
 * séance dans les deux jours, cotisation en retard ou en délai de grâce.
 * Le libellé ne porte ni montant ni nom (écran verrouillé).
 */
async function produceReminders(db: Db, identityId: string, nowMs: number): Promise<void> {
  const today = todayDouala(nowMs);
  const mine = await db.query(`SELECT group_id, membership_id FROM kombe_my_memberships() WHERE membership_state = 'active' AND group_state = 'active'`);
  for (const row of mine.rows) {
    const gid = String(row.group_id);
    await scopeGroup(db, gid);
    let group: GroupRow;
    try {
      group = await loadGroup(db, gid);
    } catch {
      continue;
    }
    const mt = await db.query(
      `SELECT meeting_id FROM meeting WHERE group_id = $1 AND state = 'planned' AND scheduled_date BETWEEN $2::date AND $3::date ORDER BY seq LIMIT 1`,
      [gid, today, addDays(today, 2)],
    );
    if (mt.rows[0]) {
      await notify(db, gid, [identityId], "meeting_reminder", `/tontines/${gid}/seances/${mt.rows[0].meeting_id}`, `meetingSoon:${mt.rows[0].meeting_id}`);
    }
    const dues = await computeDues(db, group, String(row.membership_id), today, { onlyOpen: true });
    for (const d of dues.filter((x) => x.lateness === "late" || x.lateness === "grace")) {
      await notify(db, gid, [identityId], "due_reminder", `/tontines/${gid}`, `due:${d.roundSeq}:${d.lateness}`);
      break;
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
  "draw.committed": "Tirage scellé",
  "cycle.started": "Cycle démarré",
  "payout.declared": "Remise déclarée",
  "payout.received": "Remise reçue par le bénéficiaire",
  "round.closed": "Tour clos",
  "order.swap_requested": "Échange de tour demandé",
  "order.swap_accepted": "Échange de tour accepté",
  "order.swap_applied": "Échange de tour appliqué",
  "meeting.opened": "Séance ouverte",
  "meeting.attendance": "Appel noté",
  "meeting.closed": "Séance close, PV généré",
  "meeting.minutes_approved": "PV approuvé",
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
        `SELECT notification_id, group_id, kind, target, created_at, read_at FROM inbox_notification
          WHERE identity_id = $1 ${opts.unreadOnly ? "AND read_at IS NULL" : ""} ORDER BY created_at DESC, notification_id DESC LIMIT 100`,
        [id],
      );
      return r.rows.map((row) => ({
        notificationId: String(row.notification_id),
        groupId: row.group_id ? String(row.group_id) : null,
        groupName: row.group_id ? (nameOf.get(String(row.group_id)) ?? null) : null,
        kind: String(row.kind),
        target: row.target ?? null,
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
