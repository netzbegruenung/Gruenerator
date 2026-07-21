/**
 * Per-user registry of external MCP servers (EXPERIMENTAL).
 *
 * Stores server records in the `mcp_servers` table; access tokens are encrypted
 * at rest with the shared credential helper (same scheme as Canva).
 * The chat `mcp`-intent tool-loop reads {@link getConnectionConfigs} to connect
 * to a user's enabled servers; the settings UI drives the CRUD methods.
 *
 * Auth: `none`, `bearer` and `oauth` are wired end-to-end; the interactive
 * OAuth (PKCE/DCR) flow lives in McpOAuthService, whose tokens this registry
 * lazy-refreshes in getConnectionConfigs.
 */

import { type McpServerSummary } from '@gruenerator/contracts';
import { and, eq } from 'drizzle-orm';

import { mcp_servers, type McpServer } from '../../database/schema/mcpServers.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { createLogger } from '../../utils/logger.js';
import { decryptCredential, encryptCredential } from '../../utils/validation/encryption.js';

import { findSeedByUrl } from './McpRegistryService.js';
import { type McpConnectionConfig, type McpToolDescriptor } from './UserMCPClient.js';

const log = createLogger('mcp-server-registry');

/** Cap the persisted snapshot so a chatty server can't bloat the row. */
const SNAPSHOT_MAX_TOOLS = 40;
const SNAPSHOT_DESC_CHARS = 200;

/** Enabled server as seen by the classifier — cheap, no live connect. */
export interface McpClassifierServer {
  id: string;
  name: string;
  description: string | null;
  toolNames: string[];
}

// getClassifierContext runs on every prose classification; a short TTL cache
// keeps it off the DB hot path without risking a stale server list.
const CLASSIFIER_CACHE_TTL_MS = 60_000;
const classifierCache = new Map<string, { at: number; data: McpClassifierServer[] }>();

export type McpAuthType = 'none' | 'bearer' | 'oauth';

// UI-facing record — never exposes decrypted tokens. Shape is the single source
// of truth in @gruenerator/contracts (mcpServerSummarySchema); re-exported here
// for the service's return types.
export type { McpServerSummary };

export interface McpServerCreateInput {
  name: string;
  url: string;
  authType: McpAuthType;
  token?: string | null;
  /** Pre-registered OAuth client (skips DCR). */
  oauthClientId?: string | null;
  oauthClientSecret?: string | null;
}

export interface McpServerUpdateInput {
  name?: string;
  url?: string;
  authType?: McpAuthType;
  /** undefined = leave unchanged; null = clear; string = replace (re-encrypted). */
  token?: string | null;
  enabled?: boolean;
  oauthClientId?: string | null;
  oauthClientSecret?: string | null;
}

function toSummary(row: McpServer): McpServerSummary {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    authType: row.auth_type,
    hasToken: !!row.token_encrypted,
    enabled: row.enabled,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    description: findSeedByUrl(row.url)?.description ?? null,
    toolNames: row.tools_snapshot?.map((t) => t.name) ?? null,
  };
}

export class McpServerRegistry {
  /** All of a user's servers (enabled + disabled) for the settings UI. */
  static async list(userId: string): Promise<McpServerSummary[]> {
    const db = getDrizzleInstance();
    const rows = await db.select().from(mcp_servers).where(eq(mcp_servers.user_id, userId));
    return rows.map(toSummary);
  }

  /** Count of enabled servers — used to gate the `mcp` intent per user. */
  static async countEnabled(userId: string): Promise<number> {
    const db = getDrizzleInstance();
    const rows = await db
      .select({ id: mcp_servers.id })
      .from(mcp_servers)
      .where(and(eq(mcp_servers.user_id, userId), eq(mcp_servers.enabled, true)));
    return rows.length;
  }

  /**
   * Decrypted connection configs for the tool-loop. Skips disabled servers.
   * Pass `serverId` to scope to a single server (a `@notion`/`@brevo` mention or
   * a classifier hint) — this also limits the OAuth lazy-refresh to that server.
   */
  static async getConnectionConfigs(
    userId: string,
    opts?: { serverId?: string }
  ): Promise<McpConnectionConfig[]> {
    const db = getDrizzleInstance();
    const where = opts?.serverId
      ? and(
          eq(mcp_servers.user_id, userId),
          eq(mcp_servers.enabled, true),
          eq(mcp_servers.id, opts.serverId)
        )
      : and(eq(mcp_servers.user_id, userId), eq(mcp_servers.enabled, true));
    const rows = await db.select().from(mcp_servers).where(where);
    return Promise.all(
      rows.map(async (row) => {
        let token: string | null = null;
        if (row.auth_type === 'oauth') {
          // Lazy-refresh a valid access token (McpOAuthService owns the crypto +
          // refresh lock). Imported lazily to avoid a module cycle.
          const { McpOAuthService } = await import('./McpOAuthService.js');
          token = await McpOAuthService.getValidAccessToken(userId, row.id).catch(() => null);
        } else if (row.token_encrypted) {
          try {
            token = decryptCredential(row.token_encrypted);
          } catch (err) {
            log.warn('Failed to decrypt MCP token; connecting without auth', {
              server: row.name,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
        return { id: row.id, name: row.name, url: row.url, authType: row.auth_type, token };
      })
    );
  }

  /**
   * Persist the tool list from a successful connect (best-effort — never throws).
   * Used only for mention hints + classifier context; the loop always lists live.
   */
  static async saveToolsSnapshot(
    userId: string,
    serverId: string,
    tools: McpToolDescriptor[]
  ): Promise<void> {
    try {
      const snapshot = tools.slice(0, SNAPSHOT_MAX_TOOLS).map((t) => ({
        name: t.name,
        description: (t.description ?? '').slice(0, SNAPSHOT_DESC_CHARS),
      }));
      const db = getDrizzleInstance();
      await db
        .update(mcp_servers)
        .set({ tools_snapshot: snapshot, tools_snapshot_at: new Date() })
        .where(and(eq(mcp_servers.user_id, userId), eq(mcp_servers.id, serverId)));
      // No classifierCache invalidation here: prose routing matches on server
      // NAMES, not tool names, so a refreshed snapshot can't change routing.
      // Busting it on every tool-loop turn would defeat the 60s TTL.
    } catch (err) {
      log.warn('Failed to persist MCP tools snapshot', {
        serverId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Enabled servers with a description + cached tool names, for the classifier's
   * conservative prose routing. Short-TTL cached per user to stay off the DB hot
   * path (the classifier runs on every message).
   */
  static async getClassifierContext(userId: string): Promise<McpClassifierServer[]> {
    const cached = classifierCache.get(userId);
    if (cached && Date.now() - cached.at < CLASSIFIER_CACHE_TTL_MS) return cached.data;
    const db = getDrizzleInstance();
    const rows = await db
      .select({
        id: mcp_servers.id,
        name: mcp_servers.name,
        url: mcp_servers.url,
        tools_snapshot: mcp_servers.tools_snapshot,
      })
      .from(mcp_servers)
      .where(and(eq(mcp_servers.user_id, userId), eq(mcp_servers.enabled, true)));
    const data: McpClassifierServer[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: findSeedByUrl(row.url)?.description ?? null,
      toolNames: row.tools_snapshot?.map((t) => t.name) ?? [],
    }));
    classifierCache.set(userId, { at: Date.now(), data });
    return data;
  }

  static async create(userId: string, input: McpServerCreateInput): Promise<McpServerSummary> {
    const db = getDrizzleInstance();
    const rows = await db
      .insert(mcp_servers)
      .values({
        user_id: userId,
        name: input.name,
        url: input.url,
        auth_type: input.authType,
        token_encrypted: input.token ? encryptCredential(input.token) : null,
        // Pre-registered OAuth client → store id in oauth_meta, secret encrypted.
        ...(input.oauthClientId
          ? { oauth_meta: { clientId: input.oauthClientId, scheme: 'pre_registration' as const } }
          : {}),
        ...(input.oauthClientSecret
          ? { oauth_client_secret_encrypted: encryptCredential(input.oauthClientSecret) }
          : {}),
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error('Failed to insert MCP server');
    classifierCache.delete(userId);
    log.info('MCP server created', { userId, server: row.name });
    return toSummary(row);
  }

  static async update(
    userId: string,
    id: string,
    patch: McpServerUpdateInput
  ): Promise<McpServerSummary | undefined> {
    const db = getDrizzleInstance();
    const values: Partial<typeof mcp_servers.$inferInsert> = { updated_at: new Date() };
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.url !== undefined) values.url = patch.url;
    if (patch.authType !== undefined) values.auth_type = patch.authType;
    if (patch.enabled !== undefined) values.enabled = patch.enabled;
    if (patch.token !== undefined) {
      values.token_encrypted = patch.token ? encryptCredential(patch.token) : null;
    }
    if (patch.oauthClientId !== undefined) {
      values.oauth_meta = patch.oauthClientId
        ? { clientId: patch.oauthClientId, scheme: 'pre_registration' }
        : null;
    }
    if (patch.oauthClientSecret !== undefined) {
      values.oauth_client_secret_encrypted = patch.oauthClientSecret
        ? encryptCredential(patch.oauthClientSecret)
        : null;
    }
    const rows = await db
      .update(mcp_servers)
      .set(values)
      .where(and(eq(mcp_servers.user_id, userId), eq(mcp_servers.id, id)))
      .returning();
    const row = rows[0];
    classifierCache.delete(userId);
    return row ? toSummary(row) : undefined;
  }

  static async delete(userId: string, id: string): Promise<boolean> {
    const db = getDrizzleInstance();
    const rows = await db
      .delete(mcp_servers)
      .where(and(eq(mcp_servers.user_id, userId), eq(mcp_servers.id, id)))
      .returning({ id: mcp_servers.id });
    classifierCache.delete(userId);
    return rows.length > 0;
  }
}

export default McpServerRegistry;
