/**
 * Échéances et relances (ADR-0042) : statuts à accepter, cotisations, séances,
 * votes et fonctions proposées. Les relances se rapprochent à l'approche de
 * l'échéance ; à l'échéance des statuts, les retardataires sont exclus (avant
 * le démarrage du cycle, si le bureau l'a choisi) ou signalés au bureau.
 *
 * Déclenchement : à chaque lecture de la boîte de notifications (pour la
 * personne qui lit, et l'échéance des statuts du groupe) et par la tâche
 * planifiée quotidienne (tous les groupes, toutes les personnes). Chaque palier
 * est dédupliqué : relancer deux fois le même calcul n'envoie rien de plus.
 */
import { dayReminderStage, reminderStage, reminderStageOpensAt, type GroupRole } from "@kombe/domain";
import { type Db, appendEvent, identitiesWithRoles, notify, scopeGroup, todayDouala } from "./infra.js";
import { computeDues, cycleInProgress, loadGroup, type GroupRow } from "./views.js";
import { statutesSigners } from "./groups.js";

/** Acteur des écritures automatiques du registre (échéance appliquée par KÓMBE). */
function systemActor(groupId: string): { groupId: string; identityId: string; roles: readonly GroupRole[] } {
  return { groupId, identityId: "kombe:echeances", roles: [] };
}

const BUREAU: readonly GroupRole[] = ["animator", "vice_president", "secretary"];

export interface ProcessOptions {
  /** Ne produire les relances que pour cette identité (lecture de sa boîte). */
  readonly onlyIdentity?: string | undefined;
}

/** Traite un groupe déjà mis en portée (`scopeGroup`). */
export async function processGroupDeadlines(db: Db, groupId: string, nowMs: number, opts: ProcessOptions = {}): Promise<void> {
  let group: GroupRow;
  try {
    group = await loadGroup(db, groupId);
  } catch {
    return;
  }
  if (group.state === "closed") return;
  await statutesDeadlines(db, group, nowMs, opts);
  if (group.state === "active" || group.state === "paused") {
    await dueAndMeetingReminders(db, group, nowMs, opts);
  }
  await voteReminders(db, group, nowMs, opts);
  await roleReminders(db, group, nowMs, opts);
}

/* ── Statuts : relances accentuées puis échéance ─────────────────────── */

async function statutesDeadlines(db: Db, group: GroupRow, nowMs: number, opts: ProcessOptions): Promise<void> {
  const gid = group.groupId;
  const r = await db.query(
    `SELECT v.version, d.deadline_at, d.acceptance_days, d.on_expiry, d.updated_at
       FROM statutes_version v JOIN statutes_deadline d ON d.group_id = v.group_id AND d.version = v.version
      WHERE v.group_id = $1 ORDER BY v.version DESC LIMIT 1`,
    [gid],
  );
  const row = r.rows[0];
  if (!row) return;
  const version = Number(row.version);
  const deadlineMs = new Date(row.deadline_at as string).getTime();
  const days = Number(row.acceptance_days);
  const onExpiry = String(row.on_expiry) as "exclude" | "keep";
  // Dernière annonce de l'échéance (publication ou prolongation) : un palier
  // déjà ouvert à ce moment-là est couvert par cette annonce (pas de doublon).
  const announcedMs = new Date(row.updated_at as string).getTime();
  const laggards = (await statutesSigners(db, gid, version)).filter((x) => !x.accepted);
  if (laggards.length === 0) return;
  const inCycle = await cycleInProgress(db, gid);
  const bureau = await identitiesWithRoles(db, gid, BUREAU);
  const expired: { membershipId: string; identityId: string; name: string; state: "active" | "pending" }[] = [];
  for (const p of laggards) {
    const own = p.joinedAtMs === null ? deadlineMs : Math.max(deadlineMs, p.joinedAtMs + days * 86_400_000);
    const stage = reminderStage(nowMs, own);
    if (stage === "expired") {
      expired.push(p);
      continue;
    }
    if (stage === null) continue;
    if (reminderStageOpensAt(stage, own) <= Math.max(announcedMs, p.joinedAtMs ?? 0)) continue;
    if (opts.onlyIdentity && opts.onlyIdentity !== p.identityId) continue;
    await notify(db, gid, [p.identityId], "statutes_reminder", `/tontines/${gid}/statuts`, `statutesRemind:${version}:${stage}`, {
      version,
      deadlineAt: new Date(own).toISOString(),
      onExpiry,
      stage,
      groupName: group.name,
    });
  }
  if (expired.length === 0) return;

  // Exclusion seulement avant tout cycle en cours (aucune remise en jeu) et
  // jamais de la présidence (le groupe resterait sans responsable).
  const presidency = new Set(await identitiesWithRoles(db, gid, ["animator"]));
  for (const p of expired) {
    const exclude = onExpiry === "exclude" && !inCycle && !presidency.has(p.identityId);
    if (exclude) {
      const upd = await db.query(
        `UPDATE membership SET state = 'revoked' WHERE group_id = $1 AND membership_id = $2 AND state IN ('active','pending')`,
        [gid, p.membershipId],
      );
      if ((upd.rowCount ?? 0) === 0) continue;
      await db.query(`UPDATE role_assignment SET ended_at = now() WHERE group_id = $1 AND membership_id = $2 AND ended_at IS NULL`, [gid, p.membershipId]);
      await appendEvent(db, systemActor(gid), "statutes.deadline_exclusion", { version, membershipId: p.membershipId, previousState: p.state }, nowMs);
      await notify(db, gid, [p.identityId], "statutes_excluded", `/tontines/${gid}`, `statutesExcluded:${version}`, {
        version,
        groupName: group.name,
        wasApplicant: p.state === "pending",
      });
    }
    await notify(db, gid, bureau, "statutes_expired", `/tontines/${gid}/statuts`, `statutesExpired:${version}:${p.membershipId}`, {
      version,
      name: p.name,
      excluded: exclude,
      reason: exclude ? null : onExpiry === "keep" ? "keep" : inCycle ? "cycle_in_progress" : "presidency",
      groupName: group.name,
    });
  }
}

/* ── Cotisations et séances : avant-veille, veille, jour même ────────── */

async function dueAndMeetingReminders(db: Db, group: GroupRow, nowMs: number, opts: ProcessOptions): Promise<void> {
  const gid = group.groupId;
  const today = todayDouala(nowMs);
  const members = await db.query(
    `SELECT membership_id, identity_id FROM membership WHERE group_id = $1 AND state = 'active' AND identity_id NOT LIKE 'offline\\_%'
        AND ($2::text IS NULL OR identity_id = $2)`,
    [gid, opts.onlyIdentity ?? null],
  );
  if (members.rows.length === 0) return;

  const mt = await db.query(
    `SELECT meeting_id, seq, scheduled_date::text AS d, location FROM meeting
      WHERE group_id = $1 AND state = 'planned' AND scheduled_date BETWEEN $2::date AND ($2::date + 2) ORDER BY seq LIMIT 1`,
    [gid, today],
  );
  const meeting = mt.rows[0];
  const meetingStage = meeting ? dayReminderStage(today, String(meeting.d)) : null;

  for (const m of members.rows) {
    const identityId = String(m.identity_id);
    if (meeting && meetingStage && meetingStage !== "j2") {
      await notify(db, gid, [identityId], "meeting_reminder", `/tontines/${gid}/seances/${meeting.meeting_id}`, `meetingSoon:${meeting.meeting_id}:${meetingStage}`, {
        date: String(meeting.d),
        seq: Number(meeting.seq),
        place: meeting.location ?? group.settings.meetingPlace ?? null,
        stage: meetingStage,
        groupName: group.name,
      });
    }
    const dues = await computeDues(db, group, String(m.membership_id), today, { onlyOpen: true });
    // Une relance par tour (toutes caisses confondues) : la plus urgente.
    const byRound = new Map<number, { date: string; remaining: bigint; lateness: string }>();
    for (const d of dues) {
      const cur = byRound.get(d.roundSeq);
      const rem = BigInt(d.remaining);
      byRound.set(d.roundSeq, { date: d.date, remaining: (cur?.remaining ?? 0n) + rem, lateness: cur?.lateness === "late" ? "late" : d.lateness });
    }
    for (const [seq, d] of [...byRound.entries()].sort((a, b) => a[0] - b[0])) {
      if (d.remaining <= 0n) continue;
      const stage = d.lateness === "late" || d.lateness === "grace" ? d.lateness : dayReminderStage(today, d.date);
      if (!stage) continue;
      await notify(db, gid, [identityId], "due_reminder", `/tontines/${gid}/argent`, `due:${seq}:${stage}`, {
        roundSeq: seq,
        date: d.date,
        deadlineTime: group.settings.deadlineTime,
        remaining: d.remaining.toString(),
        stage,
        groupName: group.name,
      });
      break;
    }
  }
}

/* ── Votes : la veille de la clôture, à qui n'a pas voté ─────────────── */

async function voteReminders(db: Db, group: GroupRow, nowMs: number, opts: ProcessOptions): Promise<void> {
  const gid = group.groupId;
  const r = await db.query(
    `SELECT d.decision_id, d.kind, d.closes_at, m.identity_id
       FROM group_decision d
       JOIN membership m ON m.group_id = d.group_id AND m.state = 'active' AND m.identity_id NOT LIKE 'offline\\_%'
        AND (m.joined_at IS NULL OR m.joined_at <= d.opened_at)
        AND (d.target_membership_id IS NULL OR d.kind NOT IN ('exclusion','removal','payout_suspension','replacement') OR m.membership_id <> d.target_membership_id)
      WHERE d.group_id = $1 AND d.state = 'open' AND d.closes_at > now()
        AND NOT EXISTS (SELECT 1 FROM decision_ballot b WHERE b.decision_id = d.decision_id AND b.membership_id = m.membership_id)
        AND ($2::text IS NULL OR m.identity_id = $2)`,
    [gid, opts.onlyIdentity ?? null],
  );
  for (const x of r.rows) {
    const closes = new Date(x.closes_at as string).getTime();
    const stage = reminderStage(nowMs, closes);
    if (stage !== "j1" && stage !== "h6") continue;
    await notify(db, gid, [String(x.identity_id)], "vote_reminder", `/tontines/${gid}/decisions`, `voteSoon:${x.decision_id}:${stage}`, {
      decisionKind: String(x.kind),
      closesAt: new Date(closes).toISOString(),
      stage,
      groupName: group.name,
    });
  }
}

/* ── Fonctions proposées et non acceptées ────────────────────────────── */

async function roleReminders(db: Db, group: GroupRow, nowMs: number, opts: ProcessOptions): Promise<void> {
  const gid = group.groupId;
  const r = await db.query(
    `SELECT ra.role_assignment_id, ra.role, m.identity_id, ra.proposed_at
       FROM role_assignment ra JOIN membership m ON m.group_id = ra.group_id AND m.membership_id = ra.membership_id
      WHERE ra.group_id = $1 AND ra.accepted_at IS NULL AND ra.ended_at IS NULL AND m.state = 'active'
        AND ($2::text IS NULL OR m.identity_id = $2)`,
    [gid, opts.onlyIdentity ?? null],
  );
  for (const x of r.rows) {
    const since = x.proposed_at ? new Date(x.proposed_at as string).getTime() : null;
    if (since === null || nowMs - since < 86_400_000) continue;
    const day = Math.floor((nowMs - since) / 86_400_000);
    if (day !== 1 && day !== 3 && day !== 7) continue;
    await notify(db, gid, [String(x.identity_id)], "role_reminder", `/tontines/${gid}/membres`, `roleRemind:${x.role_assignment_id}:${day}`, {
      role: String(x.role),
      groupName: group.name,
    });
  }
}

/** Tâche planifiée : tous les groupes vivants, chacun sous sa portée RLS. */
export async function processAllGroups(db: Db, nowMs: number): Promise<{ groups: number }> {
  const r = await db.query(`SELECT kombe_groups_to_process() AS g`);
  let n = 0;
  for (const row of r.rows) {
    const gid = String(row.g);
    await db.query("SAVEPOINT g");
    try {
      await scopeGroup(db, gid);
      await processGroupDeadlines(db, gid, nowMs);
      await db.query("RELEASE SAVEPOINT g");
      n += 1;
    } catch {
      await db.query("ROLLBACK TO SAVEPOINT g");
    }
  }
  return { groups: n };
}
