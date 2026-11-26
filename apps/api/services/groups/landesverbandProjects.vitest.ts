/**
 * Die Zugangsregel des automatischen LV-Projekts, ohne Datenbank: nur eine
 * bestätigte Adresse auf der Domain des Landesverbands öffnet es, die Rolle
 * allein nie. Das ist eine Sicherheitsgrenze; jeder Fall hier ist ein Weg, auf
 * dem jemand sonst Admin eines fremden Landesverbands-Projekts würde.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../database/services/PostgresService.js', () => ({ getPostgresInstance: vi.fn() }));
vi.mock('../landesverband/LandesverbandDerivationService.js', () => ({
  deriveLandesverbandFromRoles: vi.fn(),
}));

const { planLandesverbandAccess } = await import('./landesverbandProjects.js');

const LGS = 'Mitarbeiter*in Landesgeschäftsstelle';
const lgs = (bundesland: string) => ({ ebene: 'land', rolle: LGS, bundesland });
const base = { locale: 'de-DE', emailVerified: true };

describe('planLandesverbandAccess', () => {
  it('admits a verified LV address with the matching role, adding nothing', () => {
    expect(
      planLandesverbandAccess({ ...base, roles: [lgs('Berlin')], email: 'kim@gruene-berlin.de' })
    ).toEqual({ addRole: null, lvIds: ['berlin'] });
  });

  it('adds the missing LGS role for a verified LV address and admits', () => {
    expect(planLandesverbandAccess({ ...base, roles: [], email: 'kim@gruene-berlin.de' })).toEqual({
      addRole: lgs('Berlin'),
      lvIds: ['berlin'],
    });
  });

  it('adds the role next to unrelated roles', () => {
    const plan = planLandesverbandAccess({
      ...base,
      roles: [
        { ebene: 'kreisverband', rolle: 'Mitarbeiter*in Kreisverband', bundesland: 'Berlin' },
      ],
      email: 'kim@gruene-berlin.de',
    });
    expect(plan.addRole).toEqual(lgs('Berlin'));
    expect(plan.lvIds).toEqual(['berlin']);
  });

  it('admits nobody on the role alone: unverified address', () => {
    expect(
      planLandesverbandAccess({
        ...base,
        emailVerified: false,
        roles: [lgs('Berlin')],
        email: 'kim@gruene-berlin.de',
      })
    ).toEqual({ addRole: null, lvIds: [] });
  });

  it.each([
    ['a private address', 'kim@example.com'],
    ['the federal party', 'kim@gruene.de'],
    ['a subdomain (Kreisverband)', 'kim@kv.gruene-berlin.de'],
    ['a look-alike domain', 'kim@gruene-berlin.com'],
    ['no address', null],
  ])('admits nobody on the role alone: %s', (_label, email) => {
    expect(planLandesverbandAccess({ ...base, roles: [lgs('Berlin')], email })).toEqual({
      addRole: null,
      lvIds: [],
    });
  });

  it('never admits into another Landesverband than the address belongs to', () => {
    // Hessen address, Berlin role claimed by hand: Berlin stays closed.
    const plan = planLandesverbandAccess({
      ...base,
      roles: [lgs('Berlin')],
      email: 'kim@gruene-hessen.de',
    });
    expect(plan.lvIds).not.toContain('berlin');
    expect(plan.addRole).toEqual(lgs('Hessen'));
  });

  it('gives Austria no automatic access (gruene.at is also the federal party)', () => {
    expect(
      planLandesverbandAccess({
        ...base,
        locale: 'de-AT',
        roles: [{ ebene: 'land', rolle: 'Mitarbeiter*in Landesorganisation', bundesland: 'Wien' }],
        email: 'kim@gruene.at',
      })
    ).toEqual({ addRole: null, lvIds: [] });
  });
});
