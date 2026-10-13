/**
 * KÓMBE @kombe/api — groupe, adhésions, bureau, calendrier (lots L-02, L-03,
 * L-04, L-11, L-13, L-14). Toutes les décisions sont prises par les fonctions
 * pures de `@kombe/domain` ; ce module lit et écrit dans PostgreSQL, sous la
 * transaction du groupe, et scelle un événement de journal par décision.
 */
import type pg from "pg";
import {
  DEFAULT_FINE_SCHEDULE,
  DEFAULT_FUND_RULES,
  DomainError,
  FUND_LABELS,
  assertCadence,
  assertCanAct,
  assertFineSchedule,
  assertAidScale,
  assertMandate,
  assertRoleAssignable,
  assertShares,
  canAct,
  canonicalHash,
  compileRuleSet,
  describeCadence,
  drawCommitment,
  drawOrder,
  isGroupRole,
  maskPhone,
  isPhoneIdentity,
  meetingDates,
  deadlineUtcMs,
  memberDueForRound,
  oneSharePerMember,
  potPerRound,
  swapApprovalsComplete,
  swapRounds,
  transitionGroupState,
  type AidScale,
  type Cadence,
  type FineSchedule,
  type FundKind,
  type GroupRole,
  type GroupState,
  type Share,
  type Transparency,
  type WithdrawalFeeBearer,
} from "@kombe/domain";
import {
  appendEvent,
  identitiesWithRoles,
  invitationCode,
  newId,
  notify,
  toBig,
  type TontineActor,
} from "./context.js";

/* ── Réglages du groupe (group.settings, jsonb) ──────────────────────── */

export interface GroupSettings {
  readonly transparency: Transparency;
  readonly feeBearer: WithdrawalFeeBearer;
  readonly guarantorRequired: boolean;
  readonly newcomersLast: boolean;
  readonly minMembers: number;
  readonly maxMembers: number;
  readonly fines: FineSchedule;
  readonly aidScale: AidScale;
  readonly seat: string | null;
  readonly purpose: string | null;
  readonly meetingPlace: string | null;
  readonly minimumWitnesses: number;
}

export const DEFAULT_SETTINGS: GroupSettings = {
  transparency: "all_members",
  feeBearer: "beneficiary",
  guarantorRequired: false,
  newcomersLast: true,
  minMembers: 2,
  maxMembers: 60,
  fines: DEFAULT_FINE_SCHEDULE,
  aidScale: [],
  seat: null,
  purpose: null,
  meetingPlace: null,
  minimumWitnesses: 2,
};

export function serializeSettings(s: GroupSettings): Record<string, unknown> {
  return JSON.parse(JSON.stringify(s, (_k, v) => (typeof v === "bigint" ? v.toString() : v))) as Record<string, unknown>;
}

export function reviveSettings(raw: unknown): GroupSettings {
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const f = (v["fines"] ?? {}) as Record<string, unknown>;
  const fines: FineSchedule = {
    lateContributionFixed: toBig(f["lateContributionFixed"]),
    lateContributionPerDay: toBig(f["lateContributionPerDay"]),
    lateContributionCap: toBig(f["lateContributionCap"]),
    meetingLate: toBig(f["meetingLate"]),
    meetingAbsence: toBig(f["meetingAbsence"]),
    indisciplineCap: toBig(f["indisciplineCap"]),
    graceDays: Number(f["graceDays"] ?? 0),
  };
  const aid = Array.isArray(v["aidScale"]) ? (v["aidScale"] as Record<string, unknown>[]) : [];
  const pick = <T>(key: string, fallback: T): T => (v[key] === undefined ? fallback : (v[key] as T));
  return {
    transparency: pick("transparency", DEFAULT_SETTINGS.transparency),
    feeBearer: pick("feeBearer", DEFAULT_SETTINGS.feeBearer),
    guarantorRequired: pick("guarantorRequired", DEFAULT_SETTINGS.guarantorRequired),
    newcomersLast: pick("newcomersLast", DEFAULT_SETTINGS.newcomersLast),
    minMembers: Number(pick("minMembers", DEFAULT_SETTINGS.minMembers)),
    maxMembers: Number(pick("maxMembers", DEFAULT_SETTINGS.maxMembers)),
    fines,
    aidScale: aid.map((e) => ({
      event: e["event"] as AidScale[number]["event"],
      amount: toBig(e["amount"]),
      maxPerYear: Number(e["maxPerYear"] ?? 0),
    })),
    seat: pick<string | null>("seat", null),
    purpose: pick<string | null>("purpose", null),
    meetingPlace: pick<string | null>("meetingPlace", null),
    minimumWitnesses: Number(pick("minimumWitnesses", DEFAULT_SETTINGS.minimumWitnesses)),
  };
}

export function assertSettings(s: GroupSettings): void {
  if (!["all_members", "bureau_only", "anonymized"].includes(s.transparency)) {
    throw new DomainError("GROUP_STATE_INVALID", "Transparence inconnue");
  }
  if (!["member", "beneficiary", "fund"].includes(s.feeBearer)) {
    throw new DomainError("FUND_INVALID", "Prise en charge des frais inconnue");
  }
  if (!Number.isInteger(s.minMembers) || !Number.isInteger(s.maxMembers) || s.minMembers < 2 || s.maxMembers > 200 || s.minMembers > s.maxMembers) {
    throw new DomainError("RULE_INVALID", "Bornes d'effectif invalides (2 à 200)");
  }
  if (!Number.isInteger(s.minimumWitnesses) || s.minimumWitnesses < 1 || s.minimumWitnesses > 5) {
    throw new DomainError("WITNESS_REQUIRED", "Nombre de témoins de 1 à 5");
  }
  assertFineSchedule(s.fines);
  assertAidScale(s.aidScale);
}

export async function loadGroup(
  client: pg.PoolClient,
  groupId: string,
): Promise<{ name: string; state: GroupState; version: number; settings: GroupSettings; createdBy: string | null }> {
  const res = await client.query(
    `SELECT name, state, version, settings, created_by_identity_id FROM "group" WHERE group_id = $1`,
    [groupId],
  );
  const row = res.rows[0] as Record<string, unknown> | undefined;
  if (!row) throw new DomainError("TONTINE_FORBIDDEN", "Accès refusé");
  return {
    name: (row["name"] as string | null) ?? "Groupe",
    state: row["state"] as GroupState,
    version: Number(row["version"]),
    settings: reviveSettings(row["settings"]),
    createdBy: (row["created_by_identity_id"] as string | null) ?? null,
  };
}

/* ── Création d'un groupe (L-02) ─────────────────────────────────────── */

export const DEFAULT_FUNDS: readonly FundKind[] = ["rotation", "solidarity", "fines", "operating", "year_end_reserve"];

export async function createGroup(
  client: pg.PoolClient,
  identityId: string,
  groupId: string,
  input: {
    readonly name: string;
    readonly displayName: string;
    readonly funds?: readonly FundKind[] | undefined;
    readonly settings?: Partial<GroupSettings> | undefined;
  },
  nowMs: number,
): Promise<{ groupId: string; membershipId: string }> {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 120) throw new DomainError("GROUP_NAME_INVALID", "Nom de groupe de 2 à 120 caractères");
  const displayName = input.displayName.trim();
  if (displayName.length < 1 || displayName.length > 80) throw new DomainError("GROUP_NAME_INVALID", "Nom affiché invalide");
  const settings: GroupSettings = { ...DEFAULT_SETTINGS, ...(input.settings ?? {}) };
  assertSettings(settings);
  const funds = [...new Set(input.funds ?? DEFAULT_FUNDS)];
  if (!funds.includes("rotation")) funds.unshift("rotation");
  for (const k of funds) {
    if (k === "loan" || k === "collector") throw new DomainError("FUND_KIND_DISABLED", "Caisse fermée par défaut");
    if (!(k in DEFAULT_FUND_RULES)) throw new DomainError("FUND_INVALID", "Type de caisse inconnu");
  }

  await client.query(
    `INSERT INTO "group" (group_id, state, version, name, created_by_identity_id, settings)
     VALUES ($1, 'configuration', 1, $2, $3, $4::jsonb)`,
    [groupId, name, identityId, JSON.stringify(serializeSettings(settings))],
  );
  const membershipId = newId("mem");
  await client.query(
    `INSERT INTO membership (membership_id, group_id, identity_id, state, display_name, joined_at)
     VALUES ($1, $2, $3, 'active', $4, now())`,
    [membershipId, groupId, identityId, displayName],
  );
  // Fonction « membre » de base (routes du socle), puis Président (animator),
  // acceptée d'office ; la plus récente acceptation fait foi pour le socle.
  await client.query(
    `INSERT INTO role_assignment (role_assignment_id, group_id, membership_id, role, accepted_at)
     VALUES ($1, $2, $3, 'member', now() - interval '1 second')`,
    [newId("ra"), groupId, membershipId],
  );
  await client.query(
    `INSERT INTO role_assignment (role_assignment_id, group_id, membership_id, role, accepted_at,
                                  proposed_by_identity_id, mandate_start)
     VALUES ($1, $2, $3, 'animator', now(), $4, CURRENT_DATE)`,
    [newId("ra"), groupId, membershipId, identityId],
  );
  for (const kind of funds) {
    const rules = DEFAULT_FUND_RULES[kind];
    await client.query(
      `INSERT INTO fund (fund_id, group_id, kind, name, rules, state, created_by_identity_id)
       VALUES ($1, $2, $3, $4, $5::jsonb, 'active', $6)`,
      [
        newId("fund"),
        groupId,
        kind,
        FUND_LABELS[kind].fr,
        JSON.stringify({
          perMeetingAmount: rules.perMeetingAmount.toString(),
          annualAmount: rules.annualAmount.toString(),
          controlRequired: rules.controlRequired,
          allowNegative: rules.allowNegative,
        }),
        identityId,
      ],
    );
  }
  await appendEvent(client, groupId, { identityId, roles: ["animator"] }, "group.created", { name, funds }, nowMs);
  return { groupId, membershipId };
}

/* ── Mes groupes, vue du groupe, membres ─────────────────────────────── */

export async function myGroups(client: pg.PoolClient): Promise<unknown[]> {
  const res = await client.query(`SELECT * FROM kombe_my_memberships() ORDER BY group_name NULLS LAST`);
  return res.rows.map((r: Record<string, unknown>) => ({
    groupId: r["group_id"],
    membershipId: r["membership_id"],
    membershipState: r["membership_state"],
    name: r["group_name"],
    groupState: r["group_state"],
    roles: r["roles"],
  }));
}

export async function members(client: pg.PoolClient, groupId: string, actor: TontineActor): Promise<unknown[]> {
  const g = await loadGroup(client, groupId);
  const bureau = canAct(actor.roles, "member.admit") || canAct(actor.roles, "member.invite");
  const res = await client.query(
    `SELECT m.membership_id, m.identity_id, m.state, m.display_name, m.joined_at, m.sponsor_membership_id,
            m.proxy_membership_id,
            COALESCE((SELECT array_agg(r.role ORDER BY r.role) FROM role_assignment r
                       WHERE r.group_id = m.group_id AND r.membership_id = m.membership_id
                         AND r.accepted_at IS NOT NULL AND r.ended_at IS NULL), ARRAY[]::text[]) AS roles
       FROM membership m
      WHERE m.group_id = $1 AND m.state IN ('active','pending')
      ORDER BY m.joined_at NULLS LAST, m.membership_id`,
    [groupId],
  );
  return res.rows
    .filter((r: Record<string, unknown>) => r["state"] === "active" || bureau)
    .map((r: Record<string, unknown>) => {
      const identity = String(r["identity_id"]);
      // Contact visible du bureau seulement, masqué pour un numéro.
      const contact = bureau ? (isPhoneIdentity(identity) ? maskPhone(identity) : identity) : null;
      return {
        membershipId: r["membership_id"],
        displayName: g.settings.transparency === "anonymized" && !bureau && r["membership_id"] !== actor.membershipId
          ? "Membre"
          : (r["display_name"] ?? "Membre"),
        state: r["state"],
        roles: r["roles"],
        joinedAt: r["joined_at"],
        sponsorMembershipId: r["sponsor_membership_id"],
        proxyMembershipId: r["proxy_membership_id"],
        isMe: r["membership_id"] === actor.membershipId,
        contact,
      };
    });
}

export async function overview(client: pg.PoolClient, groupId: string, actor: TontineActor): Promise<unknown> {
  const g = await loadGroup(client, groupId);
  const counts = await client.query(
    `SELECT count(*) FILTER (WHERE state = 'active')::int AS active,
            count(*) FILTER (WHERE state = 'pending')::int AS pending
       FROM membership WHERE group_id = $1`,
    [groupId],
  );
  const sched = await client.query(
    `SELECT state, cadence, rules_version FROM cycle_schedule WHERE group_id = $1`,
    [groupId],
  );
  const next = await client.query(
    `SELECT meeting_id, seq, scheduled_date, state, location FROM meeting
      WHERE group_id = $1 AND state IN ('planned','open') ORDER BY seq LIMIT 1`,
    [groupId],
  );
  const pendingValidations = await client.query(
    `SELECT count(*)::int AS n FROM fund_movement WHERE group_id = $1 AND state IN ('declared','confirmed')`,
    [groupId],
  );
  const s = sched.rows[0] as Record<string, unknown> | undefined;
  const cadence = (s?.["cadence"] as Cadence | null | undefined) ?? null;
  return {
    groupId,
    name: g.name,
    state: g.state,
    settings: serializeSettings(g.settings),
    me: { membershipId: actor.membershipId, roles: actor.roles, displayName: actor.displayName },
    members: { active: Number(counts.rows[0]?.active ?? 0), pending: Number(counts.rows[0]?.pending ?? 0) },
    schedule: s
      ? { state: s["state"], cadence, cadenceLabel: cadence ? describeCadence(cadence, "fr") : null }
      : null,
    nextMeeting: next.rows[0] ?? null,
    pendingValidations: Number(pendingValidations.rows[0]?.n ?? 0),
  };
}

export async function updateSettings(
  client: pg.PoolClient,
  groupId: string,
  actor: TontineActor,
  patch: Partial<GroupSettings>,
  nowMs: number,
): Promise<unknown> {
  assertCanAct(actor.roles, "group.manage");
  const g = await loadGroup(client, groupId);
  const next: GroupSettings = { ...g.settings, ...patch };
  assertSettings(next);
  await client.query(`UPDATE "group" SET settings = $2::jsonb, version = version + 1 WHERE group_id = $1`, [
    groupId,
    JSON.stringify(serializeSettings(next)),
  ]);
  await appendEvent(client, groupId, actor, "group.settings_updated", { keys: Object.keys(patch) }, nowMs);
  return serializeSettings(next);
}

/* ── Invitations par code (I-14, L-02) ───────────────────────────────── */

export async function createInvitation(
  client: pg.PoolClient,
  groupId: string,
  actor: TontineActor,
  input: { readonly maxUses: number; readonly ttlHours: number; readonly channel: "link" | "whatsapp" },
  nowMs: number,
): Promise<{ invitationId: string; code: string; expiresAt: string }> {
  assertCanAct(actor.roles, "member.invite");
  if (!Number.isInteger(input.maxUses) || input.maxUses < 1 || input.maxUses > 200) {
    throw new DomainError("INVITATION_INVALID", "Nombre d'utilisations de 1 à 200");
  }
  if (!Number.isInteger(input.ttlHours) || input.ttlHours < 1 || input.ttlHours > 24 * 30) {
    throw new DomainError("INVITATION_INVALID", "Durée de 1 heure à 30 jours");
  }
  const invitationId = newId("inv");
  const expiresAt = new Date(nowMs + input.ttlHours * 3_600_000).toISOString();
  // Collision de code improbable (32^8) : on retente quelques fois.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = invitationCode();
    const clash = await client.query(`SELECT 1 FROM kombe_invitation_by_code($1)`, [code]);
    if (clash.rows.length > 0) continue;
    await client.query(
      `INSERT INTO invitation (invitation_id, group_id, channel, max_uses, used_count, issued_at, expires_at,
                               created_by_identity_id, code)
       VALUES ($1, $2, $3, $4, 0, $5, $6, $7, $8)`,
      [invitationId, groupId, input.channel, input.maxUses, new Date(nowMs).toISOString(), expiresAt, actor.identityId, code],
    );
    await appendEvent(client, groupId, actor, "invitation.created", { invitationId, maxUses: input.maxUses }, nowMs);
    return { invitationId, code, expiresAt };
  }
  throw new DomainError("INVITATION_INVALID", "Code indisponible, réessayez");
}

export async function listInvitations(client: pg.PoolClient, groupId: string, actor: TontineActor): Promise<unknown[]> {
  assertCanAct(actor.roles, "member.invite");
  const res = await client.query(
    `SELECT invitation_id, code, channel, max_uses, used_count, expires_at, revoked_at
       FROM invitation WHERE group_id = $1 AND code IS NOT NULL ORDER BY issued_at DESC LIMIT 50`,
    [groupId],
  );
  return res.rows;
}

export async function revokeInvitation(
  client: pg.PoolClient,
  groupId: string,
  actor: TontineActor,
  invitationId: string,
  nowMs: number,
): Promise<void> {
  assertCanAct(actor.roles, "member.invite");
  const res = await client.query(
    `UPDATE invitation SET revoked_at = now() WHERE group_id = $1 AND invitation_id = $2 AND revoked_at IS NULL`,
    [groupId, invitationId],
  );
  if (res.rowCount !== 1) throw new DomainError("OBJET_INTROUVABLE", "Invitation introuvable");
  await appendEvent(client, groupId, actor, "invitation.revoked", { invitationId }, nowMs);
}

/** Lecture d'une invitation par code (identité authentifiée, hors groupe). */
export async function invitationByCode(client: pg.PoolClient, code: string): Promise<{ invitationId: string; groupId: string; groupName: string | null; usable: boolean }> {
  const res = await client.query(`SELECT * FROM kombe_invitation_by_code($1)`, [code.trim().toUpperCase()]);
  const row = res.rows[0] as Record<string, unknown> | undefined;
  if (!row) throw new DomainError("INVITATION_INVALID", "Code inconnu ou expiré");
  return {
    invitationId: String(row["invitation_id"]),
    groupId: String(row["group_id"]),
    groupName: (row["group_name"] as string | null) ?? null,
    usable: row["usable"] === true,
  };
}

/** Demande d'adhésion : crée une adhésion EN ATTENTE, admise ensuite par le bureau. */
export async function requestMembership(
  client: pg.PoolClient,
  groupId: string,
  identityId: string,
  invitationId: string,
  input: { readonly displayName: string; readonly sponsorMembershipId?: string | null | undefined },
  nowMs: number,
): Promise<{ membershipId: string; state: "pending" }> {
  const inv = await client.query(
    `SELECT used_count, max_uses, expires_at, revoked_at FROM invitation
      WHERE group_id = $1 AND invitation_id = $2 FOR UPDATE`,
    [groupId, invitationId],
  );
  const row = inv.rows[0] as Record<string, unknown> | undefined;
  if (
    !row ||
    row["revoked_at"] !== null ||
    new Date(String(row["expires_at"])).getTime() <= nowMs ||
    Number(row["used_count"]) >= Number(row["max_uses"])
  ) {
    throw new DomainError("INVITATION_INVALID", "Invitation expirée ou épuisée");
  }
  const existing = await client.query(
    `SELECT state FROM membership WHERE group_id = $1 AND identity_id = $2 AND state IN ('active','pending')`,
    [groupId, identityId],
  );
  if (existing.rows.length > 0) throw new DomainError("MEMBERSHIP_ALREADY_ACTIVE", "Déjà membre ou demande en cours");
  const g = await loadGroup(client, groupId);
  const sponsor = input.sponsorMembershipId ?? null;
  if (g.settings.guarantorRequired && !sponsor) {
    throw new DomainError("DEBT_INVALID", "Ce groupe demande un avaliseur");
  }
  if (sponsor) {
    const s = await client.query(`SELECT 1 FROM membership WHERE group_id = $1 AND membership_id = $2 AND state = 'active'`, [
      groupId,
      sponsor,
    ]);
    if (s.rows.length === 0) throw new DomainError("DEBT_INVALID", "L'avaliseur doit être un membre actif");
  }
  const displayName = input.displayName.trim();
  if (displayName.length < 1 || displayName.length > 80) throw new DomainError("GROUP_NAME_INVALID", "Nom affiché invalide");
  await client.query(`INSERT INTO identity (identity_id) VALUES ($1) ON CONFLICT DO NOTHING`, [identityId]);
  const membershipId = newId("mem");
  await client.query(
    `INSERT INTO membership (membership_id, group_id, identity_id, state, display_name, invitation_id, sponsor_membership_id)
     VALUES ($1, $2, $3, 'pending', $4, $5, $6)`,
    [membershipId, groupId, identityId, displayName, invitationId, sponsor],
  );
  await client.query(`UPDATE invitation SET used_count = used_count + 1 WHERE group_id = $1 AND invitation_id = $2`, [
    groupId,
    invitationId,
  ]);
  await appendEvent(client, groupId, { identityId, roles: ["member"] }, "membership.requested", { membershipId, invitationId }, nowMs);
  await notify(client, groupId, await identitiesWithRoles(client, groupId, ["animator", "vice_president"]), "membership", `group:${groupId}:members`, `req:${membershipId}`);
  return { membershipId, state: "pending" };
}

export async function decideMembership(
  client: pg.PoolClient,
  groupId: string,
  actor: TontineActor,
  membershipId: string,
  decision: "admit" | "refuse",
  nowMs: number,
): Promise<{ state: string }> {
  assertCanAct(actor.roles, "member.admit");
  const res = await client.query(
    `SELECT identity_id, state FROM membership WHERE group_id = $1 AND membership_id = $2 FOR UPDATE`,
    [groupId, membershipId],
  );
  const row = res.rows[0] as { identity_id: string; state: string } | undefined;
  if (!row || row.state !== "pending") throw new DomainError("OBJET_INTROUVABLE", "Demande introuvable");
  if (row.identity_id === actor.identityId) throw new DomainError("APPROVER_NOT_DISTINCT", "On ne s'admet pas soi-même");
  if (decision === "admit") {
    const g = await loadGroup(client, groupId);
    const active = await client.query(`SELECT count(*)::int AS n FROM membership WHERE group_id = $1 AND state = 'active'`, [groupId]);
    if (Number(active.rows[0]?.n ?? 0) >= g.settings.maxMembers) {
      throw new DomainError("RULE_INVALID", "Effectif maximal du groupe atteint");
    }
    await client.query(
      `UPDATE membership SET state = 'active', joined_at = now(), admitted_by_identity_id = $3
        WHERE group_id = $1 AND membership_id = $2`,
      [groupId, membershipId, actor.identityId],
    );
    await client.query(
      `INSERT INTO role_assignment (role_assignment_id, group_id, membership_id, role, accepted_at)
       VALUES ($1, $2, $3, 'member', now())`,
      [newId("ra"), groupId, membershipId],
    );
  } else {
    await client.query(`UPDATE membership SET state = 'revoked' WHERE group_id = $1 AND membership_id = $2`, [groupId, membershipId]);
  }
  await appendEvent(client, groupId, actor, decision === "admit" ? "membership.admitted" : "membership.refused", { membershipId }, nowMs);
  await notify(client, groupId, [row.identity_id], "membership", `group:${groupId}`, `decision:${membershipId}`);
  return { state: decision === "admit" ? "active" : "revoked" };
}

/* ── Bureau (L-11) ───────────────────────────────────────────────────── */

export async function proposeRole(
  client: pg.PoolClient,
  groupId: string,
  actor: TontineActor,
  input: { readonly membershipId: string; readonly role: string; readonly mandateStart: string; readonly mandateEnd: string | null },
  nowMs: number,
): Promise<{ roleAssignmentId: string }> {
  assertCanAct(actor.roles, "role.assign");
  if (!isGroupRole(input.role) || input.role === "member") throw new DomainError("MANDATE_INVALID", "Fonction inconnue");
  assertMandate(input.mandateStart, input.mandateEnd);
  const target = await client.query(
    `SELECT identity_id FROM membership WHERE group_id = $1 AND membership_id = $2 AND state = 'active'`,
    [groupId, input.membershipId],
  );
  const t = target.rows[0] as { identity_id: string } | undefined;
  if (!t) throw new DomainError("OBJET_INTROUVABLE", "Membre introuvable");
  assertRoleAssignable({ role: input.role, proposerIdentityId: actor.identityId, targetIdentityId: t.identity_id });
  const dup = await client.query(
    `SELECT 1 FROM role_assignment WHERE group_id = $1 AND membership_id = $2 AND role = $3 AND ended_at IS NULL`,
    [groupId, input.membershipId, input.role],
  );
  if (dup.rows.length > 0) throw new DomainError("MANDATE_INVALID", "Fonction déjà proposée ou exercée");
  // Président et trésorier : une seule personne à la fois (adjoints à part).
  if (input.role === "animator" || input.role === "treasurer") {
    const holder = await client.query(
      `SELECT 1 FROM role_assignment WHERE group_id = $1 AND role = $2 AND accepted_at IS NOT NULL AND ended_at IS NULL`,
      [groupId, input.role],
    );
    if (holder.rows.length > 0) throw new DomainError("MANDATE_INVALID", "Fonction déjà occupée : mettez d'abord fin au mandat");
  }
  const roleAssignmentId = newId("ra");
  await client.query(
    `INSERT INTO role_assignment (role_assignment_id, group_id, membership_id, role, proposed_by_identity_id, mandate_start, mandate_end)
     VALUES ($1, $2, $3, $4, $5, $6::date, $7::date)`,
    [roleAssignmentId, groupId, input.membershipId, input.role, actor.identityId, input.mandateStart, input.mandateEnd],
  );
  await appendEvent(client, groupId, actor, "role.proposed", { roleAssignmentId, membershipId: input.membershipId, role: input.role }, nowMs);
  await notify(client, groupId, [t.identity_id], "general", `group:${groupId}:roles`, `role:${roleAssignmentId}`);
  return { roleAssignmentId };
}

export async function acceptRole(
  client: pg.PoolClient,
  groupId: string,
  actor: TontineActor,
  roleAssignmentId: string,
  nowMs: number,
): Promise<void> {
  const res = await client.query(
    `SELECT membership_id, role, accepted_at, ended_at FROM role_assignment WHERE group_id = $1 AND role_assignment_id = $2 FOR UPDATE`,
    [groupId, roleAssignmentId],
  );
  const row = res.rows[0] as { membership_id: string; role: string; accepted_at: unknown; ended_at: unknown } | undefined;
  if (!row || row.membership_id !== actor.membershipId) throw new DomainError("OBJET_INTROUVABLE", "Fonction introuvable");
  if (row.accepted_at !== null || row.ended_at !== null) throw new DomainError("ROLE_ACCEPTANCE_REQUIRED", "Fonction déjà acceptée ou close");
  if (row.role === "animator" || row.role === "treasurer") {
    const holder = await client.query(
      `SELECT 1 FROM role_assignment WHERE group_id = $1 AND role = $2 AND accepted_at IS NOT NULL AND ended_at IS NULL`,
      [groupId, row.role],
    );
    if (holder.rows.length > 0) throw new DomainError("MANDATE_INVALID", "Fonction déjà occupée");
  }
  await client.query(`UPDATE role_assignment SET accepted_at = now() WHERE role_assignment_id = $1`, [roleAssignmentId]);
  await appendEvent(client, groupId, actor, "role.accepted", { roleAssignmentId, role: row.role }, nowMs);
}

export async function endRole(
  client: pg.PoolClient,
  groupId: string,
  actor: TontineActor,
  roleAssignmentId: string,
  reason: string,
  nowMs: number,
): Promise<void> {
  const res = await client.query(
    `SELECT membership_id, role, ended_at FROM role_assignment WHERE group_id = $1 AND role_assignment_id = $2 FOR UPDATE`,
    [groupId, roleAssignmentId],
  );
  const row = res.rows[0] as { membership_id: string; role: string; ended_at: unknown } | undefined;
  if (!row || row.ended_at !== null) throw new DomainError("OBJET_INTROUVABLE", "Fonction introuvable");
  // Démission (soi-même) ou fin de mandat décidée par la présidence.
  if (row.membership_id !== actor.membershipId) assertCanAct(actor.roles, "role.assign");
  if (row.role === "animator") {
    const others = await client.query(
      `SELECT 1 FROM role_assignment WHERE group_id = $1 AND role IN ('vice_president') AND accepted_at IS NOT NULL
         AND ended_at IS NULL AND role_assignment_id <> $2`,
      [groupId, roleAssignmentId],
    );
    if (others.rows.length === 0) {
      throw new DomainError("MANDATE_INVALID", "Désignez d'abord un vice-président pour assurer l'intérim");
    }
  }
  await client.query(`UPDATE role_assignment SET ended_at = now() WHERE role_assignment_id = $1`, [roleAssignmentId]);
  await appendEvent(client, groupId, actor, "role.ended", { roleAssignmentId, role: row.role, reason: reason.slice(0, 200) }, nowMs);
}

export async function listRoles(client: pg.PoolClient, groupId: string): Promise<unknown[]> {
  const res = await client.query(
    `SELECT r.role_assignment_id, r.membership_id, m.display_name, r.role, r.accepted_at, r.mandate_start, r.mandate_end,
            r.proposed_by_identity_id IS NOT NULL AS proposed
       FROM role_assignment r JOIN membership m USING (group_id, membership_id)
      WHERE r.group_id = $1 AND r.ended_at IS NULL AND r.role <> 'member'
      ORDER BY r.role`,
    [groupId],
  );
  return res.rows;
}

/* ── Calendrier réel (L-03), parts (L-14), ordre (L-13) ─────────────── */

async function activeMembers(client: pg.PoolClient, groupId: string): Promise<{ membershipId: string; identityId: string; joinedAt: string | null; displayName: string | null }[]> {
  const res = await client.query(
    `SELECT membership_id, identity_id, joined_at, display_name FROM membership
      WHERE group_id = $1 AND state = 'active' ORDER BY joined_at NULLS LAST, membership_id`,
    [groupId],
  );
  return res.rows.map((r: Record<string, unknown>) => ({
    membershipId: String(r["membership_id"]),
    identityId: String(r["identity_id"]),
    joinedAt: r["joined_at"] ? new Date(String(r["joined_at"])).toISOString() : null,
    displayName: (r["display_name"] as string | null) ?? null,
  }));
}

export interface ScheduleInput {
  readonly cadence: Cadence;
  readonly startDate: string;
  readonly contributionPerShare: bigint;
  readonly order: { readonly mode: "join_order" } | { readonly mode: "manual"; readonly membershipIds: readonly string[] } | { readonly mode: "draw"; readonly drawId: string };
  readonly shares?: readonly { readonly holders: readonly { readonly membershipId: string; readonly weight: number }[] }[] | undefined;
  readonly dueTime?: string | undefined;
}

export async function buildSchedule(
  client: pg.PoolClient,
  groupId: string,
  actor: TontineActor,
  input: ScheduleInput,
  nowMs: number,
): Promise<unknown> {
  assertCanAct(actor.roles, "schedule.manage");
  assertCadence(input.cadence);
  const meta = await client.query(`SELECT state FROM cycle_schedule WHERE group_id = $1 FOR UPDATE`, [groupId]);
  if (meta.rows[0]?.state === "started") throw new DomainError("SCHEDULE_FROZEN", "Cycle démarré : calendrier figé");
  const g = await loadGroup(client, groupId);
  const mems = await activeMembers(client, groupId);
  if (mems.length < g.settings.minMembers) {
    throw new DomainError("CYCLE_START_NOT_READY", `Au moins ${g.settings.minMembers} membres actifs`);
  }
  const activeIds = mems.map((m) => m.membershipId);

  // Ordre des titulaires (parts par défaut : une par membre).
  let ordered: string[];
  if (input.order.mode === "manual") {
    ordered = [...input.order.membershipIds];
  } else if (input.order.mode === "draw") {
    const d = await client.query(`SELECT result FROM draw WHERE group_id = $1 AND draw_id = $2 AND revealed_at IS NOT NULL`, [
      groupId,
      input.order.drawId,
    ]);
    const result = d.rows[0]?.result as string[] | null | undefined;
    if (!result) throw new DomainError("DRAW_INVALID", "Tirage non révélé");
    ordered = [...result];
  } else {
    ordered = [...activeIds];
  }

  let shares: Share[];
  if (input.shares && input.shares.length > 0) {
    shares = input.shares.map((s, i) => ({ shareId: `${groupId}_s${i + 1}`, holders: s.holders.map((h) => ({ ...h })) }));
  } else {
    if (new Set(ordered).size !== ordered.length || ordered.length !== activeIds.length || !ordered.every((m) => activeIds.includes(m))) {
      throw new DomainError("SCHEDULE_ROUNDS_MISMATCH", "L'ordre doit citer chaque membre actif une fois");
    }
    shares = oneSharePerMember(ordered).map((s, i) => ({ ...s, shareId: `${groupId}_s${i + 1}` }));
  }
  assertShares(shares, activeIds);
  if (input.contributionPerShare <= 0n) throw new DomainError("RULE_INVALID", "Cotisation par part invalide");

  const dates = meetingDates(input.cadence, input.startDate, shares.length);
  const dueDay = Number(input.startDate.slice(8, 10));
  const legacyFrequency = input.cadence.kind === "weekly" || input.cadence.kind === "biweekly" || input.cadence.kind === "daily" || input.cadence.kind === "every_n_days" ? "weekly" : "monthly";
  const ruleSet = compileRuleSet(
    {
      memberCount: activeIds.length,
      contribution: input.contributionPerShare,
      rounds: shares.length,
      frequency: legacyFrequency,
      dueDay: Math.min(dueDay, 31),
      quorum: { numerator: 1, denominator: 2 },
      gracePeriodDays: Math.min(g.settings.fines.graceDays, 30),
      penaltyEnabled: false,
    },
    { pilot: false },
  );
  const nextVer = await client.query(`SELECT COALESCE(MAX(rules_version), 0) + 1 AS v FROM rule_version WHERE group_id = $1`, [groupId]);
  const rulesVersion = Number(nextVer.rows[0]?.v ?? 1);
  const snapshotJson = { ...ruleSet, contribution: ruleSet.contribution.toString() };
  await client.query(
    `INSERT INTO rule_version (group_id, rules_version, snapshot, snapshot_hash, published_at)
     VALUES ($1, $2, $3::jsonb, $4, now())`,
    [groupId, rulesVersion, JSON.stringify(snapshotJson), canonicalHash(ruleSet)],
  );

  await client.query(
    `INSERT INTO cycle_schedule (group_id, rules_version, frequency, state, cadence)
     VALUES ($1, $2, $3, 'draft', $4::jsonb)
     ON CONFLICT (group_id) DO UPDATE SET rules_version = EXCLUDED.rules_version, frequency = EXCLUDED.frequency,
       cadence = EXCLUDED.cadence, state = 'draft'`,
    [groupId, rulesVersion, input.cadence.kind, JSON.stringify(input.cadence)],
  );
  await client.query(`DELETE FROM obligation WHERE group_id = $1`, [groupId]);
  await client.query(`DELETE FROM round WHERE group_id = $1`, [groupId]);
  await client.query(`DELETE FROM share_holder WHERE group_id = $1`, [groupId]);
  await client.query(`DELETE FROM share WHERE group_id = $1`, [groupId]);

  for (const [i, s] of shares.entries()) {
    const label = s.holders.length === 1 ? `Part ${i + 1}` : `Part ${i + 1} (partagée)`;
    await client.query(`INSERT INTO share (share_id, group_id, label) VALUES ($1, $2, $3)`, [s.shareId, groupId, label]);
    for (const h of s.holders) {
      await client.query(`INSERT INTO share_holder (group_id, share_id, membership_id, weight) VALUES ($1, $2, $3, $4)`, [
        groupId,
        s.shareId,
        h.membershipId,
        h.weight,
      ]);
    }
  }
  const dueByMember = memberDueForRound(shares, input.contributionPerShare);
  for (const [i, s] of shares.entries()) {
    const seq = i + 1;
    const date = dates[i] as string;
    const roundId = `${groupId}_r${seq}`;
    const beneficiary = s.holders.length === 1 ? (s.holders[0]?.membershipId ?? null) : null;
    await client.query(
      `INSERT INTO round (round_id, group_id, seq, state, beneficiary_membership_id, due_date_business, due_at_utc, rules_version, share_id)
       VALUES ($1, $2, $3, 'open', $4, $5::date, $6, $7, $8)`,
      [roundId, groupId, seq, beneficiary, date, new Date(deadlineUtcMs(date, input.dueTime ?? "18:00")).toISOString(), rulesVersion, s.shareId],
    );
    for (const m of activeIds) {
      const due = dueByMember.get(m) ?? 0n;
      if (due <= 0n) continue;
      await client.query(
        `INSERT INTO obligation (obligation_id, group_id, round_id, member_membership_id, due_amount)
         VALUES ($1, $2, $3, $4, $5)`,
        [`${roundId}_${m}`, groupId, roundId, m, due.toString()],
      );
    }
  }
  await appendEvent(
    client,
    groupId,
    actor,
    "schedule.built",
    { rulesVersion, cadence: input.cadence, startDate: input.startDate, shares: shares.length, contributionPerShare: input.contributionPerShare },
    nowMs,
  );
  return getSchedule(client, groupId);
}

export async function getSchedule(client: pg.PoolClient, groupId: string): Promise<unknown> {
  const meta = await client.query(`SELECT state, cadence, rules_version, started_at FROM cycle_schedule WHERE group_id = $1`, [groupId]);
  const m = meta.rows[0] as Record<string, unknown> | undefined;
  if (!m) return { state: "none", rounds: [] };
  const rv = await client.query(`SELECT snapshot FROM rule_version WHERE group_id = $1 AND rules_version = $2`, [groupId, m["rules_version"]]);
  const contribution = toBig((rv.rows[0]?.snapshot as Record<string, unknown> | undefined)?.["contribution"]);
  const rounds = await client.query(
    `SELECT r.seq, r.round_id, r.state, r.due_date_business, r.share_id, r.beneficiary_membership_id,
            COALESCE((SELECT array_agg(json_build_object('membershipId', h.membership_id, 'name', mm.display_name, 'weight', h.weight))
                        FROM share_holder h JOIN membership mm ON mm.group_id = h.group_id AND mm.membership_id = h.membership_id
                       WHERE h.group_id = r.group_id AND h.share_id = r.share_id), ARRAY[]::json[]) AS holders,
            (SELECT meeting_id FROM meeting mt WHERE mt.group_id = r.group_id AND mt.round_seq = r.seq LIMIT 1) AS meeting_id
       FROM round r WHERE r.group_id = $1 ORDER BY r.seq`,
    [groupId],
  );
  const shareCount = rounds.rows.length;
  const cadence = m["cadence"] as Cadence | null;
  return {
    state: m["state"],
    cadence,
    cadenceLabel: cadence ? describeCadence(cadence, "fr") : null,
    rulesVersion: Number(m["rules_version"]),
    contributionPerShare: contribution.toString(),
    potPerRound: (contribution * BigInt(shareCount)).toString(),
    startedAt: m["started_at"],
    rounds: rounds.rows.map((r: Record<string, unknown>) => ({
      seq: r["seq"],
      roundId: r["round_id"],
      state: r["state"],
      date: r["due_date_business"] ? String(r["due_date_business"] instanceof Date ? (r["due_date_business"] as Date).toISOString().slice(0, 10) : r["due_date_business"]) : null,
      shareId: r["share_id"],
      holders: r["holders"],
      meetingId: r["meeting_id"],
    })),
  };
}

export async function startSchedule(
  client: pg.PoolClient,
  groupId: string,
  actor: TontineActor,
  nowMs: number,
): Promise<unknown> {
  assertCanAct(actor.roles, "schedule.manage");
  const meta = await client.query(`SELECT state FROM cycle_schedule WHERE group_id = $1 FOR UPDATE`, [groupId]);
  const state = meta.rows[0]?.state as string | undefined;
  if (!state) throw new DomainError("CYCLE_START_NOT_READY", "Aucun calendrier");
  if (state === "started") throw new DomainError("SCHEDULE_FROZEN", "Cycle déjà démarré");
  // Bureau minimal : un président et un trésorier distincts, acceptés.
  const bureau = await client.query(
    `SELECT role, membership_id FROM role_assignment
      WHERE group_id = $1 AND role IN ('animator','treasurer') AND accepted_at IS NOT NULL AND ended_at IS NULL`,
    [groupId],
  );
  const president = bureau.rows.find((r: Record<string, unknown>) => r["role"] === "animator");
  const treasurer = bureau.rows.find((r: Record<string, unknown>) => r["role"] === "treasurer");
  if (!president || !treasurer) throw new DomainError("CYCLE_START_NOT_READY", "Un président et un trésorier doivent avoir accepté leur fonction");
  if (president["membership_id"] === treasurer["membership_id"]) {
    throw new DomainError("CYCLE_START_NOT_READY", "Le trésorier est une autre personne que le président");
  }
  const g = await loadGroup(client, groupId);
  const rounds = await client.query(`SELECT seq, due_date_business FROM round WHERE group_id = $1 ORDER BY seq`, [groupId]);
  if (rounds.rows.length < 2) throw new DomainError("CYCLE_START_NOT_READY", "Calendrier incomplet");
  for (const r of rounds.rows as Record<string, unknown>[]) {
    const d = r["due_date_business"];
    const iso = d instanceof Date ? d.toISOString().slice(0, 10) : String(d);
    await client.query(
      `INSERT INTO meeting (meeting_id, group_id, seq, scheduled_date, round_seq, state, location)
       VALUES ($1, $2, $3, $4::date, $3, 'planned', $5)
       ON CONFLICT (group_id, seq) DO NOTHING`,
      [`${groupId}_m${String(r["seq"])}`, groupId, r["seq"], iso, g.settings.meetingPlace],
    );
  }
  await client.query(`UPDATE cycle_schedule SET state = 'started', started_at = now() WHERE group_id = $1`, [groupId]);
  if (g.state === "configuration") {
    const next = transitionGroupState(g.state, "active");
    await client.query(`UPDATE "group" SET state = $2, version = version + 1 WHERE group_id = $1`, [groupId, next]);
  }
  await appendEvent(client, groupId, actor, "schedule.started", { rounds: rounds.rows.length }, nowMs);
  const everyone = await client.query(`SELECT identity_id FROM membership WHERE group_id = $1 AND state = 'active'`, [groupId]);
  await notify(client, groupId, everyone.rows.map((r: { identity_id: string }) => r.identity_id), "meeting_reminder", `group:${groupId}:schedule`, "schedule-started");
  return getSchedule(client, groupId);
}

/* ── Tirage engagé (L-13) ────────────────────────────────────────────── */

export async function commitDraw(
  client: pg.PoolClient,
  groupId: string,
  actor: TontineActor,
  commitment: string,
  nowMs: number,
): Promise<{ drawId: string }> {
  assertCanAct(actor.roles, "order.manage");
  if (!/^[0-9a-f]{64}$/.test(commitment)) throw new DomainError("DRAW_INVALID", "Empreinte invalide");
  const drawId = newId("draw");
  await client.query(
    `INSERT INTO draw (draw_id, group_id, commitment, committed_by_identity_id) VALUES ($1, $2, $3, $4)`,
    [drawId, groupId, commitment, actor.identityId],
  );
  await appendEvent(client, groupId, actor, "draw.committed", { drawId, commitment }, nowMs);
  return { drawId };
}

export async function revealDraw(
  client: pg.PoolClient,
  groupId: string,
  actor: TontineActor,
  drawId: string,
  seed: string,
  nowMs: number,
): Promise<{ order: string[] }> {
  assertCanAct(actor.roles, "order.manage");
  const d = await client.query(`SELECT commitment, revealed_at FROM draw WHERE group_id = $1 AND draw_id = $2 FOR UPDATE`, [groupId, drawId]);
  const row = d.rows[0] as { commitment: string; revealed_at: unknown } | undefined;
  if (!row) throw new DomainError("OBJET_INTROUVABLE", "Tirage introuvable");
  if (row.revealed_at !== null) throw new DomainError("DRAW_INVALID", "Tirage déjà révélé");
  if (drawCommitment(seed) !== row.commitment) throw new DomainError("DRAW_INVALID", "La graine ne correspond pas à l'engagement");
  const g = await loadGroup(client, groupId);
  const mems = await activeMembers(client, groupId);
  let order = drawOrder(seed, row.commitment, mems.map((m) => m.membershipId));
  if (g.settings.newcomersLast) {
    // Les nouveaux (admis après le premier quart des membres) passent après les anciens.
    const joined = mems.map((m) => m.joinedAt ?? "").sort();
    const cutoff = joined[Math.floor(joined.length / 2)] ?? "";
    const isNew = (id: string) => (mems.find((m) => m.membershipId === id)?.joinedAt ?? "") > cutoff && cutoff !== "";
    order = [...order.filter((id) => !isNew(id)), ...order.filter((id) => isNew(id))];
  }
  await client.query(`UPDATE draw SET seed = $3, revealed_at = now(), result = $4 WHERE group_id = $1 AND draw_id = $2`, [
    groupId,
    drawId,
    seed,
    order,
  ]);
  await appendEvent(client, groupId, actor, "draw.revealed", { drawId, seed, order }, nowMs);
  return { order };
}

/* ── Échange de tours (L-13) ─────────────────────────────────────────── */

async function slots(client: pg.PoolClient, groupId: string): Promise<{ seq: number; holder: string; paid: boolean }[]> {
  const res = await client.query(
    `SELECT r.seq, r.share_id, r.state,
            EXISTS (SELECT 1 FROM fund_movement fm WHERE fm.group_id = r.group_id AND fm.kind = 'payout'
                      AND fm.related_kind = 'payout' AND fm.related_id = r.round_id AND fm.state <> 'rejected') AS paid
       FROM round r WHERE r.group_id = $1 ORDER BY r.seq`,
    [groupId],
  );
  return res.rows.map((r: Record<string, unknown>) => ({
    seq: Number(r["seq"]),
    holder: String(r["share_id"] ?? ""),
    paid: r["paid"] === true || r["state"] === "closed",
  }));
}

async function shareIdentities(client: pg.PoolClient, groupId: string, shareId: string): Promise<string[]> {
  const res = await client.query(
    `SELECT m.identity_id FROM share_holder h JOIN membership m ON m.group_id = h.group_id AND m.membership_id = h.membership_id
      WHERE h.group_id = $1 AND h.share_id = $2`,
    [groupId, shareId],
  );
  return res.rows.map((r: { identity_id: string }) => r.identity_id);
}

export async function requestSwap(
  client: pg.PoolClient,
  groupId: string,
  actor: TontineActor,
  input: { readonly seqA: number; readonly seqB: number; readonly reason: string | null },
  nowMs: number,
): Promise<{ changeId: string }> {
  assertCanAct(actor.roles, "order.swap.request");
  const s = await slots(client, groupId);
  swapRounds(s, input.seqA, input.seqB); // valide l'échange (tours non remis, titulaires distincts)
  const a = s.find((x) => x.seq === input.seqA);
  const b = s.find((x) => x.seq === input.seqB);
  const required = [
    ...new Set([...(await shareIdentities(client, groupId, a?.holder ?? "")), ...(await shareIdentities(client, groupId, b?.holder ?? ""))]),
  ];
  if (!required.includes(actor.identityId)) {
    throw new DomainError("ORDER_CHANGE_INVALID", "Seul un titulaire d'un des deux tours demande l'échange");
  }
  const changeId = newId("chg");
  await client.query(
    `INSERT INTO order_change (change_id, group_id, kind, seq_a, seq_b, reason, required_identity_ids, accepted_identity_ids,
                               requested_by_identity_id, state)
     VALUES ($1, $2, 'swap', $3, $4, $5, $6, $7, $8, 'requested')`,
    [changeId, groupId, input.seqA, input.seqB, input.reason, required, [actor.identityId], actor.identityId],
  );
  await appendEvent(client, groupId, actor, "order.swap_requested", { changeId, seqA: input.seqA, seqB: input.seqB }, nowMs);
  await notify(client, groupId, required.filter((i) => i !== actor.identityId), "order_change", `group:${groupId}:order`, `swap:${changeId}`);
  return { changeId };
}

export async function actOnSwap(
  client: pg.PoolClient,
  groupId: string,
  actor: TontineActor,
  changeId: string,
  act: "accept" | "approve" | "reject",
  nowMs: number,
): Promise<{ state: string }> {
  const res = await client.query(
    `SELECT seq_a, seq_b, required_identity_ids, accepted_identity_ids, approved_by_identity_id, state
       FROM order_change WHERE group_id = $1 AND change_id = $2 FOR UPDATE`,
    [groupId, changeId],
  );
  const row = res.rows[0] as Record<string, unknown> | undefined;
  if (!row || row["state"] !== "requested") throw new DomainError("OBJET_INTROUVABLE", "Demande introuvable");
  const required = row["required_identity_ids"] as string[];
  let accepted = row["accepted_identity_ids"] as string[];
  let approver = (row["approved_by_identity_id"] as string | null) ?? null;
  if (act === "reject") {
    if (!required.includes(actor.identityId) && !canAct(actor.roles, "order.manage")) throw new DomainError("TONTINE_FORBIDDEN", "Accès refusé");
    await client.query(`UPDATE order_change SET state = 'rejected', version = version + 1 WHERE change_id = $1`, [changeId]);
    await appendEvent(client, groupId, actor, "order.swap_rejected", { changeId }, nowMs);
    return { state: "rejected" };
  }
  if (act === "accept") {
    if (!required.includes(actor.identityId)) throw new DomainError("TONTINE_FORBIDDEN", "Accès refusé");
    accepted = [...new Set([...accepted, actor.identityId])];
  } else {
    assertCanAct(actor.roles, "order.manage");
    if (required.includes(actor.identityId)) throw new DomainError("APPROVER_NOT_DISTINCT", "Le bureau approuve un échange qui ne le concerne pas");
    approver = actor.identityId;
  }
  const complete = required.every((r) => accepted.includes(r)) && approver !== null;
  await client.query(
    `UPDATE order_change SET accepted_identity_ids = $2, approved_by_identity_id = $3, version = version + 1 WHERE change_id = $1`,
    [changeId, accepted, approver],
  );
  if (!complete) return { state: "requested" };
  // Accords complets : application tracée, autorisée au gel par le drapeau de transaction.
  const s = await slots(client, groupId);
  const seqA = Number(row["seq_a"]);
  const seqB = Number(row["seq_b"]);
  const swapped = swapRounds(s, seqA, seqB);
  void swapApprovalsComplete;
  await client.query("SELECT set_config('kombe.order_change', 'approved', true)");
  for (const seq of [seqA, seqB]) {
    const newShare = swapped.find((x) => x.seq === seq)?.holder as string;
    const holders = await client.query(`SELECT membership_id FROM share_holder WHERE group_id = $1 AND share_id = $2`, [groupId, newShare]);
    const beneficiary = holders.rows.length === 1 ? String(holders.rows[0]?.membership_id) : null;
    // Deux tours échangent leur part : on passe par un état intermédiaire
    // (share_id NULL) pour respecter l'unicité « un tour par part ».
    await client.query(`UPDATE round SET share_id = NULL, beneficiary_membership_id = NULL WHERE group_id = $1 AND seq = $2`, [groupId, seq]);
    void beneficiary;
  }
  for (const seq of [seqA, seqB]) {
    const newShare = swapped.find((x) => x.seq === seq)?.holder as string;
    const holders = await client.query(`SELECT membership_id FROM share_holder WHERE group_id = $1 AND share_id = $2`, [groupId, newShare]);
    const beneficiary = holders.rows.length === 1 ? String(holders.rows[0]?.membership_id) : null;
    await client.query(`UPDATE round SET share_id = $3, beneficiary_membership_id = $4 WHERE group_id = $1 AND seq = $2`, [
      groupId,
      seq,
      newShare,
      beneficiary,
    ]);
  }
  await client.query("SELECT set_config('kombe.order_change', '', true)");
  await client.query(`UPDATE order_change SET state = 'applied', applied_at = now() WHERE change_id = $1`, [changeId]);
  await appendEvent(client, groupId, actor, "order.swap_applied", { changeId, seqA, seqB }, nowMs);
  await notify(client, groupId, required, "order_change", `group:${groupId}:schedule`, `applied:${changeId}`);
  return { state: "applied" };
}

export async function listOrderChanges(client: pg.PoolClient, groupId: string): Promise<unknown[]> {
  const res = await client.query(
    `SELECT change_id, kind, seq_a, seq_b, reason, required_identity_ids, accepted_identity_ids, approved_by_identity_id IS NOT NULL AS approved,
            state, created_at
       FROM order_change WHERE group_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [groupId],
  );
  return res.rows;
}

/** Montant de la cagnotte d'un tour (cotisation × nombre de parts). */
export async function potForGroup(client: pg.PoolClient, groupId: string): Promise<bigint> {
  const sched = await client.query(
    `SELECT rv.snapshot FROM cycle_schedule cs JOIN rule_version rv ON rv.group_id = cs.group_id AND rv.rules_version = cs.rules_version
      WHERE cs.group_id = $1`,
    [groupId],
  );
  const contribution = toBig((sched.rows[0]?.snapshot as Record<string, unknown> | undefined)?.["contribution"]);
  const n = await client.query(`SELECT count(*)::int AS n FROM share WHERE group_id = $1`, [groupId]);
  const shares: Share[] = Array.from({ length: Number(n.rows[0]?.n ?? 0) }, (_, i) => ({ shareId: String(i), holders: [{ membershipId: String(i), weight: 1 }] }));
  return shares.length > 0 ? potPerRound(shares, contribution) : 0n;
}

export type { GroupRole };
