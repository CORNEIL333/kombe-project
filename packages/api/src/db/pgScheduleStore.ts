/**
 * KÓMBE @kombe/api — store RÉEL (PostgreSQL) du calendrier de cycle (C05 :
 * 5.1 → 5.5). TOUTE décision reste dans les fonctions pures de `@kombe/domain`
 * (schedule.ts) : N tours pour N membres, permutation des bénéficiaires
 * (refus de doublon), gel à la construction, départ sans réaffectation,
 * plan de renouvellement. La migration 0022 sert de défense en profondeur
 * (gel en base d'un échéancier démarré : méta, tours, affectations), jamais
 * d'unique garde-fou — la décision est prise ici AVANT toute écriture.
 *
 * Autorité SERVEUR (jamais le corps de requête) : la cotisation, la fréquence
 * et le quantième d'échéance naissent de l'instantané de règle PUBLIÉ
 * (`rule_version.snapshot`) rattaché au cycle ; les membres sont résolus vers
 * des adhésions ACTIVES réelles du groupe. Dates métier calculées par le
 * domaine (`businessDateFor`, Africa/Douala), persistées avec leur instant UTC.
 */
import type pg from "pg";
import {
  DISPLAY_TZ,
  DomainError,
  applyDeparture,
  buildSchedule,
  planRenewal,
  reassignBeneficiary,
  rotation,
  startSchedule,
  type CycleSchedule,
  type DepartureView,
  type Frequency,
  type Obligation,
  type RenewalPlan,
  type RuleSet,
  type ScheduledRound,
} from "@kombe/domain";
import { withGroupTx, lockGroupForJournalWrite } from "./txContext.js";
import { reviveRuleSnapshot } from "./ruleSnapshotCodec.js";

/** Entrée de construction : seuls les paramètres NON financiers viennent du
 *  corps (projection du calendrier) ; l'engagement vient de la règle publiée. */
export interface BuildScheduleCommand {
  readonly ruleVersion: number;
  readonly members: readonly string[]; // identités actives, uniques
  readonly beneficiaryOrder: readonly string[]; // permutation attendue
  readonly startYear: number;
  readonly startMonth: number;
}

interface ScheduleMetaRow {
  readonly rules_version: number;
  readonly frequency: Frequency;
  readonly state: "draft" | "started";
}

interface RoundRow {
  readonly round_id: string;
  readonly seq: number;
  readonly beneficiary_identity: string | null;
  readonly due_date: string | null;
  readonly due_at_ms: string | null;
  readonly rules_version: number | null;
}

interface ObligationRow {
  readonly obligation_id: string;
  readonly round_id: string;
  readonly member_identity: string;
  readonly due_amount: string;
}

const OBLIGATION_MEMBER_INDEX = /_m(\d+)$/;

export class PgScheduleStore {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * Reconstruit le calendrier persisté (source de vérité) dans une
   * transaction DÉJÀ ouverte — jamais de transaction imbriquée (épuisement
   * de pool). Un cycle persisté mais incomplet (tour sans bénéficiaire,
   * obligation manquante, séquence trouée) est refusé, jamais servi.
   */
  private async reconstruct(client: pg.PoolClient, groupId: string): Promise<CycleSchedule> {
    const metaRes = await client.query<ScheduleMetaRow>(
      `SELECT rules_version, frequency, state FROM cycle_schedule WHERE group_id = $1`,
      [groupId],
    );
    const meta = metaRes.rows[0];
    if (!meta) throw new DomainError("RESERVATION_INCOHERENTE", "Cycle absent");

    const verRes = await client.query<{ snapshot: unknown }>(
      `SELECT snapshot FROM rule_version WHERE group_id = $1 AND rules_version = $2`,
      [groupId, meta.rules_version],
    );
    const verRow = verRes.rows[0];
    if (!verRow) throw new DomainError("RESERVATION_INCOHERENTE", "Version de règle introuvable");
    const contribution = reviveRuleSnapshot(verRow.snapshot).contribution;

    const roundRes = await client.query<RoundRow>(
      `SELECT r.round_id, r.seq,
              m.identity_id AS beneficiary_identity,
              to_char(r.due_date_business, 'YYYY-MM-DD') AS due_date,
              (extract(epoch FROM r.due_at_utc) * 1000)::bigint::text AS due_at_ms,
              r.rules_version
       FROM round r
       LEFT JOIN membership m
         ON m.group_id = r.group_id AND m.membership_id = r.beneficiary_membership_id
       WHERE r.group_id = $1 ORDER BY r.seq ASC`,
      [groupId],
    );
    const obligationRes = await client.query<ObligationRow>(
      `SELECT o.obligation_id, o.round_id, o.due_amount::text AS due_amount,
              m.identity_id AS member_identity
       FROM obligation o
       JOIN membership m
         ON m.group_id = o.group_id AND m.membership_id = o.member_membership_id
       WHERE o.group_id = $1`,
      [groupId],
    );

    const byRound = new Map<string, ObligationRow[]>();
    for (const o of obligationRes.rows) {
      const list = byRound.get(o.round_id);
      if (list) list.push(o);
      else byRound.set(o.round_id, [o]);
    }

    const rows = roundRes.rows;
    if (rows.length === 0) throw new DomainError("RESERVATION_INCOHERENTE", "Cycle incomplet");
    const memberSet = new Set(obligationRes.rows.map((o) => o.member_identity));
    const memberCount = memberSet.size;

    const schedule: ScheduledRound[] = rows.map((r, i) => {
      if (r.seq !== i + 1 || !r.beneficiary_identity || !r.due_date || r.due_at_ms === null) {
        throw new DomainError("RESERVATION_INCOHERENTE", "Cycle incomplet");
      }
      const obligations = (byRound.get(r.round_id) ?? [])
        .sort((a, b) => {
          const ia = Number(OBLIGATION_MEMBER_INDEX.exec(a.obligation_id)?.[1] ?? 0);
          const ib = Number(OBLIGATION_MEMBER_INDEX.exec(b.obligation_id)?.[1] ?? 0);
          return ia - ib;
        })
        .map<Obligation>((o) => ({
          obligationId: o.obligation_id,
          roundSeq: r.seq,
          memberId: o.member_identity,
          amount: BigInt(o.due_amount),
          dueDate: r.due_date as string,
          dueAtMs: Number(r.due_at_ms),
          ruleVersion: r.rules_version ?? meta.rules_version,
        }));
      if (obligations.length !== memberCount) {
        throw new DomainError("RESERVATION_INCOHERENTE", "Cycle incomplet");
      }
      return Object.freeze({
        seq: r.seq,
        beneficiaryId: r.beneficiary_identity,
        dueDate: r.due_date,
        dueAtMs: Number(r.due_at_ms),
        roundPot: rotation(memberCount, contribution).roundPot,
        obligations: Object.freeze(obligations),
      });
    });
    if (schedule.length !== memberCount) {
      throw new DomainError("RESERVATION_INCOHERENTE", "Cycle incohérent (tours ≠ membres)");
    }

    const rot = rotation(memberCount, contribution);
    return Object.freeze({
      groupId,
      ruleVersion: meta.rules_version,
      memberCount,
      rounds: rot.rounds,
      contribution,
      roundPot: rot.roundPot,
      cycleExpectedTotal: rot.cycleTotal,
      displayTz: DISPLAY_TZ,
      frequency: meta.frequency,
      state: meta.state,
      schedule: Object.freeze(schedule),
    });
  }

  /**
   * Construit (ou reconstruit en brouillon) le calendrier d'un cycle :
   * décisions domaine d'abord (permutation, une part par membre), écritures
   * ensuite. Un cycle DÉMARRÉ est figé : jamais reconstruit (`SCHEDULE_FROZEN`).
   */
  async build(groupId: string, input: BuildScheduleCommand): Promise<CycleSchedule> {
    return withGroupTx(this.pool, groupId, async (client) => {
      await lockGroupForJournalWrite(client, groupId);
      const metaRes = await client.query<{ state: "draft" | "started" }>(
        `SELECT state FROM cycle_schedule WHERE group_id = $1 FOR UPDATE`,
        [groupId],
      );
      if (metaRes.rows[0]?.state === "started") {
        throw new DomainError("SCHEDULE_FROZEN", "Cycle démarré : ordre figé");
      }

      const verRes = await client.query<{ snapshot: unknown }>(
        `SELECT snapshot FROM rule_version WHERE group_id = $1 AND rules_version = $2`,
        [groupId, input.ruleVersion],
      );
      const verRow = verRes.rows[0];
      if (!verRow) throw new DomainError("RESERVATION_INCOHERENTE", "Version de règle introuvable");
      const snapshot = reviveRuleSnapshot(verRow.snapshot);

      const members = [...new Set(input.members)];
      if (members.length !== snapshot.memberCount) {
        throw new DomainError(
          "SCHEDULE_ROUNDS_MISMATCH",
          "Effectif du cycle ≠ effectif de la règle publiée",
        );
      }
      const memRes = await client.query<{ identity_id: string; membership_id: string }>(
        `SELECT identity_id, membership_id FROM membership
         WHERE group_id = $1 AND state = 'active' AND identity_id = ANY($2::text[])`,
        [groupId, members],
      );
      const membershipBy = new Map(memRes.rows.map((r) => [r.identity_id, r.membership_id]));
      for (const id of members) {
        if (!membershipBy.has(id)) {
          throw new DomainError("SCHEDULE_MEMBER_UNKNOWN", "Membre sans adhésion active");
        }
      }

      // Décision domaine AVANT toute écriture (permutation, une part/membre).
      const model = buildSchedule({
        groupId,
        ruleVersion: input.ruleVersion,
        members,
        contribution: snapshot.contribution,
        frequency: snapshot.frequency,
        dueDay: snapshot.dueDay,
        startYear: input.startYear,
        startMonth: input.startMonth,
        beneficiaryOrder: input.beneficiaryOrder,
        pilot: true,
      });

      await client.query(
        `INSERT INTO cycle_schedule (group_id, rules_version, frequency, state)
         VALUES ($1, $2, $3, 'draft')
         ON CONFLICT (group_id) DO UPDATE
           SET rules_version = EXCLUDED.rules_version,
               frequency = EXCLUDED.frequency,
               state = 'draft'`,
        [groupId, input.ruleVersion, snapshot.frequency],
      );
      await client.query(`DELETE FROM obligation WHERE group_id = $1`, [groupId]);
      await client.query(`DELETE FROM round WHERE group_id = $1`, [groupId]);

      const seqs = model.schedule.map((r) => r.seq);
      const dues = model.schedule.map((r) => r.dueDate);
      const dueAts = model.schedule.map((r) => new Date(r.dueAtMs).toISOString());
      const beneficiaries = model.schedule.map(
        (r) => membershipBy.get(r.beneficiaryId) as string,
      );
      await client.query(
        `INSERT INTO round
           (round_id, group_id, seq, state, beneficiary_membership_id,
            due_date_business, due_at_utc, rules_version)
         SELECT $1 || '_r' || g.seq, $1, g.seq, 'open', g.ben, g.due::date, g.due_at::timestamptz, $2
         FROM unnest($3::int[], $4::text[], $5::text[], $6::text[])
           AS g(seq, ben, due, due_at)`,
        [groupId, input.ruleVersion, seqs, beneficiaries, dues, dueAts],
      );

      const obligations = model.schedule.flatMap((r) => r.obligations);
      const obIds = obligations.map((o) => o.obligationId);
      const obSeqs = obligations.map((o) => o.roundSeq);
      const obMembers = obligations.map((o) => membershipBy.get(o.memberId) as string);
      const obAmounts = obligations.map((o) => o.amount.toString());
      await client.query(
        `INSERT INTO obligation
           (obligation_id, group_id, round_id, member_membership_id, due_amount)
         SELECT o.oid, $1, $1 || '_r' || o.seq, o.mem, o.amt::bigint
         FROM unnest($2::text[], $3::int[], $4::text[], $5::text[])
           AS o(oid, seq, mem, amt)`,
        [groupId, obIds, obSeqs, obMembers, obAmounts],
      );

      return this.reconstruct(client, groupId);
    });
  }

  /** Lecture du calendrier courant — relecture de la vérité persistée. */
  async get(groupId: string): Promise<CycleSchedule> {
    return withGroupTx(this.pool, groupId, (client) => this.reconstruct(client, groupId));
  }

  /** Démarre (gèle) le calendrier : dernière écriture de méta permise
   *  (draft → started) ; l'ordre des bénéficiaires devient figé (5.3). */
  async start(groupId: string): Promise<{ state: "started"; rounds: number }> {
    return withGroupTx(this.pool, groupId, async (client) => {
      await lockGroupForJournalWrite(client, groupId);
      const model = await this.reconstruct(client, groupId);
      const started = startSchedule(model); // refus si déjà démarré / incomplet
      await client.query(
        `UPDATE cycle_schedule SET state = 'started', started_at = now()
         WHERE group_id = $1 AND state = 'draft'`,
        [groupId],
      );
      return { state: "started" as const, rounds: started.rounds };
    });
  }

  /**
   * Réassignation d'un bénéficiaire (brouillon uniquement). Au pilote, la
   * décision domaine n'accepte qu'un NO-OP (tout changement réel créerait un
   * doublon ⇒ `SCHEDULE_BENEFICIARY_DUPLICATE`) ; après démarrage ⇒
   * `SCHEDULE_FROZEN`. Aucune écriture : la reconstruction domaine sert de
   * seule décision, le calendrier relu (vérité persistée) est retourné.
   */
  async reassign(groupId: string, seq: number, newBeneficiaryId: string): Promise<CycleSchedule> {
    return withGroupTx(this.pool, groupId, async (client) => {
      const model = await this.reconstruct(client, groupId);
      reassignBeneficiary(model, seq, newBeneficiaryId);
      return model;
    });
  }

  /** Départ d'un membre : la dette déjà due reste affectée au partant et le
   *  nombre de tours ne diminue pas silencieusement (aucune réaffectation). */
  async depart(groupId: string, departingId: string): Promise<DepartureView> {
    return withGroupTx(this.pool, groupId, async (client) => {
      const model = await this.reconstruct(client, groupId);
      return applyDeparture(model, departingId);
    });
  }

  /** Plan de renouvellement (5.5) : repart de la version ACCEPTÉE du cycle ;
   *  un changement d'engagement essentiel exige de nouvelles acceptations.
   *  Pure décision — la création du nouveau cycle relève d'une commande. */
  async renew(
    groupId: string,
    to: { version: number; memberCount: number; contribution: bigint; rounds: number },
  ): Promise<RenewalPlan> {
    return withGroupTx(this.pool, groupId, async (client) => {
      const metaRes = await client.query<{ rules_version: number }>(
        `SELECT rules_version FROM cycle_schedule WHERE group_id = $1`,
        [groupId],
      );
      const meta = metaRes.rows[0];
      if (!meta) throw new DomainError("RESERVATION_INCOHERENTE", "Cycle absent");
      const verRes = await client.query<{ snapshot: unknown }>(
        `SELECT snapshot FROM rule_version WHERE group_id = $1 AND rules_version = $2`,
        [groupId, meta.rules_version],
      );
      const verRow = verRes.rows[0];
      if (!verRow) throw new DomainError("RESERVATION_INCOHERENTE", "Version de règle introuvable");
      const prev = reviveRuleSnapshot(verRow.snapshot);
      const next: RuleSet = {
        ...prev,
        memberCount: to.memberCount,
        contribution: to.contribution,
        rounds: to.rounds,
      };
      return planRenewal(prev, next, meta.rules_version, to.version);
    });
  }
}
