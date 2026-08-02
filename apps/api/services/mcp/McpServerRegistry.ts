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
 *
 * MANAGED CONNECTORS are unioned in on read. They are first-party servers
 * configured from env (`systemMcpServers.ts`) with no `mcp_servers` row: every
 * user gets them, enabled unless they opted out in `mcp_system_prefs`. They are
 * READ-ONLY here — no create, no delete, no URL/token edit — because there is no
 * per-user record to change, only a switch.
 */

import { type McpServerSummary } from '@gruenerator/contracts';
import { and, eq } from 'drizzle-orm';

import { mcp_servers, type McpServer } from '../../database/schema/mcpServers.js';
import { mcp_system_prefs } from '../../database/schema/mcpSystemPrefs.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { createLogger } from '../../utils/logger.js';
import { decryptCredential, encryptCredential } from '../../utils/validation/encryption.js';

import { findSeedByUrl } from './McpRegistryService.js';
import {
  getManagedConnectorById,
  getManagedConnectors,
  parseManagedConnectorId,
  type ManagedConnector,
} from './systemMcpServers.js';
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

/**
 * A managed connector as the settings UI sees it.
 *
 * `url` is deliberately EMPTY: the endpoint is deploy-env-only and must not
 * reach any API response (see systemMcpServers.ts). Everything the UI needs to
 * render a managed row — title, description, switch — comes from the definition,
 * and there is nothing behind the URL for the user to edit anyway.
 *
 * `createdAt`/`updatedAt` carry the opt-out row's timestamp when there is one;
 * a connector nobody ever toggled has no row and reports the epoch. They exist
 * only to satisfy the shared summary shape — no UI sorts managed rows by date.
 */
function managedToSummary(connector: ManagedConnector, enabled: boolean, updatedAt: Date | null) {
  const ts = (updatedAt ?? new Date(0)).toISOString();
  return {
    id: connector.id,
    name: connector.connector.title,
    url: '',
    authType: connector.authType,
    hasToken: !!connector.token,
    enabled,
    createdAt: ts,
    updatedAt: ts,
    description: connector.connector.description,
    toolNames: connector.toolAllowlist,
    managed: true as const,
  } satisfies McpServerSummary;
}

/**
 * Managed connector → loop connection config. No decryption and no OAuth
 * refresh: the shared bearer comes straight from env. `managed: true` tells the
 * catalog there is no row behind this id (no snapshot write, no fingerprint
 * baseline, no rug-pull check).
 */
function toManagedConfig(connector: ManagedConnector): McpConnectionConfig {
  return {
    id: connector.id,
    name: connector.connector.title,
    url: connector.url,
    authType: connector.authType,
    token: connector.token,
    managed: true,
  };
}

/** `system_key` → opt-out row, for one user. Absent key = default (enabled). */
async function loadSystemPrefs(
  userId: string
): Promise<Map<string, { enabled: boolean; updatedAt: Date }>> {
  const db = getDrizzleInstance();
  const rows = await db.select().from(mcp_system_prefs).where(eq(mcp_system_prefs.user_id, userId));
  return new Map(rows.map((r) => [r.system_key, { enabled: r.enabled, updatedAt: r.updated_at }]));
}

export class McpServerRegistry {
  /**
   * All of a user's servers for the settings UI — managed connectors first,
   * then their own (enabled + disabled).
   *
   * A prefs-table outage must not blank the connector list: managed rows then
   * render at their default (enabled), which is what they would do with no row
   * anyway. Logged, not thrown.
   */
  static async list(userId: string): Promise<McpServerSummary[]> {
    const db = getDrizzleInstance();
    const rows = await db.select().from(mcp_servers).where(eq(mcp_servers.user_id, userId));
    const prefs = await loadSystemPrefs(userId).catch((err: unknown) => {
      log.warn(`Failed to load managed-connector prefs; defaulting to enabled: ${err}`);
      return new Map<string, { enabled: boolean; updatedAt: Date }>();
    });
    const managed = getManagedConnectors().map((c) => {
      const pref = prefs.get(c.key);
      return managedToSummary(c, pref?.enabled ?? true, pref?.updatedAt ?? null);
    });
    return [...managed, ...rows.map(toSummary)];
  }

  /** The managed connectors this user has switched off (`system_key` values). */
  static async getDisabledManagedKeys(userId: string): Promise<Set<string>> {
    const prefs = await loadSystemPrefs(userId);
    return new Set([...prefs].filter(([, p]) => !p.enabled).map(([key]) => key));
  }

  /**
   * Switch a managed connector on/off for one user. Upsert on the composite key:
   * switching back ON writes `true` rather than deleting the row, so the table
   * records a decision instead of leaving "never touched" and "explicitly on"
   * indistinguishable.
   *
   * Returns the refreshed summary, or null when the id is not a configured
   * managed connector (unknown key, or its URL is unset in this deployment).
   */
  static async setManagedEnabled(
    userId: string,
    id: string,
    enabled: boolean
  ): Promise<McpServerSummary | null> {
    const connector = getManagedConnectorById(id);
    if (!connector) return null;
    const db = getDrizzleInstance();
    const updatedAt = new Date();
    await db
      .insert(mcp_system_prefs)
      .values({ user_id: userId, system_key: connector.key, enabled, updated_at: updatedAt })
      .onConflictDoUpdate({
        target: [mcp_system_prefs.user_id, mcp_system_prefs.system_key],
        set: { enabled, updated_at: updatedAt },
      });
    return managedToSummary(connector, enabled, updatedAt);
  }

  /** True when the id addresses a managed connector rather than a user row. */
  static isManagedId(id: string): boolean {
    return parseManagedConnectorId(id) !== null;
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
   *
   * Managed connectors are unioned in (unless opted out) and short-circuit a
   * scoped call: a `system-<key>` scope can never match an `mcp_servers` row, and
   * the id is not a UUID — running the row query on it would raise a column-cast
   * error rather than return nothing.
   */
  static async getConnectionConfigs(
    userId: string,
    opts?: { serverId?: string }
  ): Promise<McpConnectionConfig[]> {
    const managedScope = opts?.serverId ? parseManagedConnectorId(opts.serverId) : null;
    if (opts?.serverId && managedScope) {
      const connector = getManagedConnectorById(opts.serverId);
      if (!connector) return [];
      const disabled = await this.getDisabledManagedKeys(userId).catch(() => new Set<string>());
      return disabled.has(connector.key) ? [] : [toManagedConfig(connector)];
    }

    const db = getDrizzleInstance();
    const where = opts?.serverId
      ? and(
          eq(mcp_servers.user_id, userId),
          eq(mcp_servers.enabled, true),
          eq(mcp_servers.id, opts.serverId)
        )
      : and(eq(mcp_servers.user_id, userId), eq(mcp_servers.enabled, true));
    const rows = await db.select().from(mcp_servers).where(where);
    const userConfigs: McpConnectionConfig[] = await Promise.all(
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
        return {
          id: row.id,
          name: row.name,
          url: row.url,
          authType: row.auth_type,
          token,
          approvedFingerprints: row.tool_fingerprints,
        };
      })
    );

    // Managed connectors ride along on an UNSCOPED load: every user has them,
    // minus their opt-outs. A prefs failure must not silently mount a connector
    // somebody switched off, so it drops all of them instead of defaulting to on
    // — the opposite of `list()`, where the safe direction is showing the row.
    const disabled = await this.getDisabledManagedKeys(userId).catch((err: unknown) => {
      log.warn(`Managed-connector prefs unavailable; skipping managed mounts: ${err}`);
      return null;
    });
    const managed = disabled
      ? getManagedConnectors()
          .filter((c) => !disabled.has(c.key))
          .map(toManagedConfig)
      : [];

    return [...userConfigs, ...managed];
  }

  /**
   * Record the approved tool-definition fingerprints for a server.
   *
   * Called when a server has no baseline yet (first connect, or a server that
   * predates the column) and after an explicit re-approval. NOT best-effort in
   * the same sense as saveToolsSnapshot: a failed write here means the next
   * load re-baselines rather than blocking, so a persistent failure degrades
   * to today's behaviour — no detection — instead of locking the user out.
   * It is logged at WARN for exactly that reason.
   */
  static async saveToolFingerprints(
    userId: string,
    serverId: string,
    fingerprints: Record<string, string>
  ): Promise<void> {
    try {
      const db = getDrizzleInstance();
      await db
        .update(mcp_servers)
        .set({ tool_fingerprints: fingerprints, tools_approved_at: new Date() })
        .where(and(eq(mcp_servers.user_id, userId), eq(mcp_servers.id, serverId)));
    } catch (err) {
      log.warn('Failed to persist MCP tool fingerprints', {
        serverId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
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
   *
   * MANAGED CONNECTORS ARE DELIBERATELY ABSENT (this reads `mcp_servers` only).
   * Prose routing fires on a server NAME plus an action verb, and these names
   * are ordinary German words: "Gesetze", "Wetter", "Deutsche Bahn". Letting
   * them in would route "erkläre mir die Gesetze zur Bahnreform" into a tool
   * loop scoped to a law server.
   *
   * They get selected automatically — just not here. `managedSourceTrigger`
   * does it on vocabulary, with word boundaries that exclude exactly those
   * compounds, and it mounts tools instead of scoping the whole turn to one
   * server. Two mechanisms with different failure modes: this one commits the
   * turn to a service, that one only offers the tools.
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
