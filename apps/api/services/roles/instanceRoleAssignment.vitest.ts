import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserProfile } from '../user/types.js';

const instanceMock = { CURRENT_INSTANCE: 'bgst' as string };
vi.mock('../../config/instance.js', () => ({
  get CURRENT_INSTANCE() {
    return instanceMock.CURRENT_INSTANCE;
  },
}));

const updateUserDefault = vi.fn();
vi.mock('../user/ProfileService.js', () => ({
  getProfileService: () => ({ updateUserDefault }),
}));

const BGST_ROLE = { ebene: 'bund', rolle: 'Mitarbeiter*in Bundesgeschäftsstelle' };

function profile(user_defaults?: UserProfile['user_defaults']): UserProfile {
  return { id: 'u1', ...(user_defaults ? { user_defaults } : {}) } as UserProfile;
}

async function load() {
  return import('./instanceRoleAssignment.js');
}

beforeEach(() => {
  vi.resetModules();
  updateUserDefault.mockReset();
  instanceMock.CURRENT_INSTANCE = 'bgst';
});

describe('assignInstanceRole', () => {
  it('writes the instance role into an empty profile and returns the updated one', async () => {
    const updated = profile({ profile: { roles: [BGST_ROLE] } });
    updateUserDefault.mockResolvedValue(updated);

    const { assignInstanceRole } = await load();
    const result = await assignInstanceRole(profile());

    expect(updateUserDefault).toHaveBeenCalledWith('u1', 'profile', 'roles', [BGST_ROLE]);
    expect(result).toBe(updated);
  });

  it('treats an empty roles array as no role', async () => {
    updateUserDefault.mockResolvedValue(profile({ profile: { roles: [BGST_ROLE] } }));

    const { assignInstanceRole } = await load();
    await assignInstanceRole(profile({ profile: { roles: [] } }));

    expect(updateUserDefault).toHaveBeenCalledTimes(1);
  });

  // Sonst überschriebe jedes Lesen der User-Defaults die Rollen, die jemand
  // vor der Verengung angelegt hat — `offeredRoles` ist Angebot, keine Sperre.
  it('leaves an existing role alone, even one the instance no longer offers', async () => {
    const existing = profile({
      profile: { roles: [{ ebene: 'land', rolle: 'Mitarbeiter*in Landesgeschäftsstelle' }] },
    });

    const { assignInstanceRole } = await load();
    const result = await assignInstanceRole(existing);

    expect(updateUserDefault).not.toHaveBeenCalled();
    expect(result).toBe(existing);
  });

  it('does nothing on an instance whose wizard has a real choice to offer', async () => {
    instanceMock.CURRENT_INSTANCE = 'production';

    const { assignInstanceRole } = await load();
    const empty = profile();
    const result = await assignInstanceRole(empty);

    expect(updateUserDefault).not.toHaveBeenCalled();
    expect(result).toBe(empty);
  });

  // Die Rolle ist eine Bequemlichkeit; ein Profil ohne sie ist ein gültiger
  // Zustand. Ein Schreibfehler darf das Laden der Einstellungen nicht kippen.
  it('returns the untouched profile when the write fails', async () => {
    updateUserDefault.mockRejectedValue(new Error('Postgres weg'));

    const { assignInstanceRole } = await load();
    const empty = profile();

    await expect(assignInstanceRole(empty)).resolves.toBe(empty);
  });
});
