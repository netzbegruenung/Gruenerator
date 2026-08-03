/**
 * Tests for the model-preferences resolver.
 *
 * Pins the rule: a stored override wins; otherwise we fall back to the
 * `offByDefault` flag in the canonical model catalog. No model is currently
 * off by default, so everything resolves to enabled unless explicitly
 * disabled by the user.
 *
 * Plus the F0 half: profiles written before the lanes were renamed still carry
 * the vendor ids, and they must keep deciding.
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';

// Mocks must be declared before importing the module under test.
const getProfileByIdMock = vi.fn();
const updateUserDefaultMock = vi.fn();

vi.mock('./ProfileService.js', () => ({
  getProfileService: () => ({
    getProfileById: getProfileByIdMock,
    updateUserDefault: updateUserDefaultMock,
  }),
}));

import {
  getDefaultModelPreferences,
  getModelPreferencesForUser,
  isModelEnabledForUser,
  setModelPreference,
} from './modelPreferences.js';

beforeEach(() => {
  getProfileByIdMock.mockReset();
  updateUserDefaultMock.mockReset();
});

describe('modelPreferences', () => {
  describe('getDefaultModelPreferences', () => {
    it('enables every catalog model by default', () => {
      const defaults = getDefaultModelPreferences();
      expect(defaults['gruenerator-small']).toEqual({ enabled: true });
      expect(defaults['gruenerator-medium']).toEqual({ enabled: true });
      expect(defaults['gruenerator-ultra']).toEqual({ enabled: true });
    });
  });

  describe('getModelPreferencesForUser', () => {
    it('falls back to platform defaults when no overrides exist', async () => {
      getProfileByIdMock.mockResolvedValue({
        id: 'user-1',
        user_defaults: {},
      });
      const prefs = await getModelPreferencesForUser('user-1');
      expect(prefs['gruenerator-ultra'].enabled).toBe(true);
      expect(prefs['gruenerator-medium'].enabled).toBe(true);
    });

    it('falls back to platform defaults when profile is null', async () => {
      getProfileByIdMock.mockResolvedValue(null);
      const prefs = await getModelPreferencesForUser('ghost');
      expect(prefs['gruenerator-ultra'].enabled).toBe(true);
    });

    it('respects an explicit disable for an on-by-default model', async () => {
      getProfileByIdMock.mockResolvedValue({
        id: 'user-1',
        user_defaults: { models: { 'gruenerator-medium': { enabled: false } } },
      });
      const prefs = await getModelPreferencesForUser('user-1');
      expect(prefs['gruenerator-medium'].enabled).toBe(false);
      expect(prefs['gruenerator-ultra'].enabled).toBe(true);
    });

    it('ignores malformed stored values and uses default', async () => {
      getProfileByIdMock.mockResolvedValue({
        id: 'user-1',
        user_defaults: { models: { 'gruenerator-medium': 'yes-please' } },
      });
      const prefs = await getModelPreferencesForUser('user-1');
      expect(prefs['gruenerator-medium'].enabled).toBe(true);
    });

    it('uses the preloaded profile when provided to skip the DB roundtrip', async () => {
      const prefs = await getModelPreferencesForUser('user-1', {
        id: 'user-1',
        user_defaults: { models: { 'gruenerator-medium': { enabled: false } } },
      });
      expect(prefs['gruenerator-medium'].enabled).toBe(false);
      expect(getProfileByIdMock).not.toHaveBeenCalled();
    });

    /**
     * The whole point of the alias table: without it the rename silently
     * re-enables every model a user had switched off.
     */
    it('still honours a disable stored under the old vendor id', async () => {
      getProfileByIdMock.mockResolvedValue({
        id: 'user-1',
        user_defaults: {
          models: {
            'gemma-litellm': { enabled: false },
            litellm: { enabled: false },
            'mistral-medium-3.5': { enabled: false },
          },
        },
      });
      const prefs = await getModelPreferencesForUser('user-1');
      expect(prefs['gruenerator-medium'].enabled).toBe(false);
      expect(prefs['gruenerator-small'].enabled).toBe(false);
      expect(prefs['gruenerator-ultra'].enabled).toBe(false);
    });

    it('lets a value under the new id win over a stale one under the old', async () => {
      getProfileByIdMock.mockResolvedValue({
        id: 'user-1',
        user_defaults: {
          models: {
            'gemma-litellm': { enabled: false },
            'gruenerator-medium': { enabled: true },
          },
        },
      });
      const prefs = await getModelPreferencesForUser('user-1');
      expect(prefs['gruenerator-medium'].enabled).toBe(true);
    });
  });

  describe('setModelPreference', () => {
    it('persists via ProfileService.updateUserDefault and returns refreshed prefs', async () => {
      updateUserDefaultMock.mockResolvedValue(undefined);
      getProfileByIdMock.mockResolvedValue({
        id: 'user-1',
        user_defaults: { models: { 'gruenerator-medium': { enabled: false } } },
      });

      const prefs = await setModelPreference('user-1', 'gruenerator-medium', false);

      expect(updateUserDefaultMock).toHaveBeenCalledWith('user-1', 'models', 'gruenerator-medium', {
        enabled: false,
      });
      expect(prefs['gruenerator-medium'].enabled).toBe(false);
    });

    /** An old client keeps sending its vendor id; it must not open a second
     *  key for the same lane. */
    it('writes an old vendor id under its lane', async () => {
      updateUserDefaultMock.mockResolvedValue(undefined);
      getProfileByIdMock.mockResolvedValue({ id: 'user-1', user_defaults: {} });

      await setModelPreference('user-1', 'gemma-litellm', false);

      expect(updateUserDefaultMock).toHaveBeenCalledWith('user-1', 'models', 'gruenerator-medium', {
        enabled: false,
      });
    });

    it('rejects unknown model ids', async () => {
      await expect(setModelPreference('user-1', 'nonsense' as never, true)).rejects.toThrow(
        /Unknown modelId/
      );
      expect(updateUserDefaultMock).not.toHaveBeenCalled();
    });
  });

  describe('isModelEnabledForUser', () => {
    it('uses the resolved value from the prefs map', () => {
      const prefs = getDefaultModelPreferences();
      expect(isModelEnabledForUser(prefs, 'gruenerator-medium')).toBe(true);
    });

    it('falls back to platform default for an id missing from the map', () => {
      expect(isModelEnabledForUser({} as never, 'gruenerator-medium')).toBe(true);
    });
  });
});
