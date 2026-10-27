import { randomBytes } from 'crypto';

import { env } from '../config/env.js';

let cachedSecret: Uint8Array | null = null;

/**
 * Signing key of the short-lived tokens this API mints for its own clients:
 * the app login code (`routes/auth/appLogin.ts`, redeemed in
 * `plugins/mobileTokenExchange.ts`) and the WebView handoff token
 * (`plugins/webViewHandoff.ts`). The audiences keep the two kinds apart.
 *
 * In production a missing `SESSION_SECRET` is an error on first use — like
 * the dev-auth-bypass guard in `requireAuth` — rather than at boot: app login
 * and the handoff fail loudly, the rest of the API stays up.
 *
 * Elsewhere a missing secret becomes a random key per process, never a
 * constant: a constant would be public in this repository. Development runs
 * single-process (`server.ts`), so minting and redeeming see the same key; a
 * restart invalidates outstanding tokens, which live 60 seconds anyway.
 */
export function getAuthTokenSecret(): Uint8Array {
  if (cachedSecret) return cachedSecret;

  const secret = env.SESSION_SECRET;
  if (secret) {
    cachedSecret = new TextEncoder().encode(secret);
    return cachedSecret;
  }

  if (env.NODE_ENV === 'production') {
    throw new Error(
      'SESSION_SECRET must be set in production: app login codes and WebView handoff tokens are signed with it'
    );
  }

  cachedSecret = new Uint8Array(randomBytes(32));
  return cachedSecret;
}
