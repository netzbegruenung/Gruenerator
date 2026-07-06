/**
 * Per-user registry of external MCP servers (EXPERIMENTAL).
 *
 * Stores server records in the `mcp_servers` table; access tokens are encrypted
 * at rest with the shared credential helper (same scheme as Canva/WordPress).
 * The chat `mcp`-intent tool-loop reads {@link getConnectionConfigs} to connect
 * to a user's enabled servers; the settings UI drives the CRUD methods.
 *
 * v1 auth: `none` and `bearer` are wired end-to-end. `oauth` columns exist but
 * the interactive PKCE/DCR flow is out of scope — a stored token, if present,
 * is used as a bearer token.
 */

import { and, eq } from 'drizzle-orm';

import { mcp_servers, type McpServer } from '../../database/schema/mcpServers.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { createLogger } from '../../utils/logger.js';
import { decryptCredential, encryptCredential } from '../../utils/validation/encryption.js';

import { type McpConnectionConfig } from './UserMCPClient.js';

const log = createLogger('mcp-server-registry');

export type McpAuthType = 'none' | 'bearer' | 'oauth';

/** UI-facing record — never exposes decrypted tokens. */
export interface McpServerSummary {
  id: string;
  name: string;
  url: string;
  authType: McpAuthType;
  hasToken: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface McpServerCreateInput {
  name: string;
  url: string;
  authType: McpAuthType;
  token?: string | null;
}

export interface McpServerUpdateInput {
  name?: string;
  url?: string;
  authType?: McpAuthType;
  /** undefined = leave unchanged; null = clear; string = replace (re-encrypted). */
  token?: string | null;
  enabled?: boolean;
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

  /** Decrypted connection configs for the tool-loop. Skips disabled servers. */
  static async getConnectionConfigs(userId: string): Promise<McpConnectionConfig[]> {
    const db = getDrizzleInstance();
    const rows = await db
      .select()
      .from(mcp_servers)
      .where(and(eq(mcp_servers.user_id, userId), eq(mcp_servers.enabled, true)));
    return rows.map((row) => {
      let token: string | null = null;
      if (row.token_encrypted) {
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
    });
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
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error('Failed to insert MCP server');
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
    const rows = await db
      .update(mcp_servers)
      .set(values)
      .where(and(eq(mcp_servers.user_id, userId), eq(mcp_servers.id, id)))
      .returning();
    const row = rows[0];
    return row ? toSummary(row) : undefined;
  }

  static async delete(userId: string, id: string): Promise<boolean> {
    const db = getDrizzleInstance();
    const rows = await db
      .delete(mcp_servers)
      .where(and(eq(mcp_servers.user_id, userId), eq(mcp_servers.id, id)))
      .returning({ id: mcp_servers.id });
    return rows.length > 0;
  }
}

export default McpServerRegistry;
