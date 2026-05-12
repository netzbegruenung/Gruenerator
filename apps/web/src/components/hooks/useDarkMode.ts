import { useState, useEffect } from 'react';

const STORAGE_KEY = 'darkMode';
const LEGACY_KEY = 'theme';
const USER_PREFERENCE_EXPIRY = 7 * 24 * 60 * 60 * 1000;

const readSavedPreference = (): boolean | null => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const { value, timestamp } = JSON.parse(saved) as { value: boolean; timestamp: number };
      if (Date.now() - timestamp < USER_PREFERENCE_EXPIRY) {
        return value;
      }
    } catch {
      // fall through to legacy key
    }
  }
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (legacy === 'dark' || legacy === 'light') {
    return legacy === 'dark';
  }
  return null;
};

const getInitialDarkMode = (): boolean => {
  const saved = readSavedPreference();
  if (saved !== null) return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

const listeners = new Set<(value: boolean) => void>();

const useDarkMode = (): [boolean, () => void] => {
  const [darkMode, setDarkMode] = useState<boolean>(getInitialDarkMode);

  useEffect(() => {
    listeners.add(setDarkMode);
    const onStorage = (e: StorageEvent): void => {
      if (e.key !== STORAGE_KEY && e.key !== LEGACY_KEY) return;
      const next = readSavedPreference();
      if (next !== null) setDarkMode(next);
    };
    window.addEventListener('storage', onStorage);
    return () => {
      listeners.delete(setDarkMode);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent): void => {
      if (readSavedPreference() === null) {
        setDarkMode(e.matches);
      }
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ value: darkMode, timestamp: Date.now() })
    );
    localStorage.removeItem(LEGACY_KEY);
    listeners.forEach((cb) => {
      if (cb !== setDarkMode) cb(darkMode);
    });
  }, [darkMode]);

  const toggleDarkMode = (): void => {
    setDarkMode((prev) => !prev);
  };

  return [darkMode, toggleDarkMode];
};

export default useDarkMode;
