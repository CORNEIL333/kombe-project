/**
 * API produit « tontine réelle » — socle commun aux routes (docs/API_TONTINE.md).
 *
 * Une requête = UNE transaction : session résolue côté serveur (Bearer),
 * contexte RLS posé (`kombe.identity_id`, puis `kombe.group_id`), droits
 * vérifiés sur le groupe ET sur l'objet, effet, événement chaîné au journal,
 * notifications, réponse mémorisée pour l'idempotence — puis COMMIT. Toute
 * erreur annule l'ensemble : jamais d'effet partiel.
 */
import { randomUUID } from "node:crypto";
import type pg from "pg";
import {
  DomainError,
  GENESIS_HASH,
  canonicalHash,
  sealEventV1,
  type GroupRole,
  type JournalRole,
  type TontineAction,
  assertCanAct,
  canAct,
} from "@kombe/domain";
import { resolveSession } from "../db/pgSessionResolver.js";

export type Db = pg.PoolClient;

/** Identifiant opaque préfixé (lisible dans les journaux d'exploitation). */
export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}

/** Montant XAF reçu en chaîne d'entier → bigint (jamais de flottant). */
export function money(value: string | number | bigint | null | undefined, field = "montant"): bigint {
  if (value === null || value === undefined) return 0n;
  if (typeof value === "bigint") return value;
  const s = String(value).trim();
  if (!/^\d{1,13}$/.test(s)) {
    throw new DomainError("MONEY_NOT_INTEGER", `${field} : entier XAF attendu`);
  }
  return BigInt(s);
}

export function m(value: bigint): string {
  return value.toString();
}

/** Date métier du jour à Douala (UTC+1, sans heure d'été). */
export function todayDouala(nowMs: number): string {
  return new Date(nowMs + 3_600_000).toISOString().slice(0, 10);
}

export function isoDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    // Les colonnes `date` arrivent en minuit local du serveur Node : on relit
    // les composantes locales (jamais un décalage UTC qui changerait le jour).
    const y = value.getFullYear();
    const mo = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${mo}-${d}`;
  }
  return String(value).slice(0, 10);
}

export function isoInstant(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

/* ── Transactions ─────────────────────────────────────────────────────── */

export async function inTx<T>(pool: pg.Pool, fn: (db: Db) => Promise<T>): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query("SET LOCAL idle_in_transaction_session_timeout = '15s'");
    await db.query("SET LOCAL lock_timeout = '3s'");
    await db.query("SET LOCAL statement_timeout = '15s'");
    const out = await fn(db);
    await db.query("COMMIT");
    return out;
  } catch (error) {
    try {
      await db.query("ROLLBACK");
    } catch {
      /* connexion perdue : le pool la recrée */
    }
    throw translatePgError(error);
  } finally {
    db.release();
  }
}

/** Erreur Postgres → erreur métier stable, jamais le message brut (fuite de schéma). */
export function translatePgError(error: unknown): unknown {
  if (error instanceof DomainError) return error;
  const code = (error as { code?: string } | null)?.code;
  if (process.env.KOMBE_DEBUG_PG === "1") {
    process.stderr.write(`[tontine pg] ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  }
  if (code === "23505") return new DomainError("STATE_CONFLICT", "Déjà enregistré");
  if (code === "23514" || code === "23503" || code === "23502") {
    return new DomainError("STATE_CONFLICT", "Opération refusée par les règles du registre");
  }
  if (code === "42501") return new DomainError("TONTINE_FORBIDDEN", "Opération non autorisée");
  if (code === "40001" || code === "40P01" || code === "55P03") {
    return new DomainError("STATE_CONFLICT", "Opération concurrente : réessayez");
  }
  return error;
}

/* ── Session et acteur ────────────────────────────────────────────────── */

export function bearerOf(headers: Record<string, unknown>): string {
  const h = headers["authorization"];
  return typeof h === "string" && h.startsWith("Bearer ") ? h.slice(7).trim() : "";
}

/** Résout la session (pose `kombe.identity_id`) — 401 uniforme sinon. */
export async function sessionIdentity(db: Db, headers: Record<string, unknown>, nowMs: number): Promise<string> {
  const sid = bearerOf(headers);
  if (!sid) throw new DomainError("SESSION_INVALID", "Session non applicable");
  const who = await resolveSession(db, sid, nowMs);
  return who.identityId;
}

export interface Actor {
  readonly identityId: string;
  readonly groupId: string;
  readonly membershipId: string;
  readonly displayName: string;
  readonly roles: readonly GroupRole[];
  readonly membershipState: "pending" | "active";
}

export async function scopeGroup(db: Db, groupId: string): Promise<void> {
  if (!groupId || groupId.length > 200) throw new DomainError("OBJET_INTROUVABLE", "Objet hors portée");
  await db.query("SELECT set_config('kombe.group_id', $1, true)", [groupId]);
}

/** Fonctions acceptées et en cours d'un membre (+ « membre » implicite). */
export async function rolesOf(db: Db, membershipId: string): Promise<GroupRole[]> {
  const r = await db.query(
    `SELECT DISTINCT role FROM role_assignment
      WHERE membership_id = $1 AND accepted_at IS NOT NULL AND ended_at IS NULL`,
    [membershipId],
  );
  const roles = r.rows.map((x) => String(x.role) as GroupRole);
  if (!roles.includes("member")) roles.push("member");
  return roles;
}

/**
 * Membre ACTIF du groupe (ou en attente si `allowPending`). Absence ⇒ 404
 * « hors portée » : on ne révèle jamais l'existence d'un groupe tiers.
 */
export async function groupActor(
  db: Db,
  identityId: string,
  groupId: string,
  opts: { readonly allowPending?: boolean } = {},
): Promise<Actor> {
  await scopeGroup(db, groupId);
  const r = await db.query(
    `SELECT membership_id, state, display_name FROM membership
      WHERE group_id = $1 AND identity_id = $2 AND state IN ('active','pending')
      ORDER BY (state = 'active') DESC LIMIT 1`,
    [groupId, identityId],
  );
  const row = r.rows[0];
  if (!row || (row.state === "pending" && !opts.allowPending)) {
    throw new DomainError("OBJET_INTROUVABLE", "Objet hors portée");
  }
  const membershipId = String(row.membership_id);
  return {
    identityId,
    groupId,
    membershipId,
    displayName: row.display_name ? String(row.display_name) : "",
    roles: row.state === "active" ? await rolesOf(db, membershipId) : [],
    membershipState: row.state as "pending" | "active",
  };
}

export function requireAct(actor: Actor, action: TontineAction): void {
  if (actor.membershipState !== "active") {
    throw new DomainError("TONTINE_FORBIDDEN", "Adhésion en attente d'admission");
  }
  assertCanAct(actor.roles, action);
}

export function may(actor: Actor, action: TontineAction): boolean {
  return actor.membershipState === "active" && canAct(actor.roles, action);
}

/** Rôle capturé dans l'enveloppe du journal : la fonction la plus élevée. */
const ROLE_RANK: readonly GroupRole[] = [
  "animator",
  "vice_president",
  "secretary",
  "treasurer",
  "treasurer_deputy",
  "auditor",
  "censor",
  "advisor",
  "member",
];
export function journalRole(roles: readonly GroupRole[]): JournalRole {
  for (const r of ROLE_RANK) if (roles.includes(r)) return r;
  return "member";
}

/* ── Journal chaîné ───────────────────────────────────────────────────── */

function jsonSafe(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
}

/**
 * Ajoute un événement au journal append-only du groupe (empreinte chaînée,
 * séquence sous verrou de groupe). Les montants du corps sont des chaînes :
 * le payload relu est identique à l'original (rejouable, vérifiable).
 */
export async function appendEvent(
  db: Db,
  actor: { readonly groupId: string; readonly identityId: string; readonly roles: readonly GroupRole[] },
  type: string,
  body: Readonly<Record<string, unknown>>,
  nowMs: number,
): Promise<string> {
  await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [actor.groupId]);
  const last = await db.query(`SELECT seq, hash FROM journal WHERE group_id = $1 ORDER BY seq DESC LIMIT 1`, [
    actor.groupId,
  ]);
  const previousHash = last.rows[0] ? String(last.rows[0].hash) : GENESIS_HASH;
  const seq = last.rows[0] ? Number(last.rows[0].seq) + 1 : 1;
  const event = sealEventV1({
    groupId: actor.groupId,
    seq,
    type,
    version: 1,
    previousHash,
    actorIdentityId: actor.identityId,
    actorRole: journalRole(actor.roles),
    serverDate: new Date(nowMs).toISOString(),
    commandId: newId("cmd"),
    body,
  });
  await db.query(
    `INSERT INTO journal (group_id, seq, event_type, version, previous_hash, hash, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [actor.groupId, event.seq, event.type, event.version, event.previousHash, event.hash, jsonSafe(event)],
  );
  return event.hash;
}

/* ── Notifications de l'application ───────────────────────────────────── */

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

/**
 * Notifie des identités du groupe courant. Libellé SANS montant ni nom
 * (écran verrouillé) : `target` est un chemin de l'app, le détail se lit
 * après authentification. Dédupliqué par `dedup`.
 */
export async function notify(
  db: Db,
  groupId: string,
  identityIds: readonly string[],
  kind: NotificationKind,
  target: string | null,
  dedup: string,
): Promise<void> {
  for (const id of new Set(identityIds)) {
    if (id.startsWith("offline_")) continue;
    await db.query("SELECT kombe_notify($1,$2,$3,$4,$5)", [id, groupId, kind, target, `${dedup}:${id}`]);
  }
}

/** Identités des membres actifs portant l'une des fonctions données. */
export async function identitiesWithRoles(db: Db, groupId: string, roles: readonly GroupRole[]): Promise<string[]> {
  const r = await db.query(
    `SELECT DISTINCT m.identity_id FROM role_assignment ra
       JOIN membership m ON m.group_id = ra.group_id AND m.membership_id = ra.membership_id
      WHERE ra.group_id = $1 AND ra.role = ANY($2) AND ra.accepted_at IS NOT NULL AND ra.ended_at IS NULL
        AND m.state = 'active'`,
    [groupId, roles as string[]],
  );
  return r.rows.map((x) => String(x.identity_id));
}

export async function activeMemberIdentities(db: Db, groupId: string): Promise<string[]> {
  const r = await db.query(`SELECT identity_id FROM membership WHERE group_id = $1 AND state = 'active'`, [groupId]);
  return r.rows.map((x) => String(x.identity_id));
}

/* ── Idempotence ──────────────────────────────────────────────────────── */

export interface IdemResult<T> {
  readonly status: number;
  readonly body: T;
}

/**
 * Rejoue la réponse mémorisée pour (identité, clé) ; sinon exécute et
 * mémorise dans la MÊME transaction. Même clé, corps différent ⇒ 422.
 */
export async function idempotent<T>(
  db: Db,
  identityId: string,
  key: string | undefined,
  route: string,
  requestBody: unknown,
  run: () => Promise<IdemResult<T>>,
): Promise<IdemResult<T>> {
  if (!key) return run();
  if (key.length < 8 || key.length > 120) throw new DomainError("STATE_CONFLICT", "Clé d'idempotence invalide");
  const bodyHash = canonicalHash({ route, body: requestBody ?? null });
  const prior = await db.query(
    `SELECT body_hash, status_code, response FROM api_idempotency WHERE identity_id = $1 AND idempotency_key = $2`,
    [identityId, key],
  );
  if (prior.rows[0]) {
    if (prior.rows[0].body_hash !== bodyHash) {
      throw new DomainError("IDEMPOTENCY_BODY_CONFLICT", "Clé déjà utilisée pour une autre requête");
    }
    return { status: Number(prior.rows[0].status_code), body: prior.rows[0].response as T };
  }
  const out = await run();
  await db.query(
    `INSERT INTO api_idempotency (identity_id, idempotency_key, route, body_hash, status_code, response)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
    [identityId, key, route, bodyHash, out.status, jsonSafe(out.body)],
  );
  return out;
}

/** Règle de visibilité d'un identifiant de connexion (numéro masqué hors bureau). */
export function maskLogin(login: string): string {
  if (login.startsWith("offline_")) return "";
  if (login.includes("@")) {
    const [u, d] = login.split("@");
    return `${(u ?? "").slice(0, 2)}•••@${d ?? ""}`;
  }
  if (login.length < 6) return "•••";
  return `${login.slice(0, 5)}•• •• •• ${login.slice(-2)}`;
}
