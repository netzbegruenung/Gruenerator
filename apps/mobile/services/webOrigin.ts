/**
 * The web app's origin, and how to resolve the URLs the API hands us against it.
 *
 * The API mints thumbnail and media URLs origin-relative on purpose — see
 * `apps/api/services/media/thumbnailUrl.ts`: "Resolving against the API origin
 * is the client's job." On the web that job is done by the browser. Native has
 * no base origin, so `<Image source={{ uri: '/api/thumbs/…' }}>` loads nothing
 * and, because the field is set, the placeholder branch never runs either — the
 * card just stays blank.
 *
 * One helper rather than the per-screen `startsWith('http')` ternary this
 * replaces: two screens had it, a third did not, and the third is the one whose
 * canvas tiles were empty.
 *
 * Zugleich die Quelle fuer Links, die die App nach aussen gibt (Teilen, Verlauf,
 * `Linking.openURL`). Diese Herkunft ist NICHT `EXPO_PUBLIC_API_URL`: die
 * Variable schliesst `/api` ein und zeigt lokal auf eine Emulator-Adresse — ein
 * Teilen-Link daraus war unter `…/api/notebooks/…` und ausserhalb des Emulators
 * gar nicht aufloesbar (#2841). Bewusst ein Literal ohne Env-Schalter: ein
 * geteilter Link ist fuer jemand anderen, also immer die Produktions-Herkunft.
 * `services/apiBaseConvention.vitest.ts` bewacht die Trennung.
 */
export const WEB_ORIGIN = 'https://gruenerator.eu';

/**
 * Absolute URL for something the API returned. Absolute inputs (and `data:` /
 * `file:` URIs) pass through untouched.
 */
export function resolveWebUrl(url: string): string;
export function resolveWebUrl(url: string | null | undefined): string | undefined;
export function resolveWebUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url;
  return url.startsWith('/') ? `${WEB_ORIGIN}${url}` : `${WEB_ORIGIN}/${url}`;
}
