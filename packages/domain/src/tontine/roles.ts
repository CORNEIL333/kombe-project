/**
 * Bureau d'une tontine ou d'une association camerounaise (lot L-11, ADR-0026).
 *
 * Les identifiants techniques restent stables (`animator` = Président, pour
 * ne pas casser le socle C00–C29) ; les libellés affichés sont ceux du
 * terrain : Président, Vice-président, Secrétaire général, Trésorier,
 * Trésorier adjoint, Commissaire aux comptes, Censeur, Conseiller, Membre.
 *
 * Un membre peut cumuler plusieurs fonctions ; l'indépendance se vérifie
 * PAR OPÉRATION (le déclarant ne confirme jamais sa propre opération), pas
 * par le rôle. La matrice ci-dessous dit seulement QUI peut tenter l'acte.
 */
import { DomainError } from "../errors.js";

export const GROUP_ROLES = [
  "animator",
  "vice_president",
  "secretary",
  "treasurer",
  "treasurer_deputy",
  "auditor",
  "censor",
  "advisor",
  "member",
] as const;
export type GroupRole = (typeof GROUP_ROLES)[number];

export const ROLE_LABELS: Readonly<Record<GroupRole, { fr: string; en: string }>> = {
  animator: { fr: "Président", en: "President" },
  vice_president: { fr: "Vice-président", en: "Vice-president" },
  secretary: { fr: "Secrétaire général", en: "Secretary general" },
  treasurer: { fr: "Trésorier", en: "Treasurer" },
  treasurer_deputy: { fr: "Trésorier adjoint", en: "Deputy treasurer" },
  auditor: { fr: "Commissaire aux comptes", en: "Auditor" },
  censor: { fr: "Censeur", en: "Censor" },
  advisor: { fr: "Conseiller", en: "Advisor" },
  member: { fr: "Membre", en: "Member" },
};

/** Fonctions du bureau (tout sauf « membre »). */
export const BUREAU_ROLES: readonly GroupRole[] = GROUP_ROLES.filter((r) => r !== "member");

export const TONTINE_ACTIONS = [
  "group.read",
  "cycle.start",
  "group.manage",
  "member.invite",
  "member.admit",
  "member.remove",
  "role.assign",
  "rules.publish",
  "schedule.manage",
  "meeting.manage",
  "meeting.attendance",
  "movement.declare",
  "movement.confirm",
  "movement.control",
  "fine.issue",
  "aid.request",
  "aid.decide",
  "fund.manage",
  "debt.manage",
  "order.manage",
  "order.swap.request",
  "statutes.publish",
  "import.history",
] as const;
export type TontineAction = (typeof TONTINE_ACTIONS)[number];

const EVERYONE: readonly GroupRole[] = GROUP_ROLES;
const PRESIDENCY: readonly GroupRole[] = ["animator", "vice_president"];
const ADMIN: readonly GroupRole[] = ["animator", "vice_president", "secretary"];
const TREASURY: readonly GroupRole[] = ["treasurer", "treasurer_deputy"];

const MATRIX: Readonly<Record<TontineAction, readonly GroupRole[]>> = {
  "group.read": EVERYONE,
  // Démarrage / renouvellement du cycle : acte de la présidence (le socle
  // C03-BOOT le réservait au fondateur — dans L-11 le fondateur est Président).
  "cycle.start": PRESIDENCY,
  "group.manage": ADMIN,
  "member.invite": ADMIN,
  "member.admit": PRESIDENCY,
  "member.remove": PRESIDENCY,
  "role.assign": PRESIDENCY,
  "rules.publish": ADMIN,
  "schedule.manage": ADMIN,
  "meeting.manage": ADMIN,
  "meeting.attendance": ["animator", "vice_president", "secretary", "censor"],
  "movement.declare": EVERYONE,
  "movement.confirm": TREASURY,
  "movement.control": ["auditor"],
  "fine.issue": ["censor", "animator", "vice_president"],
  "aid.request": EVERYONE,
  "aid.decide": [...PRESIDENCY, "secretary", "treasurer"],
  "fund.manage": ["animator", "vice_president", "treasurer"],
  "debt.manage": ["animator", "vice_president", "treasurer"],
  "order.manage": ADMIN,
  "order.swap.request": EVERYONE,
  "statutes.publish": ADMIN,
  "import.history": PRESIDENCY,
};

export function isGroupRole(value: string): value is GroupRole {
  return (GROUP_ROLES as readonly string[]).includes(value);
}

/** Vrai si l'une des fonctions acceptées du membre ouvre l'action. */
export function canAct(roles: readonly GroupRole[], action: TontineAction): boolean {
  const allowed = MATRIX[action];
  return roles.some((r) => allowed.includes(r));
}

export function assertCanAct(roles: readonly GroupRole[], action: TontineAction): void {
  if (!canAct(roles, action)) {
    throw new DomainError("TONTINE_FORBIDDEN", "Action réservée à une autre fonction du bureau");
  }
}

/**
 * Un rôle attribué doit être accepté par la personne nommée, puis approuvé par
 * une personne distincte du proposant (circuit A19 conservé). Le Président ne
 * s'attribue jamais lui-même une fonction financière.
 */
export function assertRoleAssignable(input: {
  readonly role: GroupRole;
  readonly proposerIdentityId: string;
  readonly targetIdentityId: string;
}): void {
  if (!isGroupRole(input.role)) {
    throw new DomainError("MANDATE_INVALID", "Fonction inconnue");
  }
  const financial: readonly GroupRole[] = ["treasurer", "treasurer_deputy", "auditor"];
  if (financial.includes(input.role) && input.proposerIdentityId === input.targetIdentityId) {
    throw new DomainError("APPROVER_NOT_DISTINCT", "Une fonction financière ne s'attribue pas à soi-même");
  }
}

/**
 * Mandat : dates ISO (YYYY-MM-DD), fin strictement après le début, durée
 * bornée à 5 ans (les associations renouvellent leur bureau en assemblée).
 */
export function assertMandate(start: string, end: string | null): void {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(start) || (end !== null && !iso.test(end))) {
    throw new DomainError("MANDATE_INVALID", "Dates de mandat invalides");
  }
  if (end !== null) {
    const s = Date.parse(`${start}T00:00:00Z`);
    const e = Date.parse(`${end}T00:00:00Z`);
    if (!(e > s) || e - s > 5 * 366 * 86_400_000) {
      throw new DomainError("MANDATE_INVALID", "Durée de mandat invalide");
    }
  }
}

/**
 * Destitution par vote (reprise de l'ancienne application) : ouverte à tout
 * membre, adoptée seulement à la majorité ABSOLUE des membres actifs (pas des
 * votants), avec une fenêtre de vote d'au moins 72 h.
 */
export function removalAdopted(input: {
  readonly activeMembers: number;
  readonly yes: number;
  readonly windowHours: number;
}): boolean {
  if (input.windowHours < 72) return false;
  return input.yes * 2 > input.activeMembers;
}
