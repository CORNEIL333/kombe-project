/**
 * Votes libres (0041) : tout membre actif ouvre un vote sur le sujet de son
 * choix, avec les réponses qu'il rédige (et, s'il le veut, une réponse libre).
 * Un vote libre ÉCLAIRE le groupe : il ne déclenche aucun effet automatique
 * (les décisions qui engagent restent les décisions votées, ADR-0038).
 * Chacun peut changer sa réponse tant que le vote est ouvert. L'auteur ou la
 * présidence clôt ou annule.
 */
import type pg from "pg";
import { DomainError, type PollView } from "@kombe/domain";
import { type Actor, type Db, activeMemberIdentities, appendEvent, groupActor, inReadTx, inTx, isoInstant, may, newId, notify, requireAct, sessionIdentity } from "./infra.js";
import { loadNames } from "./views.js";

export interface PollCreateInput {
  readonly question: string;
  readonly details?: string | null | undefined;
  readonly options: readonly string[];
  readonly allowFreeAnswer?: boolean | undefined;
  readonly multiple?: boolean | undefined;
  readonly anonymous?: boolean | undefined;
  /** Durée en heures ; absente = ouvert jusqu'à clôture par l'auteur. */
  readonly hours?: number | undefined;
}

export interface PollBallotInput {
  readonly choices: readonly number[];
  readonly freeAnswer?: string | null | undefined;
}

const clean = (s: string): string => s.trim().replace(/\s+/g, " ");

/** Vote dont l'échéance est passée : lu comme clos (la clôture s'écrit à la prochaine écriture). */
function effectiveState(row: { state: string; closes_at: unknown }, nowMs: number): "open" | "closed" | "cancelled" {
  if (row.state === "open" && row.closes_at && new Date(String(row.closes_at)).getTime() <= nowMs) return "closed";
  return row.state as "open" | "closed" | "cancelled";
}

async function pollViews(db: Db, actor: Actor, nowMs: number, pollId?: string): Promise<PollView[]> {
  const names = await loadNames(db, actor.groupId);
  const r = await db.query(
    `SELECT * FROM poll WHERE group_id = $1 ${pollId ? "AND poll_id = $2" : ""}
      ORDER BY (state = 'open') DESC, created_at DESC LIMIT 100`,
    pollId ? [actor.groupId, pollId] : [actor.groupId],
  );
  if (r.rows.length === 0) return [];
  const ids = r.rows.map((x) => String(x.poll_id));
  const b = await db.query(`SELECT poll_id, membership_id, choices, free_answer FROM poll_ballot WHERE group_id = $1 AND poll_id = ANY($2) ORDER BY cast_at`, [
    actor.groupId,
    ids,
  ]);
  const electorate = Number(
    (await db.query(`SELECT count(*)::int AS n FROM membership WHERE group_id = $1 AND state = 'active'`, [actor.groupId])).rows[0]?.n ?? 0,
  );
  const presidency = may(actor, "member.admit");
  return r.rows.map((row) => {
    const id = String(row.poll_id);
    const options = (row.options as string[]) ?? [];
    const anonymous = row.anonymous === true;
    const ballots = b.rows.filter((x) => String(x.poll_id) === id);
    const counts = options.map(() => 0);
    for (const x of ballots) for (const c of (x.choices as number[]) ?? []) if (c >= 0 && c < counts.length) counts[c] = (counts[c] ?? 0) + 1;
    const mine = ballots.find((x) => String(x.membership_id) === actor.membershipId);
    return {
      pollId: id,
      question: String(row.question),
      details: row.details ?? null,
      options,
      allowFreeAnswer: row.allow_free_answer === true,
      multiple: row.multiple === true,
      anonymous,
      state: effectiveState(row, nowMs),
      createdByMembershipId: String(row.created_by_membership_id),
      createdByName: names.byMembership.get(String(row.created_by_membership_id)) ?? "",
      createdAt: isoInstant(row.created_at) as string,
      closesAt: row.closes_at ? (isoInstant(row.closes_at) as string) : null,
      closedAt: row.closed_at ? (isoInstant(row.closed_at) as string) : null,
      electorate,
      ballotCount: ballots.length,
      counts,
      freeAnswers: ballots
        .filter((x) => x.free_answer)
        .map((x) => ({ text: String(x.free_answer), name: anonymous ? null : (names.byMembership.get(String(x.membership_id)) ?? null) })),
      voters: anonymous
        ? null
        : ballots.map((x) => ({
            membershipId: String(x.membership_id),
            name: names.byMembership.get(String(x.membership_id)) ?? "",
            choices: ((x.choices as number[]) ?? []).map(Number),
          })),
      myBallot: mine ? { choices: ((mine.choices as number[]) ?? []).map(Number), freeAnswer: mine.free_answer ?? null } : null,
      canManage: String(row.created_by_membership_id) === actor.membershipId || presidency,
    };
  });
}

export class PollService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly now: () => number,
  ) {}

  private async actor(db: Db, headers: Record<string, unknown>, groupId: string, nowMs: number): Promise<Actor> {
    return groupActor(db, await sessionIdentity(db, headers, nowMs), groupId);
  }

  async list(headers: Record<string, unknown>, groupId: string): Promise<PollView[]> {
    const nowMs = this.now();
    return inReadTx(this.pool, async (db) => pollViews(db, await this.actor(db, headers, groupId, nowMs), nowMs));
  }

  async create(headers: Record<string, unknown>, groupId: string, input: PollCreateInput): Promise<PollView> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await this.actor(db, headers, groupId, nowMs);
      requireAct(actor, "group.read"); // tout membre actif
      const question = clean(input.question);
      if (question.length < 3) throw new DomainError("POLL_INVALID", "Posez une question d'au moins 3 caractères");
      const options = input.options.map(clean).filter((o) => o.length > 0);
      if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) throw new DomainError("POLL_INVALID", "Deux réponses identiques");
      const allowFree = input.allowFreeAnswer === true;
      if (options.length < 2 && !allowFree) throw new DomainError("POLL_INVALID", "Proposez au moins deux réponses, ou acceptez les réponses libres");
      if (options.length === 1) throw new DomainError("POLL_INVALID", "Une seule réponse proposée : ajoutez-en une autre ou retirez-la");
      const open = await db.query(`SELECT count(*)::int AS n FROM poll WHERE group_id = $1 AND state = 'open'`, [groupId]);
      if (Number(open.rows[0]?.n ?? 0) >= 20) throw new DomainError("POLL_INVALID", "Trop de votes ouverts : clôturez-en avant d'en ouvrir un autre");
      const pollId = newId("pol");
      const closesAt = input.hours ? new Date(nowMs + input.hours * 3_600_000) : null;
      await db.query(
        `INSERT INTO poll (poll_id, group_id, question, details, options, allow_free_answer, multiple, anonymous,
                           created_by_membership_id, created_by_identity_id, created_at, closes_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          pollId,
          groupId,
          question,
          input.details?.trim() ? input.details.trim() : null,
          options,
          allowFree,
          input.multiple === true && options.length >= 2,
          input.anonymous === true,
          actor.membershipId,
          actor.identityId,
          new Date(nowMs),
          closesAt,
        ],
      );
      await appendEvent(db, actor, "poll.opened", { pollId }, nowMs);
      const others = (await activeMemberIdentities(db, groupId)).filter((i) => i !== actor.identityId);
      await notify(db, groupId, others, "poll_opened", `/tontines/${groupId}/votes`, `poll:${pollId}`, { question: question.slice(0, 80) });
      return (await pollViews(db, actor, nowMs, pollId))[0] as PollView;
    });
  }

  async vote(headers: Record<string, unknown>, groupId: string, pollId: string, input: PollBallotInput): Promise<PollView> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await this.actor(db, headers, groupId, nowMs);
      requireAct(actor, "group.read");
      const r = await db.query(`SELECT * FROM poll WHERE group_id = $1 AND poll_id = $2 FOR SHARE`, [groupId, pollId]);
      const row = r.rows[0];
      if (!row) throw new DomainError("OBJET_INTROUVABLE", "Vote introuvable");
      if (effectiveState(row, nowMs) !== "open") throw new DomainError("POLL_STATE_INVALID", "Ce vote est clos");
      const options = (row.options as string[]) ?? [];
      const choices = [...new Set(input.choices)].sort((a, b) => a - b);
      if (choices.some((c) => c < 0 || c >= options.length)) throw new DomainError("POLL_INVALID", "Réponse inconnue");
      if (choices.length > 1 && row.multiple !== true) throw new DomainError("POLL_INVALID", "Une seule réponse pour ce vote");
      const free = input.freeAnswer?.trim() ? clean(input.freeAnswer).slice(0, 300) : null;
      if (free && row.allow_free_answer !== true) throw new DomainError("POLL_INVALID", "Ce vote n'accepte pas de réponse libre");
      if (choices.length === 0 && !free) throw new DomainError("POLL_INVALID", "Choisissez une réponse");
      await db.query(
        `INSERT INTO poll_ballot (group_id, poll_id, membership_id, choices, free_answer, cast_at) VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (poll_id, membership_id) DO UPDATE SET choices = EXCLUDED.choices, free_answer = EXCLUDED.free_answer, cast_at = EXCLUDED.cast_at`,
        [groupId, pollId, actor.membershipId, choices, free, new Date(nowMs)],
      );
      return (await pollViews(db, actor, nowMs, pollId))[0] as PollView;
    });
  }

  async end(headers: Record<string, unknown>, groupId: string, pollId: string, to: "closed" | "cancelled"): Promise<PollView> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await this.actor(db, headers, groupId, nowMs);
      requireAct(actor, "group.read");
      const r = await db.query(`SELECT state, created_by_membership_id FROM poll WHERE group_id = $1 AND poll_id = $2 FOR UPDATE`, [groupId, pollId]);
      const row = r.rows[0];
      if (!row) throw new DomainError("OBJET_INTROUVABLE", "Vote introuvable");
      if (String(row.created_by_membership_id) !== actor.membershipId && !may(actor, "member.admit")) {
        throw new DomainError("TONTINE_FORBIDDEN", "Seul l'auteur du vote ou la présidence le clôt");
      }
      if (row.state !== "open") throw new DomainError("POLL_STATE_INVALID", "Ce vote est déjà clos");
      await db.query(`UPDATE poll SET state = $3, closed_at = $4, closed_by_identity_id = $5, version = version + 1 WHERE group_id = $1 AND poll_id = $2`, [
        groupId,
        pollId,
        to,
        new Date(nowMs),
        actor.identityId,
      ]);
      await appendEvent(db, actor, to === "closed" ? "poll.closed" : "poll.cancelled", { pollId }, nowMs);
      return (await pollViews(db, actor, nowMs, pollId))[0] as PollView;
    });
  }
}
