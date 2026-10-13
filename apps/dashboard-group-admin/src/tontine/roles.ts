/**
 * Matrice des fonctions du bureau — copie fidèle de
 * packages/domain/src/tontine/roles.ts (le test roles.test.ts vérifie la
 * parité). Elle sert seulement à MASQUER les actions qu'une fonction ne peut
 * pas tenter : le serveur reste juge (403 TONTINE_FORBIDDEN, indépendance
 * vérifiée par opération) et ses refus sont toujours affichés.
 */
import type { GroupRole } from './types';

export const ROLE_LABELS: Readonly<Record<GroupRole, string>> = {
  animator: 'Président',
  vice_president: 'Vice-président',
  secretary: 'Secrétaire général',
  treasurer: 'Trésorier',
  treasurer_deputy: 'Trésorier adjoint',
  auditor: 'Commissaire aux comptes',
  censor: 'Censeur',
  advisor: 'Conseiller',
  member: 'Membre',
};

export const BUREAU_ROLES: readonly Exclude<GroupRole, 'member'>[] = [
  'animator',
  'vice_president',
  'secretary',
  'treasurer',
  'treasurer_deputy',
  'auditor',
  'censor',
  'advisor',
];

export const TONTINE_ACTIONS = [
  'group.read',
  'group.manage',
  'member.invite',
  'member.admit',
  'member.remove',
  'role.assign',
  'rules.publish',
  'schedule.manage',
  'meeting.manage',
  'meeting.attendance',
  'movement.declare',
  'movement.confirm',
  'movement.control',
  'fine.issue',
  'aid.request',
  'aid.decide',
  'fund.manage',
  'debt.manage',
  'order.manage',
  'order.swap.request',
  'statutes.publish',
  'import.history',
] as const;
export type TontineAction = (typeof TONTINE_ACTIONS)[number];

const EVERYONE: readonly GroupRole[] = ['animator', 'vice_president', 'secretary', 'treasurer', 'treasurer_deputy', 'auditor', 'censor', 'advisor', 'member'];
const PRESIDENCY: readonly GroupRole[] = ['animator', 'vice_president'];
const ADMIN: readonly GroupRole[] = ['animator', 'vice_president', 'secretary'];
const TREASURY: readonly GroupRole[] = ['treasurer', 'treasurer_deputy'];

export const MATRIX: Readonly<Record<TontineAction, readonly GroupRole[]>> = {
  'group.read': EVERYONE,
  'group.manage': ADMIN,
  'member.invite': ADMIN,
  'member.admit': PRESIDENCY,
  'member.remove': PRESIDENCY,
  'role.assign': PRESIDENCY,
  'rules.publish': ADMIN,
  'schedule.manage': ADMIN,
  'meeting.manage': ADMIN,
  'meeting.attendance': ['animator', 'vice_president', 'secretary', 'censor'],
  'movement.declare': EVERYONE,
  'movement.confirm': TREASURY,
  'movement.control': ['auditor'],
  'fine.issue': ['censor', 'animator', 'vice_president'],
  'aid.request': EVERYONE,
  'aid.decide': [...PRESIDENCY, 'secretary', 'treasurer'],
  'fund.manage': ['animator', 'vice_president', 'treasurer'],
  'debt.manage': ['animator', 'vice_president', 'treasurer'],
  'order.manage': ADMIN,
  'order.swap.request': EVERYONE,
  'statutes.publish': ADMIN,
  'import.history': PRESIDENCY,
};

export function canAct(roles: readonly GroupRole[], action: TontineAction): boolean {
  const allowed = MATRIX[action];
  return roles.some((r) => allowed.includes(r));
}

/**
 * Gestes du bureau qui ne sont pas une ligne de la matrice mais une règle du
 * serveur (packages/api/src/tontine/association.ts) :
 * - remise et versement d'un secours : trésorerie seulement ;
 * - collecte pour le compte des membres : trésorerie ou secrétariat de séance ;
 * - arbitrage d'une amende contestée : présidence (member.admit).
 */
export interface BureauAbilities {
  readonly can: (action: TontineAction) => boolean;
  readonly treasury: boolean;
  readonly collect: boolean;
  readonly arbitrateFines: boolean;
}

export function abilities(roles: readonly GroupRole[]): BureauAbilities {
  const can = (a: TontineAction) => canAct(roles, a);
  return {
    can,
    treasury: roles.some((r) => TREASURY.includes(r)),
    collect: can('movement.confirm') || can('meeting.attendance'),
    arbitrateFines: can('member.admit'),
  };
}

export function roleList(roles: readonly GroupRole[]): string {
  const shown = roles.filter((r) => r !== 'member');
  return shown.length === 0 ? ROLE_LABELS.member : shown.map((r) => ROLE_LABELS[r]).join(', ');
}
