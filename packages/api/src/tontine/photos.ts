/* KÓMBE — photo de profil d'une tontine (migration 0034).
   Lecture : membres du groupe (RLS par groupe) ou porteur d'un code
   d'invitation valide. Écriture : fonction « group.photo » (présidence,
   secrétariat). Le serveur valide et nettoie chaque variante (domaine
   `cleanGroupPhoto`), limite la fréquence, journalise sans les octets. */

import { createHash } from "node:crypto";
import type pg from "pg";
import { DomainError, cleanGroupPhoto, type PhotoSize } from "@kombe/domain";
import { type Db, appendEvent, groupActor, inTx, requireAct, scopeGroup, sessionIdentity } from "./infra.js";

/** Au plus N changements par heure et par groupe (anti-abus, coût de stockage). */
const CHANGEMENTS_PAR_HEURE = 6;

/** La table existe-t-elle ? (API déployée avant la migration : pas de photo, pas d'erreur.) */
async function tablePresente(db: Db): Promise<boolean> {
  const r = await db.query(`SELECT to_regclass('public.group_photo') IS NOT NULL AS ok`);
  return r.rows[0]?.ok === true;
}

/** Version de la photo (clé de cache) ; null = pas de photo. Contexte de groupe déjà posé. */
export async function photoVersionOf(db: Db, groupId: string): Promise<number | null> {
  if (!(await tablePresente(db))) return null;
  const r = await db.query(`SELECT version FROM group_photo WHERE group_id = $1 AND bytes_512 IS NOT NULL`, [groupId]);
  return r.rows[0] ? Number(r.rows[0].version) : null;
}

export interface PhotoBytes {
  readonly bytes: Buffer;
  readonly version: number;
}

function decode(b64: unknown, size: PhotoSize): Uint8Array {
  if (typeof b64 !== "string" || b64.length === 0 || b64.length > 600_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) {
    throw new DomainError("PHOTO_INVALID", `Variante ${size} px absente ou mal encodée`);
  }
  return new Uint8Array(Buffer.from(b64, "base64"));
}

async function lire(db: Db, groupId: string, size: PhotoSize): Promise<PhotoBytes | null> {
  if (!(await tablePresente(db))) return null;
  const col = size === 512 ? "bytes_512" : "bytes_256";
  const r = await db.query(`SELECT version, ${col} AS b FROM group_photo WHERE group_id = $1 AND ${col} IS NOT NULL`, [groupId]);
  return r.rows[0] ? { bytes: r.rows[0].b as Buffer, version: Number(r.rows[0].version) } : null;
}

export class PhotoService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly now: () => number,
  ) {}

  /** Membre (actif ou en attente) du groupe uniquement. */
  async read(headers: Record<string, unknown>, groupId: string, size: PhotoSize): Promise<PhotoBytes | null> {
    return inTx(this.pool, async (db) => {
      const identityId = await sessionIdentity(db, headers, this.now());
      await groupActor(db, identityId, groupId);
      return lire(db, groupId, size);
    });
  }

  /** Aperçu d'invitation : le code (connu du destinataire) ouvre la photo, rien d'autre. */
  async readForInvitation(headers: Record<string, unknown>, code: string, size: PhotoSize): Promise<PhotoBytes | null> {
    return inTx(this.pool, async (db) => {
      await sessionIdentity(db, headers, this.now());
      const r = await db.query(`SELECT * FROM kombe_invitation_by_code($1)`, [code.trim().toUpperCase()]);
      const row = r.rows[0];
      if (!row || row.usable !== true) throw new DomainError("INVITATION_INVALID", "Code inconnu ou expiré");
      await scopeGroup(db, String(row.group_id));
      return lire(db, String(row.group_id), size);
    });
  }

  async replace(headers: Record<string, unknown>, groupId: string, body: { image512?: unknown; image256?: unknown }): Promise<{ photoVersion: number }> {
    const nowMs = this.now();
    const v512 = cleanGroupPhoto(decode(body.image512, 512), 512);
    const v256 = cleanGroupPhoto(decode(body.image256, 256), 256);
    const sha = createHash("sha256").update(v512).digest("hex");
    return inTx(this.pool, async (db) => {
      const actor = await groupActor(db, await sessionIdentity(db, headers, nowMs), groupId);
      requireAct(actor, "group.photo");
      if (!(await tablePresente(db))) throw new DomainError("STATE_CONFLICT", "Photos de groupe pas encore disponibles sur ce serveur");
      await this.limiter(db, groupId, nowMs);
      const r = await db.query(
        `INSERT INTO group_photo (group_id, version, sha256, bytes_512, bytes_256, updated_by, updated_at)
         VALUES ($1, 1, $2, $3, $4, $5, $6)
         ON CONFLICT (group_id) DO UPDATE SET version = group_photo.version + 1, sha256 = EXCLUDED.sha256,
           bytes_512 = EXCLUDED.bytes_512, bytes_256 = EXCLUDED.bytes_256, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at
         RETURNING version`,
        [groupId, sha, Buffer.from(v512), Buffer.from(v256), actor.identityId, new Date(nowMs)],
      );
      const version = Number(r.rows[0]?.version);
      await appendEvent(db, actor, "tontine.photo_changed", { version, sha256: sha }, nowMs);
      return { photoVersion: version };
    });
  }

  /** Retour aux initiales : les octets sont effacés (l'application n'a pas le droit DELETE). */
  async remove(headers: Record<string, unknown>, groupId: string): Promise<{ photoVersion: null }> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await groupActor(db, await sessionIdentity(db, headers, nowMs), groupId);
      requireAct(actor, "group.photo");
      if (!(await tablePresente(db))) return { photoVersion: null };
      const r = await db.query(
        `UPDATE group_photo SET version = version + 1, sha256 = NULL, bytes_512 = NULL, bytes_256 = NULL, updated_by = $2, updated_at = $3
          WHERE group_id = $1 AND bytes_512 IS NOT NULL RETURNING version`,
        [groupId, actor.identityId, new Date(nowMs)],
      );
      if (r.rows[0]) await appendEvent(db, actor, "tontine.photo_removed", { version: Number(r.rows[0].version) }, nowMs);
      return { photoVersion: null };
    });
  }

  private async limiter(db: Db, groupId: string, nowMs: number): Promise<void> {
    const r = await db.query(
      `SELECT count(*) AS n FROM journal WHERE group_id = $1 AND event_type IN ('tontine.photo_changed','tontine.photo_removed')
          AND (payload->>'serverDate')::timestamptz > $2`,
      [groupId, new Date(nowMs - 3_600_000)],
    );
    if (Number(r.rows[0]?.n ?? 0) >= CHANGEMENTS_PAR_HEURE) {
      throw new DomainError("PHOTO_THROTTLED", "Trop de changements de photo : réessayez dans une heure");
    }
  }
}

/* ── Photo de profil d'un membre (migration 0035) ─────────────────────────
   Une par personne. Écriture : soi-même. Lecture : soi-même ou un membre d'un
   groupe partagé (groupActor pose le groupe, la RLS fait le reste). */

async function tableMembrePresente(db: Db): Promise<boolean> {
  const r = await db.query(`SELECT to_regclass('public.identity_photo') IS NOT NULL AS ok`);
  return r.rows[0]?.ok === true;
}

/** Versions des photos des membres d'un groupe (membership_id → version). Contexte de groupe déjà posé. */
export async function memberPhotoVersions(db: Db, groupId: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!(await tableMembrePresente(db))) return out;
  const r = await db.query(
    `SELECT m.membership_id, p.version FROM membership m JOIN identity_photo p ON p.identity_id = m.identity_id
      WHERE m.group_id = $1 AND p.bytes_512 IS NOT NULL`,
    [groupId],
  );
  for (const row of r.rows) out.set(String(row.membership_id), Number(row.version));
  return out;
}

export async function myPhotoVersion(db: Db, identityId: string): Promise<number | null> {
  if (!(await tableMembrePresente(db))) return null;
  const r = await db.query(`SELECT version FROM identity_photo WHERE identity_id = $1 AND bytes_512 IS NOT NULL`, [identityId]);
  return r.rows[0] ? Number(r.rows[0].version) : null;
}

export class MemberPhotoService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly now: () => number,
  ) {}

  async readMine(headers: Record<string, unknown>, size: PhotoSize): Promise<PhotoBytes | null> {
    return inTx(this.pool, async (db) => {
      const id = await sessionIdentity(db, headers, this.now());
      if (!(await tableMembrePresente(db))) return null;
      const col = size === 512 ? "bytes_512" : "bytes_256";
      const r = await db.query(`SELECT version, ${col} AS b FROM identity_photo WHERE identity_id = $1 AND ${col} IS NOT NULL`, [id]);
      return r.rows[0] ? { bytes: r.rows[0].b as Buffer, version: Number(r.rows[0].version) } : null;
    });
  }

  /** Photo d'un membre : réservée aux membres du même groupe. */
  async readMember(headers: Record<string, unknown>, groupId: string, membershipId: string, size: PhotoSize): Promise<PhotoBytes | null> {
    return inTx(this.pool, async (db) => {
      await groupActor(db, await sessionIdentity(db, headers, this.now()), groupId);
      if (!(await tableMembrePresente(db))) return null;
      const col = size === 512 ? "bytes_512" : "bytes_256";
      const r = await db.query(
        `SELECT p.version, p.${col} AS b FROM membership m JOIN identity_photo p ON p.identity_id = m.identity_id
          WHERE m.group_id = $1 AND m.membership_id = $2 AND p.${col} IS NOT NULL`,
        [groupId, membershipId],
      );
      return r.rows[0] ? { bytes: r.rows[0].b as Buffer, version: Number(r.rows[0].version) } : null;
    });
  }

  async replace(headers: Record<string, unknown>, body: { image512?: unknown; image256?: unknown }): Promise<{ photoVersion: number }> {
    const nowMs = this.now();
    const v512 = cleanGroupPhoto(decode(body.image512, 512), 512);
    const v256 = cleanGroupPhoto(decode(body.image256, 256), 256);
    const sha = createHash("sha256").update(v512).digest("hex");
    return inTx(this.pool, async (db) => {
      const id = await sessionIdentity(db, headers, nowMs);
      if (!(await tableMembrePresente(db))) throw new DomainError("STATE_CONFLICT", "Photos de profil pas encore disponibles sur ce serveur");
      await this.limiter(db, id, nowMs);
      const r = await db.query(
        `INSERT INTO identity_photo (identity_id, sha256, bytes_512, bytes_256, window_start, window_count, updated_at)
         VALUES ($1, $2, $3, $4, $5, 1, $5)
         ON CONFLICT (identity_id) DO UPDATE SET version = identity_photo.version + 1, sha256 = EXCLUDED.sha256,
           bytes_512 = EXCLUDED.bytes_512, bytes_256 = EXCLUDED.bytes_256, updated_at = EXCLUDED.updated_at,
           window_count = CASE WHEN identity_photo.window_start > $5::timestamptz - interval '1 hour' THEN identity_photo.window_count + 1 ELSE 1 END,
           window_start = CASE WHEN identity_photo.window_start > $5::timestamptz - interval '1 hour' THEN identity_photo.window_start ELSE $5 END
         RETURNING version`,
        [id, sha, Buffer.from(v512), Buffer.from(v256), new Date(nowMs)],
      );
      return { photoVersion: Number(r.rows[0]?.version) };
    });
  }

  async remove(headers: Record<string, unknown>): Promise<{ photoVersion: null }> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const id = await sessionIdentity(db, headers, nowMs);
      if (!(await tableMembrePresente(db))) return { photoVersion: null };
      await db.query(
        `UPDATE identity_photo SET version = version + 1, sha256 = NULL, bytes_512 = NULL, bytes_256 = NULL, updated_at = $2
          WHERE identity_id = $1 AND bytes_512 IS NOT NULL`,
        [id, new Date(nowMs)],
      );
      return { photoVersion: null };
    });
  }

  private async limiter(db: Db, identityId: string, nowMs: number): Promise<void> {
    const r = await db.query(`SELECT window_start, window_count FROM identity_photo WHERE identity_id = $1`, [identityId]);
    const row = r.rows[0];
    if (row && new Date(row.window_start as string).getTime() > nowMs - 3_600_000 && Number(row.window_count) >= CHANGEMENTS_PAR_HEURE) {
      throw new DomainError("PHOTO_THROTTLED", "Trop de changements de photo : réessayez dans une heure");
    }
  }
}
