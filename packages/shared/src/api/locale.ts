/**
 * The locale every API client advertises via `X-User-Locale`.
 *
 * The backend's `extractLocaleFromRequest` prefers `req.user.locale` and only
 * falls back to this header — but on routes without auth middleware the header
 * IS the answer. It therefore has to reflect the user's persisted preference,
 * not the browser's language list: an Austrian user on a German-language
 * browser was sending `de-DE` on every request, which is how AT reels ended up
 * with German subtitle styles.
 *
 * Module-level rather than a client option because the value changes at login
 * and in the settings, long after the clients are constructed. Callers set it
 * (authStore on login / locale change); `createApiClient` reads it per request.
 */
let currentLocale = 'de-DE';

export function setApiLocale(locale: string): void {
  currentLocale = locale;
}

export function getApiLocale(): string {
  return currentLocale;
}
