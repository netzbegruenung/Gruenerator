import { DEFAULT_NOTEBOOK_ANSWER_MODE, DEFAULT_NOTEBOOK_DEPTH } from '@gruenerator/chat';
import { notebookAnswerModeSchema, notebookDepthSchema } from '@gruenerator/contracts';
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
    notebookDepth: DEFAULT_NOTEBOOK_DEPTH,
    notebookAnswerMode: DEFAULT_NOTEBOOK_ANSWER_MODE,
    vorlagenGridSize: 'small',
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

describe('notebookAnswerMode', () => {
  it.each(notebookAnswerModeSchema.options)('round-trips %s', async (mode) => {
    await usePreferencesStore.getState().setNotebookAnswerMode(mode);
    expect(await AsyncStorage.getItem('notebookAnswerMode')).toBe(mode);

    usePreferencesStore.setState({ notebookAnswerMode: DEFAULT_NOTEBOOK_ANSWER_MODE });
    await usePreferencesStore.getState().loadPreferences();

    expect(usePreferencesStore.getState().notebookAnswerMode).toBe(mode);
  });

  it('round-trips the client-only manuell mode', async () => {
    await usePreferencesStore.getState().setNotebookAnswerMode('manuell');

    usePreferencesStore.setState({ notebookAnswerMode: DEFAULT_NOTEBOOK_ANSWER_MODE });
    await usePreferencesStore.getState().loadPreferences();

    expect(usePreferencesStore.getState().notebookAnswerMode).toBe('manuell');
  });

  it('starts on auto when nothing was ever chosen', async () => {
    await usePreferencesStore.getState().loadPreferences();
    expect(usePreferencesStore.getState().notebookAnswerMode).toBe('auto');
  });

  it('falls back to the default for a mode this build no longer knows', async () => {
    await AsyncStorage.setItem('notebookAnswerMode', 'turbo');

    await usePreferencesStore.getState().loadPreferences();

    expect(usePreferencesStore.getState().notebookAnswerMode).toBe(DEFAULT_NOTEBOOK_ANSWER_MODE);
  });

  it('keeps the depth when only the answer mode is set', async () => {
    await AsyncStorage.setItem('notebookDepth', 'ultra');
    await AsyncStorage.setItem('notebookAnswerMode', 'praezision');

    await usePreferencesStore.getState().loadPreferences();

    expect(usePreferencesStore.getState().notebookDepth).toBe('ultra');
    expect(usePreferencesStore.getState().notebookAnswerMode).toBe('praezision');
  });

  it('still applies the choice when persisting fails', async () => {
    vi.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));

    await expect(
      usePreferencesStore.getState().setNotebookAnswerMode('chat')
    ).resolves.toBeUndefined();
    expect(usePreferencesStore.getState().notebookAnswerMode).toBe('chat');
  });
});

describe('vorlagenGridSize', () => {
  it('persists the choice and restores it', async () => {
    await usePreferencesStore.getState().setVorlagenGridSize('large');
    expect(await AsyncStorage.getItem('vorlagenGridSize')).toBe('large');

    usePreferencesStore.setState({ vorlagenGridSize: 'small' });
    await usePreferencesStore.getState().loadPreferences();
    expect(usePreferencesStore.getState().vorlagenGridSize).toBe('large');
  });

  it('falls back to small cards for an unknown stored value', async () => {
    await AsyncStorage.setItem('vorlagenGridSize', 'riesig');
    await usePreferencesStore.getState().loadPreferences();
    expect(usePreferencesStore.getState().vorlagenGridSize).toBe('small');
  });
});
