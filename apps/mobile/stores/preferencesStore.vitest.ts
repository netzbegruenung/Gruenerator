import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetAsyncStorage } from '../test/stubs/async-storage';

import { usePreferencesStore } from './preferencesStore';

/**
 * Theme mode drives every screen via `useColorScheme()`. The one contract that
 * must not drift: "follow OS" is the string 'unspecified', never null — RN hands
 * the value straight to native `setColorScheme(style: String)`, and a null there
 * is an NPE on the new architecture, not a no-op.
 */

beforeEach(() => {
  __resetAsyncStorage();
  vi.clearAllMocks();
  usePreferencesStore.setState({ isLoading: true, themeMode: 'system' });
});

describe('setThemeMode', () => {
  it.each(['light', 'dark'] as const)('passes %s straight to Appearance', async (mode) => {
    await usePreferencesStore.getState().setThemeMode(mode);
    expect(Appearance.setColorScheme).toHaveBeenCalledWith(mode);
    expect(usePreferencesStore.getState().themeMode).toBe(mode);
  });

  it("translates 'system' to the non-null 'unspecified' sentinel", async () => {
    await usePreferencesStore.getState().setThemeMode('system');
    expect(Appearance.setColorScheme).toHaveBeenCalledWith('unspecified');
    expect(Appearance.setColorScheme).not.toHaveBeenCalledWith(null);
  });

  it('persists the choice', async () => {
    await usePreferencesStore.getState().setThemeMode('dark');
    expect(await AsyncStorage.getItem('themeMode')).toBe('dark');
  });

  it('still applies the theme when persisting fails', async () => {
    vi.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));

    await expect(usePreferencesStore.getState().setThemeMode('dark')).resolves.toBeUndefined();
    expect(usePreferencesStore.getState().themeMode).toBe('dark');
    expect(Appearance.setColorScheme).toHaveBeenCalledWith('dark');
  });
});

describe('loadPreferences', () => {
  it.each(['light', 'dark', 'system'] as const)('restores a stored %s', async (mode) => {
    await AsyncStorage.setItem('themeMode', mode);

    await usePreferencesStore.getState().loadPreferences();

    expect(usePreferencesStore.getState().themeMode).toBe(mode);
    expect(usePreferencesStore.getState().isLoading).toBe(false);
  });

  it('falls back to system when nothing is stored', async () => {
    await usePreferencesStore.getState().loadPreferences();

    expect(usePreferencesStore.getState().themeMode).toBe('system');
    expect(Appearance.setColorScheme).toHaveBeenCalledWith('unspecified');
  });

  it('falls back to system when the stored value is garbage', async () => {
    // A stale key from an older build, or a hand-edited store.
    await AsyncStorage.setItem('themeMode', 'sepia');

    await usePreferencesStore.getState().loadPreferences();

    expect(usePreferencesStore.getState().themeMode).toBe('system');
    expect(Appearance.setColorScheme).toHaveBeenCalledWith('unspecified');
  });

  it('always clears the loading flag, even when storage throws', async () => {
    // isLoading gates the splash screen — leaving it true hangs the app on a
    // blank screen, which is worse than losing the theme preference.
    vi.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('unavailable'));

    await usePreferencesStore.getState().loadPreferences();

    expect(usePreferencesStore.getState().isLoading).toBe(false);
  });
});
