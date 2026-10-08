/**
 * KÓMBE @kombe/api — store RÉEL (PostgreSQL) du moteur de règles versionnées
 * (C04 : 3.1 → 3.7, 6.7). TOUTE décision reste dans les fonctions pures de
 * `@kombe/domain` (rules.ts) : compilation pilote (pénalités forcées false),
 * scellement du hash canonique, acceptation par hash EXACT, effectivité d'un
 * engagement essentiel, garde de non-rétroactivité. La migration 0005 sert de
 * défense en profondeur (immuabilité `rule_version` par déclencheur, CHECK
 * anti-pénalité, unicité d'acceptation), jamais d'unique garde-fou.
 *
 * Horloge SERVEUR injectée (§27) : `publishedAt`/`acceptedAt` naissent de
 * `now()`, jamais du corps de requête. La numérotation des versions est
 * sérialisée par verrou consultatif group-level (deux publications
 * concurrentes ne peuvent pas produire le même numéro).
 */
import type pg from "pg";
import {
  DomainError,
  acceptRuleVersion,
  assertNonRetroactive,
  canonicalHash,
  compileRuleSet,
  newRuleEffective,
  planRuleChange,
  publishRule,
  requestPenaltyEnabled,
  type ExistingDue,
  type PublishedRule,
  type RuleAcceptance,
  type RuleSet,
} from "@kombe/domain";
import { withGroupTx, lockGroupForJournalWrite } from "./txContext.js";
import { reviveRuleSnapshot, serializeRuleSnapshot } from "./ruleSnapshotCodec.js";

interface RuleVersionRow {
  readonly rules_version: number;
  readonly snapshot: unknown;
  readonly snapshot_hash: string | null;
  readonly supersedes: number | null;
  readonly published_at: string | null;
}

export class PgRulesStore {
  constructor(
    private readonly pool: pg.Pool,
    private readonly now: () => number,
  ) {}

  /** Relit une version publiée ; l'empreinte persistée fait foi (repli :
   *  recalcul canonique — même valeur, l'instantané étant scellé). */
  private async loadVersion(
    client: pg.PoolClient,
    groupId: string,
    version: number,
  ): Promise<PublishedRule> {
    const res = await client.query<RuleVersionRow>(
      `SELECT rules_version, snapshot, snapshot_hash, supersedes, published_at
       FROM rule_version WHERE group_id = $1 AND rules_version = $2`,
      [groupId, version],
    );
    const row = res.rows[0];
    if (!row) throw new DomainError("RESERVATION_INCOHERENTE", "Version de règle introuvable");
    const snapshot = reviveRuleSnapshot(row.snapshot);
    return Object.freeze({
      version: row.rules_version,
      groupId,
      snapshot,
      hash: row.snapshot_hash ?? canonicalHash(snapshot),
      publishedAt: row.published_at ? Date.parse(row.published_at) : 0,
      supersedes: row.supersedes,
    });
  }

  /** Publie une version : compiler pilote → pénalités forcées à false ; le
   *  hash canonique scelle l'instantané ; numéro sérialisé par verrou. */
  async publish(
    groupId: string,
    input: RuleSet,
    supersedes?: number,
  ): Promise<{ version: number; hash: string; penaltyEnabled: boolean }> {
    const compiled = compileRuleSet(input, { pilot: true });
    return withGroupTx(this.pool, groupId, async (client) => {
      await lockGroupForJournalWrite(client, groupId);
      const nextRes = await client.query<{ next_version: number }>(
        `SELECT COALESCE(MAX(rules_version), 0) + 1 AS next_version
         FROM rule_version WHERE group_id = $1`,
        [groupId],
      );
      const version = Number(nextRes.rows[0]?.next_version ?? 1);
      const pub = publishRule({
        version,
        groupId,
        snapshot: compiled,
        publishedAt: this.now(),
        supersedes: supersedes ?? null,
      });
      await client.query(
        `INSERT INTO rule_version
           (group_id, rules_version, snapshot, snapshot_hash, supersedes, published_at)
         VALUES ($1, $2, $3::jsonb, $4, $5, $6)`,
        [
          groupId,
          version,
          serializeRuleSnapshot(pub.snapshot),
          pub.hash,
          pub.supersedes,
          new Date(pub.publishedAt).toISOString(),
        ],
      );
      return { version, hash: pub.hash, penaltyEnabled: pub.snapshot.penaltyEnabled };
    });
  }

  /** Acceptation horodatée portant sur le hash EXACT d'une version publiée.
   *  L'accepteur est choisi par l'APPELANT (acteur résolu côté route) ; le
   *  rejeu ne produit jamais de doublon (unicité PK, DO NOTHING). */
  async accept(groupId: string, identityId: string, version: number, hash: string): Promise<RuleAcceptance> {
    return withGroupTx(this.pool, groupId, async (client) => {
      const published = await this.loadVersion(client, groupId, version);
      const acceptance = acceptRuleVersion(published, identityId, hash, this.now());
      await client.query(
        `INSERT INTO rules_acceptance (group_id, identity_id, rules_version, accepted_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (group_id, identity_id, rules_version) DO NOTHING`,
        [groupId, identityId, version, new Date(acceptance.acceptedAt).toISOString()],
      );
      return acceptance;
    });
  }

  /** Identités membres ACTIVES du groupe — source serveur de l'électorat
   *  « concerné » par un changement de règle (jamais une liste cliente). */
  async activeMemberIdentities(groupId: string): Promise<readonly string[]> {
    return withGroupTx(this.pool, groupId, async (client) => {
      const res = await client.query<{ identity_id: string }>(
        `SELECT identity_id FROM membership
         WHERE group_id = $1 AND state = 'active' ORDER BY identity_id`,
        [groupId],
      );
      return res.rows.map((r) => r.identity_id);
    });
  }

  /**
   * Effectivité d'un changement de règle DÉJÀ publié (3.7) : compare la
   * version cible à celle qu'elle remplace, calcule le plan, puis décide à
   * partir des acceptations PERSISTÉES. Engagement essentiel non accepté par
   * TOUTES les personnes concernées ⇒ `new_rule_executed = false`.
   */
  async evaluateChange(
    groupId: string,
    newVersion: number,
    concerned: readonly string[],
  ): Promise<{
    version: number;
    essential: boolean;
    appliesTo: "next_cycle" | "immediate";
    new_rule_executed: boolean;
  }> {
    return withGroupTx(this.pool, groupId, async (client) => {
      const versionsRes = await client.query<RuleVersionRow>(
        `SELECT rules_version, snapshot, snapshot_hash, supersedes, published_at
         FROM rule_version WHERE group_id = $1 ORDER BY rules_version ASC`,
        [groupId],
      );
      const idx = versionsRes.rows.findIndex((r) => r.rules_version === newVersion);
      if (idx < 1) throw new DomainError("RESERVATION_INCOHERENTE", "Version cible inexistante");
      const toPublished = await this.loadVersion(client, groupId, newVersion);
      const fromPublished = await this.loadVersion(
        client,
        groupId,
        versionsRes.rows[idx - 1]!.rules_version,
      );
      const plan = planRuleChange(fromPublished.snapshot, toPublished.snapshot);
      const accRes = await client.query<{ identity_id: string; rules_version: number }>(
        `SELECT identity_id, rules_version FROM rules_acceptance
         WHERE group_id = $1 AND rules_version = $2`,
        [groupId, newVersion],
      );
      const acceptances: RuleAcceptance[] = accRes.rows.map((r) => ({
        identityId: r.identity_id,
        groupId,
        version: r.rules_version,
        hash: toPublished.hash,
        acceptedAt: 0,
      }));
      const executed = newRuleEffective(plan, acceptances, newVersion, concerned);
      return {
        version: newVersion,
        essential: plan.essential,
        appliesTo: plan.appliesTo,
        new_rule_executed: executed,
      };
    });
  }

  /**
   * Recalcule les échéances du cycle COURANT vers la contribution de la
   * version courante (C04-RETRO). Toute modification d'une échéance DÉJÀ
   * PASSÉE est refusée par `assertNonRetroactive` AVANT écriture
   * (`RULE_RETROACTIVE`) ; en cas de succès, aucune échéance passée n'a
   * changé ⇒ `past_due_changed = false`. Une échéance sans instant borné
   * (jamais produite par C05) est traitée comme future — jamais modifiée
   * en silence dans le passé.
   */
  async recalculateCurrentCycle(groupId: string): Promise<{ past_due_changed: false }> {
    return withGroupTx(this.pool, groupId, async (client) => {
      await lockGroupForJournalWrite(client, groupId);
      const curRes = await client.query<{ rules_version: number }>(
        `SELECT rules_version FROM rule_version
         WHERE group_id = $1 ORDER BY rules_version DESC LIMIT 1`,
        [groupId],
      );
      const cur = curRes.rows[0];
      if (!cur) throw new DomainError("RESERVATION_INCOHERENTE", "Groupe ou règle absent");
      const current = await this.loadVersion(client, groupId, cur.rules_version);

      const dueRes = await client.query<{
        obligation_id: string;
        due_at_ms: string | null;
        due_amount: string;
      }>(
        `SELECT o.obligation_id,
                (extract(epoch FROM r.due_at_utc) * 1000)::bigint::text AS due_at_ms,
                o.due_amount::text AS due_amount
         FROM obligation o
         JOIN round r ON r.group_id = o.group_id AND r.round_id = o.round_id
         WHERE o.group_id = $1`,
        [groupId],
      );
      const before: ExistingDue[] = dueRes.rows.map((r) => ({
        obligationId: r.obligation_id,
        dueAtMs: r.due_at_ms === null ? Number.MAX_SAFE_INTEGER : Number(r.due_at_ms),
        amount: BigInt(r.due_amount),
      }));
      const after: ExistingDue[] = before.map((d) => ({
        ...d,
        amount: current.snapshot.contribution,
      }));
      assertNonRetroactive(before, after, this.now()); // refus explicite si passé modifié

      const ids = after.map((d) => d.obligationId);
      const amounts = after.map((d) => d.amount.toString());
      await client.query(
        `UPDATE obligation AS o
         SET due_amount = n.amt::bigint, version = o.version + 1
         FROM unnest($2::text[], $3::text[]) AS n(oid, amt)
         WHERE o.group_id = $1 AND o.obligation_id = n.oid AND o.due_amount <> n.amt::bigint`,
        [groupId, ids, amounts],
      );
      return { past_due_changed: false as const };
    });
  }

  /** Demande d'activation des pénalités — barrière serveur du pilote (3.3). */
  requestPenalty(desired: boolean): {
    requested: boolean;
    penalty_enabled: boolean;
    rejected: boolean;
  } {
    return requestPenaltyEnabled(desired, true);
  }
}
