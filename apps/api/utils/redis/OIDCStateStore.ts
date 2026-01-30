/**
 * OIDC State Store — Redis-backed fallback for privacy browsers
 *
 * Privacy browsers (Ecosia, Brave, etc.) block third-party cookies on
 * cross-origin redirects. When Keycloak redirects back, the session cookie
 * is missing and Express creates an empty session → "session_not_found".
 *
 * This module stores OIDC session data keyed by the cryptographic `state`
 * parameter in Redis. On callback, if the cookie is gone, we look up the
 * state in Redis instead. The state is consumed atomically (get + del)
 * to prevent replay.
 */

import client from './client.js';

import type { OIDCSessionData } from '../../config/keycloakOIDCStrategy.js';

const KEY_PREFIX = 'oidc:state:';
const TTL_SECONDS = 600; // 10 minutes — matches session staleness check

/**
 * Store OIDC session data in Redis, keyed by the state parameter.
 * Called after the session is saved in `initiateAuthorization()`.
 */
export async function storeOIDCState(state: string, data: OIDCSessionData): Promise<void> {
  await client.setEx(`${KEY_PREFIX}${state}`, TTL_SECONDS, JSON.stringify(data));
}

/**
 * Atomically retrieve and delete OIDC session data from Redis.
 * Returns `null` if the state was not found or already consumed.
 */
export async function consumeOIDCState(state: string): Promise<OIDCSessionData | null> {
  const key = `${KEY_PREFIX}${state}`;

  const results = await client.multi().get(key).del(key).exec();

  // node-redis multi().exec() returns untyped ReplyUnion — narrowing required
  const raw = results[0] as unknown as string | null;
  if (!raw) return null;

  return JSON.parse(raw) as OIDCSessionData;
}
