/**
 * KÓMBE @kombe/api — contexte des routes « tontine réelle » (mode réel).
 *
 * Contrairement à `resolveGroupActor` (une seule fonction par adhésion, socle
 * pilote), un membre d'association cumule souvent plusieurs fonctions
 * (trésorière ET hôte, président ET témoin…) : l'acteur porte TOUTES ses
 * fonctions acceptées et non terminées, et chaque route vérifie l'action via
 * la matrice du domaine (`assertCanAct`). Une seule transaction par requête,
 * scopée au groupe (RLS `tenant_isolation`), l'identité venant toujours de la
 * session résolue côté serveur.
 */
import { randomInt, randomUUID } from "node:crypto";
import type pg from "pg";
import {
  DomainError,
  GENESIS_HASH,
  isGroupRole,
  sealEventV1,
  type GroupRole,
  type JournalRole,
} from "@kombe/domain";
import { lockGroupForJournalWrite, withGroupTx, withIdentityTx } from "../db/txContext.js";
import { resolveSession } from "../db/pgSessionResolver.js";

export interface TontineActor {
  readonly identityId: string;
  readonly membershipId: string;
  readonly roles: readonly GroupRole[];
  readonly displayName: string | null;
}

type Req = { readonly headers: Record<string, unknown> };

function bearer(request: Req): string {
  const h = request.headers["authorization"];
  const sessionId = typeof h === "string" && h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!sessionId) throw new DomainError("SESSION_INVALID", "Session non applicable");
  return sessionId;
}

/** Identité de la session (transaction courte dédiée). */
export async function sessionIdentity(pool: pg.Pool, request: Req, now: () => number): Promise<string> {
  const sessionId = bearer(request);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const identity = await resolveSession(client, sessionId, now());
    await client.query("COMMIT");
    return identity.identityId;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* connexion perdue */
    }
    throw error;
  } finally {
    client.release();
  }
}

/** Adhésion ACTIVE + fonctions acceptées de l'identité dans le groupe courant. */
export async function loadActor(client: pg.PoolClient, groupId: string, identityId: string): Promise<TontineActor> {
  const res = await client.query<{ membership_id: string; display_name: string | null; roles: string[] | null }>(
    `SELECT m.membership_id, m.display_name,
            (SELECT array_agg(r.role) FROM role_assignment r
              WHERE r.group_id = m.group_id AND r.membership_id = m.membership_id
                AND r.accepted_at IS NOT NULL AND r.ended_at IS NULL) AS roles
       FROM membership m
      WHERE m.group_id = $1 AND m.identity_id = $2 AND m.state = 'active'`,
    [groupId, identityId],
  );
  const row = res.rows[0];
  // Non-divulgation : pas de distinction « groupe inexistant » / « pas membre ».
  if (!row) throw new DomainError("TONTINE_FORBIDDEN", "Accès refusé");
  const roles = (row.roles ?? []).filter(isGroupRole);
  return {
    identityId,
    membershipId: row.membership_id,
    roles: roles.length > 0 ? [...new Set(roles)] : ["member"],
    displayName: row.display_name,
  };
}

/** Requête de groupe : session → transaction groupe → acteur → effet. */
export async function withActor<T>(
  pool: pg.Pool,
  request: Req,
  groupId: string,
  now: () => number,
  fn: (client: pg.PoolClient, actor: TontineActor) => Promise<T>,
): Promise<T> {
  const identityId = await sessionIdentity(pool, request, now);
  return withGroupTx(pool, groupId, async (client) => {
    await client.query("SELECT set_config('kombe.identity_id', $1, true)", [identityId]);
    const actor = await loadActor(client, groupId, identityId);
    return fn(client, actor);
  });
}

/** Requête d'identité (mes groupes, mon profil, mes notifications). */
export async function withSessionIdentity<T>(
  pool: pg.Pool,
  request: Req,
  now: () => number,
  fn: (client: pg.PoolClient, identityId: string) => Promise<T>,
): Promise<T> {
  const identityId = await sessionIdentity(pool, request, now);
  return withIdentityTx(pool, identityId, (client) => fn(client, identityId)).catch((e: unknown) => {
    // withIdentityTx traduit les erreurs techniques en TOKEN_INVALID (contexte
    // d'accès) ; ici une erreur technique n'est pas un problème de jeton.
    if (e instanceof DomainError && e.code === "TOKEN_INVALID") {
      throw new DomainError("RESERVATION_INCOHERENTE", "Opération non confirmée");
    }
    throw e;
  });
}

/* ── Identifiants ─────────────────────────────────────────────────────── */

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** Code d'invitation lisible (8 caractères, sans 0/O/1/I). */
export function invitationCode(): string {
  let out = "";
  for (let i = 0; i < 8; i += 1) out += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  return out;
}

/* ── Journal ──────────────────────────────────────────────────────────── */

const ROLE_PRIORITY: readonly GroupRole[] = [
  "animator",
  "vice_president",
  "treasurer",
  "treasurer_deputy",
  "secretary",
  "auditor",
  "censor",
  "advisor",
  "member",
];

/** Fonction exacte (colonne `journal.actor_role`, CHECK élargi en 0024). */
export function primaryRole(roles: readonly GroupRole[]): GroupRole {
  return ROLE_PRIORITY.find((r) => roles.includes(r)) ?? "member";
}

/** Rôle d'enveloppe du journal (vocabulaire de la timeline C11) : les
 *  fonctions ajoutées se rattachent à leur famille (vice-président →
 *  présidence, adjoint → trésorerie, censeur et conseiller → membre). */
export function journalRole(roles: readonly GroupRole[]): JournalRole {
  const r = primaryRole(roles);
  switch (r) {
    case "vice_president":
      return "animator";
    case "treasurer_deputy":
      return "treasurer";
    case "censor":
    case "advisor":
      return "member";
    default:
      return r;
  }
}

function jsonSafe(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
}

/**
 * Événement scellé dans le journal chaîné du groupe (append-only, même
 * scellement que les cotisations C06). Toute décision « tontine » laisse une
 * trace rejouable : qui, quelle fonction, quand (horloge serveur), quoi.
 */
export async function appendEvent(
  client: pg.PoolClient,
  groupId: string,
  actor: { readonly identityId: string; readonly roles: readonly GroupRole[] },
  type: string,
  body: Record<string, unknown>,
  nowMs: number,
): Promise<void> {
  await lockGroupForJournalWrite(client, groupId);
  const last = await client.query<{ hash: string; seq: string }>(
    `SELECT hash, seq FROM journal WHERE group_id = $1 ORDER BY seq DESC LIMIT 1`,
    [groupId],
  );
  const previousHash = last.rows[0] ? String(last.rows[0].hash) : GENESIS_HASH;
  const seq = last.rows[0] ? Number(last.rows[0].seq) + 1 : 1;
  const role = journalRole(actor.roles);
  const exactRole = primaryRole(actor.roles);
  const event = sealEventV1({
    groupId,
    seq,
    type,
    version: 1,
    previousHash,
    actorIdentityId: actor.identityId,
    actorRole: role,
    serverDate: new Date(nowMs).toISOString(),
    commandId: newId("cmd"),
    body: JSON.parse(jsonSafe(body)) as Record<string, unknown>,
  });
  await client.query(
    `INSERT INTO journal (group_id, seq, event_type, version, previous_hash, hash, payload,
                          actor_identity_id, actor_role, command_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)`,
    [
      groupId,
      event.seq,
      event.type,
      event.version,
      event.previousHash,
      event.hash,
      jsonSafe(event),
      actor.identityId,
      exactRole,
      event.commandId,
    ],
  );
}

/* ── Notifications in-app (libellés sans montant ni nom) ─────────────── */

export type NotificationKind =
  | "meeting_reminder"
  | "due_reminder"
  | "validation_waiting"
  | "payout_recorded"
  | "fine_issued"
  | "aid_decided"
  | "order_change"
  | "membership"
  | "minutes_ready"
  | "general";

export async function notify(
  client: pg.PoolClient,
  groupId: string,
  identityIds: readonly string[],
  kind: NotificationKind,
  target: string,
  dedup: string,
): Promise<void> {
  for (const id of new Set(identityIds)) {
    await client.query(`SELECT kombe_notify($1, $2, $3, $4, $5)`, [id, groupId, kind, target, `${dedup}:${id}`]);
  }
}

/** Identités actives détenant l'une des fonctions données. */
export async function identitiesWithRoles(
  client: pg.PoolClient,
  groupId: string,
  roles: readonly GroupRole[],
): Promise<string[]> {
  const res = await client.query<{ identity_id: string }>(
    `SELECT DISTINCT m.identity_id FROM membership m
       JOIN role_assignment r ON r.group_id = m.group_id AND r.membership_id = m.membership_id
      WHERE m.group_id = $1 AND m.state = 'active' AND r.role = ANY($2::text[])
        AND r.accepted_at IS NOT NULL AND r.ended_at IS NULL`,
    [groupId, roles as unknown as string[]],
  );
  return res.rows.map((r) => r.identity_id);
}

export function toBig(v: unknown): bigint {
  return BigInt(String(v ?? "0"));
}
