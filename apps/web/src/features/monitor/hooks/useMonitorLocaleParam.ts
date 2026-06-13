import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useAuthStore } from '../../../stores/authStore';

import type { MonitorLocale } from './useMonitor';

const PARAM = 'locale';

function isMonitorLocale(value: string | null): value is MonitorLocale {
  return value === 'de' || value === 'at';
}

/**
 * Monitor locale as URL state (`?locale=at`), defaulting from the auth
 * profile. The param is only present when it differs from the user's default,
 * so bare links stay clean. Works outside /monitor too (e.g. sections embedded
 * on the WorkplacePage): no param → profile default.
 */
export function useMonitorLocaleParam(): {
  locale: MonitorLocale;
  setLocale: (locale: MonitorLocale) => void;
  /** Append `?locale=` to an internal path when the locale is non-default. */
  withLocale: (pathname: string) => string;
} {
  const authLocale = useAuthStore((s) => s.locale);
  const defaultLocale: MonitorLocale = authLocale === 'de-AT' ? 'at' : 'de';
  const [searchParams, setSearchParams] = useSearchParams();

  const param = searchParams.get(PARAM);
  const locale = isMonitorLocale(param) ? param : defaultLocale;

  const setLocale = useCallback(
    (next: MonitorLocale) => {
      // Functional form so concurrent params (e.g. feed filters) are kept.
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next === defaultLocale) {
            params.delete(PARAM);
          } else {
            params.set(PARAM, next);
          }
          return params;
        },
        { replace: true }
      );
    },
    [defaultLocale, setSearchParams]
  );

  const withLocale = useCallback(
    (pathname: string) => (locale === defaultLocale ? pathname : `${pathname}?${PARAM}=${locale}`),
    [locale, defaultLocale]
  );

  return { locale, setLocale, withLocale };
}
