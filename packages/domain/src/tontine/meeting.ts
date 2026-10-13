/**
 * La séance (lots L-04, L-05, L-06 ; ADR-0028).
 *
 * La tontine camerounaise vit en réunion : appel, collecte, remise au
 * bénéficiaire (« celui qui bouffe ») devant témoins, secours, amendes,
 * questions diverses, procès-verbal approuvé à la séance suivante. Ce module
 * porte les règles pures ; la persistance et le journal sont côté API.
 */
import { DomainError } from "../errors.js";
import { canonicalHash } from "../canonical.js";

export const MEETING_STATES = ["planned", "open", "closed", "cancelled"] as const;
export type MeetingState = (typeof MEETING_STATES)[number];

export const ATTENDANCE_STATUSES = ["present", "late", "excused", "absent", "represented"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

const TRANSITIONS: Readonly<Record<MeetingState, readonly MeetingState[]>> = {
  planned: ["open", "cancelled"],
  open: ["closed"],
  closed: [],
  cancelled: [],
};

export function transitionMeeting(from: MeetingState, to: MeetingState): MeetingState {
  if (!TRANSITIONS[from].includes(to)) {
    throw new DomainError("MEETING_STATE_INVALID", `Séance : ${from} → ${to} impossible`);
  }
  return to;
}

/** La présence ne se modifie que pendant la séance ouverte. */
export function assertAttendanceEditable(state: MeetingState): void {
  if (state !== "open") {
    throw new DomainError("MEETING_STATE_INVALID", "La présence se note pendant la séance ouverte");
  }
}

export function assertAttendance(input: {
  readonly status: AttendanceStatus;
  readonly membershipId: string;
  readonly representedByMembershipId?: string | null;
}): void {
  if (!(ATTENDANCE_STATUSES as readonly string[]).includes(input.status)) {
    throw new DomainError("ATTENDANCE_INVALID", "Statut de présence inconnu");
  }
  const rep = input.representedByMembershipId ?? null;
  if (input.status === "represented") {
    if (!rep || rep === input.membershipId) {
      throw new DomainError("ATTENDANCE_INVALID", "Un membre représenté l'est par un autre membre");
    }
  } else if (rep) {
    throw new DomainError("ATTENDANCE_INVALID", "Représentant renseigné sans statut « représenté »");
  }
}

/** Compte les présences comme on le fait à l'appel (représenté = présent). */
export function quorumOfMeeting(statuses: readonly AttendanceStatus[]): {
  readonly present: number;
  readonly absent: number;
  readonly excused: number;
} {
  let present = 0;
  let absent = 0;
  let excused = 0;
  for (const s of statuses) {
    if (s === "present" || s === "late" || s === "represented") present += 1;
    else if (s === "excused") excused += 1;
    else absent += 1;
  }
  return { present, absent, excused };
}

/**
 * Remise en séance : au moins deux témoins présents, distincts du
 * bénéficiaire et du déclarant (le trésorier). Le bénéficiaire confirme
 * lui-même la réception (sur son téléphone, ou sur celui du secrétaire
 * devant les témoins).
 */
export function assertPayoutWitnesses(input: {
  readonly beneficiaryMembershipId: string;
  readonly declarantMembershipId: string;
  readonly witnessMembershipIds: readonly string[];
  readonly presentMembershipIds: readonly string[];
  readonly minimumWitnesses?: number;
}): void {
  const min = input.minimumWitnesses ?? 2;
  const witnesses = new Set(input.witnessMembershipIds);
  if (witnesses.size !== input.witnessMembershipIds.length) {
    throw new DomainError("WITNESS_REQUIRED", "Témoin cité deux fois");
  }
  const present = new Set(input.presentMembershipIds);
  for (const w of witnesses) {
    if (w === input.beneficiaryMembershipId || w === input.declarantMembershipId) {
      throw new DomainError("WITNESS_REQUIRED", "Un témoin est distinct du bénéficiaire et du trésorier");
    }
    if (!present.has(w)) {
      throw new DomainError("WITNESS_REQUIRED", "Un témoin doit être présent à la séance");
    }
  }
  if (witnesses.size < min) {
    throw new DomainError("WITNESS_REQUIRED", `Au moins ${min} témoins présents`);
  }
}

/* ── Procès-verbal ─────────────────────────────────────────────────────── */

export interface MinutesInput {
  readonly groupName: string;
  readonly meetingSeq: number;
  readonly date: string;
  readonly location: string | null;
  readonly host: string | null;
  readonly attendance: readonly { readonly name: string; readonly status: AttendanceStatus; readonly representedBy?: string | null }[];
  readonly collections: readonly { readonly fund: string; readonly member: string; readonly amount: bigint; readonly state: string }[];
  readonly payouts: readonly { readonly fund: string; readonly beneficiary: string; readonly amount: bigint; readonly witnesses: readonly string[]; readonly confirmed: boolean }[];
  readonly fines: readonly { readonly member: string; readonly reason: string; readonly amount: bigint }[];
  readonly aids: readonly { readonly member: string; readonly event: string; readonly amount: bigint }[];
  readonly decisions: readonly string[];
  readonly notes: string | null;
}

export interface Minutes {
  readonly text: string;
  readonly hash: string;
}

const STATUS_FR: Readonly<Record<AttendanceStatus, string>> = {
  present: "présent",
  late: "en retard",
  excused: "absent excusé",
  absent: "absent",
  represented: "représenté",
};

function xaf(n: bigint): string {
  return `${n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} FCFA`;
}

/**
 * Génère le procès-verbal depuis les faits de la séance (jamais saisi à la
 * main pour les montants). Le texte est stable : son empreinte permet
 * d'approuver EXACTEMENT ce texte à la séance suivante.
 */
export function buildMinutes(m: MinutesInput): Minutes {
  const lines: string[] = [];
  lines.push(`PROCÈS-VERBAL — ${m.groupName}`);
  lines.push(`Séance n° ${m.meetingSeq} du ${m.date}${m.location ? `, ${m.location}` : ""}${m.host ? ` (reçue par ${m.host})` : ""}`);
  lines.push("");
  const q = quorumOfMeeting(m.attendance.map((a) => a.status));
  lines.push(`1. Appel : ${q.present} présent(s), ${q.excused} excusé(s), ${q.absent} absent(s).`);
  for (const a of m.attendance) {
    lines.push(`   - ${a.name} : ${STATUS_FR[a.status]}${a.representedBy ? ` par ${a.representedBy}` : ""}`);
  }
  lines.push("");
  lines.push("2. Cotisations reçues :");
  if (m.collections.length === 0) lines.push("   (aucune)");
  for (const c of m.collections) lines.push(`   - [${c.fund}] ${c.member} : ${xaf(c.amount)} (${c.state})`);
  lines.push("");
  lines.push("3. Remises :");
  if (m.payouts.length === 0) lines.push("   (aucune)");
  for (const p of m.payouts) {
    lines.push(
      `   - [${p.fund}] ${p.beneficiary} : ${xaf(p.amount)}, témoins : ${p.witnesses.join(", ") || "aucun"}, réception ${p.confirmed ? "confirmée" : "non confirmée"}`,
    );
  }
  lines.push("");
  lines.push("4. Amendes :");
  if (m.fines.length === 0) lines.push("   (aucune)");
  for (const f of m.fines) lines.push(`   - ${f.member} : ${xaf(f.amount)} (${f.reason})`);
  lines.push("");
  lines.push("5. Secours :");
  if (m.aids.length === 0) lines.push("   (aucun)");
  for (const a of m.aids) lines.push(`   - ${a.member} : ${xaf(a.amount)} (${a.event})`);
  lines.push("");
  lines.push("6. Décisions :");
  if (m.decisions.length === 0) lines.push("   (aucune)");
  for (const d of m.decisions) lines.push(`   - ${d}`);
  if (m.notes) {
    lines.push("");
    lines.push("7. Questions diverses :");
    lines.push(`   ${m.notes}`);
  }
  lines.push("");
  lines.push("KÓMBE tient le registre ; il ne garde pas l'argent du groupe.");
  const text = lines.join("\n");
  return { text, hash: canonicalHash({ text }) };
}

/** L'approbation porte sur l'empreinte EXACTE du PV présenté. */
export function assertMinutesApproval(expectedHash: string, presentedHash: string): void {
  if (expectedHash !== presentedHash) {
    throw new DomainError("MEETING_STATE_INVALID", "Le PV a changé depuis sa présentation");
  }
}
