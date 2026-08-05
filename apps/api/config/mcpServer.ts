import { env } from './env.js';

// Shared config for the authenticated MCP server (routes/mcp-server) and its
// OAuth authorization server (Better Auth `mcp` plugin in betterAuth.ts).

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

/**
 * Modellzugriff über `/api/v1/chat/completions` (Excel-Add-in).
 *
 * Bewusst **nicht** in `MCP_SCOPES`: dort stehen die Rechte des MCP-Servers,
 * und `assertScope` prüft dieselbe Liste. Ein Eintrag dort hiesse, dass jeder
 * MCP-Client nebenbei Modellzugriff bekommt.
 */
export const CHAT_COMPLETIONS_SCOPE = 'chat:completions';

const OAUTH_BASE_SCOPES = ['openid', 'profile', 'email', 'offline_access'];

/** Was der Autorisierungsserver überhaupt ausstellen darf. */
export const MCP_OAUTH_SCOPES_SUPPORTED = [
  ...OAUTH_BASE_SCOPES,
  ...MCP_SCOPES,
  CHAT_COMPLETIONS_SCOPE,
];

/**
 * Clients that send no `scope` param (claude.ai often omits it) get everything.
 *
 * `chat:completions` steht hier absichtlich **nicht** drin: „ohne Angabe alles"
 * würde sonst jedem MCP-Konnektor Modellzugriff mitgeben, den niemand
 * angefordert hat. Das Add-in fragt den Scope ausdrücklich an.
 */
export const MCP_DEFAULT_SCOPE = [...OAUTH_BASE_SCOPES, ...MCP_SCOPES].join(' ');

/**
 * Public URL of the MCP endpoint — the OAuth "resource".
 *
 * Die Wurzel, nicht mehr `/v2`: es gibt nur noch einen Grünerator-MCP. `/v2` und
 * `/mcp` bleiben in nginx als dauerhafte Aliasse bestehen (URLs sind F0), aber
 * die Adresse, die der Server von sich selbst nennt, ist die kanonische.
 *
 * **Das entwertet bestehende Client-Registrierungen einmalig:** der
 * Discovery-Pfad leitet sich hieraus ab und faellt damit von
 * `/.well-known/oauth-protected-resource/v2` auf den nackten Pfad zurueck.
 * claude.ai und ChatGPT muessen den Konnektor einmal neu verbinden.
 */
export const MCP_RESOURCE_URL = env.MCP_SERVER_PUBLIC_URL ?? 'https://mcp.gruenerator.eu';

/** OAuth login/consent redirects AND absolutized tool-result links must point
 *  at the same SPA origin; in dev the SPA runs on its own port. */
export const APP_BASE_URL = (
  env.WEB_BASE_URL ??
  (env.NODE_ENV === 'development' ? 'http://localhost:3000' : `https://${env.PRIMARY_DOMAIN}`)
).replace(/\/$/, '');

export const MCP_LOGIN_PAGE = `${APP_BASE_URL}/login`;
export const MCP_CONSENT_PAGE = `${APP_BASE_URL}/oauth/consent`;
