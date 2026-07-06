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
});

export const mcpServerErrorResponseSchema = z.object({
  error: z.string(),
});

export const mcpOauthStartResponseSchema = z.object({
  authorizationUrl: z.string(),
});

// ── Registry discovery ──────────────────────────────────────────────────────

export const mcpRegistryEntrySchema = z.object({
  name: z.string(),
  title: z.string(),
  description: z.string(),
  url: z.string(),
  websiteUrl: z.string().nullish(),
  authHint: z.enum(['none', 'bearer', 'oauth', 'unknown']),
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
});
