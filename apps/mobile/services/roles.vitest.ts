/**
 * Der `profile`-Block der User-Defaults, so wie die App ihn liest.
 *
 * `hasChosenRole` ist der heikle Teil: es hängt am VORHANDENSEIN des Schlüssels,
 * nicht an seinem Wert. „Bewusst ohne Rolle" (`activeRole: null`) und „nie
 * gewählt" (kein Schlüssel) lesen sich sonst gleich, und die Vorauswahl bei
 * genau einer Rolle wäre nicht abwählbar.
 *
 * Run with: pnpm --filter @gruenerator/mobile test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUserDefaults = vi.fn();

vi.mock('@gruenerator/shared/api', () => ({
  getContractsClient: () => ({ userProfile: { getUserDefaults } }),
}));

const { fetchProfileDefaults, fetchRoles } = await import('./roles');

const LGS = { ebene: 'land', rolle: 'Mitarbeiter*in Landesgeschäftsstelle', bundesland: 'Hessen' };

function respond(profile: Record<string, unknown> | undefined, status = 200) {
  getUserDefaults.mockResolvedValue({
    status,
    body: { userDefaults: profile === undefined ? {} : { profile } },
  });
}

beforeEach(() => {
  getUserDefaults.mockReset();
});

describe('fetchProfileDefaults', () => {
  it('liest Rollen und gewählte Rolle', async () => {
    respond({ roles: [LGS], activeRole: { ebene: LGS.ebene, rolle: LGS.rolle } });
    const defaults = await fetchProfileDefaults();
    expect(defaults.roles).toEqual([LGS]);
    expect(defaults.activeRole).toEqual({ ebene: LGS.ebene, rolle: LGS.rolle });
    expect(defaults.hasChosenRole).toBe(true);
  });

  it('unterscheidet „bewusst ohne Rolle" von „nie gewählt"', async () => {
    respond({ roles: [LGS], activeRole: null });
    expect((await fetchProfileDefaults()).hasChosenRole).toBe(true);

    respond({ roles: [LGS] });
    expect((await fetchProfileDefaults()).hasChosenRole).toBe(false);
  });

  it('verkraftet einen fehlenden profile-Block', async () => {
    respond(undefined);
    expect(await fetchProfileDefaults()).toEqual({
      roles: [],
      activeRole: null,
      hasChosenRole: false,
    });
  });

  it('verkraftet ein roles-Feld, das keine Liste ist', async () => {
    respond({ roles: 'kaputt' });
    expect((await fetchProfileDefaults()).roles).toEqual([]);
  });

  it('liefert bei einem Fehlerstatus leere Voreinstellungen statt zu werfen', async () => {
    // Der Aufrufer hydratisiert danach mit `isHydrated: true` — eine leere
    // Rollenliste heißt „geprüft, keine Rolle" und blendet LV-Inhalte aus.
    // Ein Wurf hier ließe `isHydrated` auf false und zeigte wieder alles.
    respond({ roles: [LGS] }, 500);
    expect(await fetchProfileDefaults()).toEqual({
      roles: [],
      activeRole: null,
      hasChosenRole: false,
    });
  });
});

describe('fetchRoles', () => {
  it('reicht die Rollen aus denselben Voreinstellungen durch', async () => {
    respond({ roles: [LGS] });
    expect(await fetchRoles()).toEqual([LGS]);
  });
});
