import { profileUpdateBodySchema } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getProfileByIdMock = vi.fn();

vi.mock('./ProfileService.js', () => ({
  getProfileService: () => ({ getProfileById: getProfileByIdMock }),
}));

import { gatePandaModelId, isPandaEntitled } from './pandaEntitlement.js';

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
describe('profile update body', () => {
  it('never carries panda_enabled', () => {
    const parsed = profileUpdateBodySchema.parse({ display_name: 'x', panda_enabled: true });
    expect(parsed).not.toHaveProperty('panda_enabled');
  });
});
