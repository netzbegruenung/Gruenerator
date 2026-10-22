import { profileUpdateBodySchema } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getProfileByIdMock = vi.fn();

vi.mock('./ProfileService.js', () => ({
  getProfileService: () => ({ getProfileById: getProfileByIdMock }),
}));

import { gatePandaModelId, isPandaEntitled, resolveNotebookTier } from './pandaEntitlement.js';

beforeEach(() => {
  getProfileByIdMock.mockReset();
});

describe('isPandaEntitled', () => {
  it('follows the instance default when nobody decided', () => {
    expect(isPandaEntitled(null, true)).toBe(true);
    expect(isPandaEntitled(undefined, false)).toBe(false);
  });

  it('lets the per-account decision win in both directions', () => {
    expect(isPandaEntitled(true, false)).toBe(true);
    expect(isPandaEntitled(false, true)).toBe(false);
  });
});

describe('gatePandaModelId', () => {
  it('passes every other lane without a profile lookup', async () => {
    expect(await gatePandaModelId('gruenerator-ultra', 'user-1')).toBe('gruenerator-ultra');
    expect(await gatePandaModelId(undefined, 'user-1')).toBeUndefined();
    expect(getProfileByIdMock).not.toHaveBeenCalled();
  });

  it('keeps Panda for an unlocked account', async () => {
    getProfileByIdMock.mockResolvedValue({ id: 'user-1', panda_enabled: true });
    expect(await gatePandaModelId('gruenerator-panda', 'user-1')).toBe('gruenerator-panda');
  });

  it('serves Ultra to an account without an unlock', async () => {
    getProfileByIdMock.mockResolvedValue({ id: 'user-1', panda_enabled: null });
    expect(await gatePandaModelId('gruenerator-panda', 'user-1')).toBe('gruenerator-ultra');
  });

  it('serves Ultra without a user', async () => {
    expect(await gatePandaModelId('gruenerator-panda', null)).toBe('gruenerator-ultra');
  });
});

/** Only an instance admin unlocks Panda — the self-service profile update must drop it. */
describe('resolveNotebookTier', () => {
  it('turns the Panda tier into the Ultra search with the Panda lane', async () => {
    getProfileByIdMock.mockResolvedValue({ id: 'user-1', panda_enabled: true });
    await expect(resolveNotebookTier('panda', 'gruenerator-medium', 'user-1')).resolves.toEqual({
      mode: 'ultra',
      model: 'gruenerator-panda',
    });
  });

  it('keeps the Ultra search but serves Ultra without an unlock', async () => {
    getProfileByIdMock.mockResolvedValue({ id: 'user-1', panda_enabled: false });
    await expect(resolveNotebookTier('panda', 'gruenerator-medium', 'user-1')).resolves.toEqual({
      mode: 'ultra',
      model: 'gruenerator-ultra',
    });
  });

  it('leaves the other tiers and their model alone', async () => {
    await expect(resolveNotebookTier('ultra', 'gruenerator-medium', 'user-1')).resolves.toEqual({
      mode: 'ultra',
      model: 'gruenerator-medium',
    });
    await expect(resolveNotebookTier(undefined, undefined, 'user-1')).resolves.toEqual({
      mode: undefined,
      model: undefined,
    });
    expect(getProfileByIdMock).not.toHaveBeenCalled();
  });
});

describe('profile update body', () => {
  it('never carries panda_enabled', () => {
    const parsed = profileUpdateBodySchema.parse({ display_name: 'x', panda_enabled: true });
    expect(parsed).not.toHaveProperty('panda_enabled');
  });
});
