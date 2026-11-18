/**
 * Dev auth bypass, second identity per browser tab.
 *
 * Set `sessionStorage['gr.devBypassUser']` to an id from the API's
 * `DEV_BYPASS_EXTRA_USERS` (e.g. Lena Hoffmann, `00000000-0000-4000-a000-0000000000b2`)
 * and reload: this tab then talks as that user while other tabs stay the default
 * dev user. Only active with `VITE_E2E_AUTH_BYPASS=true` on localhost; the API
 * ignores the header unless the bypass token is valid too.
 */
export const DEV_BYPASS_USER_STORAGE_KEY = 'gr.devBypassUser';

export function getDevBypassUserId(): string | null {
  if (import.meta.env.VITE_E2E_AUTH_BYPASS !== 'true') return null;
  if (typeof window === 'undefined') return null;
  if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname)) return null;
  try {
    return window.sessionStorage.getItem(DEV_BYPASS_USER_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}
