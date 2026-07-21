import { env } from './env.js';

/**
 * Shared config for the authenticated MCP server (routes/mcp-server) and its
 * OAuth authorization server (Better Auth `mcp` plugin in betterAuth.ts).
 */

export const MCP_SCOPES = [
  'search',
  'content:read',
  'content:write',
  'groups:read',
  'groups:write',
  'media:read',
  'media:write',
] as const;

export type McpScope = (typeof MCP_SCOPES)[number];

export const MCP_OAUTH_SCOPES_SUPPORTED = [
  'openid',
  'profile',
  'email',
  'offline_access',
  ...MCP_SCOPES,
];

/** Clients that send no `scope` param (claude.ai often omits it) get everything. */
export const MCP_DEFAULT_SCOPE = MCP_OAUTH_SCOPES_SUPPORTED.join(' ');

/** Public URL of the MCP endpoint — the OAuth "resource". */
export const MCP_RESOURCE_URL = env.MCP_SERVER_PUBLIC_URL ?? 'https://mcp.gruenerator.eu/v2';

/**
 * Single definition of "where the web SPA lives" for this feature: OAuth
 * login/consent redirects AND absolutized tool-result links must point at the
 * same origin. Dev: the SPA runs on its own port.
 */
export const APP_BASE_URL = (
  env.WEB_BASE_URL ??
  (env.NODE_ENV === 'development' ? 'http://localhost:3000' : `https://${env.PRIMARY_DOMAIN}`)
).replace(/\/$/, '');

export const MCP_LOGIN_PAGE = `${APP_BASE_URL}/login`;
export const MCP_CONSENT_PAGE = `${APP_BASE_URL}/oauth/consent`;
