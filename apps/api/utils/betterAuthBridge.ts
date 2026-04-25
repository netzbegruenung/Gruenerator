/**
 * Bridge between Express and Better Auth's programmatic `auth.api.*` surface.
 *
 * Better Auth's `auth.api.<method>(...)` calls run the same code path as the
 * HTTP endpoints, which means they prepare Set-Cookie headers for state,
 * session, PKCE verifier, etc. When invoked with the default body-only
 * signature, those cookies are written onto a synthetic Response that we
 * never see — the browser gets no cookies and any follow-up OAuth/state
 * round-trip fails with `state_mismatch`.
 *
 * Canonical usage at every mutating call site:
 *
 *   const response = await auth.api.signInWithOAuth2({
 *     body: { providerId, callbackURL },
 *     headers: fromNodeHeaders(req.headers),
 *     asResponse: true,                       // <- mandatory
 *   });
 *   forwardBetterAuthCookies(res, response); // <- mandatory
 *   const { url } = (await response.json()) as { url?: string };
 *
 * Keeping this a thin utility (instead of a generic wrapper) preserves
 * Better Auth's per-endpoint body types at the call site.
 *
 * Pinned incident: commit fix/mobile-auth-cookie-forwarding — mobile OAuth
 * through `appLogin.ts` landed on the marketing homepage because
 * `__Secure-ba.state` was never emitted by `GET /api/auth/login`.
 */

import type { Response as ExpressResponse } from 'express';

export function forwardBetterAuthCookies(res: ExpressResponse, response: Response): void {
  for (const cookie of response.headers.getSetCookie()) {
    res.appendHeader('Set-Cookie', cookie);
  }
}
