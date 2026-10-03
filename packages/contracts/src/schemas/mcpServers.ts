/**
 * Zod schemas for /api/mcp/servers (EXPERIMENTAL).
 * Mirrors apps/api/services/mcp/McpServerRegistry.ts.
 */
import { z } from 'zod';

export const mcpAuthTypeSchema = z.enum(['none', 'bearer', 'oauth']);
export type McpAuthType = z.infer<typeof mcpAuthTypeSchema>;

// ── Shared record (never carries the decrypted token) ───────────────────────

export const mcpServerSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  authType: mcpAuthTypeSchema,
  hasToken: z.boolean(),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  // Enriched from the curated registry seed matching the URL host; drives the
  // chat mention picker's description line. Null for uncurated custom servers.
  description: z.string().nullish(),
  // Cached tool names from the last successful connect (tools_snapshot); powers
  // the composer mention hint and the classifier's server context.
  toolNames: z.array(z.string()).nullish(),
  // A first-party MANAGED connector: offered to every user, on by default, no
  // per-user record. Only `enabled` is changeable — no rename, no URL, no
  // token, no delete; `url` comes back EMPTY because the endpoint is
  // deploy-env-only. Optional rather than defaulted so a client shipped before
  // this field simply ignores it (see `sse-gate-drops-whole-event`: wire schemas
  // are parsed by binaries we can no longer update).
  managed: z.boolean().optional(),
  // Tool definitions that drifted since the user approved the server, waiting
  // for "Werkzeuge freigeben". `changed` blocks the whole server, `added` only
  // withholds the new tools. Null/absent = nothing pending.
  toolsDrift: z.object({ changed: z.array(z.string()), added: z.array(z.string()) }).nullish(),
});
export type McpServerSummary = z.infer<typeof mcpServerSummarySchema>;

// ── Request bodies ──────────────────────────────────────────────────────────

export const mcpServerCreateBodySchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  authType: mcpAuthTypeSchema.default('none'),
  token: z.string().min(1).max(4096).nullish(),
  // Optional pre-registered OAuth client (for providers that reject dynamic
  // registration, e.g. Canva/Atlassian). Leave empty to use DCR.
  oauthClientId: z.string().min(1).max(512).nullish(),
  oauthClientSecret: z.string().min(1).max(4096).nullish(),
});

export const mcpServerUpdateBodySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().optional(),
  authType: mcpAuthTypeSchema.optional(),
  token: z.string().min(1).max(4096).nullish(),
  enabled: z.boolean().optional(),
  oauthClientId: z.string().min(1).max(512).nullish(),
  oauthClientSecret: z.string().min(1).max(4096).nullish(),
});

// ── Response schemas ────────────────────────────────────────────────────────

export const mcpServerListResponseSchema = z.object({
  servers: z.array(mcpServerSummarySchema),
});

export const mcpServerResponseSchema = z.object({
  server: mcpServerSummarySchema,
});

export const mcpServerDeleteResponseSchema = z.object({
  success: z.literal(true),
});

export const mcpServerTestResponseSchema = z.object({
  ok: z.boolean(),
  toolCount: z.number(),
  toolNames: z.array(z.string()),
  error: z.string().nullable(),
  // Diagnostics, all additive: "connected, but zero tools" is indistinguishable
  // from "everything is fine" without them, and that is exactly the report we
  // could not debug. Optional so older clients keep parsing the response.
  transport: z.enum(['http', 'sse']).nullish(),
  protocolVersion: z.string().nullish(),
  /** Entries the server returned that carried no usable name. */
  skippedTools: z.number().nullish(),
  /** Tools cut off at our cap — gezählt, damit sie nicht still verschwinden. */
  truncatedTools: z.number().nullish(),
  /**
   * Klassifikation dessen, was zu sagen ist — auch bei `ok: true` (ein
   * erreichbarer Server ohne Werkzeuge ist kein Fehler und trotzdem kein
   * Erfolg). Absent, wenn alles glatt lief.
   */
  reasonCode: z.string().nullish(),
  /** Der konkrete Handgriff zur Meldung, falls es einen gibt. */
  hint: z.string().nullish(),
});
export type McpServerTestResult = z.infer<typeof mcpServerTestResponseSchema>;

// ── Grant card for drifted tools ────────────────────────────────────────────

/**
 * How the person answered a grant card: deny = switch the tools off,
 * session = only this conversation, always = approve server-wide. Same three
 * scopes as assistant-ui's PermissionGrant.
 */
export const mcpToolGrantScopeSchema = z.enum(['denied', 'session', 'always']);
export type McpToolGrantScope = z.infer<typeof mcpToolGrantScopeSchema>;

/**
 * Drifted tools of one server that wait for a decision in a thread (raw tool
 * names). Streamed as `mcp_tool_grant` and persisted as message metadata
 * `toolGrants[]`; `resolved` is set once the card was answered.
 */
export const mcpToolGrantSchema = z.object({
  serverId: z.string(),
  serverName: z.string(),
  added: z.array(z.string()),
  changed: z.array(z.string()),
  /** The thread the card belongs to — the answer is scoped to it. */
  threadId: z.string().nullish(),
  resolved: mcpToolGrantScopeSchema.nullish(),
});
export type McpToolGrant = z.infer<typeof mcpToolGrantSchema>;

export const mcpToolGrantBodySchema = z.object({
  scope: mcpToolGrantScopeSchema,
  threadId: z.string().min(1).max(100),
  tools: z.array(z.string().min(1).max(200)).min(1).max(100),
});

export const mcpToolGrantResponseSchema = z.object({
  resolved: mcpToolGrantScopeSchema,
});

export const mcpServerErrorResponseSchema = z.object({
  error: z.string(),
  // Machine-readable OAuth failure class so the UI can react (e.g. open the
  // manual-registration form on dcr_rejected) instead of string-matching.
  code: z.enum(['dcr_rejected', 'no_oauth_support']).optional(),
});

export const mcpOauthStartResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('authorize'), authorizationUrl: z.string() }),
  // Discovery found no OAuth but the server accepts unauthenticated connects —
  // the backend flipped it to authType 'none'; nothing left to authorize.
  z.object({ status: z.literal('no_auth_required') }),
]);
export type McpOauthStartResult = z.infer<typeof mcpOauthStartResponseSchema>;

// ── Registry discovery ──────────────────────────────────────────────────────

export const mcpRegistryEntrySchema = z.object({
  name: z.string(),
  title: z.string(),
  description: z.string(),
  url: z.string(),
  websiteUrl: z.string().nullish(),
  authHint: z.enum(['none', 'bearer', 'oauth', 'unknown']),
  // Every way this connector accepts, preferred first (`authOptions[0]` equals
  // `authHint`). Lets the UI offer "Stattdessen API-Key verwenden" where a
  // provider takes both. Absent for registry results, where nothing is known.
  authOptions: z.array(mcpAuthTypeSchema).optional(),
  // Provider page where the user creates an API key for the bearer path.
  keyUrl: z.string().optional(),
  recommended: z.boolean(),
  // Directory grouping for the category filter pills (e.g. "Produktivität").
  category: z.string().optional(),
  // Provider rejects dynamic client registration → user must create an app and
  // paste Client-ID/Secret (with our redirect URI). `setupUrl` links that console.
  requiresManualRegistration: z.boolean().optional(),
  setupUrl: z.string().nullish(),
});
export type McpRegistryEntry = z.infer<typeof mcpRegistryEntrySchema>;

export const mcpRegistryResponseSchema = z.object({
  recommended: z.array(mcpRegistryEntrySchema),
  servers: z.array(mcpRegistryEntrySchema),
  nextCursor: z.string().nullable(),
  // The redirect URI the backend registers — what a user enters when creating
  // an OAuth app by hand. Taken from BASE_URL, not the browser's origin.
  oauthRedirectUri: z.string().nullable().optional(),
});
export type McpRegistryResponse = z.infer<typeof mcpRegistryResponseSchema>;
