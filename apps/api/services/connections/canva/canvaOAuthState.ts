/**
 * Canva OAuth PKCE state (Redis)
 *
 * The Canva Connect API requires PKCE. We generate a code_verifier when the
 * user starts the flow, hand Canva the derived code_challenge, and must hand
 * the verifier back at the token-exchange step. The verifier (plus the user it
 * belongs to) is parked in Redis under a one-time `state` key with a short TTL.
 */

import crypto from 'node:crypto';

import { createLogger } from '../../../utils/logger.js';
import { ensureConnected, redisClient } from '../../../utils/redis/client.js';

const log = createLogger('canva-oauth');

const STATE_TTL_SECONDS = 600; // 10 minutes — covers the user completing Canva's consent screen

interface CanvaOAuthState {
  userId: string;
  codeVerifier: string;
  createdAt: number;
}

function key(state: string): string {
  return `oauth:canva:pkce:${state}`;
}

function base64Url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface PkceChallenge {
  state: string;
  codeChallenge: string;
}

/**
 * Generate a PKCE verifier/challenge pair + opaque state, and persist the
 * verifier (bound to userId) for the later callback.
 */
export async function createPkceState(userId: string): Promise<PkceChallenge> {
  const codeVerifier = base64Url(crypto.randomBytes(64)); // 86 chars, within the 43–128 spec range
  const codeChallenge = base64Url(crypto.createHash('sha256').update(codeVerifier).digest());
  const state = base64Url(crypto.randomBytes(24));

  const payload: CanvaOAuthState = { userId, codeVerifier, createdAt: Date.now() };

  await ensureConnected();
  await redisClient.setEx(key(state), STATE_TTL_SECONDS, JSON.stringify(payload));

  log.debug('Stored Canva PKCE state', { userId, statePrefix: state.slice(0, 8) });

  return { state, codeChallenge };
}

/**
 * Retrieve-and-delete the verifier for a state (one-time use). Returns null if
 * the state is unknown or expired.
 */
export async function consumePkceState(state: string): Promise<CanvaOAuthState | null> {
  await ensureConnected();
  const raw = await redisClient.getDel(key(state));
  if (!raw || typeof raw !== 'string') {
    log.warn('Canva PKCE state not found / already used', { statePrefix: state.slice(0, 8) });
    return null;
  }
  return JSON.parse(raw) as CanvaOAuthState;
}
