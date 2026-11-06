/**
 * Export Excel du registre d'un groupe (0041), réservé au bureau : noms et
 * tours, mouvements de toutes les caisses, amendes, séances, votes libres.
 * Le fichier est servi à la requête authentifiée (en-tête Bearer) ; aucun
 * jeton ni lien public n'est jamais placé dans une URL.
 */
import type pg from "pg";
import { DomainError, FINE_LABELS } from "@kombe/domain";
import { type Actor, type Db, groupActor, inReadTx, isoInstant, may, sessionIdentity } from "./infra.js";
import { loadGroup, loadNames, loadRounds, loadShareHoldings, loadShareLabels, meetingSummaries } from "./views.js";
import { buildXlsx, type Sheet } from "./xlsx.js";

const MOVEMENT_KIND: Readonly<Record<string, string>> = {
  contribution: "Cotisation",
  payout: "Remise",
  fine_payment: "Paiement d'amende",
  advance: "Avance",
  advance_repayment: "Remboursement d'avance",
  transfer_in: "Transfert reçu",
  transfer_out: "Transfert émis",
  fee: "Frais",
  expense: "Dépense",
};
const MOVEMENT_STATE: Readonly<Record<string, string>> = {
  declared: "Déclaré",
  confirmed: "Confirmé",
  validated: "Validé",
  rejected: "Rejeté",
  compensated: "Compensé",
};
const CHANNEL: Readonly<Record<string, string>> = {
  cash: "Espèces",
  orange_money: "Orange Money",
  mtn_momo: "MTN MoMo",
  bank: "Banque",
  international_transfer: "Transfert international",
  other: "Autre",
};
const FINE_STATE: Readonly<Record<string, string>> = { issued: "À payer", contested: "Contestée", paid: "Payée", cancelled: "Annulée" };
const MEETING_STATE: Readonly<Record<string, string>> = { planned: "Prévue", open: "Ouverte", closed: "Close", cancelled: "Annulée" };
const MEETING_FORMAT: Readonly<Record<string, string>> = { in_person: "Présentiel", online: "En ligne", hybrid: "Présentiel et en ligne" };
const POLL_STATE: Readonly<Record<string, string>> = { open: "Ouvert", closed: "Clos", cancelled: "Annulé" };

const day = (v: unknown): string => (v ? String(isoInstant(v)).slice(0, 10) : "");

export function mayExport(actor: Actor): boolean {
  return may(actor, "group.manage") || may(actor, "movement.confirm") || may(actor, "movement.control");
}

export class ExportService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly now: () => number,
  ) {}

  async workbook(headers: Record<string, unknown>, groupId: string): Promise<{ fileName: string; bytes: Buffer }> {
    const nowMs = this.now();
    return inReadTx(this.pool, async (db) => {
      const actor = await groupActor(db, await sessionIdentity(db, headers, nowMs), groupId);
      if (actor.membershipState !== "active" || !mayExport(actor)) throw new DomainError("TONTINE_FORBIDDEN", "L'export est réservé au bureau");
      const group = await loadGroup(db, groupId);
      const sheets = await buildSheets(db, actor, group);
      const slug = group.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "groupe";
      const date = new Date(nowMs + 3_600_000).toISOString().slice(0, 10);
      return { fileName: `kombe-${slug}-${date}.xlsx`, bytes: buildXlsx(sheets, { title: `KÓMBE — ${group.name}`, now: new Date(nowMs) }) };
    });
  }
}

async function buildSheets(db: Db, actor: Actor, group: Awaited<ReturnType<typeof loadGroup>>): Promise<Sheet[]> {
  const groupId = actor.groupId;
  const names = await loadNames(db, groupId);
  const who = (mid: unknown): string => (mid ? (names.byMembership.get(String(mid)) ?? "") : "");
  const byIdentity = (id: unknown): string => (id ? (names.byIdentity.get(String(id)) ?? "") : "");

  // Noms et tours.
  const rounds = await loadRounds(db, group);
  const labels = await loadShareLabels(db, groupId);
  const holdings = await loadShareHoldings(db, groupId);
  const holdersOf = (shareId: string | null | undefined): string =>
    shareId
      ? holdings
          .filter((h) => h.shareId === shareId && h.untilSeq === null)
          .map((h) => who(h.membershipId))
          .join(" & ")
      : "";
  const tours: Sheet = {
    name: "Tours",
    header: ["Tour", "Date", "Nom", "Titulaire", "Bénéficiaire", "Cagnotte attendue (XAF)", "Cotisations confirmées (XAF)", "Remise", "État"],
    numeric: [0, 5, 6],
    rows: rounds.map((r) => [
      r.seq,
      r.date,
      r.shareId ? (labels.get(r.shareId) ?? "") : "",
      holdersOf(r.shareId),
      r.beneficiaryName ?? "",
      r.expectedPot,
      r.collected,
      { none: "Pas encore", declared: "Déclarée", confirmed: "Confirmée", received: "Reçue" }[r.payoutState],
      r.state === "open" ? "Ouvert" : "Clos",
    ]),
  };

  // Membres.
  const mem = await db.query(
    `SELECT membership_id, display_name, state, joined_at FROM membership WHERE group_id = $1 ORDER BY joined_at NULLS LAST, membership_id`,
    [groupId],
  );
  const shareCount = new Map<string, number>();
  for (const h of holdings) if (h.untilSeq === null) shareCount.set(h.membershipId, (shareCount.get(h.membershipId) ?? 0) + 1);
  const STATE: Record<string, string> = { active: "Actif", pending: "En attente", left: "Parti", removed: "Retiré", excluded: "Exclu", rejected: "Refusé" };
  const membres: Sheet = {
    name: "Membres",
    header: ["Membre", "État", "Entré le", "Noms tenus"],
    numeric: [3],
    rows: mem.rows.map((x) => [who(x.membership_id), STATE[String(x.state)] ?? String(x.state), day(x.joined_at), shareCount.get(String(x.membership_id)) ?? 0]),
  };

  // Mouvements (toutes caisses).
  const mv = await db.query(
    `SELECT mv.*, f.name AS fund_name FROM fund_movement mv JOIN fund f ON f.group_id = mv.group_id AND f.fund_id = mv.fund_id
      WHERE mv.group_id = $1 ORDER BY mv.declared_at, mv.movement_id LIMIT 50000`,
    [groupId],
  );
  const mouvements: Sheet = {
    name: "Mouvements",
    header: ["Déclaré le", "Caisse", "Nature", "Montant (XAF)", "Membre", "Tour", "Canal", "Référence", "État", "Déclaré par", "Confirmé par", "Motif du rejet"],
    numeric: [3, 5],
    rows: mv.rows.map((x) => [
      day(x.declared_at),
      String(x.fund_name),
      MOVEMENT_KIND[String(x.kind)] ?? String(x.kind),
      String(x.amount),
      who(x.membership_id),
      x.round_seq ?? "",
      CHANNEL[String(x.channel)] ?? String(x.channel),
      x.reference ?? "",
      MOVEMENT_STATE[String(x.state)] ?? String(x.state),
      byIdentity(x.declared_by_identity_id),
      byIdentity(x.confirmed_by_identity_id),
      x.rejected_reason ?? "",
    ]),
  };

  // Amendes.
  const fi = await db.query(`SELECT * FROM fine WHERE group_id = $1 ORDER BY issued_at, fine_id LIMIT 20000`, [groupId]);
  const amendes: Sheet = {
    name: "Amendes",
    header: ["Constatée le", "Membre", "Motif", "Nature", "Montant (XAF)", "État", "Remboursement", "Constatée par"],
    numeric: [4],
    rows: fi.rows.map((x) => [
      day(x.issued_at),
      who(x.membership_id),
      String(x.reason),
      FINE_LABELS[x.kind as keyof typeof FINE_LABELS]?.fr ?? String(x.kind),
      String(x.amount),
      FINE_STATE[String(x.state)] ?? String(x.state),
      x.refunded_at ? `Remboursée le ${day(x.refunded_at)}` : x.refund_due ? "À rembourser" : "",
      byIdentity(x.issued_by_identity_id),
    ]),
  };

  // Séances.
  const meetings = await meetingSummaries(db, groupId);
  const att = await db.query(
    `SELECT meeting_id, count(*) FILTER (WHERE status IN ('present','late','represented'))::int AS p, count(*)::int AS n
       FROM attendance WHERE group_id = $1 GROUP BY meeting_id`,
    [groupId],
  );
  const attOf = new Map(att.rows.map((x) => [String(x.meeting_id), `${x.p} / ${x.n}`]));
  const seances: Sheet = {
    name: "Séances",
    header: ["N°", "Date", "Modalité", "Lieu", "Lien en ligne", "Accueil", "Présents", "État", "PV approuvé"],
    numeric: [0],
    rows: meetings.map((x) => [
      x.seq,
      x.date,
      MEETING_FORMAT[x.format] ?? x.format,
      x.location ?? "",
      x.onlineUrl ?? "",
      x.hostName ?? "",
      attOf.get(x.meetingId) ?? "",
      MEETING_STATE[x.state] ?? x.state,
      x.minutesApproved ? "Oui" : "Non",
    ]),
  };

  // Votes libres (résultats agrégés ; jamais le détail d'un vote anonyme).
  const po = await db.query(`SELECT * FROM poll WHERE group_id = $1 ORDER BY created_at LIMIT 2000`, [groupId]);
  const ba = await db.query(`SELECT poll_id, choices FROM poll_ballot WHERE group_id = $1`, [groupId]);
  const votes: Sheet = {
    name: "Votes",
    header: ["Ouvert le", "Question", "Ouvert par", "Réponses", "Participants", "État"],
    numeric: [4],
    rows: po.rows.map((x) => {
      const options = (x.options as string[]) ?? [];
      const mine = ba.rows.filter((b) => String(b.poll_id) === String(x.poll_id));
      const counts = options.map((_, i) => mine.filter((b) => ((b.choices as number[]) ?? []).map(Number).includes(i)).length);
      return [
        day(x.created_at),
        String(x.question),
        who(x.created_by_membership_id),
        options.map((o, i) => `${o} : ${counts[i]}`).join(" · "),
        mine.length,
        POLL_STATE[String(x.state)] ?? String(x.state),
      ];
    }),
  };

  return [tours, membres, mouvements, amendes, seances, votes];
}
