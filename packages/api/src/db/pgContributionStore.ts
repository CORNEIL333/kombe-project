/**
 * KÓMBE @kombe/api — store RÉEL (PostgreSQL) pour les déclarations partielles
 * et l'idempotence durable (C06, Piste A1). Même surface publique que
 * `FictitiousContributionStore` (`packages/api/src/contributionStore.ts`),
 * sauf `groupId` explicite en premier paramètre de `declare`/`view`/
 * `declaredEventCount` : la RLS `tenant_isolation` (migrations 0001/0008)
 * filtre sur `kombe.group_id` AVANT toute lecture, donc le groupe doit être
 * connu avant d'interroger `obligation` — déjà le cas en pratique, la route
 * HTTP porte `:groupId` dans son chemin
 * (`POST /v1/groups/:groupId/declarations`, server.ts).
 *
 * TOUTE décision métier reste dans les fonctions pures de `@kombe/domain`
 * (contribution.ts) : hash de corps, rejeu/conflit, réservation sous
 * capacité, validation canal/référence/motif, scellement d'événement. Ce
 * fichier ne fait que lire/écrire ces décisions dans Postgres sous verrou,
 * exactement comme `packages/worker/src/pgWorker.ts` le fait pour l'outbox.
 *
 * Verrouillage : `SELECT ... FOR UPDATE` sur la ligne `obligation` ciblée
 * (sérialise les déclarations concurrentes sur LA MÊME obligation) +
 * `pg_advisory_xact_lock(hashtext(groupId))` (sérialise l'assignation du
 * `seq` du journal entre déclarations concurrentes sur DEUX obligations
 * différentes du même groupe — `journal` n'a pas de compteur dédié, seul un
 * verrou explicite évite une collision de clé primaire `(group_id, seq)`).
 *
 * Limite documentée (non cachée) : le rejeu reconstruit `commandId` à partir
 * de la requête COURANTE (`ctx.commandId`), pas d'une valeur relue en base.
 * `idempotency_registry.command_id` (FK vers `command`) est laissé NULL
 * pour ne pas se heurter à la contrainte d'unicité GLOBALE
 * `command.idempotency_key UNIQUE` (héritée du scaffold C00, non scopée
 * acteur/groupe/type comme `idempotency_registry` l'est pour C06) — câbler
 * cette FK correctement est un défaut restant, consigné dans
 * `docs/PREUVES_PISTE_A.md`. Avec le défaut client (`commandId` dérivé de la
 * clé d'idempotence, cf. `declareCtxFrom`), le rejeu est déjà identique
 * octet pour octet.
 */
import type pg from "pg";
import {
  DomainError,
  GENESIS_HASH,
  assertAllowed,
  can,
  contributionBodyHash,
  decideIdempotency,
  isCrossGroupAccess,
  reserveObligation,
  sealEventV1,
  validateDeclaration,
  type ContributionDeclaration,
} from "@kombe/domain";
import { withGroupTx, lockGroupForJournalWrite } from "./txContext.js";
import type { DeclareContext, DeclareReceipt, ObligationView } from "../contributionStore.js";

/** `JSON.stringify` refuse nativement les BigInt (montants XAF entiers,
 *  ADR-0002) : converties en chaîne pour le stockage JSONB. Le hash
 *  canonique de l'événement (`event.hash`) est déjà figé par
 *  `sealEventV1`/`canonical.ts` AVANT cet appel — cette sérialisation ne
 *  sert que la colonne `journal.payload`, jamais le calcul d'empreinte. */
function jsonSafe(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v));
}

export class PgContributionStore {
  constructor(private readonly pool: pg.Pool) {}

  /** Amorçage de test RÉEL (pas un seed en mémoire) : insère une obligation
   *  dans sa propre transaction group-scopée. Réservé aux fixtures de test. */
  async seedObligation(
    groupId: string,
    obligationId: string,
    roundId: string,
    memberMembershipId: string,
    due: bigint,
    opts?: { validatedNet?: bigint; activeReserved?: bigint; version?: number },
  ): Promise<void> {
    await withGroupTx(this.pool, groupId, async (client) => {
      await client.query(
        `INSERT INTO obligation
           (obligation_id, group_id, round_id, member_membership_id, due_amount, validated_net, active_reserved, version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (obligation_id) DO NOTHING`,
        [
          obligationId,
          groupId,
          roundId,
          memberMembershipId,
          due.toString(),
          (opts?.validatedNet ?? 0n).toString(),
          (opts?.activeReserved ?? 0n).toString(),
          opts?.version ?? 1,
        ],
      );
    });
  }

  async declare(groupId: string, ctx: DeclareContext, decl: ContributionDeclaration): Promise<DeclareReceipt> {
    if (!ctx.actorIdentityId) {
      throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Acteur non authentifié");
    }
    return withGroupTx(this.pool, groupId, async (client) => {
      const obRes = await client.query(
        `SELECT obligation_id, group_id, due_amount, validated_net, active_reserved, version
         FROM obligation WHERE obligation_id = $1 FOR UPDATE`,
        [decl.obligationId],
      );
      const obRow = obRes.rows[0];
      // Non-divulgation : une obligation inconnue (ou masquée par RLS hors
      // du groupe scopé) répond comme une erreur interne de réservation.
      if (!obRow) {
        throw new DomainError("RESERVATION_INCOHERENTE", "Obligation introuvable");
      }
      const ob = {
        obligationId: String(obRow.obligation_id),
        groupId: String(obRow.group_id),
        due: BigInt(obRow.due_amount as string),
        validatedNet: BigInt(obRow.validated_net as string),
        activeReserved: BigInt(obRow.active_reserved as string),
        version: Number(obRow.version),
      };

      // Barrière anti-IDOR applicative (défense en profondeur : la RLS a
      // déjà scopé la lecture, mais la décision d'autorisation reste ici).
      if (isCrossGroupAccess(ctx.actorGroupIds, ob.groupId)) {
        throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Objet hors portée");
      }

      const scopedCommandType = "contribution.declare";
      const bodyHash = contributionBodyHash(decl);
      const regRes = await client.query(
        `SELECT body_hash, result_version, event_hash FROM idempotency_registry
         WHERE actor_identity_id = $1 AND group_id = $2 AND command_type = $3 AND idempotency_key = $4`,
        [ctx.actorIdentityId, ob.groupId, scopedCommandType, ctx.idempotencyKey],
      );
      const existingRow = regRes.rows[0];
      const existing = existingRow
        ? {
            bodyHash: String(existingRow.body_hash),
            result: {
              commandId: ctx.commandId,
              status: "applied" as const,
              resultVersion: Number(existingRow.result_version),
              eventHash: String(existingRow.event_hash),
            },
          }
        : undefined;
      const decision = decideIdempotency(existing, bodyHash);

      if (decision.kind === "conflict") {
        throw new DomainError(
          "IDEMPOTENCY_BODY_CONFLICT",
          "Même clé, corps différent : conflit d'idempotence",
        );
      }

      if (decision.kind === "replay") {
        // Droits RELUS avant de servir un rejeu (identité révoquée/sortie du
        // groupe refuse le rejeu, jamais le résultat d'un tiers).
        assertAllowed(ctx.actorRole, scopedCommandType);
        if (isCrossGroupAccess(ctx.actorGroupIds, ob.groupId)) {
          throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Objet hors portée");
        }
        return {
          ...decision.result,
          status: "duplicate" as const,
          obligationId: ob.obligationId,
          remainingDue: ob.due - ob.validatedNet,
          availableToDeclare: ob.due - ob.activeReserved,
        };
      }

      // execute (première fois) : droits, préconditions, puis mutation.
      assertAllowed(ctx.actorRole, scopedCommandType);
      if (!can(ctx.actorRole, scopedCommandType)) {
        throw new DomainError("FEATURE_PILOT_FORBIDDEN", "Action non autorisée");
      }
      validateDeclaration(decl);
      if (
        !Number.isInteger(ctx.expectedVersion) ||
        ctx.expectedVersion < 1 ||
        ctx.expectedVersion !== ob.version
      ) {
        throw new DomainError("EVENT_CHAIN_BREAK", "Version d'objet dépassée (conflit)");
      }

      // Réservation sous verrou : excédent bloqué AVANT toute écriture
      // (CHECK obligation.active_reserved<=due_amount reste la garantie
      // base réelle, en défense supplémentaire sous le FOR UPDATE ci-dessus).
      const res = reserveObligation(
        { due: ob.due, validatedNet: ob.validatedNet, activeReserved: ob.activeReserved },
        decl.amountMinor,
      );

      // Verrou group-level : sérialise l'assignation du seq du journal entre
      // déclarations concurrentes sur DEUX obligations différentes du groupe.
      await lockGroupForJournalWrite(client, ob.groupId);
      const lastRes = await client.query(
        `SELECT hash FROM journal WHERE group_id = $1 ORDER BY seq DESC LIMIT 1`,
        [ob.groupId],
      );
      const previousHash = lastRes.rows[0] ? String(lastRes.rows[0].hash) : GENESIS_HASH;
      const seqRes = await client.query(
        `SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq FROM journal WHERE group_id = $1`,
        [ob.groupId],
      );
      const seq = Number(seqRes.rows[0]?.next_seq ?? 1);

      const event = sealEventV1({
        groupId: ob.groupId,
        seq,
        type: "contribution.declared",
        version: 1,
        previousHash,
        actorIdentityId: ctx.actorIdentityId,
        actorRole: ctx.actorRole,
        serverDate: ctx.serverDate,
        commandId: ctx.commandId,
        ...(ctx.rulesVersion !== undefined ? { rulesVersion: ctx.rulesVersion } : {}),
        body: {
          obligationId: decl.obligationId,
          amount: decl.amountMinor,
          channel: decl.channel,
          allegedDate: decl.allegedDate,
          reserved: res.activeReserved,
        },
      });

      const newVersion = ob.version + 1;
      const updated = await client.query(
        `UPDATE obligation SET active_reserved = $2, version = $3 WHERE obligation_id = $1 AND version = $4`,
        [ob.obligationId, res.activeReserved.toString(), newVersion, ob.version],
      );
      // Ne devrait jamais arriver sous FOR UPDATE : vérifié explicitement,
      // jamais un écrasement silencieux si un autre writer a glissé entre.
      if (updated.rowCount !== 1) {
        throw new DomainError("EVENT_CHAIN_BREAK", "Version d'objet dépassée (conflit)");
      }

      const contributionId = `${decl.obligationId}:${ctx.commandId}`;
      await client.query(
        `INSERT INTO contribution
           (contribution_id, group_id, obligation_id, declared_amount, state, version,
            channel, reference, justification, alleged_date, server_date)
         VALUES ($1,$2,$3,$4,'declared',1,$5,$6,$7,$8,$9)`,
        [
          contributionId,
          ob.groupId,
          ob.obligationId,
          decl.amountMinor.toString(),
          decl.channel,
          decl.reference ?? null,
          decl.justification ?? null,
          decl.allegedDate,
          ctx.serverDate,
        ],
      );

      await client.query(
        `INSERT INTO journal (group_id, seq, event_type, version, previous_hash, hash, payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
        [ob.groupId, event.seq, event.type, event.version, event.previousHash, event.hash, jsonSafe(event)],
      );

      await client.query(
        `INSERT INTO idempotency_registry
           (actor_identity_id, group_id, command_type, idempotency_key, body_hash,
            result_status, result_version, event_hash)
         VALUES ($1,$2,$3,$4,$5,'applied',$6,$7)`,
        [ctx.actorIdentityId, ob.groupId, scopedCommandType, ctx.idempotencyKey, bodyHash, newVersion, event.hash],
      );

      return {
        commandId: ctx.commandId,
        status: "applied" as const,
        resultVersion: newVersion,
        eventHash: event.hash,
        obligationId: ob.obligationId,
        remainingDue: res.remainingDue,
        availableToDeclare: res.availableToDeclare,
      };
    });
  }

  /** Brouillon local (6.9) : aucune mutation, identique au store fictif. */
  saveDraft(
    actorIdentityId: string,
    obligationId: string,
    draft: ContributionDeclaration,
  ): { readonly draftSaved: true; readonly submitted: false; readonly obligationId: string } {
    void actorIdentityId;
    void draft;
    return { draftSaved: true, submitted: false, obligationId };
  }

  async view(groupId: string, obligationId: string): Promise<ObligationView> {
    return withGroupTx(this.pool, groupId, async (client) => {
      const obRes = await client.query(
        `SELECT obligation_id, group_id, due_amount, validated_net, active_reserved, version
         FROM obligation WHERE obligation_id = $1`,
        [obligationId],
      );
      const obRow = obRes.rows[0];
      if (!obRow) throw new DomainError("RESERVATION_INCOHERENTE", "Obligation introuvable");
      const due = BigInt(obRow.due_amount as string);
      const validatedNet = BigInt(obRow.validated_net as string);
      const activeReserved = BigInt(obRow.active_reserved as string);
      const countRes = await client.query(
        `SELECT count(*)::int AS n FROM contribution WHERE obligation_id = $1 AND state = 'declared'`,
        [obligationId],
      );
      return {
        obligationId: String(obRow.obligation_id),
        groupId: String(obRow.group_id),
        due: due.toString(),
        validatedNet: validatedNet.toString(),
        activeReserved: activeReserved.toString(),
        remainingDue: (due - validatedNet).toString(),
        availableToDeclare: (due - activeReserved).toString(),
        contributionCount: Number(countRes.rows[0]?.n ?? 0),
        version: Number(obRow.version),
      };
    });
  }

  async declaredEventCount(groupId: string): Promise<number> {
    return withGroupTx(this.pool, groupId, async (client) => {
      const res = await client.query(
        `SELECT count(*)::int AS n FROM journal WHERE group_id = $1 AND event_type = 'contribution.declared'`,
        [groupId],
      );
      return Number(res.rows[0]?.n ?? 0);
    });
  }
}
