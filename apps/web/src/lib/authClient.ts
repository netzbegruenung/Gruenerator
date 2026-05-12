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
 * We derive the origin from `window.location` (same-origin pattern, mirrors
 * the WS scheme rule) so dev (`http://localhost:3000`), test, and prod
 * (`https://gruenerator.eu`) all work without env wiring.
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
export const authClient = createAuthClient({
  baseURL: `${window.location.origin}/api/auth/v2`,
});
