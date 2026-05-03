/**
 * Tests for the model-preferences resolver.
 *
 * Pins the rule: a stored override wins; otherwise we fall back to the
 * `offByDefault` flag in the canonical model catalog. Chinese (Qwen) models
 * carry `offByDefault: true`, everything else defaults to enabled.
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
    it('disables Chinese models and enables the rest by default', () => {
      const defaults = getDefaultModelPreferences();
      expect(defaults['qwen-regolo']).toEqual({ enabled: false });
      expect(defaults['qwen3.6-regolo']).toEqual({ enabled: false });
      expect(defaults['gemma-litellm']).toEqual({ enabled: true });
      expect(defaults['gpt-oss-regolo']).toEqual({ enabled: true });
      expect(defaults['litellm']).toEqual({ enabled: true });
    });
  });

  describe('getModelPreferencesForUser', () => {
    it('falls back to platform defaults when no overrides exist', async () => {
      getProfileByIdMock.mockResolvedValue({
        id: 'user-1',
        user_defaults: {},
      });
      const prefs = await getModelPreferencesForUser('user-1');
      expect(prefs['qwen-regolo'].enabled).toBe(false);
      expect(prefs['gemma-litellm'].enabled).toBe(true);
    });

    it('falls back to platform defaults when profile is null', async () => {
      getProfileByIdMock.mockResolvedValue(null);
      const prefs = await getModelPreferencesForUser('ghost');
      expect(prefs['qwen-regolo'].enabled).toBe(false);
      expect(prefs['gpt-oss-regolo'].enabled).toBe(true);
    });

    it('respects an explicit override for an off-by-default model', async () => {
      getProfileByIdMock.mockResolvedValue({
        id: 'user-1',
        user_defaults: { models: { 'qwen-regolo': { enabled: true } } },
      });
      const prefs = await getModelPreferencesForUser('user-1');
      expect(prefs['qwen-regolo'].enabled).toBe(true);
      expect(prefs['qwen3.6-regolo'].enabled).toBe(false);
    });

    it('respects an explicit disable for an on-by-default model', async () => {
      getProfileByIdMock.mockResolvedValue({
        id: 'user-1',
        user_defaults: { models: { 'gemma-litellm': { enabled: false } } },
      });
      const prefs = await getModelPreferencesForUser('user-1');
      expect(prefs['gemma-litellm'].enabled).toBe(false);
      expect(prefs['gpt-oss-regolo'].enabled).toBe(true);
    });

    it('ignores malformed stored values and uses default', async () => {
      getProfileByIdMock.mockResolvedValue({
        id: 'user-1',
        user_defaults: { models: { 'qwen-regolo': 'yes-please' } },
      });
      const prefs = await getModelPreferencesForUser('user-1');
      expect(prefs['qwen-regolo'].enabled).toBe(false);
    });

    it('uses the preloaded profile when provided to skip the DB roundtrip', async () => {
      const prefs = await getModelPreferencesForUser('user-1', {
        id: 'user-1',
        user_defaults: { models: { 'qwen-regolo': { enabled: true } } },
      });
      expect(prefs['qwen-regolo'].enabled).toBe(true);
      expect(getProfileByIdMock).not.toHaveBeenCalled();
    });
  });

  describe('setModelPreference', () => {
    it('persists via ProfileService.updateUserDefault and returns refreshed prefs', async () => {
      updateUserDefaultMock.mockResolvedValue(undefined);
      getProfileByIdMock.mockResolvedValue({
        id: 'user-1',
        user_defaults: { models: { 'qwen-regolo': { enabled: true } } },
      });

      const prefs = await setModelPreference('user-1', 'qwen-regolo', true);

      expect(updateUserDefaultMock).toHaveBeenCalledWith(
        'user-1',
        'models',
        'qwen-regolo',
        { enabled: true }
      );
      expect(prefs['qwen-regolo'].enabled).toBe(true);
    });

    it('rejects unknown model ids', async () => {
      await expect(
        setModelPreference('user-1', 'nonsense' as never, true)
      ).rejects.toThrow(/Unknown modelId/);
      expect(updateUserDefaultMock).not.toHaveBeenCalled();
    });
  });

  describe('isModelEnabledForUser', () => {
    it('uses the resolved value from the prefs map', () => {
      const prefs = getDefaultModelPreferences();
      expect(isModelEnabledForUser(prefs, 'qwen-regolo')).toBe(false);
      expect(isModelEnabledForUser(prefs, 'gemma-litellm')).toBe(true);
    });

    it('falls back to platform default for an id missing from the map', () => {
      expect(isModelEnabledForUser({} as never, 'qwen-regolo')).toBe(false);
      expect(isModelEnabledForUser({} as never, 'gemma-litellm')).toBe(true);
    });
  });
});
