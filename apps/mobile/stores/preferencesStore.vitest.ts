import { DEFAULT_NOTEBOOK_DEPTH } from '@gruenerator/chat';
import { notebookDepthSchema } from '@gruenerator/contracts';
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
  usePreferencesStore.setState({
    isLoading: true,
    themeMode: 'system',
    performanceMode: false,
    notebookDepth: DEFAULT_NOTEBOOK_DEPTH,
  });
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

describe('setPerformanceMode', () => {
  it.each([true, false])('persists %s as a string AsyncStorage can round-trip', async (value) => {
    await usePreferencesStore.getState().setPerformanceMode(value);

    expect(usePreferencesStore.getState().performanceMode).toBe(value);
    expect(await AsyncStorage.getItem('performanceMode')).toBe(String(value));
  });

  it('still applies the switch when persisting fails', async () => {
    vi.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));

    await expect(usePreferencesStore.getState().setPerformanceMode(true)).resolves.toBeUndefined();
    expect(usePreferencesStore.getState().performanceMode).toBe(true);
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

  it('restores a stored performance mode', async () => {
    await AsyncStorage.setItem('performanceMode', 'true');

    await usePreferencesStore.getState().loadPreferences();

    expect(usePreferencesStore.getState().performanceMode).toBe(true);
  });

  it.each([undefined, 'false', '1', 'yes'])('treats %s as performance mode off', async (stored) => {
    // Only the exact string 'true' counts. Anything else — nothing stored, an
    // older build's value, a hand-edited store — must leave the blur on rather
    // than silently changing how the app looks.
    if (stored !== undefined) await AsyncStorage.setItem('performanceMode', stored);

    await usePreferencesStore.getState().loadPreferences();

    expect(usePreferencesStore.getState().performanceMode).toBe(false);
  });

  it('keeps the theme when only the performance key is set', async () => {
    // The two keys are read together; neither may swallow the other.
    await AsyncStorage.setItem('themeMode', 'dark');
    await AsyncStorage.setItem('performanceMode', 'true');

    await usePreferencesStore.getState().loadPreferences();

    expect(usePreferencesStore.getState().themeMode).toBe('dark');
    expect(usePreferencesStore.getState().performanceMode).toBe(true);
  });

  it('always clears the loading flag, even when storage throws', async () => {
    // isLoading gates the splash screen — leaving it true hangs the app on a
    // blank screen, which is worse than losing the theme preference.
    vi.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('unavailable'));

    await usePreferencesStore.getState().loadPreferences();

    expect(usePreferencesStore.getState().isLoading).toBe(false);
  });
});

/**
 * The notebook depth lives here rather than in `notebookFilterStore` because it
 * is a standing preference, not a per-session filter — so unlike the facets it
 * has to survive an app restart.
 */
describe('notebookDepth', () => {
  it.each(notebookDepthSchema.options)('round-trips %s', async (depth) => {
    await usePreferencesStore.getState().setNotebookDepth(depth);
    expect(await AsyncStorage.getItem('notebookDepth')).toBe(depth);

    usePreferencesStore.setState({ notebookDepth: DEFAULT_NOTEBOOK_DEPTH });
    await usePreferencesStore.getState().loadPreferences();

    expect(usePreferencesStore.getState().notebookDepth).toBe(depth);
  });

  it('falls back to the default for a tier this build no longer knows', async () => {
    // A binary that shipped a tier since dropped from the enum wrote this key.
    // Sending it back on the wire would fail the request at the contract.
    await AsyncStorage.setItem('notebookDepth', 'gigantisch');

    await usePreferencesStore.getState().loadPreferences();

    expect(usePreferencesStore.getState().notebookDepth).toBe(DEFAULT_NOTEBOOK_DEPTH);
  });

  it('starts on the default when nothing was ever chosen', async () => {
    await usePreferencesStore.getState().loadPreferences();
    expect(usePreferencesStore.getState().notebookDepth).toBe(DEFAULT_NOTEBOOK_DEPTH);
  });

  it('still applies the choice when persisting fails', async () => {
    vi.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));

    await expect(usePreferencesStore.getState().setNotebookDepth('ultra')).resolves.toBeUndefined();
    expect(usePreferencesStore.getState().notebookDepth).toBe('ultra');
  });
});
