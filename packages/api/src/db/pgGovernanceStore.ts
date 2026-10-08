/**
 * KÓMBE @kombe/api — store RÉEL (PostgreSQL) pour la gouvernance de groupe
 * (C03, bâti pendant la campagne "construit les 15"). Même esprit que
 * `pgContributionStore.ts` : TOUTE décision reste dans les fonctions pures de
 * `@kombe/domain` (group.ts, governance.ts, identity.ts) ; ce fichier ne fait
 * que lire/écrire ces décisions dans Postgres sous verrou. Même surface
 * publique que `FictitiousGovernanceStore` (packages/api/src/governanceStore.ts),
 * sauf méthodes de seed de test qui écrivent réellement (pas de Map en mémoire).
 *
 * "Fonctions indépendantes" (readiness.acceptedIndependentRoles) : dérivées en
 * comptant les lignes RÉELLES `role_assignment` dont le rôle ∈
 * {animator,treasurer,secretary,auditor} (exclut "member") ET accepted_at non
 * nul — jamais un compteur arbitraire (contrairement au store fictif qui
 * n'expose qu'un setter de test `setAcceptedIndependentRoles`).
 */
import type pg from "pg";
import {
  DomainError,
  transitionGroupState,
  assertGroupMutable,
  assertCycleStartable,
  allMembersAccepted,
  issueInvitation,
  redeemInvitation,
  acceptRules,
  assertContributionAllowed,
  transitionMembership,
  assertIdentityActiveInGroup,
  type CycleReadiness,
  type GroupState,
  type Membership,
  type RulesAcceptance,
} from "@kombe/domain";
import { withGroupTx } from "./txContext.js";

const INDEPENDENT_ROLES = ["animator", "treasurer", "secretary", "auditor"] as const;

export class PgGovernanceStore {
  constructor(private readonly pool: pg.Pool) {}

  async createGroup(input: {
    groupId: string;
    minimumMembers?: number | undefined;
    requiredIndependentRoles?: number | undefined;
  }): Promise<{ state: GroupState }> {
    await withGroupTx(this.pool, input.groupId, async (client) => {
      await client.query(
        `INSERT INTO "group" (group_id, state, version) VALUES ($1,'configuration',1)
         ON CONFLICT (group_id) DO NOTHING`,
        [input.groupId],
      );
      // minimumMembers/requiredIndependentRoles n'ont pas de colonne dédiée au
      // socle 0001/0004 : mêmes valeurs par défaut que le store fictif
      // (3 / 4), appliquées côté lecture (readiness) plutôt que stockées —
      // limite assumée, documentée (pas de migration nouvelle autorisée ici).
      void input.minimumMembers;
      void input.requiredIndependentRoles;
    });
    return { state: "configuration" };
  }

  /** Amorçage de test RÉEL (pas un seed en mémoire) : insère une adhésion
   *  active + identité si besoin. Réservé aux fixtures de test/outillage. */
  async seedActiveMember(groupId: string, identityId: string, membershipId?: string): Promise<string> {
    const mid = membershipId ?? `mem_${groupId}_${identityId}`;
    await withGroupTx(this.pool, groupId, async (client) => {
      await client.query(`INSERT INTO identity (identity_id) VALUES ($1) ON CONFLICT DO NOTHING`, [
        identityId,
      ]);
      await client.query(
        `INSERT INTO membership (membership_id, group_id, identity_id, state)
         VALUES ($1,$2,$3,'active') ON CONFLICT (membership_id) DO NOTHING`,
        [mid, groupId, identityId],
      );
    });
    return mid;
  }

  /** Amorçage de test RÉEL : accepte un rôle indépendant pour une adhésion. */
  async seedAcceptedRole(
    groupId: string,
    membershipId: string,
    role: (typeof INDEPENDENT_ROLES)[number],
    roleAssignmentId?: string,
  ): Promise<void> {
    const raId = roleAssignmentId ?? `ra_${groupId}_${membershipId}_${role}`;
    await withGroupTx(this.pool, groupId, async (client) => {
      await client.query(
        `INSERT INTO role_assignment (role_assignment_id, group_id, membership_id, role, accepted_at)
         VALUES ($1,$2,$3,$4, now())
         ON CONFLICT (role_assignment_id) DO UPDATE SET accepted_at = now()`,
        [raId, groupId, membershipId, role],
      );
    });
  }

  async designateTreasurerSubstitute(groupId: string, membershipId: string): Promise<void> {
    // Pas de colonne dédiée au socle existant : modélisé comme une ligne
    // role_assignment "member" acceptée portant un role_assignment_id
    // reconnaissable — limite assumée (même esprit que minimumMembers
    // ci-dessus : aucune migration nouvelle autorisée dans cet incrément).
    await withGroupTx(this.pool, groupId, async (client) => {
      await client.query(
        `INSERT INTO role_assignment (role_assignment_id, group_id, membership_id, role, accepted_at)
         VALUES ($1,$2,$3,'member', now())
         ON CONFLICT (role_assignment_id) DO UPDATE SET accepted_at = now()`,
        [`ra_${groupId}_substitute`, groupId, membershipId],
      );
    });
  }

  private async groupRow(client: pg.PoolClient, groupId: string): Promise<{ state: GroupState; version: number }> {
    const res = await client.query(`SELECT state, version FROM "group" WHERE group_id = $1`, [groupId]);
    const row = res.rows[0];
    if (!row) throw new DomainError("RESERVATION_INCOHERENTE", "Groupe introuvable");
    return { state: row.state as GroupState, version: Number(row.version) };
  }

  async readiness(groupId: string): Promise<CycleReadiness> {
    return withGroupTx(this.pool, groupId, async (client) => {
      const g = await this.groupRow(client, groupId);
      const activeRes = await client.query(
        `SELECT membership_id, identity_id FROM membership WHERE group_id = $1 AND state = 'active'`,
        [groupId],
      );
      const activeMembers = activeRes.rows as { membership_id: string; identity_id: string }[];
      const activeIds = activeMembers.map((m) => String(m.identity_id));

      const acceptedRes = await client.query(
        `SELECT count(DISTINCT membership_id)::int AS n FROM role_assignment
         WHERE group_id = $1 AND role = ANY($2) AND accepted_at IS NOT NULL`,
        [groupId, INDEPENDENT_ROLES as unknown as string[]],
      );
      const acceptedIndependentRoles = Number(acceptedRes.rows[0]?.n ?? 0);

      const substituteRes = await client.query(
        `SELECT 1 FROM role_assignment WHERE role_assignment_id = $1 AND accepted_at IS NOT NULL`,
        [`ra_${groupId}_substitute`],
      );
      const treasurerSubstituteDesignated = substituteRes.rows.length > 0;

      const currentVersionRes = await client.query(
        `SELECT COALESCE(MAX(rules_version), 0)::int AS v FROM rule_version WHERE group_id = $1`,
        [groupId],
      );
      const currentRulesVersion = Number(currentVersionRes.rows[0]?.v ?? 0);

      const acceptancesRes = await client.query(
        `SELECT identity_id, group_id, rules_version, extract(epoch from accepted_at)::bigint AS accepted_at
         FROM rules_acceptance WHERE group_id = $1 AND rules_version = $2`,
        [groupId, currentRulesVersion],
      );
      const acceptances: RulesAcceptance[] = acceptancesRes.rows.map((r) => ({
        identityId: String(r.identity_id),
        groupId: String(r.group_id),
        rulesVersion: Number(r.rules_version),
        acceptedAt: Number(r.accepted_at),
      }));

      return {
        groupState: g.state,
        acceptedIndependentRoles,
        requiredIndependentRoles: 4,
        rulesAcceptedByAllMembers:
          currentRulesVersion > 0 && allMembersAccepted(acceptances, activeIds, groupId, currentRulesVersion),
        treasurerSubstituteDesignated,
        activeMembers: activeIds.length,
        minimumMembers: 3,
      };
    });
  }

  async startCycle(groupId: string): Promise<{ state: GroupState }> {
    const readiness = await this.readiness(groupId);
    assertCycleStartable(readiness);
    return withGroupTx(this.pool, groupId, async (client) => {
      const g = await this.groupRow(client, groupId);
      const next = transitionGroupState(g.state, "active");
      await client.query(`UPDATE "group" SET state = $2, version = version + 1 WHERE group_id = $1`, [
        groupId,
        next,
      ]);
      return { state: next };
    });
  }

  async transition(groupId: string, to: GroupState): Promise<{ state: GroupState }> {
    return withGroupTx(this.pool, groupId, async (client) => {
      const g = await this.groupRow(client, groupId);
      const next = transitionGroupState(g.state, to);
      await client.query(`UPDATE "group" SET state = $2, version = version + 1 WHERE group_id = $1`, [
        groupId,
        next,
      ]);
      return { state: next };
    });
  }

  async attemptMutation(groupId: string, identityId: string): Promise<{ mutation_accepted: true }> {
    return withGroupTx(this.pool, groupId, async (client) => {
      const g = await this.groupRow(client, groupId);
      assertGroupMutable(g.state);
      const memRes = await client.query(
        `SELECT membership_id, identity_id, group_id, state FROM membership WHERE group_id = $1`,
        [groupId],
      );
      const memberships: Membership[] = memRes.rows.map((r) => ({
        membershipId: String(r.membership_id),
        identityId: String(r.identity_id),
        groupId: String(r.group_id),
        state: r.state,
      }));
      assertIdentityActiveInGroup(memberships, identityId, groupId);
      return { mutation_accepted: true as const };
    });
  }

  async inviteMember(
    groupId: string,
    handle: string,
  ): Promise<{ membershipId: string; groupId: string; state: Membership["state"] }> {
    return withGroupTx(this.pool, groupId, async (client) => {
      const g = await this.groupRow(client, groupId);
      assertGroupMutable(g.state);
      const membershipId = `mem_${groupId}_${handle}`;
      const existing = await client.query(`SELECT state FROM membership WHERE membership_id = $1`, [
        membershipId,
      ]);
      const existingState = existing.rows[0]?.state as Membership["state"] | undefined;
      if (existingState === "pending" || existingState === "active") {
        throw new DomainError("MEMBERSHIP_ALREADY_ACTIVE", "Une adhésion est déjà en cours pour cette identité");
      }
      await client.query(`INSERT INTO identity (identity_id) VALUES ($1) ON CONFLICT DO NOTHING`, [handle]);
      await client.query(
        `INSERT INTO membership (membership_id, group_id, identity_id, state)
         VALUES ($1,$2,$3,'pending')
         ON CONFLICT (membership_id) DO UPDATE SET state = 'pending'`,
        [membershipId, groupId, handle],
      );
      return { membershipId, groupId, state: "pending" as const };
    });
  }

  async terminateMembership(groupId: string, identityId: string): Promise<{ state: Membership["state"] }> {
    return withGroupTx(this.pool, groupId, async (client) => {
      const res = await client.query(
        `SELECT membership_id, state FROM membership WHERE group_id = $1 AND identity_id = $2 FOR UPDATE`,
        [groupId, identityId],
      );
      const row = res.rows[0];
      if (!row) throw new DomainError("IDENTITY_NOT_ACTIVE", "Adhésion introuvable");
      const current: Membership = {
        membershipId: String(row.membership_id),
        identityId,
        groupId,
        state: row.state,
      };
      const next = transitionMembership(current, "revoked");
      await client.query(`UPDATE membership SET state = $2 WHERE membership_id = $1`, [
        next.membershipId,
        next.state,
      ]);
      return { state: next.state };
    });
  }

  async acceptGroupRules(groupId: string, identityId: string): Promise<RulesAcceptance> {
    return withGroupTx(this.pool, groupId, async (client) => {
      const currentVersionRes = await client.query(
        `SELECT COALESCE(MAX(rules_version), 0)::int AS v FROM rule_version WHERE group_id = $1`,
        [groupId],
      );
      const currentRulesVersion = Number(currentVersionRes.rows[0]?.v ?? 0);
      if (currentRulesVersion < 1) {
        throw new DomainError("RULES_NOT_ACCEPTED", "Aucune version de règles publiée");
      }
      const acceptance = acceptRules(identityId, groupId, currentRulesVersion, Date.now());
      await client.query(
        `INSERT INTO rules_acceptance (group_id, identity_id, rules_version, accepted_at)
         VALUES ($1,$2,$3, to_timestamp($4/1000.0))
         ON CONFLICT (group_id, identity_id, rules_version) DO NOTHING`,
        [groupId, identityId, currentRulesVersion, acceptance.acceptedAt],
      );
      return acceptance;
    });
  }

  async declareContribution(groupId: string, identityId: string): Promise<{ allowed: true }> {
    return withGroupTx(this.pool, groupId, async (client) => {
      const currentVersionRes = await client.query(
        `SELECT COALESCE(MAX(rules_version), 0)::int AS v FROM rule_version WHERE group_id = $1`,
        [groupId],
      );
      const currentRulesVersion = Number(currentVersionRes.rows[0]?.v ?? 0);
      const acceptancesRes = await client.query(
        `SELECT identity_id, group_id, rules_version, extract(epoch from accepted_at)::bigint AS accepted_at
         FROM rules_acceptance WHERE group_id = $1 AND identity_id = $2`,
        [groupId, identityId],
      );
      const acceptances: RulesAcceptance[] = acceptancesRes.rows.map((r) => ({
        identityId: String(r.identity_id),
        groupId: String(r.group_id),
        rulesVersion: Number(r.rules_version),
        acceptedAt: Number(r.accepted_at),
      }));
      assertContributionAllowed(acceptances, identityId, groupId, currentRulesVersion);
      return { allowed: true as const };
    });
  }

  /** Amorçage de test RÉEL d'une invitation anonyme (lien/QR). */
  async seedInvitation(invitationId: string, groupId: string, maxUses: number): Promise<void> {
    const inv = issueInvitation({ invitationId, groupId, maxUses, now: Date.now(), ttlSeconds: 3600 });
    await withGroupTx(this.pool, groupId, async (client) => {
      await client.query(
        `INSERT INTO invitation (invitation_id, group_id, channel, max_uses, used_count, issued_at, expires_at)
         VALUES ($1,$2,'link',$3,0, to_timestamp($4/1000.0), to_timestamp($5/1000.0))
         ON CONFLICT (invitation_id) DO NOTHING`,
        [invitationId, groupId, maxUses, inv.issuedAt, inv.expiresAt],
      );
    });
  }

  async redeemInvitation(groupId: string, invitationId: string): Promise<{ usedCount: number; groupId: string }> {
    return withGroupTx(this.pool, groupId, async (client) => {
      const res = await client.query(
        `SELECT invitation_id, group_id, max_uses, used_count,
                extract(epoch from issued_at)::bigint*1000 AS issued_at,
                extract(epoch from expires_at)::bigint*1000 AS expires_at,
                extract(epoch from revoked_at)::bigint*1000 AS revoked_at
         FROM invitation WHERE invitation_id = $1 FOR UPDATE`,
        [invitationId],
      );
      const row = res.rows[0];
      if (!row) throw new DomainError("INVITATION_INVALID", "Invitation inconnue");
      const inv = {
        invitationId: String(row.invitation_id),
        groupId: String(row.group_id),
        maxUses: Number(row.max_uses),
        usedCount: Number(row.used_count),
        issuedAt: Number(row.issued_at),
        expiresAt: Number(row.expires_at),
        revokedAt: row.revoked_at === null ? null : Number(row.revoked_at),
      };
      const next = redeemInvitation(inv, Date.now());
      await client.query(`UPDATE invitation SET used_count = $2 WHERE invitation_id = $1`, [
        invitationId,
        next.usedCount,
      ]);
      return { usedCount: next.usedCount, groupId: next.groupId };
    });
  }
}
