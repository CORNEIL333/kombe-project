import { describe, expect, it } from 'vitest';
import { MATRIX, TONTINE_ACTIONS, abilities, canAct, roleList } from './roles';
import { GROUP_ROLES } from './types';

interface DomainRoles {
  readonly TONTINE_ACTIONS: readonly string[];
  readonly GROUP_ROLES: readonly string[];
  readonly canAct: (roles: readonly string[], action: string) => boolean;
}

describe('matrice des fonctions du bureau', () => {
  it('reste identique à packages/domain/src/tontine/roles.ts (source de vérité serveur)', async () => {
    const path = new URL('../../../../packages/domain/src/tontine/roles.ts', import.meta.url).href;
    const domain = (await import(/* @vite-ignore */ path)) as DomainRoles;
    expect([...TONTINE_ACTIONS]).toEqual([...domain.TONTINE_ACTIONS]);
    expect([...GROUP_ROLES]).toEqual([...domain.GROUP_ROLES]);
    for (const action of TONTINE_ACTIONS) {
      for (const role of GROUP_ROLES) {
        expect({ action, role, allowed: canAct([role], action) }).toEqual({ action, role, allowed: domain.canAct([role], action) });
      }
    }
  });

  it('le Trésorier confirme mais ne contrôle pas ; le commissaire contrôle mais ne confirme pas', () => {
    expect(canAct(['treasurer'], 'movement.confirm')).toBe(true);
    expect(canAct(['treasurer'], 'movement.control')).toBe(false);
    expect(canAct(['auditor'], 'movement.control')).toBe(true);
    expect(canAct(['auditor'], 'movement.confirm')).toBe(false);
  });

  it('un simple membre ne voit aucune action de bureau', () => {
    const a = abilities(['member']);
    expect(a.treasury).toBe(false);
    expect(a.collect).toBe(false);
    expect(a.arbitrateFines).toBe(false);
    for (const action of ['member.invite', 'member.admit', 'meeting.manage', 'meeting.attendance', 'movement.confirm', 'fine.issue', 'import.history'] as const) {
      expect(a.can(action)).toBe(false);
    }
  });

  it('la secrétaire tient la séance et collecte, sans remise ni confirmation', () => {
    const a = abilities(['secretary']);
    expect(a.can('meeting.manage')).toBe(true);
    expect(a.collect).toBe(true);
    expect(a.treasury).toBe(false);
    expect(a.can('movement.confirm')).toBe(false);
    expect(a.can('member.admit')).toBe(false);
  });

  it('cumul de fonctions : union des droits', () => {
    const a = abilities(['censor', 'treasurer_deputy']);
    expect(a.can('fine.issue')).toBe(true);
    expect(a.treasury).toBe(true);
    expect(a.can('meeting.attendance')).toBe(true);
  });

  it('chaque action a au moins une fonction', () => {
    for (const action of TONTINE_ACTIONS) expect(MATRIX[action].length).toBeGreaterThan(0);
  });

  it('libellés de terrain', () => {
    expect(roleList(['animator'])).toBe('Président');
    expect(roleList(['member'])).toBe('Membre');
    expect(roleList(['secretary', 'member'])).toBe('Secrétaire général');
  });
});
