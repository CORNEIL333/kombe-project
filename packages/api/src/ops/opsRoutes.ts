/**
 * Console d'exploitation (X-08, X-11 à X-13) : routes de lecture réservées aux
 * OPÉRATEURS de la plateforme, alimentant les tableaux de bord Opérations,
 * Direction et Engineering. Toutes passent par les fonctions SECURITY DEFINER
 * de 0029_ops_console, qui refusent (42501 → 403) tout appelant non opérateur.
 * Aucune donnée individuelle n'est exposée ; aucune écriture.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import type pg from "pg";
import { z } from "zod";
import { DomainError } from "@kombe/domain";
import { inTx, sessionIdentity } from "../tontine/infra.js";

/** Dernier jalon de schéma attendu par CE build de l'API (test : = dernier fichier de migrations/). */
export const EXPECTED_LATEST_MIGRATION = "migrations/0029_ops_console.sql";

export interface OpsRoutesOptions {
  readonly pool: pg.Pool;
  readonly now: () => number;
}

const startedAt = Date.now();

export function registerOpsRoutes(app: FastifyInstance, opts: OpsRoutesOptions): void {
  const { pool, now } = opts;
  const H = (r: FastifyRequest): Record<string, unknown> => r.headers as Record<string, unknown>;

  /** Ouvre une transaction sous l'identité de la session et exige un opérateur. */
  async function asOperator<T>(req: FastifyRequest, fn: (db: pg.PoolClient) => Promise<T>): Promise<T> {
    return inTx(pool, async (db) => {
      await sessionIdentity(db, H(req), now());
      const r = await db.query("SELECT kombe_is_operator() AS ok");
      if (r.rows[0]?.ok !== true) throw new DomainError("TONTINE_FORBIDDEN", "Réservé aux opérateurs de la plateforme");
      return fn(db);
    });
  }

  // Qui suis-je pour la console ? (toute session ; ne révèle rien d'autre)
  app.get("/v1/ops/me", async (req) =>
    inTx(pool, async (db) => {
      const identityId = await sessionIdentity(db, H(req), now());
      const r = await db.query("SELECT kombe_is_operator() AS ok");
      return { identityId, operator: r.rows[0]?.ok === true };
    }),
  );

  app.get("/v1/ops/overview", async (req) =>
    asOperator(req, async (db) => {
      const r = await db.query("SELECT kombe_ops_overview() AS o");
      return r.rows[0]?.o ?? {};
    }),
  );

  app.get("/v1/ops/kpis", async (req) => {
    const weeks = z.coerce.number().int().min(1).max(104).default(12).parse((req.query as { weeks?: string }).weeks);
    return asOperator(req, async (db) => {
      const r = await db.query("SELECT * FROM kombe_ops_kpis($1)", [weeks]);
      return r.rows.map((x) => ({
        weekStart: String(x.week_start instanceof Date ? isoDay(x.week_start) : x.week_start).slice(0, 10),
        groupsCreated: Number(x.groups_created),
        identitiesCreated: Number(x.identities_created),
        membersAdmitted: Number(x.members_admitted),
        movementsDeclared: Number(x.movements_declared),
        movementsConfirmed: Number(x.movements_confirmed),
        amountDeclared: String(x.amount_declared),
        amountConfirmed: String(x.amount_confirmed),
        payoutsReceived: Number(x.payouts_received),
        meetingsClosed: Number(x.meetings_closed),
        medianConfirmHours: x.median_confirm_hours === null ? null : Number(x.median_confirm_hours),
      }));
    });
  });

  app.get("/v1/ops/groups", async (req) => {
    const limit = z.coerce.number().int().min(1).max(500).default(100).parse((req.query as { limit?: string }).limit);
    return asOperator(req, async (db) => {
      const r = await db.query("SELECT * FROM kombe_ops_groups($1)", [limit]);
      return r.rows.map((x) => ({
        groupId: String(x.group_id),
        name: x.display_name ? String(x.display_name) : null,
        state: String(x.state),
        createdAt: new Date(x.created_at).toISOString(),
        membersActive: Number(x.members_active),
        membersPending: Number(x.members_pending),
        meetingsTotal: Number(x.meetings_total),
        meetingsClosed: Number(x.meetings_closed),
        movementsDeclaredPending: Number(x.movements_declared_pending),
        oldestPendingAt: x.oldest_pending_at ? new Date(x.oldest_pending_at).toISOString() : null,
        openDebts: Number(x.open_debts),
        lastActivityAt: x.last_activity_at ? new Date(x.last_activity_at).toISOString() : null,
      }));
    });
  });

  app.get("/v1/ops/support-requests", async (req) => {
    const limit = z.coerce.number().int().min(1).max(500).default(100).parse((req.query as { limit?: string }).limit);
    return asOperator(req, async (db) => {
      const r = await db.query("SELECT * FROM kombe_ops_support_requests($1)", [limit]);
      return r.rows.map((x) => ({
        requestId: String(x.request_id),
        applicantIdentityId: String(x.applicant_identity_id),
        targetGroupId: String(x.target_group_id),
        targetGroupName: x.target_group_name ? String(x.target_group_name) : null,
        motif: String(x.motif),
        permissions: x.permissions as string[],
        approverCount: Number(x.approver_count),
        requiredApprovals: Number(x.required_approvals),
        requestedAt: new Date(x.requested_at).toISOString(),
        expiresAt: x.expires_at ? new Date(x.expires_at).toISOString() : null,
        status: String(x.status),
        version: Number(x.version),
      }));
    });
  });

  app.get("/v1/ops/engineering", async (req) =>
    asOperator(req, async (db) => {
      const r = await db.query("SELECT kombe_ops_engineering() AS e");
      const e = (r.rows[0]?.e ?? {}) as { migrations?: { name: string }[] };
      const names = (e.migrations ?? []).map((m) => m.name);
      return {
        ...e,
        api: {
          nodeVersion: process.version,
          uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
          commit: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.KOMBE_RELEASE ?? null,
          environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? null,
          smsProvider: process.env.KOMBE_SMS_PROVIDER ?? (process.env.NODE_ENV === "production" ? null : "simulator"),
          emailConfigured: Boolean(process.env.RESEND_API_KEY),
        },
        expectedLatestMigration: EXPECTED_LATEST_MIGRATION,
        schemaUpToDate: names.includes(EXPECTED_LATEST_MIGRATION),
      };
    }),
  );
}

function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
