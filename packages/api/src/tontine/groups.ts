/**
 * Association : création, règlement, membres, bureau, invitations, statuts.
 */
import { randomInt } from "node:crypto";
import type pg from "pg";
import {
  DomainError,
  FUND_LABELS,
  assertMandate,
  assertRoleAssignable,
  buildStatutes,
  canonicalHash,
  isGroupRole,
  parseFeatureFlags,
  type CreateTontineInput,
  type FundKind,
  type GroupRole,
  type InvitationPreview,
  type InvitationView,
  type MemberView,
  type StatutesView,
  type TontineDetail,
  type TontineSettings,
  type TontineSummary,
  type Cadence,
} from "@kombe/domain";
import {
  type Actor,
  type Db,
  appendEvent,
  groupActor,
  identitiesWithRoles,
  activeMemberIdentities,
  inTx,
  isoInstant,
  m,
  newId,
  notify,
  requireAct,
  scopeGroup,
  sessionIdentity,
  todayDouala,
} from "./infra.js";
import { parseSettings, aidScaleOf, fineScheduleOf } from "./settings.js";
import {
  type GroupRow,
  computeDues,
  currentRound,
  cycleInProgress,
  cycleStarted,
  currentCycle,
  loadFundRows,
  loadFunds,
  loadGroup,
  loadMembers,
  loadNames,
  loadRounds,
  meetingSummaries,
  nextMeeting,
} from "./views.js";

const UNIQUE_ROLES: readonly GroupRole[] = [
  "animator",
  "vice_president",
  "secretary",
  "treasurer",
  "treasurer_deputy",
  "auditor",
  "censor",
];

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function invitationCode(): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  return s;
}

/** Adresse publique de la PWA pour les liens d'invitation : explicite, sinon
 *  le domaine de production fourni par Vercel (même origine que l'API). */
export function appUrl(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.KOMBE_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL ?? env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  return "http://localhost:5173";
}

function flags(): TontineDetail["flags"] {
  return parseFeatureFlags(process.env.KOMBE_FEATURE_FLAGS);
}

function cleanName(raw: string, max: number): string {
  const s = raw.trim().replace(/\s+/g, " ");
  if (s.length < 1 || s.length > max) throw new DomainError("GROUP_NAME_INVALID", `Nom de 1 à ${max} caractères`);
  return s;
}

/* ── Caisses dérivées du règlement ───────────────────────────────────── */

interface FundPlan {
  readonly kind: FundKind;
  readonly enabled: boolean;
  readonly perMeeting: string;
  readonly extra?: Record<string, unknown>;
}

function fundPlan(s: TontineSettings): FundPlan[] {
  return [
    { kind: "rotation", enabled: true, perMeeting: "0" },
    { kind: "solidarity", enabled: s.solidarity.enabled, perMeeting: s.solidarity.perMeeting, extra: { scale: s.solidarity.scale } },
    { kind: "operating", enabled: s.operating.enabled, perMeeting: s.operating.perMeeting },
    { kind: "year_end_reserve", enabled: s.yearEndReserve.enabled, perMeeting: s.yearEndReserve.perMeeting },
    { kind: "fines", enabled: true, perMeeting: "0" },
  ];
}

async function syncFunds(db: Db, groupId: string, s: TontineSettings, identityId: string): Promise<void> {
  const existing = await loadFundRows(db, groupId);
  for (const plan of fundPlan(s)) {
    const cur = existing.find((f) => f.kind === plan.kind);
    const rules = { perMeeting: plan.perMeeting, ...(plan.extra ?? {}) };
    if (!cur && plan.enabled) {
      await db.query(
        `INSERT INTO fund (fund_id, group_id, kind, name, rules, created_by_identity_id) VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,
        [newId("fnd"), groupId, plan.kind, FUND_LABELS[plan.kind].fr, JSON.stringify(rules), identityId],
      );
    } else if (cur) {
      await db.query(
        `UPDATE fund SET rules = $3::jsonb, state = $4, version = version + 1 WHERE group_id = $1 AND fund_id = $2`,
        [groupId, cur.fundId, JSON.stringify(rules), plan.enabled ? "active" : "closed"],
      );
    }
  }
}

async function publishRuleVersion(db: Db, groupId: string, s: TontineSettings): Promise<number> {
  const last = await db.query(`SELECT max(rules_version) AS v FROM rule_version WHERE group_id = $1`, [groupId]);
  const prev = last.rows[0]?.v === null || last.rows[0]?.v === undefined ? 0 : Number(last.rows[0].v);
  // `penaltyEnabled` reste false : une amende ne modifie jamais un montant de
  // cotisation (ADR-0029) ; les amendes vivent dans leur propre caisse.
  const snapshot = { kind: "tontine_settings", penaltyEnabled: false, settings: s };
  await db.query(
    `INSERT INTO rule_version (group_id, rules_version, snapshot, snapshot_hash, supersedes, published_at)
     VALUES ($1,$2,$3::jsonb,$4,$5,now())`,
    [groupId, prev + 1, JSON.stringify(snapshot), canonicalHash(snapshot), prev === 0 ? null : prev],
  );
  return prev + 1;
}

/* ── Vues composées ──────────────────────────────────────────────────── */

export async function tontineDetail(db: Db, actor: Actor, nowMs: number): Promise<TontineDetail> {
  const group = await loadGroup(db, actor.groupId);
  const counts = await db.query(
    `SELECT count(*) FILTER (WHERE state = 'active') AS a, count(*) FILTER (WHERE state = 'pending') AS p FROM membership WHERE group_id = $1`,
    [actor.groupId],
  );
  const rounds = await loadRounds(db, group);
  const meetings = await meetingSummaries(db, actor.groupId);
  const st = await db.query(
    `SELECT v.version, v.hash, EXISTS (SELECT 1 FROM statutes_acceptance a WHERE a.group_id = v.group_id AND a.version = v.version AND a.identity_id = $2) AS mine
       FROM statutes_version v WHERE v.group_id = $1 ORDER BY v.version DESC LIMIT 1`,
    [actor.groupId, actor.identityId],
  );
  const statutes = st.rows[0]
    ? { version: Number(st.rows[0].version), hash: String(st.rows[0].hash), acceptedByMe: st.rows[0].mine === true }
    : null;
  return {
    groupId: group.groupId,
    name: group.name,
    state: group.state,
    settings: group.settings,
    me: { membershipId: actor.membershipId, state: actor.membershipState, roles: actor.roles.filter((r) => r !== "member").length ? actor.roles.filter((r) => r !== "member") : actor.membershipState === "active" ? ["member"] : [] },
    memberCount: Number(counts.rows[0]?.a ?? 0),
    pendingCount: Number(counts.rows[0]?.p ?? 0),
    funds: await loadFunds(db, actor.groupId),
    currentRound: currentRound(rounds),
    nextMeeting: nextMeeting(meetings, todayDouala(nowMs)),
    statutes,
    cycleStarted: await cycleStarted(db, actor.groupId),
    cycle: await currentCycle(db, actor.groupId),
    flags: flags(),
  };
}

async function summaryFor(db: Db, group: GroupRow, membershipId: string, membershipState: "pending" | "active", roles: readonly GroupRole[], nowMs: number): Promise<TontineSummary> {
  const today = todayDouala(nowMs);
  const counts = await db.query(`SELECT count(*) AS a FROM membership WHERE group_id = $1 AND state = 'active'`, [group.groupId]);
  const meetings = await meetingSummaries(db, group.groupId);
  const next = nextMeeting(meetings, today);
  let myOpenDue = 0n;
  let myPayoutDate: string | null = null;
  if (membershipState === "active") {
    const dues = await computeDues(db, group, membershipId, today, { onlyOpen: true });
    for (const d of dues) if (d.date <= (next?.date ?? today)) myOpenDue += BigInt(d.remaining);
    const pay = await db.query(
      `SELECT due_date_business::text AS d FROM round WHERE group_id = $1 AND beneficiary_membership_id = $2 AND state = 'open' ORDER BY seq LIMIT 1`,
      [group.groupId, membershipId],
    );
    myPayoutDate = pay.rows[0] ? String(pay.rows[0].d) : null;
  }
  return {
    groupId: group.groupId,
    name: group.name,
    state: group.state,
    membershipId,
    membershipState,
    roles: roles.filter((r) => r !== "member").length ? roles.filter((r) => r !== "member") : membershipState === "active" ? ["member"] : [],
    memberCount: Number(counts.rows[0]?.a ?? 0),
    contributionPerShare: group.settings.contributionPerShare,
    nextMeetingDate: next?.date ?? null,
    myOpenDue: m(myOpenDue),
    myPayoutDate,
  };
}

/* ── Service ─────────────────────────────────────────────────────────── */

export class GroupService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly now: () => number,
  ) {}

  async create(headers: Record<string, unknown>, input: CreateTontineInput): Promise<TontineDetail> {
    const settings = parseSettings(input.settings);
    const name = cleanName(input.name, 120);
    const founderName = cleanName(input.founderDisplayName, 80);
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const identityId = await sessionIdentity(db, headers, nowMs);
      const groupId = newId("grp");
      await scopeGroup(db, groupId);
      await db.query(
        `INSERT INTO "group" (group_id, state, display_name, created_by_identity_id, settings) VALUES ($1,'configuration',$2,$3,$4::jsonb)`,
        [groupId, name, identityId, JSON.stringify(settings)],
      );
      const membershipId = newId("mbr");
      await db.query(
        `INSERT INTO membership (membership_id, group_id, identity_id, state, display_name, joined_at, share_count)
         VALUES ($1,$2,$3,'active',$4,now(),1)`,
        [membershipId, groupId, identityId, founderName],
      );
      const today = todayDouala(nowMs);
      await db.query(
        `INSERT INTO role_assignment (role_assignment_id, group_id, membership_id, role, accepted_at, proposed_by_identity_id, mandate_start)
         VALUES ($1,$2,$3,'animator',now(),$4,$5), ($6,$2,$3,'member',now(),$4,$5)`,
        [newId("rol"), groupId, membershipId, identityId, today, newId("rol")],
      );
      await db.query(`INSERT INTO identity_profile (identity_id, display_name) VALUES ($1,$2) ON CONFLICT (identity_id) DO UPDATE SET display_name = COALESCE(identity_profile.display_name, EXCLUDED.display_name)`, [identityId, founderName]);
      const rulesVersion = await publishRuleVersion(db, groupId, settings);
      await syncFunds(db, groupId, settings, identityId);
      const actor: Actor = { identityId, groupId, membershipId, displayName: founderName, roles: ["animator", "member"], membershipState: "active" };
      await appendEvent(db, actor, "tontine.created", { name, rulesVersion }, nowMs);
      return tontineDetail(db, actor, nowMs);
    });
  }

  async detail(headers: Record<string, unknown>, groupId: string): Promise<TontineDetail> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const identityId = await sessionIdentity(db, headers, nowMs);
      return tontineDetail(db, await groupActor(db, identityId, groupId), nowMs);
    });
  }

  async updateSettings(headers: Record<string, unknown>, groupId: string, input: { name?: string | undefined; settings: unknown }): Promise<TontineDetail> {
    const settings = parseSettings(input.settings);
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const identityId = await sessionIdentity(db, headers, nowMs);
      const actor = await groupActor(db, identityId, groupId);
      requireAct(actor, "rules.publish");
      const group = await loadGroup(db, groupId, true);
      if (await cycleStarted(db, groupId)) {
        throw new DomainError("GROUP_STATE_INVALID", "Règlement figé après le démarrage : proposez un changement par vote");
      }
      const active = await db.query(`SELECT count(*) AS c FROM membership WHERE group_id = $1 AND state = 'active'`, [groupId]);
      if (Number(active.rows[0]?.c ?? 0) > settings.maxMembers) {
        throw new DomainError("STATE_CONFLICT", "Plus de membres actifs que le maximum demandé");
      }
      const name = input.name !== undefined ? cleanName(input.name, 120) : group.name;
      await db.query(`UPDATE "group" SET display_name = $2, settings = $3::jsonb, version = version + 1 WHERE group_id = $1`, [
        groupId,
        name,
        JSON.stringify(settings),
      ]);
      const rulesVersion = await publishRuleVersion(db, groupId, settings);
      await syncFunds(db, groupId, settings, identityId);
      await appendEvent(db, actor, "tontine.settings_changed", { rulesVersion }, nowMs);
      return tontineDetail(db, actor, nowMs);
    });
  }

  async mine(headers: Record<string, unknown>): Promise<TontineSummary[]> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      await sessionIdentity(db, headers, nowMs);
      const r = await db.query(`SELECT group_id, membership_id, membership_state, roles FROM kombe_my_memberships()`);
      const out: TontineSummary[] = [];
      for (const row of r.rows) {
        await scopeGroup(db, String(row.group_id));
        let group: GroupRow;
        try {
          group = await loadGroup(db, String(row.group_id));
        } catch {
          continue; // groupe du socle de laboratoire (sans règlement produit)
        }
        const roles = ((row.roles as string[] | null) ?? []).filter(isGroupRole);
        out.push(await summaryFor(db, group, String(row.membership_id), row.membership_state as "pending" | "active", roles, nowMs));
      }
      return out.sort((a, b) => (a.nextMeetingDate ?? "9999").localeCompare(b.nextMeetingDate ?? "9999"));
    });
  }

  /* ── Membres ──────────────────────────────────────────────────────── */

  /** Membres actifs et en attente ; `all` ajoute les anciens (partis, exclus) pour l'historique et la reprise de place. */
  async members(headers: Record<string, unknown>, groupId: string, all = false): Promise<MemberView[]> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await groupActor(db, await sessionIdentity(db, headers, nowMs), groupId);
      return loadMembers(db, actor, { includeInactive: all });
    });
  }

  private async memberView(db: Db, actor: Actor, membershipId: string): Promise<MemberView> {
    const all = await loadMembers(db, actor, { includeInactive: true });
    const found = all.find((x) => x.membershipId === membershipId);
    if (!found) throw new DomainError("OBJET_INTROUVABLE", "Membre introuvable");
    return found;
  }

  async addOffline(headers: Record<string, unknown>, groupId: string, input: { displayName: string; proxyMembershipId: string }): Promise<MemberView> {
    const nowMs = this.now();
    const displayName = cleanName(input.displayName, 80);
    return inTx(this.pool, async (db) => {
      const actor = await groupActor(db, await sessionIdentity(db, headers, nowMs), groupId);
      requireAct(actor, "member.invite");
      const group = await loadGroup(db, groupId, true);
      await assertRoom(db, group);
      const proxy = await db.query(`SELECT identity_id FROM membership WHERE group_id = $1 AND membership_id = $2 AND state = 'active'`, [
        groupId,
        input.proxyMembershipId,
      ]);
      if (!proxy.rows[0] || String(proxy.rows[0].identity_id).startsWith("offline_")) {
        throw new DomainError("STATE_CONFLICT", "Le représentant doit être un membre actif avec un téléphone");
      }
      const identityId = newId("offline");
      await db.query(`INSERT INTO identity (identity_id) VALUES ($1)`, [identityId]);
      const membershipId = newId("mbr");
      await db.query(
        `INSERT INTO membership (membership_id, group_id, identity_id, state, display_name, joined_at, admitted_by_identity_id, proxy_membership_id, share_count)
         VALUES ($1,$2,$3,'active',$4,now(),$5,$6,1)`,
        [membershipId, groupId, identityId, displayName, actor.identityId, input.proxyMembershipId],
      );
      await db.query(
        `INSERT INTO role_assignment (role_assignment_id, group_id, membership_id, role, accepted_at, proposed_by_identity_id) VALUES ($1,$2,$3,'member',now(),$4)`,
        [newId("rol"), groupId, membershipId, actor.identityId],
      );
      await appendEvent(db, actor, "member.offline_added", { membershipId, proxyMembershipId: input.proxyMembershipId }, nowMs);
      return this.memberView(db, actor, membershipId);
    });
  }

  async admission(headers: Record<string, unknown>, groupId: string, membershipId: string, input: { decision: "admit" | "reject"; shares?: number | undefined }): Promise<MemberView> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await groupActor(db, await sessionIdentity(db, headers, nowMs), groupId);
      requireAct(actor, "member.admit");
      const group = await loadGroup(db, groupId, true);
      const t = await db.query(
        `SELECT identity_id, state, sponsor_membership_id FROM membership WHERE group_id = $1 AND membership_id = $2 FOR UPDATE`,
        [groupId, membershipId],
      );
      const target = t.rows[0];
      if (!target) throw new DomainError("OBJET_INTROUVABLE", "Membre introuvable");
      if (target.state !== "pending") throw new DomainError("MEMBERSHIP_STATE_INVALID", "Cette demande a déjà été traitée");
      if (input.decision === "reject") {
        await db.query(`UPDATE membership SET state = 'revoked' WHERE group_id = $1 AND membership_id = $2`, [groupId, membershipId]);
        await appendEvent(db, actor, "member.rejected", { membershipId }, nowMs);
      } else {
        await assertRoom(db, group);
        if (group.settings.guarantorRequired) {
          const sponsor = target.sponsor_membership_id
            ? await db.query(`SELECT 1 FROM membership WHERE group_id = $1 AND membership_id = $2 AND state = 'active'`, [groupId, target.sponsor_membership_id])
            : { rows: [] };
          if (sponsor.rows.length === 0) throw new DomainError("DEBT_INVALID", "Le règlement exige un avaliseur actif");
        }
        const shares = input.shares ?? 1;
        if (!Number.isInteger(shares) || shares < 1 || shares > 5) throw new DomainError("SHARES_INVALID", "De 1 à 5 parts");
        await db.query(
          `UPDATE membership SET state = 'active', joined_at = now(), admitted_by_identity_id = $3, share_count = $4 WHERE group_id = $1 AND membership_id = $2`,
          [groupId, membershipId, actor.identityId, shares],
        );
        await db.query(
          `INSERT INTO role_assignment (role_assignment_id, group_id, membership_id, role, accepted_at, proposed_by_identity_id) VALUES ($1,$2,$3,'member',now(),$4)`,
          [newId("rol"), groupId, membershipId, actor.identityId],
        );
        await appendEvent(db, actor, "member.admitted", { membershipId, shares }, nowMs);
      }
      await notify(db, groupId, [String(target.identity_id)], "membership", `/tontines/${groupId}`, `admission:${membershipId}`);
      return this.memberView(db, actor, membershipId);
    });
  }

  /**
   * Nombre de « mains » d'un membre (1 à 5), ou part PARTAGÉE avec un autre
   * membre (« demi-main », L-14) : chacun cotise la moitié et la remise du
   * tour revient aux deux. `sharedWith: null` défait le partage.
   */
  async setShares(
    headers: Record<string, unknown>,
    groupId: string,
    membershipId: string,
    input: { shares: number; sharedWith?: string | null | undefined },
  ): Promise<MemberView> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await groupActor(db, await sessionIdentity(db, headers, nowMs), groupId);
      requireAct(actor, "group.manage");
      if (await cycleInProgress(db, groupId)) throw new DomainError("SCHEDULE_FROZEN", "Parts figées pendant le cycle : elles changent au prochain cycle");
      const shares = input.shares;
      if (!Number.isInteger(shares) || shares < 1 || shares > 5) throw new DomainError("SHARES_INVALID", "De 1 à 5 parts");
      const cur = await db.query(
        `SELECT share_partner_membership_id FROM membership WHERE group_id = $1 AND membership_id = $2 AND state = 'active' FOR UPDATE`,
        [groupId, membershipId],
      );
      if (!cur.rows[0]) throw new DomainError("OBJET_INTROUVABLE", "Membre introuvable");
      const previous = cur.rows[0].share_partner_membership_id ? String(cur.rows[0].share_partner_membership_id) : null;
      if (input.sharedWith !== undefined) {
        // On défait d'abord tout partage existant des deux côtés.
        if (previous) {
          await db.query(`UPDATE membership SET share_partner_membership_id = NULL WHERE group_id = $1 AND membership_id = $2`, [groupId, previous]);
        }
        await db.query(`UPDATE membership SET share_partner_membership_id = NULL WHERE group_id = $1 AND membership_id = $2`, [groupId, membershipId]);
        if (input.sharedWith) {
          if (input.sharedWith === membershipId) throw new DomainError("SHARES_INVALID", "Une part se partage avec un autre membre");
          const p = await db.query(
            `SELECT share_partner_membership_id FROM membership WHERE group_id = $1 AND membership_id = $2 AND state = 'active' FOR UPDATE`,
            [groupId, input.sharedWith],
          );
          if (!p.rows[0]) throw new DomainError("OBJET_INTROUVABLE", "Membre introuvable");
          if (p.rows[0].share_partner_membership_id) throw new DomainError("SHARES_INVALID", "Ce membre partage déjà une part");
          await db.query(`UPDATE membership SET share_partner_membership_id = $3, share_count = 1 WHERE group_id = $1 AND membership_id = $2`, [
            groupId,
            membershipId,
            input.sharedWith,
          ]);
          await db.query(`UPDATE membership SET share_partner_membership_id = $3, share_count = 1 WHERE group_id = $1 AND membership_id = $2`, [
            groupId,
            input.sharedWith,
            membershipId,
          ]);
          await appendEvent(db, actor, "member.share_shared", { membershipId, partnerMembershipId: input.sharedWith }, nowMs);
          return this.memberView(db, actor, membershipId);
        }
      } else if (previous && shares !== 1) {
        throw new DomainError("SHARES_INVALID", "Une part partagée reste unique : défaites d'abord le partage");
      }
      await db.query(`UPDATE membership SET share_count = $3 WHERE group_id = $1 AND membership_id = $2`, [groupId, membershipId, shares]);
      await appendEvent(db, actor, "member.shares_set", { membershipId, shares }, nowMs);
      return this.memberView(db, actor, membershipId);
    });
  }

  /* ── Bureau ───────────────────────────────────────────────────────── */

  async proposeRole(headers: Record<string, unknown>, groupId: string, input: { membershipId: string; role: string; mandateEnd?: string | null | undefined }): Promise<MemberView> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await groupActor(db, await sessionIdentity(db, headers, nowMs), groupId);
      requireAct(actor, "role.assign");
      if (!isGroupRole(input.role) || input.role === "member") throw new DomainError("MANDATE_INVALID", "Fonction inconnue");
      const role = input.role;
      const t = await db.query(`SELECT identity_id, state FROM membership WHERE group_id = $1 AND membership_id = $2`, [groupId, input.membershipId]);
      const target = t.rows[0];
      if (!target || target.state !== "active") throw new DomainError("OBJET_INTROUVABLE", "Membre introuvable");
      if (String(target.identity_id).startsWith("offline_")) {
        throw new DomainError("MANDATE_INVALID", "Un membre sans téléphone ne tient pas une fonction du bureau");
      }
      assertRoleAssignable({ role, proposerIdentityId: actor.identityId, targetIdentityId: String(target.identity_id) });
      const today = todayDouala(nowMs);
      if (input.mandateEnd) assertMandate(today, input.mandateEnd);
      const held = await db.query(
        `SELECT 1 FROM role_assignment WHERE group_id = $1 AND membership_id = $2 AND role = $3 AND ended_at IS NULL AND accepted_at IS NOT NULL`,
        [groupId, input.membershipId, role],
      );
      if (held.rows.length > 0) throw new DomainError("STATE_CONFLICT", "Cette personne tient déjà cette fonction");
      // Une proposition en attente remplace la précédente pour la même fonction.
      await db.query(
        `UPDATE role_assignment SET ended_at = now() WHERE group_id = $1 AND role = $2 AND accepted_at IS NULL AND ended_at IS NULL`,
        [groupId, role],
      );
      await db.query(
        `INSERT INTO role_assignment (role_assignment_id, group_id, membership_id, role, proposed_by_identity_id, mandate_start, mandate_end)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [newId("rol"), groupId, input.membershipId, role, actor.identityId, today, input.mandateEnd ?? null],
      );
      await appendEvent(db, actor, "role.proposed", { membershipId: input.membershipId, role }, nowMs);
      await notify(db, groupId, [String(target.identity_id)], "membership", `/tontines/${groupId}/membres`, `role:${role}:${input.membershipId}:${nowMs}`);
      return this.memberView(db, actor, input.membershipId);
    });
  }

  async acceptRole(headers: Record<string, unknown>, groupId: string, role: string): Promise<MemberView> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await groupActor(db, await sessionIdentity(db, headers, nowMs), groupId);
      if (!isGroupRole(role)) throw new DomainError("MANDATE_INVALID", "Fonction inconnue");
      const p = await db.query(
        `SELECT role_assignment_id FROM role_assignment
          WHERE group_id = $1 AND membership_id = $2 AND role = $3 AND accepted_at IS NULL AND ended_at IS NULL FOR UPDATE`,
        [groupId, actor.membershipId, role],
      );
      if (!p.rows[0]) throw new DomainError("OBJET_INTROUVABLE", "Aucune fonction proposée");
      if (UNIQUE_ROLES.includes(role)) {
        // Passation tracée : l'ancien titulaire termine son mandat.
        await db.query(
          `UPDATE role_assignment SET ended_at = now()
            WHERE group_id = $1 AND role = $2 AND membership_id <> $3 AND accepted_at IS NOT NULL AND ended_at IS NULL`,
          [groupId, role, actor.membershipId],
        );
      }
      await db.query(`UPDATE role_assignment SET accepted_at = now() WHERE group_id = $1 AND role_assignment_id = $2`, [
        groupId,
        p.rows[0].role_assignment_id,
      ]);
      const roles = [...actor.roles, role];
      await appendEvent(db, { ...actor, roles }, "role.accepted", { membershipId: actor.membershipId, role }, nowMs);
      return this.memberView(db, { ...actor, roles }, actor.membershipId);
    });
  }

  /* ── Invitations ──────────────────────────────────────────────────── */

  private invitationView(row: Record<string, unknown>, groupName: string): InvitationView {
    const code = String(row.code);
    const url = `${appUrl()}/#/rejoindre/${code}`;
    return {
      invitationId: String(row.invitation_id),
      code,
      url,
      whatsappText: `Rejoins notre tontine « ${groupName} » sur KÓMBE : ${url} (code ${code}). KÓMBE tient le registre de notre tontine ; il ne garde pas notre argent.`,
      expiresAt: isoInstant(row.expires_at) as string,
      maxUses: Number(row.max_uses),
      usedCount: Number(row.used_count),
      revoked: row.revoked_at !== null && row.revoked_at !== undefined,
    };
  }

  async createInvitation(headers: Record<string, unknown>, groupId: string, input: { maxUses?: number | undefined; days?: number | undefined }): Promise<InvitationView> {
    const nowMs = this.now();
    const maxUses = input.maxUses ?? 30;
    const days = input.days ?? 14;
    if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 100) throw new DomainError("INVITATION_INVALID", "De 1 à 100 utilisations");
    if (!Number.isInteger(days) || days < 1 || days > 30) throw new DomainError("INVITATION_INVALID", "De 1 à 30 jours");
    return inTx(this.pool, async (db) => {
      const actor = await groupActor(db, await sessionIdentity(db, headers, nowMs), groupId);
      requireAct(actor, "member.invite");
      const group = await loadGroup(db, groupId);
      if (group.state === "closed" || group.state === "archived") throw new DomainError("GROUP_STATE_INVALID", "Groupe clos");
      const id = newId("inv");
      let row: Record<string, unknown> | undefined;
      for (let attempt = 0; attempt < 5 && !row; attempt++) {
        const r = await db.query(
          `INSERT INTO invitation (invitation_id, group_id, channel, max_uses, expires_at, created_by_identity_id, code)
           SELECT $1,$2,'link',$3,$4,$5,$6
            WHERE NOT EXISTS (SELECT 1 FROM kombe_invitation_by_code($6))
           RETURNING *`,
          [id, groupId, maxUses, new Date(nowMs + days * 86_400_000), actor.identityId, invitationCode()],
        );
        row = r.rows[0];
      }
      if (!row) throw new DomainError("STATE_CONFLICT", "Réessayez");
      await appendEvent(db, actor, "invitation.created", { invitationId: id, maxUses, days }, nowMs);
      return this.invitationView(row, group.name);
    });
  }

  async invitations(headers: Record<string, unknown>, groupId: string): Promise<InvitationView[]> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await groupActor(db, await sessionIdentity(db, headers, nowMs), groupId);
      requireAct(actor, "member.invite");
      const group = await loadGroup(db, groupId);
      const r = await db.query(`SELECT * FROM invitation WHERE group_id = $1 AND code IS NOT NULL ORDER BY issued_at DESC LIMIT 50`, [groupId]);
      return r.rows.map((row) => this.invitationView(row, group.name));
    });
  }

  async revokeInvitation(headers: Record<string, unknown>, groupId: string, invitationId: string): Promise<void> {
    const nowMs = this.now();
    await inTx(this.pool, async (db) => {
      const actor = await groupActor(db, await sessionIdentity(db, headers, nowMs), groupId);
      requireAct(actor, "member.invite");
      const r = await db.query(`UPDATE invitation SET revoked_at = now() WHERE group_id = $1 AND invitation_id = $2 AND revoked_at IS NULL`, [
        groupId,
        invitationId,
      ]);
      if (r.rowCount === 0) throw new DomainError("OBJET_INTROUVABLE", "Invitation introuvable");
      await appendEvent(db, actor, "invitation.revoked", { invitationId }, nowMs);
    });
  }

  async previewInvitation(headers: Record<string, unknown>, code: string): Promise<InvitationPreview> {
    const nowMs = this.now();
    const c = code.trim().toUpperCase();
    return inTx(this.pool, async (db) => {
      const identityId = await sessionIdentity(db, headers, nowMs);
      const r = await db.query(`SELECT * FROM kombe_invitation_by_code($1)`, [c]);
      const row = r.rows[0];
      if (!row) throw new DomainError("INVITATION_INVALID", "Code inconnu ou expiré");
      await scopeGroup(db, String(row.group_id));
      const mem = await db.query(`SELECT 1 FROM membership WHERE group_id = $1 AND identity_id = $2 AND state IN ('active','pending')`, [
        row.group_id,
        identityId,
      ]);
      return { code: c, groupName: String(row.group_name ?? ""), usable: row.usable === true, alreadyMember: mem.rows.length > 0 };
    });
  }

  async join(headers: Record<string, unknown>, code: string, input: { displayName: string; sponsorMembershipId?: string | undefined }): Promise<TontineSummary> {
    const nowMs = this.now();
    const c = code.trim().toUpperCase();
    const displayName = cleanName(input.displayName, 80);
    return inTx(this.pool, async (db) => {
      const identityId = await sessionIdentity(db, headers, nowMs);
      const r = await db.query(`SELECT * FROM kombe_invitation_by_code($1)`, [c]);
      const inv = r.rows[0];
      if (!inv || inv.usable !== true) throw new DomainError("INVITATION_INVALID", "Code inconnu ou expiré");
      const groupId = String(inv.group_id);
      await scopeGroup(db, groupId);
      const group = await loadGroup(db, groupId, true);
      if (group.state === "closed" || group.state === "archived") throw new DomainError("GROUP_STATE_INVALID", "Groupe clos");
      const existing = await db.query(`SELECT 1 FROM membership WHERE group_id = $1 AND identity_id = $2 AND state IN ('active','pending')`, [
        groupId,
        identityId,
      ]);
      if (existing.rows.length > 0) throw new DomainError("MEMBERSHIP_ALREADY_ACTIVE", "Vous êtes déjà dans ce groupe");
      if (input.sponsorMembershipId) {
        const s = await db.query(`SELECT 1 FROM membership WHERE group_id = $1 AND membership_id = $2 AND state = 'active'`, [
          groupId,
          input.sponsorMembershipId,
        ]);
        if (s.rows.length === 0) throw new DomainError("DEBT_INVALID", "Avaliseur inconnu");
      }
      const used = await db.query(
        `UPDATE invitation SET used_count = used_count + 1 WHERE group_id = $1 AND invitation_id = $2 AND used_count < max_uses AND revoked_at IS NULL AND expires_at > now()`,
        [groupId, inv.invitation_id],
      );
      if (used.rowCount === 0) throw new DomainError("INVITATION_INVALID", "Code inconnu ou expiré");
      const membershipId = newId("mbr");
      await db.query(
        `INSERT INTO membership (membership_id, group_id, identity_id, state, display_name, invitation_id, sponsor_membership_id, share_count)
         VALUES ($1,$2,$3,'pending',$4,$5,$6,1)`,
        [membershipId, groupId, identityId, displayName, inv.invitation_id, input.sponsorMembershipId ?? null],
      );
      await db.query(`INSERT INTO identity_profile (identity_id, display_name) VALUES ($1,$2) ON CONFLICT (identity_id) DO UPDATE SET display_name = COALESCE(identity_profile.display_name, EXCLUDED.display_name)`, [identityId, displayName]);
      const actor: Actor = { identityId, groupId, membershipId, displayName, roles: ["member"], membershipState: "pending" };
      await appendEvent(db, actor, "member.requested", { membershipId, invitationId: String(inv.invitation_id) }, nowMs);
      const admins = await identitiesWithRoles(db, groupId, ["animator", "vice_president"]);
      await notify(db, groupId, admins, "membership", `/tontines/${groupId}/membres`, `join:${membershipId}`);
      return summaryFor(db, group, membershipId, "pending", [], nowMs);
    });
  }

  /* ── Statuts ──────────────────────────────────────────────────────── */

  private async statutesView(db: Db, actor: Actor): Promise<StatutesView | null> {
    const r = await db.query(
      `SELECT v.*, (SELECT count(*) FROM statutes_acceptance a WHERE a.group_id = v.group_id AND a.version = v.version) AS n,
              EXISTS (SELECT 1 FROM statutes_acceptance a WHERE a.group_id = v.group_id AND a.version = v.version AND a.identity_id = $2) AS mine
         FROM statutes_version v WHERE v.group_id = $1 ORDER BY v.version DESC LIMIT 1`,
      [actor.groupId, actor.identityId],
    );
    const row = r.rows[0];
    if (!row) return null;
    return {
      version: Number(row.version),
      title: String(row.title),
      body: String(row.body),
      hash: String(row.hash),
      publishedAt: isoInstant(row.published_at) as string,
      acceptedByMe: row.mine === true,
      acceptedCount: Number(row.n),
    };
  }

  async statutes(headers: Record<string, unknown>, groupId: string): Promise<StatutesView> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await groupActor(db, await sessionIdentity(db, headers, nowMs), groupId, { allowPending: true });
      const v = await this.statutesView(db, actor);
      if (!v) throw new DomainError("OBJET_INTROUVABLE", "Statuts pas encore générés");
      return v;
    });
  }

  async publishStatutes(headers: Record<string, unknown>, groupId: string): Promise<StatutesView> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await groupActor(db, await sessionIdentity(db, headers, nowMs), groupId);
      requireAct(actor, "statutes.publish");
      const group = await loadGroup(db, groupId);
      const names = await loadNames(db, groupId);
      const bureau = await db.query(
        `SELECT membership_id, role, mandate_end::text AS e FROM role_assignment
          WHERE group_id = $1 AND accepted_at IS NOT NULL AND ended_at IS NULL AND role <> 'member' ORDER BY role`,
        [groupId],
      );
      const funds = (await loadFundRows(db, groupId)).filter((f) => f.state === "active");
      const rv = await db.query(`SELECT max(rules_version) AS v FROM rule_version WHERE group_id = $1`, [groupId]);
      const doc = buildStatutes({
        groupName: group.name,
        seat: group.settings.meetingPlace,
        purpose: null,
        cadence: group.settings.cadence as Cadence,
        meetingPlace: group.settings.meetingPlace,
        funds: funds.map((f) => ({ kind: f.kind, name: f.name, perMeetingAmount: f.perMeeting, annualAmount: 0n })),
        rotationContribution: BigInt(group.settings.contributionPerShare),
        fines: fineScheduleOf(group.settings),
        aidScale: group.settings.solidarity.enabled ? aidScaleOf(group.settings) : [],
        bureau: bureau.rows.map((b) => ({
          role: b.role as GroupRole,
          name: names.byMembership.get(String(b.membership_id)) ?? "",
          mandateEnd: b.e ?? null,
        })),
        feeBearer: group.settings.feeBearer,
        transparency: group.settings.transparency,
        guarantorRequired: group.settings.guarantorRequired,
        newcomersLast: group.settings.newcomersLast,
        rulesVersion: Number(rv.rows[0]?.v ?? 1),
      });
      const last = await this.statutesView(db, actor);
      if (last && last.hash === doc.hash) return last;
      const version = (last?.version ?? 0) + 1;
      await db.query(
        `INSERT INTO statutes_version (group_id, version, title, body, hash, rules_version, published_by_identity_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [groupId, version, doc.title, doc.text, doc.hash, Number(rv.rows[0]?.v ?? 1), actor.identityId],
      );
      await appendEvent(db, actor, "statutes.published", { version, hash: doc.hash }, nowMs);
      await notify(db, groupId, await activeMemberIdentities(db, groupId), "general", `/tontines/${groupId}/statuts`, `statutes:${version}`);
      return (await this.statutesView(db, actor)) as StatutesView;
    });
  }

  async acceptStatutes(headers: Record<string, unknown>, groupId: string, hash: string): Promise<StatutesView> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await groupActor(db, await sessionIdentity(db, headers, nowMs), groupId, { allowPending: true });
      const v = await this.statutesView(db, actor);
      if (!v) throw new DomainError("OBJET_INTROUVABLE", "Statuts pas encore générés");
      if (v.hash !== hash) throw new DomainError("RULE_ACCEPT_HASH_MISMATCH", "Les statuts ont changé : relisez la dernière version");
      if (!v.acceptedByMe) {
        await db.query(`INSERT INTO statutes_acceptance (group_id, version, identity_id, hash) VALUES ($1,$2,$3,$4)`, [
          groupId,
          v.version,
          actor.identityId,
          hash,
        ]);
        await appendEvent(db, actor, "statutes.accepted", { version: v.version, hash }, nowMs);
      }
      return (await this.statutesView(db, actor)) as StatutesView;
    });
  }
}

async function assertRoom(db: Db, group: GroupRow): Promise<void> {
  const r = await db.query(`SELECT count(*) AS c FROM membership WHERE group_id = $1 AND state = 'active'`, [group.groupId]);
  if (Number(r.rows[0]?.c ?? 0) >= group.settings.maxMembers) {
    throw new DomainError("STATE_CONFLICT", "Nombre maximal de membres atteint");
  }
}
