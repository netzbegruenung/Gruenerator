import { useState, useEffect } from 'react';

type ColorScheme = 'light' | 'dark';

function getSystemScheme(): ColorScheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getActiveScheme(): ColorScheme {
  const explicit = document.documentElement.dataset.theme;
  if (explicit === 'dark' || explicit === 'light') return explicit;
  return getSystemScheme();
}

export function useColorScheme(): ColorScheme {
  const [scheme, setScheme] = useState<ColorScheme>(getActiveScheme);

  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');

    const syncFromSystem = () => {
      const next = getActiveScheme();
      setScheme(next);
      document.documentElement.dataset.theme = next;
    };

    // Set data-theme on mount so [data-theme="dark"] CSS selectors activate
    document.documentElement.dataset.theme = getActiveScheme();

    mql.addEventListener('change', syncFromSystem);

    // Observe data-theme attribute changes (e.g. from a manual toggle)
    const observer = new MutationObserver(() => {
      setScheme(getActiveScheme());
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => {
      mql.removeEventListener('change', syncFromSystem);
      observer.disconnect();
    };
  }, []);

  return scheme;
}
