/**
 * One-time PKCE/OAuth state for MCP server authorization (Redis).
 *
 * Mirrors the Canva OAuth state store. The `startAuthorization` step returns a
 * PKCE `codeVerifier` that the callback needs; we park it (plus which user/server
 * and the resolved authorization server) under an opaque single-use `state` key
 * with a short TTL. `getDel` guarantees single-use so replay is impossible, and
 * identity comes from the state (not a cookie) so the cross-site callback works.
 */

import crypto from 'node:crypto';

import { createLogger } from '../../utils/logger.js';
import { ensureConnected, redisClient } from '../../utils/redis/client.js';

const log = createLogger('mcp-oauth-state');

const STATE_TTL_SECONDS = 600; // 10 min — covers the provider consent screen

export interface McpOAuthState {
  userId: string;
  serverId: string;
  codeVerifier: string;
  authorizationServerUrl: string;
  createdAt: number;
}

function key(state: string): string {
  return `oauth:mcp:pkce:${state}`;
}

function base64Url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Opaque, single-use state token embedded in the authorize URL. */
export function generateState(): string {
  return base64Url(crypto.randomBytes(24));
}

export async function saveOAuthState(
  state: string,
  payload: Omit<McpOAuthState, 'createdAt'>
): Promise<void> {
  await ensureConnected();
  const value: McpOAuthState = { ...payload, createdAt: Date.now() };
  await redisClient.setEx(key(state), STATE_TTL_SECONDS, JSON.stringify(value));
  log.debug('Stored MCP OAuth state', { userId: payload.userId, serverId: payload.serverId });
}

/** Retrieve-and-delete (one-time). Returns null if unknown/expired/used. */
export async function consumeOAuthState(state: string): Promise<McpOAuthState | null> {
  await ensureConnected();
  const raw = await redisClient.getDel(key(state));
  if (!raw || typeof raw !== 'string') {
    log.warn('MCP OAuth state not found / already used');
    return null;
  }
  return JSON.parse(raw) as McpOAuthState;
}
