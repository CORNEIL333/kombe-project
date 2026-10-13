/**
 * Reprise de l'historique (L-20, I-18 ; ADR-0032) : export JSON de l'ancienne
 * application KÓMBE ou page du cahier de la tontine (nom ; date ; montant).
 * Lecture seule et SÉPARÉE : les lignes importées portent la sentinelle
 * `imported_historical` et n'entrent dans aucun total courant, aucune
 * échéance, aucune remise. Réimporter le même export ne double rien.
 */
import type pg from "pg";
import { DomainError, planLegacyImport, type HistoryImportResult, type HistorySummary, type LegacyNjangi } from "@kombe/domain";
import { appendEvent, groupActor, inTx, isoInstant, m, may, newId, requireAct, sessionIdentity } from "./infra.js";

export interface HistoryImportInput {
  readonly source: "kombe_v1" | "cahier";
  readonly njangi?: LegacyNjangi | undefined;
  readonly rows?: readonly { readonly memberName: string; readonly date: string; readonly amount: number }[] | undefined;
  readonly label?: string | undefined;
}

const norm = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

export class HistoryService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly now: () => number,
  ) {}

  async importHistory(headers: Record<string, unknown>, groupId: string, input: HistoryImportInput): Promise<HistoryImportResult> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await groupActor(db, await sessionIdentity(db, headers, nowMs), groupId);
      requireAct(actor, "import.history");
      let njangi: LegacyNjangi;
      if (input.source === "kombe_v1") {
        if (!input.njangi) throw new DomainError("IMPORT_INVALID", "Export de l'ancienne application manquant");
        njangi = input.njangi;
      } else {
        const rows = input.rows ?? [];
        if (rows.length === 0) throw new DomainError("IMPORT_INVALID", "Aucune ligne du cahier");
        // Cahier : un membre par nom ; identifiant stable = nom normalisé.
        const members = new Map<string, string>();
        for (const r of rows) if (r.memberName?.trim()) members.set(norm(r.memberName), r.memberName.trim());
        njangi = {
          id: `cahier:${input.label ?? "cahier"}`,
          name: input.label?.trim() || "Cahier",
          members: [...members.entries()].map(([uid, name]) => ({ uid, name })),
          contributions: rows.map((r, i) => ({
            id: `cahier:${norm(r.memberName ?? "")}:${r.date}:${r.amount}:${i}`,
            uid: norm(r.memberName ?? ""),
            amount: r.amount,
            date: r.date,
          })),
        };
      }
      if (njangi.contributions.length > 5000) throw new DomainError("IMPORT_INVALID", "Au plus 5 000 lignes par import");
      const plan = planLegacyImport(njangi);
      const current = await db.query(`SELECT membership_id, display_name FROM membership WHERE group_id = $1 AND display_name IS NOT NULL`, [groupId]);
      const byName = new Map(current.rows.map((r) => [norm(String(r.display_name)), String(r.membership_id)]));
      const legacyName = new Map(plan.members.map((x) => [x.legacyUid, x.displayName]));
      const importId = newId("imp");
      const rejected = plan.report.filter((r) => !r.accepted).map((r) => ({ legacyId: r.legacyId, reason: r.reason ?? "refusé" }));
      await db.query(
        `INSERT INTO legacy_import (import_id, group_id, legacy_group_id, report, imported_by_identity_id) VALUES ($1,$2,$3,$4::jsonb,$5)`,
        [importId, groupId, plan.legacyGroupId, JSON.stringify({ source: input.source, label: plan.groupName, report: plan.report }), actor.identityId],
      );
      let accepted = 0;
      let already = 0;
      let total = 0n;
      for (const c of plan.contributions) {
        const name = legacyName.get(c.legacyUid) ?? "Membre";
        const r = await db.query(
          `INSERT INTO legacy_contribution (group_id, legacy_id, import_id, legacy_member_name, membership_id, amount, contribution_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (group_id, legacy_id) DO NOTHING`,
          [groupId, `${plan.legacyGroupId}/${c.legacyId}`, importId, name, byName.get(norm(name)) ?? null, m(c.amount), c.date],
        );
        if (r.rowCount === 1) {
          accepted += 1;
          total += c.amount;
        } else already += 1;
      }
      const unmatched = plan.members.filter((x) => !byName.has(norm(x.displayName))).map((x) => x.displayName);
      await appendEvent(db, actor, "history.imported", { importId, source: input.source, accepted, already, rejected: rejected.length }, nowMs);
      return { importId, source: input.source, acceptedContributions: accepted, alreadyImported: already, rejected, unmatchedMembers: unmatched, total: m(total) };
    });
  }

  async summary(headers: Record<string, unknown>, groupId: string): Promise<HistorySummary> {
    const nowMs = this.now();
    return inTx(this.pool, async (db) => {
      const actor = await groupActor(db, await sessionIdentity(db, headers, nowMs), groupId);
      const seeAll = may(actor, "import.history") || may(actor, "group.manage") || may(actor, "movement.confirm") || may(actor, "movement.control");
      const imp = await db.query(
        `SELECT i.import_id, i.report->>'label' AS label, i.imported_at,
                (SELECT count(*) FROM legacy_contribution c WHERE c.group_id = i.group_id AND c.import_id = i.import_id) AS accepted,
                (SELECT count(*) FROM jsonb_array_elements(i.report->'report') e WHERE (e->>'accepted')::boolean = false) AS rejected
           FROM legacy_import i WHERE i.group_id = $1 ORDER BY i.imported_at DESC`,
        [groupId],
      );
      // Une personne retrouvée = une ligne, quelle que soit l'orthographe du cahier.
      const per = await db.query(
        `SELECT COALESCE(m.display_name, min(c.legacy_member_name)) AS name, c.membership_id,
                count(*) AS n, SUM(c.amount)::text AS s, min(c.contribution_date)::text AS a, max(c.contribution_date)::text AS b
           FROM legacy_contribution c
           LEFT JOIN membership m ON m.group_id = c.group_id AND m.membership_id = c.membership_id
          WHERE c.group_id = $1 ${seeAll ? "" : "AND c.membership_id = $2"}
          GROUP BY c.membership_id, m.display_name, CASE WHEN c.membership_id IS NULL THEN c.legacy_member_name END
          ORDER BY 1`,
        seeAll ? [groupId] : [groupId, actor.membershipId],
      );
      let total = 0n;
      for (const r of per.rows) total += BigInt(String(r.s));
      return {
        imports: seeAll
          ? imp.rows.map((r) => ({
              importId: String(r.import_id),
              label: String(r.label ?? ""),
              importedAt: isoInstant(r.imported_at) as string,
              accepted: Number(r.accepted),
              rejected: Number(r.rejected),
            }))
          : [],
        perMember: per.rows.map((r) => ({
          memberName: String(r.name),
          membershipId: r.membership_id ? String(r.membership_id) : null,
          count: Number(r.n),
          total: String(r.s),
          firstDate: String(r.a),
          lastDate: String(r.b),
        })),
        total: m(total),
      };
    });
  }
}
