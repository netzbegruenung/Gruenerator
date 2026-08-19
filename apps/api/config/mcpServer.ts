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
 * Was ein dynamisch registrierter Client (RFC 7591) an Rechten bekommt — und
 * damit zugleich seine Obergrenze: `/oauth2/authorize` prüft gegen
 * `client.scopes ?? opts.scopes` und setzt dieselbe Liste ein, wenn der Client
 * gar keinen `scope` schickt (claude.ai lässt ihn oft weg).
 *
 * `chat:completions` steht hier absichtlich **nicht** drin: „ohne Angabe alles"
 * würde sonst jedem MCP-Konnektor Modellzugriff mitgeben, den niemand
 * angefordert hat. Das Add-in fragt den Scope ausdrücklich an.
 *
 * **Bekannter offener Punkt (19.08.2026), nicht gemessen.** Ob das Excel-Add-in
 * seinen Client dynamisch registriert oder verwaltet angelegt bekommt, ist im
 * Code nicht ablesbar. Registriert es dynamisch, kann es `chat:completions`
 * nach dem Umstieg nicht mehr anfordern: `/oauth2/authorize` prüft gegen
 * `client.scopes`, und für DCR-Clients speichert better-auth 1.7 immer die
 * Vereinigung aus `clientRegistrationDefaultScopes` und
 * `clientRegistrationAllowedScopes` — „nur das Add-in bekommt den Zusatz"
 * lässt sich über die DCR-Optionen also nicht mehr ausdrücken. Symptom wäre
 * ein `invalid_scope` beim Verbinden des Add-ins; Abhilfe ein verwaltet
 * angelegter Client mit dem Scope in seiner eigenen Zeile. Nachzusehen an den
 * registrierten Clients in `ba_oauth_clients` auf Prod.
 */
export const MCP_CLIENT_REGISTRATION_SCOPES = [...OAUTH_BASE_SCOPES, ...MCP_SCOPES];

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
