import { createAuthClient } from 'better-auth/react';

/**
 * Better Auth React client. Mounted against the native handler at
 * `/api/auth/v2/*`. Replaces the previous `/api/auth/status` wrapper:
 * `authClient.getSession()` hits `GET /api/auth/v2/get-session` directly,
 * removing the hand-rolled Express endpoint as a translation layer.
 *
 * Cookies travel automatically (same-origin). The bearer-token path used
 * by mobile/desktop continues to work through the native handler — they
 * already point at `/api/auth/v2/*`.
 *
 * **`baseURL` must be absolute.** `createAuthClient` runs `new URL(baseURL)`
 * at construction time, which throws on a bare path like `/api/auth/v2`.
 * Compose against the same `VITE_API_BASE_URL` the rest of the app uses
 * (Salt sets it to `https://{domain}/api` in test/prod); fall back to
 * `'/api'` in dev where it's unset. `new URL(input, base)` resolves the
 * relative dev case against `window.location.origin` and respects the
 * already-absolute prod value — same trick the browser uses for `<a href>`.
 *
 * Shape note: the response shape from `authClient.getSession()` is
 * Better Auth's native `Session` (camelCase `name`/`image`/`emailVerified`
 * mapped from our `display_name`/`avatar_url`/`email_verified` columns,
 * plus snake_case `additionalFields` returned as-is). The canonical
 * frontend `UserProfile` is snake_case throughout, so call sites pass the
 * raw session.user through `sessionUserToProfile()` (see
 * `./sessionUserToProfile.ts`) which mirrors the server's
 * `toBetterAuthUser()` null-strip + Zod-parse boundary.
 */
const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';

export const authClient = createAuthClient({
  baseURL: new URL(`${apiBase}/auth/v2`, window.location.origin).toString(),
});
