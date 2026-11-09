/**
 * CRM de la plateforme (ADR-0046) : demandes avec délais de service (ITIL),
 * fiches groupe et contact pseudonymes, notes, tâches, segments, journal
 * d'audit, conformité (RGPD / loi n° 2024/017).
 *
 * Accès : opérateurs uniquement, par fonction, avec le second facteur
 * (assertOperator), puis la base revérifie (RLS + fonctions SECURITY DEFINER).
 * Toute lecture d'une fiche de personne, tout affichage d'un identifiant en
 * clair et toute écriture laissent une ligne au journal d'audit, dans la même
 * transaction que l'acte. Le CRM ne touche à aucun montant.
 */
import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type pg from "pg";
import { z } from "zod";
import { DomainError } from "@kombe/domain";
import { inTx, sessionIdentity, type Db } from "../tontine/infra.js";
import { canonicalLogin } from "../tontine/auth.js";
import { assertOperator, type OperatorRole } from "../ops/operatorAccess.js";

export interface CrmRoutesOptions {
  readonly pool: pg.Pool;
  readonly now: () => number;
}

/* Fonctions d'opérateur par usage (« admin » ouvre tout, voir assertOperator). */
const SUPPORT: readonly OperatorRole[] = ["support", "operations"];
const PILOTAGE: readonly OperatorRole[] = ["support", "operations", "direction"];
const ADMIN: readonly OperatorRole[] = ["admin"];

export const CATEGORIES = ["connexion", "cotisation", "remise", "amende", "statuts", "application", "donnees_personnelles", "reclamation", "autre"] as const;
export const STATUTS = ["nouveau", "en_cours", "attente_membre", "resolu", "ferme"] as const;
const OUVERTS = ["nouveau", "en_cours", "attente_membre"];

const iso = (v: unknown): string | null => (v ? new Date(v as string).toISOString() : null);
const id = z.string().min(3).max(64).regex(/^[A-Za-z0-9_-]+$/);
const contactId = z.string().regex(/^ct_[0-9a-f]{20}$/);
const ticketId = z.string().regex(/^tk_[0-9a-f]{20}$/);

const S = {
  ticketCreate: z.object({
    subject: z.string().trim().min(3).max(140),
    category: z.enum(CATEGORIES),
    channel: z.enum(["application", "telephone", "email", "whatsapp", "sur_place"]),
    impact: z.number().int().min(1).max(3).default(3),
    urgency: z.number().int().min(1).max(3).default(3),
    groupId: id.optional(),
    contactId: contactId.optional(),
    body: z.string().trim().min(1).max(4000),
  }),
  ticketPatch: z.object({
    status: z.enum(STATUTS).optional(),
    impact: z.number().int().min(1).max(3).optional(),
    urgency: z.number().int().min(1).max(3).optional(),
    category: z.enum(CATEGORIES).optional(),
    assigneeContactId: contactId.nullable().optional(),
    groupId: id.nullable().optional(),
  }),
  message: z.object({ body: z.string().trim().min(1).max(4000), visibility: z.enum(["public", "interne"]) }),
  note: z.object({ groupId: id.optional(), contactId: contactId.optional(), body: z.string().trim().min(1).max(2000) }),
  task: z.object({
    title: z.string().trim().min(3).max(160),
    dueAt: z.string().datetime().optional(),
    assigneeContactId: contactId.optional(),
    groupId: id.optional(),
    contactId: contactId.optional(),
    ticketId: ticketId.optional(),
  }),
  taskPatch: z.object({ status: z.enum(["a_faire", "fait", "annule"]) }),
  reveal: z.object({ motif: z.string().trim().min(10).max(500) }),
  search: z.object({ login: z.string().trim().min(3).max(120) }),
  anonymize: z.object({ olderThanDays: z.number().int().min(365).max(3650).default(730) }),
  memberOpen: z.object({
    subject: z.string().trim().min(3).max(140),
    category: z.enum(CATEGORIES),
    body: z.string().trim().min(10).max(4000),
    groupId: id.optional(),
  }),
  memberReply: z.object({ body: z.string().trim().min(1).max(4000) }),
  memberRate: z.object({ score: z.number().int().min(1).max(5), comment: z.string().trim().max(500).optional() }),
};

/** Version attendue (verrou optimiste) : en-tête if-match-version obligatoire pour modifier une demande. */
function expectedVersion(req: FastifyRequest): number {
  const v = Number(req.headers["if-match-version"]);
  if (!Number.isInteger(v) || v < 1) throw new DomainError("CRM_INVALID", "En-tête if-match-version requis");
  return v;
}

async function audit(db: Db, me: string, action: string, kind: string, objectId: string | null, motif: string | null = null, detail: unknown = null): Promise<void> {
  await db.query(
    `INSERT INTO crm_audit_log (actor_contact_id, action, object_kind, object_id, motif, detail) VALUES ($1,$2,$3,$4,$5,$6)`,
    [me, action, kind, objectId, motif, detail === null ? null : JSON.stringify(detail)],
  );
}

async function names(db: Db, ids: readonly (string | null | undefined)[]): Promise<Map<string, string>> {
  const list = [...new Set(ids.filter((x): x is string => typeof x === "string"))];
  if (list.length === 0) return new Map();
  const r = await db.query(`SELECT contact_id, display_name FROM kombe_crm_contact_names($1::text[])`, [list]);
  return new Map(r.rows.map((x) => [String(x.contact_id), String(x.display_name)]));
}

function ticketView(r: Record<string, unknown>, nm: Map<string, string>, groupName: string | null, nowMs: number) {
  const open = OUVERTS.includes(String(r.status));
  const frDue = new Date(r.first_response_due as string).getTime();
  const resDue = new Date(r.resolution_due as string).getTime();
  return {
    ticketId: String(r.ticket_id),
    ref: String(r.ref),
    subject: String(r.subject),
    category: String(r.category),
    channel: String(r.channel),
    impact: Number(r.impact),
    urgency: Number(r.urgency),
    priority: Number(r.priority),
    status: String(r.status),
    groupId: r.group_id ? String(r.group_id) : null,
    groupName,
    requesterContactId: r.requester_contact_id ? String(r.requester_contact_id) : null,
    requesterName: r.requester_contact_id ? (nm.get(String(r.requester_contact_id)) ?? null) : null,
    assigneeContactId: r.assignee_contact_id ? String(r.assignee_contact_id) : null,
    assigneeName: r.assignee_contact_id ? (nm.get(String(r.assignee_contact_id)) ?? null) : null,
    createdAt: iso(r.created_at) as string,
    updatedAt: iso(r.updated_at) as string,
    firstResponseDue: iso(r.first_response_due) as string,
    resolutionDue: iso(r.resolution_due) as string,
    firstResponseAt: iso(r.first_response_at),
    resolvedAt: iso(r.resolved_at),
    closedAt: iso(r.closed_at),
    satisfaction: r.satisfaction === null || r.satisfaction === undefined ? null : Number(r.satisfaction),
    satisfactionComment: r.satisfaction_comment ? String(r.satisfaction_comment) : null,
    /** Délais de service dépassés (ITIL) : première réponse, résolution. */
    sla: {
      firstResponseBreached: r.first_response_at ? new Date(r.first_response_at as string).getTime() > frDue : open && nowMs > frDue,
      resolutionBreached: r.resolved_at ? new Date(r.resolved_at as string).getTime() > resDue : open && nowMs > resDue,
    },
    anonymized: r.anonymized_at !== null && r.anonymized_at !== undefined,
    version: Number(r.version),
  };
}

const TICKET_COLS = `t.ticket_id, t.ref, t.subject, t.category, t.channel, t.impact, t.urgency, t.priority, t.status, t.group_id,
  t.requester_contact_id, t.assignee_contact_id, t.created_at, t.updated_at, t.first_response_due, t.resolution_due,
  t.first_response_at, t.resolved_at, t.closed_at, t.satisfaction, t.satisfaction_comment, t.anonymized_at, t.version, g.display_name AS group_name`;

async function ticketsWhere(db: Db, where: string, params: unknown[], nowMs: number, limit = 200) {
  const r = await db.query(`SELECT ${TICKET_COLS} FROM crm_ticket t LEFT JOIN "group" g ON g.group_id = t.group_id WHERE ${where}
     ORDER BY (t.status IN ('nouveau','en_cours','attente_membre')) DESC, t.priority, t.created_at DESC LIMIT ${Math.min(500, limit)}`, params);
  const nm = await names(db, r.rows.flatMap((x) => [x.requester_contact_id, x.assignee_contact_id]));
  return r.rows.map((x) => ticketView(x, nm, x.group_name ? String(x.group_name) : null, nowMs));
}

/* Segments : listes de groupes à suivre, calculées à la demande sur la vue des opérations. */
interface OpsGroup { group_id: string; display_name: string | null; state: string; created_at: string; members_active: number; members_pending: number;
  movements_declared_pending: number; oldest_pending_at: string | null; open_debts: number; last_activity_at: string | null }
const DAY = 86_400_000;
const SEGMENTS: readonly { key: string; label: string; description: string; test: (g: OpsGroup, now: number, openTickets: Set<string>) => boolean }[] = [
  { key: "a-relancer", label: "Confirmations en retard", description: "Une déclaration attend la confirmation du trésorier depuis plus de 72 h.", test: (g, n) => Number(g.movements_declared_pending) > 0 && !!g.oldest_pending_at && n - new Date(g.oldest_pending_at).getTime() > 3 * DAY },
  { key: "admissions", label: "Admissions en attente", description: "Des personnes attendent d'être admises par le bureau.", test: (g) => Number(g.members_pending) > 0 },
  { key: "inactifs", label: "Inactifs depuis 30 jours", description: "Groupe en cours sans activité depuis 30 jours.", test: (g, n) => g.state === "active" && (!g.last_activity_at || n - new Date(g.last_activity_at).getTime() > 30 * DAY) },
  { key: "preparation-longue", label: "En préparation depuis 14 jours", description: "Créé il y a plus de 14 jours et toujours pas démarré.", test: (g, n) => g.state === "configuration" && n - new Date(g.created_at).getTime() > 14 * DAY },
  { key: "dettes", label: "Dettes ouvertes", description: "Au moins une dette suivie n'est pas soldée.", test: (g) => Number(g.open_debts) > 0 },
  { key: "nouveaux", label: "Nouveaux (7 jours)", description: "Créés dans les 7 derniers jours : accompagnement du démarrage.", test: (g, n) => n - new Date(g.created_at).getTime() <= 7 * DAY },
  { key: "demandes-ouvertes", label: "Avec une demande ouverte", description: "Une demande d'assistance liée au groupe n'est pas résolue.", test: (g, _n, open) => open.has(g.group_id) },
];

export function registerCrmRoutes(app: FastifyInstance, opts: CrmRoutesOptions): void {
  const { pool, now } = opts;
  const H = (r: FastifyRequest): Record<string, unknown> => r.headers as Record<string, unknown>;

  /** Opérateur de la bonne fonction + second facteur, puis transaction sous son identité ; `me` = son contact. */
  async function asOp<T>(req: FastifyRequest, roles: readonly OperatorRole[], fn: (db: Db, me: string) => Promise<T>): Promise<T> {
    await assertOperator(pool, H(req), now(), roles);
    return inTx(pool, async (db) => {
      await sessionIdentity(db, H(req), now());
      const me = String((await db.query("SELECT kombe_crm_me() AS c")).rows[0]?.c);
      return fn(db, me);
    });
  }
  const groupsOf = async (db: Db): Promise<OpsGroup[]> => (await db.query("SELECT * FROM kombe_ops_groups($1)", [500])).rows as OpsGroup[];

  /* ── Tableau de bord ─────────────────────────────────────────────── */
  app.get("/v1/crm/dashboard", async (req) =>
    asOp(req, PILOTAGE, async (db, me) => {
      const n = new Date(now());
      const r = (await db.query(
        `SELECT
           count(*) FILTER (WHERE status = 'nouveau') AS nouveau,
           count(*) FILTER (WHERE status = 'en_cours') AS en_cours,
           count(*) FILTER (WHERE status = 'attente_membre') AS attente_membre,
           count(*) FILTER (WHERE status = 'resolu' AND resolved_at > $1::timestamptz - interval '30 days') AS resolus_30j,
           count(*) FILTER (WHERE status IN ('nouveau','en_cours','attente_membre') AND priority = 1) AS p1,
           count(*) FILTER (WHERE status IN ('nouveau','en_cours','attente_membre') AND priority = 2) AS p2,
           count(*) FILTER (WHERE status IN ('nouveau','en_cours','attente_membre') AND priority = 3) AS p3,
           count(*) FILTER (WHERE status IN ('nouveau','en_cours','attente_membre') AND priority = 4) AS p4,
           count(*) FILTER (WHERE first_response_at IS NULL AND status IN ('nouveau','en_cours','attente_membre') AND first_response_due < $1) AS retard_reponse,
           count(*) FILTER (WHERE status IN ('nouveau','en_cours','attente_membre') AND resolution_due < $1) AS retard_resolution,
           count(*) FILTER (WHERE status IN ('nouveau','en_cours','attente_membre') AND category = 'donnees_personnelles') AS droits_ouverts,
           count(*) FILTER (WHERE created_at > $1::timestamptz - interval '7 days') AS crees_7j,
           count(*) FILTER (WHERE status IN ('nouveau','en_cours','attente_membre') AND assignee_contact_id = $2) AS mes_ouvertes,
           count(*) FILTER (WHERE status IN ('nouveau','en_cours','attente_membre') AND assignee_contact_id IS NULL) AS non_assignees,
           round(avg(satisfaction) FILTER (WHERE resolved_at > $1::timestamptz - interval '90 days'), 2) AS csat,
           count(satisfaction) FILTER (WHERE resolved_at > $1::timestamptz - interval '90 days') AS csat_n,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM first_response_at - created_at) / 3600)
             FILTER (WHERE first_response_at IS NOT NULL AND created_at > $1::timestamptz - interval '30 days') AS mediane_reponse_h,
           count(*) FILTER (WHERE first_response_at IS NOT NULL AND created_at > $1::timestamptz - interval '30 days') AS repondus_30j,
           count(*) FILTER (WHERE first_response_at IS NOT NULL AND first_response_at <= first_response_due AND created_at > $1::timestamptz - interval '30 days') AS repondus_a_temps_30j
         FROM crm_ticket`,
        [n, me],
      )).rows[0] ?? {};
      const t = (await db.query(`SELECT count(*) FILTER (WHERE status = 'a_faire') AS ouvertes, count(*) FILTER (WHERE status = 'a_faire' AND due_at < $2) AS en_retard FROM crm_task WHERE assignee_contact_id = $1`, [me, n])).rows[0] ?? {};
      const num = (v: unknown) => Number(v ?? 0);
      const repondus = num(r.repondus_30j);
      return {
        tickets: {
          byStatus: { nouveau: num(r.nouveau), en_cours: num(r.en_cours), attente_membre: num(r.attente_membre), resolus30j: num(r.resolus_30j) },
          openByPriority: { p1: num(r.p1), p2: num(r.p2), p3: num(r.p3), p4: num(r.p4) },
          breaches: { firstResponse: num(r.retard_reponse), resolution: num(r.retard_resolution) },
          rightsRequestsOpen: num(r.droits_ouverts),
          created7d: num(r.crees_7j),
          mineOpen: num(r.mes_ouvertes),
          unassigned: num(r.non_assignees),
          medianFirstResponseHours: r.mediane_reponse_h === null || r.mediane_reponse_h === undefined ? null : Math.round(Number(r.mediane_reponse_h) * 10) / 10,
          firstResponseOnTimePercent: repondus ? Math.round((num(r.repondus_a_temps_30j) * 100) / repondus) : null,
        },
        satisfaction: { average: r.csat === null || r.csat === undefined ? null : Number(r.csat), responses: num(r.csat_n) },
        myTasks: { open: num(t.ouvertes), overdue: num(t.en_retard) },
      };
    }),
  );

  /* ── Demandes ────────────────────────────────────────────────────── */
  app.get("/v1/crm/tickets", async (req) =>
    asOp(req, SUPPORT, async (db, me) => {
      const q = req.query as Record<string, string | undefined>;
      const where: string[] = ["true"];
      const params: unknown[] = [];
      const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
      if (q.status === "ouvertes" || !q.status) where.push(`t.status IN ('nouveau','en_cours','attente_membre')`);
      else if ((STATUTS as readonly string[]).includes(q.status)) where.push(`t.status = ${p(q.status)}`);
      if (q.priority && /^[1-4]$/.test(q.priority)) where.push(`t.priority = ${p(Number(q.priority))}`);
      if (q.assignee === "moi") where.push(`t.assignee_contact_id = ${p(me)}`);
      if (q.assignee === "personne") where.push(`t.assignee_contact_id IS NULL`);
      if (q.category && (CATEGORIES as readonly string[]).includes(q.category)) where.push(`t.category = ${p(q.category)}`);
      if (q.groupId && /^[A-Za-z0-9_-]{3,64}$/.test(q.groupId)) where.push(`t.group_id = ${p(q.groupId)}`);
      if (q.q && q.q.trim()) where.push(`(t.ref ILIKE ${p(`%${q.q.trim()}%`)} OR t.subject ILIKE $${params.length})`);
      return ticketsWhere(db, where.join(" AND "), params, now());
    }),
  );

  app.post("/v1/crm/tickets", async (req, reply) => {
    const b = S.ticketCreate.parse(req.body);
    const out = await asOp(req, SUPPORT, async (db, me) => {
      const tid = `tk_${randomBytes(10).toString("hex")}`;
      const ref = `KMB-${String((await db.query("SELECT nextval('crm_ticket_ref_seq') AS n")).rows[0]?.n).padStart(6, "0")}`;
      await db.query(
        `INSERT INTO crm_ticket (ticket_id, ref, requester_contact_id, group_id, subject, category, channel, impact, urgency, assignee_contact_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [tid, ref, b.contactId ?? null, b.groupId ?? null, b.subject, b.category, b.channel, b.impact, b.urgency, me],
      );
      await db.query(`INSERT INTO crm_ticket_message (ticket_id, author_kind, author_contact_id, visibility, body) VALUES ($1,'operateur',$2,'interne',$3)`, [tid, me, b.body]);
      await audit(db, me, "creation_demande", "demande", tid, null, { canal: b.channel, categorie: b.category });
      return (await ticketsWhere(db, "t.ticket_id = $1", [tid], now()))[0];
    });
    return reply.code(201).send(out);
  });

  app.get("/v1/crm/tickets/:id", async (req) => {
    const tid = ticketId.parse((req.params as { id: string }).id);
    return asOp(req, SUPPORT, async (db, me) => {
      const t = (await ticketsWhere(db, "t.ticket_id = $1", [tid], now()))[0];
      if (!t) throw new DomainError("OBJET_INTROUVABLE", "Demande introuvable");
      const m = await db.query(`SELECT message_id, author_kind, author_contact_id, visibility, body, created_at FROM crm_ticket_message WHERE ticket_id = $1 ORDER BY message_id`, [tid]);
      const nm = await names(db, m.rows.map((x) => x.author_contact_id));
      await audit(db, me, "consultation_demande", "demande", tid);
      return {
        ...t,
        messages: m.rows.map((x) => ({
          messageId: String(x.message_id),
          authorKind: String(x.author_kind),
          authorName: x.author_contact_id ? (nm.get(String(x.author_contact_id)) ?? null) : null,
          visibility: String(x.visibility),
          body: String(x.body),
          createdAt: iso(x.created_at) as string,
        })),
      };
    });
  });

  app.patch("/v1/crm/tickets/:id", async (req) => {
    const tid = ticketId.parse((req.params as { id: string }).id);
    const b = S.ticketPatch.parse(req.body);
    const v = expectedVersion(req);
    return asOp(req, SUPPORT, async (db, me) => {
      const sets: string[] = [];
      const params: unknown[] = [tid, v];
      const set = (col: string, val: unknown) => { params.push(val); sets.push(`${col} = $${params.length}`); };
      if (b.status !== undefined) set("status", b.status);
      if (b.impact !== undefined) set("impact", b.impact);
      if (b.urgency !== undefined) set("urgency", b.urgency);
      if (b.category !== undefined) set("category", b.category);
      if (b.assigneeContactId !== undefined) set("assignee_contact_id", b.assigneeContactId);
      if (b.groupId !== undefined) set("group_id", b.groupId);
      if (sets.length === 0) throw new DomainError("CRM_INVALID", "Rien à modifier");
      const u = await db.query(`UPDATE crm_ticket SET ${sets.join(", ")} WHERE ticket_id = $1 AND version = $2`, params);
      if (u.rowCount === 0) {
        const exists = await db.query(`SELECT 1 FROM crm_ticket WHERE ticket_id = $1`, [tid]);
        if (exists.rowCount === 0) throw new DomainError("OBJET_INTROUVABLE", "Demande introuvable");
        throw new DomainError("STATE_CONFLICT", "La demande a changé entre-temps : rechargez-la");
      }
      await audit(db, me, "modification_demande", "demande", tid, null, b);
      return (await ticketsWhere(db, "t.ticket_id = $1", [tid], now()))[0];
    });
  });

  app.post("/v1/crm/tickets/:id/messages", async (req, reply) => {
    const tid = ticketId.parse((req.params as { id: string }).id);
    const b = S.message.parse(req.body);
    const out = await asOp(req, SUPPORT, async (db, me) => {
      const t = (await db.query(`SELECT status, requester_contact_id FROM crm_ticket WHERE ticket_id = $1 FOR UPDATE`, [tid])).rows[0];
      if (!t) throw new DomainError("OBJET_INTROUVABLE", "Demande introuvable");
      if (b.visibility === "public" && !t.requester_contact_id) throw new DomainError("CRM_INVALID", "Cette demande n'a pas de demandeur à qui répondre");
      const m = await db.query(
        `INSERT INTO crm_ticket_message (ticket_id, author_kind, author_contact_id, visibility, body) VALUES ($1,'operateur',$2,$3,$4) RETURNING message_id`,
        [tid, me, b.visibility, b.body],
      );
      const mid = Number(m.rows[0]?.message_id);
      if (b.visibility === "public") {
        await db.query(
          `UPDATE crm_ticket SET first_response_at = COALESCE(first_response_at, now()),
             status = CASE WHEN status = 'nouveau' THEN 'en_cours' ELSE status END,
             assignee_contact_id = COALESCE(assignee_contact_id, $2)
           WHERE ticket_id = $1`,
          [tid, me],
        );
        await db.query(`SELECT kombe_crm_notify_reply($1, $2)`, [tid, mid]);
      }
      await audit(db, me, b.visibility === "public" ? "reponse_demande" : "note_interne", "demande", tid);
      return { messageId: String(mid) };
    });
    return reply.code(201).send(out);
  });

  /* ── Comptes (groupes) ───────────────────────────────────────────── */
  app.get("/v1/crm/accounts", async (req) =>
    asOp(req, PILOTAGE, async (db) => {
      const gs = await groupsOf(db);
      const t = await db.query(`SELECT group_id, count(*) FILTER (WHERE status IN ('nouveau','en_cours','attente_membre')) AS ouvertes, count(*) AS total FROM crm_ticket WHERE group_id IS NOT NULL GROUP BY group_id`);
      const byG = new Map(t.rows.map((x) => [String(x.group_id), { open: Number(x.ouvertes), total: Number(x.total) }]));
      const n = now();
      const openSet = new Set([...byG.entries()].filter(([, v]) => v.open > 0).map(([k]) => k));
      return gs.map((g) => ({
        groupId: g.group_id,
        name: g.display_name,
        state: g.state,
        createdAt: iso(g.created_at),
        membersActive: Number(g.members_active),
        membersPending: Number(g.members_pending),
        movementsDeclaredPending: Number(g.movements_declared_pending),
        oldestPendingAt: iso(g.oldest_pending_at),
        openDebts: Number(g.open_debts),
        lastActivityAt: iso(g.last_activity_at),
        ticketsOpen: byG.get(g.group_id)?.open ?? 0,
        ticketsTotal: byG.get(g.group_id)?.total ?? 0,
        segments: SEGMENTS.filter((s) => s.test(g, n, openSet)).map((s) => s.key),
      }));
    }),
  );

  app.get("/v1/crm/accounts/:groupId", async (req) => {
    const gid = id.parse((req.params as { groupId: string }).groupId);
    return asOp(req, SUPPORT, async (db, me) => {
      const g = (await groupsOf(db)).find((x) => x.group_id === gid);
      if (!g) throw new DomainError("OBJET_INTROUVABLE", "Groupe introuvable");
      const contacts = (await db.query(`SELECT * FROM kombe_crm_group_contacts($1)`, [gid])).rows;
      const notes = await db.query(`SELECT note_id, author_contact_id, body, created_at FROM crm_note WHERE group_id = $1 ORDER BY note_id DESC LIMIT 100`, [gid]);
      const tasks = await db.query(`SELECT task_id, title, due_at, status, assignee_contact_id, version FROM crm_task WHERE group_id = $1 ORDER BY (status = 'a_faire') DESC, due_at NULLS LAST, task_id DESC LIMIT 100`, [gid]);
      const nm = await names(db, [...notes.rows.map((x) => x.author_contact_id), ...tasks.rows.map((x) => x.assignee_contact_id)]);
      await audit(db, me, "consultation_contact", "groupe", gid, null, { responsables: contacts.length });
      const n = now();
      const tickets = await ticketsWhere(db, "t.group_id = $1", [gid], n, 100);
      const openSet = new Set(tickets.some((x) => OUVERTS.includes(x.status)) ? [gid] : []);
      return {
        groupId: gid,
        name: g.display_name,
        state: g.state,
        createdAt: iso(g.created_at),
        health: {
          membersActive: Number(g.members_active),
          membersPending: Number(g.members_pending),
          movementsDeclaredPending: Number(g.movements_declared_pending),
          oldestPendingAt: iso(g.oldest_pending_at),
          openDebts: Number(g.open_debts),
          lastActivityAt: iso(g.last_activity_at),
        },
        segments: SEGMENTS.filter((s) => s.test(g, n, openSet)).map((s) => s.key),
        contacts: contacts.map((c) => ({
          contactId: String(c.contact_id),
          displayName: String(c.display_name),
          roles: (c.roles as string[]) ?? [],
          membershipState: String(c.membership_state),
          loginMasked: String(c.login_masked),
          loginKind: String(c.login_kind),
        })),
        tickets,
        notes: notes.rows.map((x) => ({ noteId: String(x.note_id), authorName: nm.get(String(x.author_contact_id)) ?? null, body: String(x.body), createdAt: iso(x.created_at) as string })),
        tasks: tasks.rows.map((x) => ({ taskId: String(x.task_id), title: String(x.title), dueAt: iso(x.due_at), status: String(x.status), assigneeName: nm.get(String(x.assignee_contact_id)) ?? null, version: Number(x.version) })),
      };
    });
  });

  /* ── Contacts (pseudonymes) ──────────────────────────────────────── */
  app.post("/v1/crm/contacts/search", async (req) => {
    const b = S.search.parse(req.body);
    const login = canonicalLogin(b.login).login;
    return asOp(req, SUPPORT, async (db) => {
      const r = await db.query(`SELECT kombe_crm_find($1) AS c`, [login]);
      const c = r.rows[0]?.c;
      if (!c) throw new DomainError("OBJET_INTROUVABLE", "Aucun compte avec cet identifiant");
      return { contactId: String(c) };
    });
  });

  app.get("/v1/crm/contacts/:contactId", async (req) => {
    const cid = contactId.parse((req.params as { contactId: string }).contactId);
    return asOp(req, SUPPORT, async (db, me) => {
      const c = (await db.query(`SELECT * FROM kombe_crm_contact_card($1)`, [cid])).rows[0];
      if (!c) throw new DomainError("OBJET_INTROUVABLE", "Contact introuvable");
      const notes = await db.query(`SELECT note_id, author_contact_id, body, created_at FROM crm_note WHERE contact_id = $1 ORDER BY note_id DESC LIMIT 100`, [cid]);
      const tasks = await db.query(`SELECT task_id, title, due_at, status, assignee_contact_id, version FROM crm_task WHERE contact_id = $1 ORDER BY (status = 'a_faire') DESC, due_at NULLS LAST LIMIT 100`, [cid]);
      const nm = await names(db, [...notes.rows.map((x) => x.author_contact_id), ...tasks.rows.map((x) => x.assignee_contact_id)]);
      await audit(db, me, "consultation_contact", "contact", cid);
      return {
        contactId: cid,
        displayName: String(c.display_name),
        loginMasked: String(c.login_masked),
        loginKind: String(c.login_kind),
        language: String(c.language),
        createdAt: iso(c.created_at),
        isOperator: c.is_operator === true,
        groups: c.groups as { groupId: string; name: string | null; state: string; roles: string[] }[],
        consent: { push: c.push_enabled === true, sms: c.sms_enabled === true, email: c.email_enabled === true },
        tickets: await ticketsWhere(db, "t.requester_contact_id = $1", [cid], now(), 100),
        notes: notes.rows.map((x) => ({ noteId: String(x.note_id), authorName: nm.get(String(x.author_contact_id)) ?? null, body: String(x.body), createdAt: iso(x.created_at) as string })),
        tasks: tasks.rows.map((x) => ({ taskId: String(x.task_id), title: String(x.title), dueAt: iso(x.due_at), status: String(x.status), assigneeName: nm.get(String(x.assignee_contact_id)) ?? null, version: Number(x.version) })),
      };
    });
  });

  app.post("/v1/crm/contacts/:contactId/reveal", async (req) => {
    const cid = contactId.parse((req.params as { contactId: string }).contactId);
    const b = S.reveal.parse(req.body);
    return asOp(req, SUPPORT, async (db) => {
      const r = await db.query(`SELECT kombe_crm_reveal($1, $2) AS l`, [cid, b.motif]);
      if (!r.rows[0]?.l) throw new DomainError("OBJET_INTROUVABLE", "Contact introuvable");
      return { login: String(r.rows[0].l) };
    });
  });

  /* ── Notes et tâches ─────────────────────────────────────────────── */
  app.post("/v1/crm/notes", async (req, reply) => {
    const b = S.note.parse(req.body);
    if ((b.groupId === undefined) === (b.contactId === undefined)) throw new DomainError("CRM_INVALID", "Une note concerne un groupe OU un contact");
    const out = await asOp(req, SUPPORT, async (db, me) => {
      const r = await db.query(`INSERT INTO crm_note (group_id, contact_id, author_contact_id, body) VALUES ($1,$2,$3,$4) RETURNING note_id`, [b.groupId ?? null, b.contactId ?? null, me, b.body]);
      await audit(db, me, "note", b.groupId ? "groupe" : "contact", b.groupId ?? b.contactId ?? null);
      return { noteId: String(r.rows[0]?.note_id) };
    });
    return reply.code(201).send(out);
  });

  app.get("/v1/crm/tasks", async (req) =>
    asOp(req, SUPPORT, async (db, me) => {
      const q = req.query as Record<string, string | undefined>;
      const r = await db.query(
        `SELECT k.task_id, k.title, k.due_at, k.status, k.assignee_contact_id, k.group_id, g.display_name AS group_name, k.contact_id, k.ticket_id, t.ref, k.created_at, k.version
           FROM crm_task k LEFT JOIN "group" g ON g.group_id = k.group_id LEFT JOIN crm_ticket t ON t.ticket_id = k.ticket_id
          WHERE ($1 = 'toutes' OR k.assignee_contact_id = $2) AND ($3 = 'toutes' OR k.status = 'a_faire')
          ORDER BY (k.status = 'a_faire') DESC, k.due_at NULLS LAST, k.task_id DESC LIMIT 300`,
        [q.scope === "toutes" ? "toutes" : "miennes", me, q.status === "toutes" ? "toutes" : "ouvertes"],
      );
      const nm = await names(db, [...r.rows.map((x) => x.assignee_contact_id), ...r.rows.map((x) => x.contact_id)]);
      return r.rows.map((x) => ({
        taskId: String(x.task_id), title: String(x.title), dueAt: iso(x.due_at), status: String(x.status),
        overdue: x.status === "a_faire" && !!x.due_at && new Date(x.due_at).getTime() < now(),
        assigneeContactId: String(x.assignee_contact_id), assigneeName: nm.get(String(x.assignee_contact_id)) ?? null,
        groupId: x.group_id ? String(x.group_id) : null, groupName: x.group_name ? String(x.group_name) : null,
        contactId: x.contact_id ? String(x.contact_id) : null, contactName: x.contact_id ? (nm.get(String(x.contact_id)) ?? null) : null,
        ticketId: x.ticket_id ? String(x.ticket_id) : null, ticketRef: x.ref ? String(x.ref) : null,
        createdAt: iso(x.created_at) as string, version: Number(x.version),
      }));
    }),
  );

  app.post("/v1/crm/tasks", async (req, reply) => {
    const b = S.task.parse(req.body);
    const out = await asOp(req, SUPPORT, async (db, me) => {
      const r = await db.query(
        `INSERT INTO crm_task (title, due_at, assignee_contact_id, created_by_contact_id, group_id, contact_id, ticket_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING task_id`,
        [b.title, b.dueAt ?? null, b.assigneeContactId ?? me, me, b.groupId ?? null, b.contactId ?? null, b.ticketId ?? null],
      );
      await audit(db, me, "tache", "tache", String(r.rows[0]?.task_id), null, { titre: b.title });
      return { taskId: String(r.rows[0]?.task_id) };
    });
    return reply.code(201).send(out);
  });

  app.patch("/v1/crm/tasks/:id", async (req) => {
    const tid = z.string().regex(/^\d{1,18}$/).parse((req.params as { id: string }).id);
    const b = S.taskPatch.parse(req.body);
    const v = expectedVersion(req);
    return asOp(req, SUPPORT, async (db, me) => {
      const u = await db.query(
        `UPDATE crm_task SET status = $3, version = version + 1, done_at = CASE WHEN $3 = 'fait' THEN now() ELSE NULL END WHERE task_id = $1 AND version = $2 RETURNING version`,
        [tid, v, b.status],
      );
      if (u.rowCount === 0) throw new DomainError("STATE_CONFLICT", "La tâche a changé entre-temps : rechargez la liste");
      await audit(db, me, "tache", "tache", tid, null, { statut: b.status });
      return { taskId: tid, status: b.status, version: Number(u.rows[0]?.version) };
    });
  });

  app.get("/v1/crm/operators", async (req) =>
    asOp(req, SUPPORT, async (db) =>
      (await db.query(`SELECT * FROM kombe_crm_operators() ORDER BY display_name`)).rows.map((x) => ({ contactId: String(x.contact_id), displayName: String(x.display_name), roles: (x.roles as string[]) ?? [] })),
    ),
  );

  /* ── Segments ────────────────────────────────────────────────────── */
  app.get("/v1/crm/segments", async (req) =>
    asOp(req, PILOTAGE, async (db) => {
      const gs = await groupsOf(db);
      const open = new Set((await db.query(`SELECT DISTINCT group_id FROM crm_ticket WHERE group_id IS NOT NULL AND status IN ('nouveau','en_cours','attente_membre')`)).rows.map((x) => String(x.group_id)));
      const n = now();
      return SEGMENTS.map((s) => {
        const ids = gs.filter((g) => s.test(g, n, open));
        return { key: s.key, label: s.label, description: s.description, count: ids.length, groups: ids.map((g) => ({ groupId: g.group_id, name: g.display_name })) };
      });
    }),
  );

  /* ── Journal d'audit et conformité (administration) ──────────────── */
  app.get("/v1/crm/audit", async (req) =>
    asOp(req, ADMIN, async (db, me) => {
      const q = req.query as Record<string, string | undefined>;
      const r = await db.query(
        `SELECT audit_id, at, actor_contact_id, action, object_kind, object_id, motif, detail FROM crm_audit_log
          WHERE ($1::text IS NULL OR object_kind = $1) AND ($2::text IS NULL OR object_id = $2) ORDER BY audit_id DESC LIMIT 300`,
        [q.objectKind ?? null, q.objectId ?? null],
      );
      const nm = await names(db, r.rows.map((x) => x.actor_contact_id));
      await audit(db, me, "consultation_journal", "journal", null);
      return r.rows.map((x) => ({
        auditId: String(x.audit_id), at: iso(x.at) as string, actorName: nm.get(String(x.actor_contact_id)) ?? null, actorContactId: String(x.actor_contact_id),
        action: String(x.action), objectKind: String(x.object_kind), objectId: x.object_id ? String(x.object_id) : null,
        motif: x.motif ? String(x.motif) : null, detail: x.detail ?? null,
      }));
    }),
  );

  app.get("/v1/crm/compliance", async (req) =>
    asOp(req, ["direction", "admin"], async (db) => {
      const n = new Date(now());
      const records = await db.query(`SELECT record_id, purpose, data_categories, legal_basis, recipients, country, retention_days FROM processing_record ORDER BY record_id`);
      const rights = await ticketsWhere(db, `t.category = 'donnees_personnelles' AND t.status IN ('nouveau','en_cours','attente_membre')`, [], now(), 100);
      const ret = (await db.query(`SELECT count(*) AS n FROM crm_ticket WHERE status = 'ferme' AND anonymized_at IS NULL AND closed_at < $1::timestamptz - interval '730 days'`, [n])).rows[0];
      const anonymized = (await db.query(`SELECT count(*) AS n FROM crm_ticket WHERE anonymized_at IS NOT NULL`)).rows[0];
      const acts = await db.query(`SELECT action, count(*) AS n FROM crm_audit_log WHERE at > $1::timestamptz - interval '30 days' GROUP BY action ORDER BY action`, [n]);
      return {
        processingRecords: records.rows.map((x) => ({ recordId: String(x.record_id), purpose: String(x.purpose), dataCategories: x.data_categories as string[], legalBasis: String(x.legal_basis), recipients: x.recipients as string[], country: String(x.country), retentionDays: Number(x.retention_days) })),
        rightsRequestsOpen: rights,
        retention: { policyDays: 730, eligibleForAnonymization: Number(ret?.n ?? 0), anonymizedTotal: Number(anonymized?.n ?? 0) },
        auditLast30Days: Object.fromEntries(acts.rows.map((x) => [String(x.action), Number(x.n)])),
      };
    }),
  );

  app.post("/v1/crm/compliance/anonymize", async (req) => {
    const b = S.anonymize.parse(req.body ?? {});
    return asOp(req, ADMIN, async (db) => ({ anonymized: Number((await db.query(`SELECT kombe_crm_anonymize($1) AS n`, [b.olderThanDays])).rows[0]?.n ?? 0) }));
  });
}

/* ── Côté membre : mes demandes d'assistance ─────────────────────────── */

/** Refus métier de la base (23514 → STATE_CONFLICT) : motif lisible pour la personne. */
async function explain<T>(message: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof DomainError && error.code === "STATE_CONFLICT") throw new DomainError("STATE_CONFLICT", message);
    throw error;
  }
}

export class SupportTickets {
  constructor(private readonly pool: pg.Pool, private readonly now: () => number) {}

  async open(headers: Record<string, unknown>, input: unknown): Promise<{ ticketId: string; ref: string }> {
    const b = S.memberOpen.parse(input);
    return explain("Vous avez déjà 5 demandes en cours : attendez une réponse avant d'en ouvrir une autre.", () => inTx(this.pool, async (db) => {
      await sessionIdentity(db, headers, this.now());
      const r = await db.query(`SELECT * FROM kombe_crm_member_open($1,$2,$3,$4)`, [b.subject, b.category, b.body, b.groupId ?? null]);
      return { ticketId: String(r.rows[0]?.ticket_id), ref: String(r.rows[0]?.ref) };
    }));
  }

  async mine(headers: Record<string, unknown>) {
    return inTx(this.pool, async (db) => {
      await sessionIdentity(db, headers, this.now());
      const r = await db.query(
        `SELECT t.ticket_id, t.ref, t.subject, t.category, t.status, t.created_at, t.updated_at, t.satisfaction, g.display_name AS group_name
           FROM crm_ticket t LEFT JOIN "group" g ON g.group_id = t.group_id
          WHERE t.requester_contact_id = (SELECT c.contact_id FROM crm_contact c WHERE c.identity_id = current_setting('kombe.identity_id', true))
          ORDER BY t.created_at DESC LIMIT 100`,
      );
      return r.rows.map((x) => ({
        ticketId: String(x.ticket_id), ref: String(x.ref), subject: String(x.subject), category: String(x.category), status: String(x.status),
        groupName: x.group_name ? String(x.group_name) : null, createdAt: iso(x.created_at) as string, updatedAt: iso(x.updated_at) as string,
        satisfaction: x.satisfaction === null ? null : Number(x.satisfaction),
      }));
    });
  }

  async one(headers: Record<string, unknown>, rawId: string) {
    const tid = ticketId.parse(rawId);
    return inTx(this.pool, async (db) => {
      await sessionIdentity(db, headers, this.now());
      const t = (await db.query(`SELECT t.ticket_id, t.ref, t.subject, t.category, t.status, t.created_at, t.updated_at, t.satisfaction FROM crm_ticket t
          WHERE t.ticket_id = $1 AND t.requester_contact_id = (SELECT c.contact_id FROM crm_contact c WHERE c.identity_id = current_setting('kombe.identity_id', true))`, [tid])).rows[0];
      if (!t) throw new DomainError("OBJET_INTROUVABLE", "Demande introuvable");
      const m = await db.query(`SELECT message_id, author_kind, body, created_at FROM crm_ticket_message WHERE ticket_id = $1 AND visibility = 'public' ORDER BY message_id`, [tid]);
      return {
        ticketId: String(t.ticket_id), ref: String(t.ref), subject: String(t.subject), category: String(t.category), status: String(t.status),
        createdAt: iso(t.created_at) as string, updatedAt: iso(t.updated_at) as string, satisfaction: t.satisfaction === null ? null : Number(t.satisfaction),
        // Le nom de l'opérateur n'est pas communiqué : « Support KÓMBE ».
        messages: m.rows.map((x) => ({ messageId: String(x.message_id), from: x.author_kind === "membre" ? "moi" : "support", body: String(x.body), createdAt: iso(x.created_at) as string })),
      };
    });
  }

  async reply(headers: Record<string, unknown>, rawId: string, input: unknown): Promise<{ messageId: string }> {
    const tid = ticketId.parse(rawId);
    const b = S.memberReply.parse(input);
    return explain("Cette demande est close : ouvrez-en une nouvelle.", () => inTx(this.pool, async (db) => {
      await sessionIdentity(db, headers, this.now());
      const r = await db.query(`SELECT kombe_crm_member_reply($1, $2) AS m`, [tid, b.body]);
      return { messageId: String(r.rows[0]?.m) };
    }));
  }

  async rate(headers: Record<string, unknown>, rawId: string, input: unknown): Promise<{ rated: true }> {
    const tid = ticketId.parse(rawId);
    const b = S.memberRate.parse(input);
    return explain("Vous pourrez noter la réponse une fois la demande résolue, une seule fois.", () => inTx(this.pool, async (db) => {
      await sessionIdentity(db, headers, this.now());
      await db.query(`SELECT kombe_crm_member_rate($1, $2, $3)`, [tid, b.score, b.comment ?? null]);
      return { rated: true as const };
    }));
  }
}
