import { useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'themeMode';
const LEGACY_DARKMODE_KEY = 'darkMode';
const LEGACY_THEME_KEY = 'theme';

const prefersDark = (): boolean => window.matchMedia('(prefers-color-scheme: dark)').matches;

const readStoredMode = (): ThemeMode => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }
  // One-time migration from the legacy boolean/string preference.
  const legacyDark = localStorage.getItem(LEGACY_DARKMODE_KEY);
  if (legacyDark) {
    try {
      const { value } = JSON.parse(legacyDark) as { value: boolean };
      return value ? 'dark' : 'light';
    } catch {
      // fall through
    }
  }
  const legacyTheme = localStorage.getItem(LEGACY_THEME_KEY);
  if (legacyTheme === 'dark' || legacyTheme === 'light') {
    return legacyTheme;
  }
  return 'system';
};

const resolveIsDark = (mode: ThemeMode): boolean =>
  mode === 'system' ? prefersDark() : mode === 'dark';

// Single shared source of truth, mirrored across all hook instances.
let currentMode: ThemeMode = readStoredMode();
const modeListeners = new Set<(mode: ThemeMode) => void>();

const applyTheme = (mode: ThemeMode): void => {
  document.documentElement.setAttribute('data-theme', resolveIsDark(mode) ? 'dark' : 'light');
};

// Apply immediately on module load so there's no flash before a hook mounts.
applyTheme(currentMode);

// Re-apply live when the OS theme changes while in 'system' mode.
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (currentMode === 'system') applyTheme(currentMode);
});

const setMode = (mode: ThemeMode): void => {
  currentMode = mode;
  localStorage.setItem(STORAGE_KEY, mode);
  localStorage.removeItem(LEGACY_DARKMODE_KEY);
  localStorage.removeItem(LEGACY_THEME_KEY);
  applyTheme(mode);
  modeListeners.forEach((cb) => cb(mode));
};

/**
 * Explicit three-state theme control. Consumed by the settings UI so the user
 * can pick light / dark / system. `setThemeMode('system')` live-follows the OS.
 */
export const useThemeMode = (): [ThemeMode, (mode: ThemeMode) => void] => {
  const [mode, setLocalMode] = useState<ThemeMode>(currentMode);

  useEffect(() => {
    modeListeners.add(setLocalMode);
    const onStorage = (e: StorageEvent): void => {
      if (e.key !== STORAGE_KEY) return;
      const next = readStoredMode();
      currentMode = next;
      applyTheme(next);
      setLocalMode(next);
    };
    window.addEventListener('storage', onStorage);
    return () => {
      modeListeners.delete(setLocalMode);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return [mode, setMode];
};

/**
 * Backward-compatible boolean view of the theme. The boolean is the *resolved*
 * dark state; toggling commits an explicit 'light'/'dark' choice (never 'system').
 */
const useDarkMode = (): [boolean, () => void] => {
  const [mode, setLocalMode] = useState<ThemeMode>(currentMode);

  useEffect(() => {
    modeListeners.add(setLocalMode);
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = (): void => {
      if (currentMode === 'system') setLocalMode('system');
    };
    mediaQuery.addEventListener('change', onSystemChange);
    return () => {
      modeListeners.delete(setLocalMode);
      mediaQuery.removeEventListener('change', onSystemChange);
    };
  }, []);

  const toggleDarkMode = (): void => {
    setMode(resolveIsDark(currentMode) ? 'light' : 'dark');
  };

  return [resolveIsDark(mode), toggleDarkMode];
};

export default useDarkMode;
