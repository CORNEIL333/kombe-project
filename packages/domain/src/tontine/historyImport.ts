/**
 * Reprise de l'ancienne application (lot L-20, résout I-18 ; ADR-0032).
 *
 * L'ancienne application (Firebase, kombe-prod) a des groupes réels. On
 * importe un EXPORT JSON en lecture seule : groupes, membres, cotisations
 * historiques. Les cotisations importées sont marquées `imported_historical`
 * et n'entrent dans AUCUN total validé courant ni score (sentinelle reprise
 * de l'ancienne application). Aucune connexion directe à Firebase depuis la
 * production.
 */
import { DomainError } from "../errors.js";

export interface LegacyExport {
  readonly njangis: readonly LegacyNjangi[];
}

export interface LegacyNjangi {
  readonly id: string;
  readonly name: string;
  readonly members: readonly { readonly uid: string; readonly name: string; readonly phone?: string; readonly email?: string; readonly role?: string }[];
  readonly contributions: readonly { readonly id: string; readonly uid: string; readonly amount: number; readonly date: string; readonly status?: string }[];
}

export interface ImportRow {
  readonly kind: "member" | "contribution";
  readonly legacyId: string;
  readonly accepted: boolean;
  readonly reason: string | null;
}

export interface ImportPlan {
  readonly groupName: string;
  readonly legacyGroupId: string;
  readonly members: readonly { readonly legacyUid: string; readonly displayName: string; readonly contact: string | null; readonly legacyRole: string | null }[];
  readonly contributions: readonly { readonly legacyId: string; readonly legacyUid: string; readonly amount: bigint; readonly date: string }[];
  readonly report: readonly ImportRow[];
}

const LEGACY_ROLE_MAP: Readonly<Record<string, string>> = {
  president: "animator",
  "président": "animator",
  tresorier: "treasurer",
  "trésorier": "treasurer",
  commissaire: "auditor",
  secretaire: "secretary",
  "secrétaire": "secretary",
  membre: "member",
  member: "member",
};

export function mapLegacyRole(role: string | undefined): string {
  if (!role) return "member";
  return LEGACY_ROLE_MAP[role.trim().toLowerCase()] ?? "member";
}

/** Analyse un njangi exporté ; ne rejette pas tout pour une ligne fautive. */
export function planLegacyImport(n: LegacyNjangi): ImportPlan {
  if (!n.id || !n.name || n.name.trim() === "") {
    throw new DomainError("IMPORT_INVALID", "Njangi sans identifiant ni nom");
  }
  const report: ImportRow[] = [];
  const members: ImportPlan["members"][number][] = [];
  const known = new Set<string>();
  for (const m of n.members) {
    if (!m.uid || known.has(m.uid)) {
      report.push({ kind: "member", legacyId: m.uid ?? "?", accepted: false, reason: "identifiant absent ou en double" });
      continue;
    }
    known.add(m.uid);
    members.push({
      legacyUid: m.uid,
      displayName: (m.name ?? "").trim() || "Membre",
      contact: m.phone ?? m.email ?? null,
      legacyRole: m.role ?? null,
    });
    report.push({ kind: "member", legacyId: m.uid, accepted: true, reason: null });
  }
  const contributions: ImportPlan["contributions"][number][] = [];
  const seen = new Set<string>();
  for (const c of n.contributions) {
    let reason: string | null = null;
    if (!c.id || seen.has(c.id)) reason = "identifiant absent ou en double";
    else if (!known.has(c.uid)) reason = "membre inconnu";
    else if (!Number.isSafeInteger(c.amount) || c.amount <= 0 || c.amount > 1_000_000_000) reason = "montant non entier ou hors bornes";
    else if (!/^\d{4}-\d{2}-\d{2}/.test(c.date ?? "")) reason = "date illisible";
    else if (c.status && !["confirmed", "validated", "CONFIRMED"].includes(c.status)) reason = "cotisation non confirmée dans l'ancienne application";
    if (reason) {
      report.push({ kind: "contribution", legacyId: c.id ?? "?", accepted: false, reason });
      continue;
    }
    seen.add(c.id);
    contributions.push({ legacyId: c.id, legacyUid: c.uid, amount: BigInt(c.amount), date: c.date.slice(0, 10) });
    report.push({ kind: "contribution", legacyId: c.id, accepted: true, reason: null });
  }
  return { groupName: n.name.trim(), legacyGroupId: n.id, members, contributions, report };
}
