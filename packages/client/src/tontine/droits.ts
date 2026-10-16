/* KÓMBE — qui peut faire quoi dans un groupe (copie de la matrice du domaine,
   `packages/domain/src/tontine/roles.ts`). La PWA ne s'en sert que pour
   montrer ou cacher un bouton : le serveur reste seul juge (403 sinon).
   `droits.test.ts` vérifie que cette copie reste identique au domaine. */

import type { GroupRole, TontineAction } from "@kombe/domain";

const EVERYONE: readonly GroupRole[] = [
  "animator",
  "vice_president",
  "secretary",
  "treasurer",
  "treasurer_deputy",
  "auditor",
  "censor",
  "advisor",
  "member",
];
const PRESIDENCY: readonly GroupRole[] = ["animator", "vice_president"];
const ADMIN: readonly GroupRole[] = ["animator", "vice_president", "secretary"];
const TREASURY: readonly GroupRole[] = ["treasurer", "treasurer_deputy"];

export const MATRICE: Readonly<Record<TontineAction, readonly GroupRole[]>> = {
  "group.read": EVERYONE,
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

export function peut(roles: readonly GroupRole[], action: TontineAction): boolean {
  const permis = MATRICE[action];
  return roles.some((r) => permis.includes(r));
}

export const ROLES_NOMMABLES: readonly GroupRole[] = [
  "vice_president",
  "secretary",
  "treasurer",
  "treasurer_deputy",
  "auditor",
  "censor",
  "advisor",
];
