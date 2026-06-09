import { useState, useEffect } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'themePreference';
const LEGACY_DARKMODE_KEY = 'darkMode';
const LEGACY_THEME_KEY = 'theme';

// An explicit Light/Dark choice persists while the user keeps visiting — the
// timestamp is refreshed on every load (see the persist effect). Only after
// this much *inactivity* does it lapse back to `system` (which follows the OS).
const INACTIVITY_EXPIRY = 7 * 24 * 60 * 60 * 1000;

const prefersDark = (): boolean => window.matchMedia('(prefers-color-scheme: dark)').matches;

const isPreference = (v: unknown): v is ThemePreference =>
  v === 'light' || v === 'dark' || v === 'system';

// Reads the stored preference (and migrates older storage formats), applying the
// inactivity rule: an explicit choice older than INACTIVITY_EXPIRY falls back to
// `system`. `system` itself never expires — it is the fallback.
const readPreference = (): ThemePreference => {
  let value: ThemePreference | null = null;
  let timestamp = 0;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as { value?: unknown; timestamp?: unknown };
        if (isPreference(parsed.value)) {
          value = parsed.value;
          timestamp = typeof parsed.timestamp === 'number' ? parsed.timestamp : Date.now();
        }
      } catch {
        // Tolerate a bare-string value from an interim format.
        if (isPreference(stored)) {
          value = stored;
          timestamp = Date.now();
        }
      }
    }

    // Migrate the old timestamped `darkMode` JSON (honor its timestamp so an
    // already-stale choice expires immediately, per the inactivity rule).
    if (value === null) {
      const legacyDark = localStorage.getItem(LEGACY_DARKMODE_KEY);
      if (legacyDark) {
        try {
          const parsed = JSON.parse(legacyDark) as { value?: unknown; timestamp?: unknown };
          if (typeof parsed.value === 'boolean') {
            value = parsed.value ? 'dark' : 'light';
            timestamp = typeof parsed.timestamp === 'number' ? parsed.timestamp : Date.now();
          }
        } catch {
          // fall through to the next legacy key
        }
      }
    }

    // Migrate the original `theme` string key.
    if (value === null) {
      const legacyTheme = localStorage.getItem(LEGACY_THEME_KEY);
      if (legacyTheme === 'dark' || legacyTheme === 'light') {
        value = legacyTheme;
        timestamp = Date.now();
      }
    }
  } catch {
    // localStorage unavailable — fall back to following the OS.
    return 'system';
  }

  if (value === null || value === 'system') return 'system';
  if (Date.now() - timestamp >= INACTIVITY_EXPIRY) return 'system';
  return value;
};

const resolve = (preference: ThemePreference): boolean =>
  preference === 'system' ? prefersDark() : preference === 'dark';

// Shared across all hook instances so a change in one (e.g. the account menu)
// updates every other consumer in the same tab.
const listeners = new Set<(preference: ThemePreference) => void>();

const useDarkMode = (): [boolean, () => void, ThemePreference, () => void] => {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference);
  const [darkMode, setDarkMode] = useState<boolean>(() => resolve(preference));

  // Persist + apply whenever the preference changes, and broadcast to siblings.
  // Runs on mount too, so each visit refreshes the timestamp — that is what
  // resets the 7-day inactivity window for an explicit choice.
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ value: preference, timestamp: Date.now() })
      );
      localStorage.removeItem(LEGACY_DARKMODE_KEY);
      localStorage.removeItem(LEGACY_THEME_KEY);
    } catch {
      // ignore write failures (private mode etc.)
    }
    setDarkMode(resolve(preference));
    listeners.forEach((cb) => {
      if (cb !== setPreferenceState) cb(preference);
    });
  }, [preference]);

  // Keep this instance in sync with sibling instances and other tabs.
  useEffect(() => {
    listeners.add(setPreferenceState);
    const onStorage = (e: StorageEvent): void => {
      if (e.key !== STORAGE_KEY) return;
      setPreferenceState(readPreference());
    };
    window.addEventListener('storage', onStorage);
    return () => {
      listeners.delete(setPreferenceState);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  // Follow the OS live while in `system` mode.
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent): void => {
      setPreferenceState((current) => {
        if (current === 'system') setDarkMode(e.matches);
        return current;
      });
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Apply the resolved theme to <html>. color-scheme is handled in CSS via the
  // data-theme attribute (see variables.css).
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  // Binary toggle (used by ThemeToggleButton): flips to an explicit choice.
  const toggleDarkMode = (): void => {
    setPreferenceState(resolve(preference) ? 'light' : 'dark');
  };

  // Cycles Light → Dark → System → Light (used by the account-menu button).
  const cycleTheme = (): void => {
    setPreferenceState((current) =>
      current === 'light' ? 'dark' : current === 'dark' ? 'system' : 'light'
    );
  };

  return [darkMode, toggleDarkMode, preference, cycleTheme];
};

export default useDarkMode;
