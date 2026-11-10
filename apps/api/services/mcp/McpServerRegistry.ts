/**
 * Per-user registry of MCP servers (EXPERIMENTAL).
 *
 * Stores server records in the `mcp_servers` table; access tokens are encrypted
 * at rest with the shared credential helper (same scheme as Canva).
 * The chat tool-loop reads {@link getConnectionConfigs} to connect to the one
 * server a turn addresses; the settings UI drives the CRUD methods.
 *
 * Auth: `none`, `bearer` and `oauth` are wired end-to-end; the interactive
 * OAuth (PKCE/DCR) flow lives in McpOAuthService, whose tokens this registry
 * lazy-refreshes in getConnectionConfigs.
 *
 * KNOWN CONNECTORS (Bahn, Wetter, tagesschau, trivago, Gesetze, Rateo) are rows
 * too since 11/2026, marked by `registry_key`. What makes them different stays
 * out of the row: URL and token come from deploy env (`systemMcpServers.ts`),
 * name and description from the code definition, and the only thing a person
 * changes on such a row is `enabled` — or they disconnect it. The former
 * synthetic id `system-<key>` is still accepted everywhere an id is
 * ({@link McpServerRegistry.resolveServerId}); persisted pins, sticky thread
 * scopes and mention tokens carry it. Remove the alias no earlier than
 * 2027-05-10.
 */

import { type McpServerSummary } from '@gruenerator/contracts';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { type PgUpdateSetSource } from 'drizzle-orm/pg-core';

import { mcp_servers, type McpServer } from '../../database/schema/mcpServers.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { createLogger } from '../../utils/logger.js';
import { decryptCredential, encryptCredential } from '../../utils/validation/encryption.js';

import { findSeedByUrl } from './McpRegistryService.js';
import {
  getManagedConnectors,
  parseManagedConnectorId,
  toSystemConnectionConfig,
  type ManagedConnector,
  type SystemMcpKey,
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

/**
 * A patch that would change what a known connector connects to. Refused, not
 * ignored: the row's trust (widgets, read-only auto-approval, the shared tool
 * cache) belongs to the server behind the key, and a row pointed elsewhere
 * would carry it to a server nobody vetted.
 */
export class RegistryConnectorPatchError extends Error {
  constructor() {
    super('A known connector can only be switched on or off.');
    this.name = 'RegistryConnectorPatchError';
  }
}

const LOCKED_ON_KNOWN_CONNECTOR = [
  'name',
  'url',
  'authType',
  'token',
  'oauthClientId',
  'oauthClientSecret',
] as const satisfies readonly (keyof McpServerUpdateInput)[];

/** The env-active definition behind a row's key; null for user rows and unset sources. */
function knownConnector(key: string | null): ManagedConnector | null {
  if (!key) return null;
  return getManagedConnectors().find((c) => c.key === key) ?? null;
}

/**
 * Row → settings record. A known connector's row shows the definition's name
 * and description, and `url` stays EMPTY: the endpoint is deploy-env-only and
 * must not reach any API response.
 */
function toSummary(row: McpServer): McpServerSummary {
  const base: McpServerSummary = {
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
    toolsDrift: row.tools_drift
      ? { changed: row.tools_drift.changed, added: row.tools_drift.added }
      : null,
  };
  const connector = knownConnector(row.registry_key);
  if (!connector) return base;
  return {
    ...base,
    name: connector.connector.title,
    url: '',
    authType: connector.authType,
    hasToken: !!connector.token,
    description: connector.connector.description,
    toolNames: connector.toolAllowlist,
    toolsDrift: null,
    managed: true,
    category: connector.connector.category,
    registryKey: connector.key,
  };
}

/** A row the settings may show: user rows always, known ones only while their source is active. */
function isListable(row: McpServer): boolean {
  return row.registry_key == null || knownConnector(row.registry_key) != null;
}

export class McpServerRegistry {
  /**
   * All of a user's servers for the settings UI (enabled + disabled). A known
   * connector the person never connected is not here — it is a card in the
   * directory (McpRegistryService), like any other service.
   */
  static async list(userId: string): Promise<McpServerSummary[]> {
    const db = getDrizzleInstance();
    const rows = await db.select().from(mcp_servers).where(eq(mcp_servers.user_id, userId));
    return rows.filter(isListable).map(toSummary);
  }

  /**
   * The row id an id-shaped reference means for this person. A row id passes
   * through unchanged; the former synthetic `system-<key>` resolves to the
   * person's row with that key, or null when they have none (never connected,
   * or disconnected). Every route and the chat scope go through this, so an old
   * pin or sticky scope keeps working.
   */
  static async resolveServerId(userId: string, ref: string): Promise<string | null> {
    const key = parseManagedConnectorId(ref);
    if (!key) return ref;
    const db = getDrizzleInstance();
    const rows = await db
      .select({ id: mcp_servers.id, registry_key: mcp_servers.registry_key })
      .from(mcp_servers)
      .where(and(eq(mcp_servers.user_id, userId), eq(mcp_servers.registry_key, key)));
    return rows.find((r) => r.registry_key === key)?.id ?? null;
  }

  /**
   * "Verbinden" on a known connector's directory card: the person's row for
   * that key, created on first connect and switched on otherwise. Idempotent
   * through the partial unique index on (user_id, registry_key).
   *
   * Null when the key is unknown or its source is not configured here.
   */
  static async connectRegistryConnector(
    userId: string,
    key: SystemMcpKey
  ): Promise<McpServerSummary | null> {
    const connector = knownConnector(key);
    if (!connector) return null;
    const db = getDrizzleInstance();
    const rows = await db
      .insert(mcp_servers)
      .values({
        user_id: userId,
        // Display name comes from the definition (toSummary); the column is
        // NOT NULL, so it carries the key.
        name: key,
        url: '',
        auth_type: 'none',
        registry_key: key,
        enabled: true,
      })
      .onConflictDoUpdate({
        target: [mcp_servers.user_id, mcp_servers.registry_key],
        targetWhere: isNotNull(mcp_servers.registry_key),
        set: { enabled: true, updated_at: new Date() },
      })
      .returning();
    const row = rows[0];
    classifierCache.delete(userId);
    if (!row) return null;
    log.info('Known connector connected', { userId, key });
    return toSummary(row);
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
   * Decrypted connection config of ONE server — the one a turn or the settings
   * test addressed (`@notion`, a named server, the thread's sticky server).
   * Empty when it is gone or disabled.
   *
   * Always scoped: nothing mounts every connected server at once. The
   * unscoped fan-out mounted the managed connectors next to every mentioned
   * server, and they shared one tool cap — the mentioned server lost its tools
   * to whichever connected fastest.
   *
   * A known connector's config is built from env, never from the row: the row
   * says only THAT the person connected it. With the source unset in this
   * deployment (the kill switch) it yields nothing.
   */
  static async getConnectionConfigs(userId: string, ref: string): Promise<McpConnectionConfig[]> {
    const serverId = await this.resolveServerId(userId, ref);
    if (!serverId) return [];

    const db = getDrizzleInstance();
    const rows = await db
      .select()
      .from(mcp_servers)
      .where(
        and(
          eq(mcp_servers.user_id, userId),
          eq(mcp_servers.enabled, true),
          eq(mcp_servers.id, serverId)
        )
      );
    const configs = await Promise.all(
      rows.map(async (row): Promise<McpConnectionConfig | null> => {
        if (row.registry_key != null) {
          const connector = knownConnector(row.registry_key);
          if (!connector) return null;
          return {
            ...toSystemConnectionConfig(connector),
            id: row.id,
            name: connector.connector.title,
          };
        }
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
          curated: findSeedByUrl(row.url) != null,
        };
      })
    );

    return configs.filter((c): c is McpConnectionConfig => c != null);
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
   * Record tool-definition drift the catalog found, so the settings can show
   * it and offer the approval (best-effort — never throws).
   */
  static async saveToolsDrift(
    userId: string,
    serverId: string,
    drift: { changed: string[]; added: string[]; fingerprints: Record<string, string> }
  ): Promise<void> {
    try {
      const db = getDrizzleInstance();
      await db
        .update(mcp_servers)
        .set({ tools_drift: { ...drift, detectedAt: new Date().toISOString() } })
        .where(and(eq(mcp_servers.user_id, userId), eq(mcp_servers.id, serverId)));
    } catch (err) {
      log.warn('Failed to persist MCP tool drift', {
        serverId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** Pending drift of one of the user's own servers, with the server's name. */
  static async getPendingDrift(
    userId: string,
    id: string
  ): Promise<{ name: string; drift: NonNullable<McpServer['tools_drift']> | null } | undefined> {
    const db = getDrizzleInstance();
    const [row] = await db
      .select({ name: mcp_servers.name, tools_drift: mcp_servers.tools_drift })
      .from(mcp_servers)
      .where(and(eq(mcp_servers.user_id, userId), eq(mcp_servers.id, id)));
    return row ? { name: row.name, drift: row.tools_drift } : undefined;
  }

  /**
   * The user approved the server's current tool definitions. Clearing the
   * baseline lets the next catalog load record it from the live tool set —
   * the same path a fresh connection takes, so the digests are computed from
   * exactly the ToolSet the catalog builds.
   */
  static async approveTools(
    userId: string,
    id: string
  ): Promise<{ server: McpServerSummary; changed: string[] } | undefined> {
    const db = getDrizzleInstance();
    const where = and(eq(mcp_servers.user_id, userId), eq(mcp_servers.id, id));
    // The pending `changed` list is returned so the caller can revoke the
    // standing approvals of exactly those tools: an "always allow" was given
    // for a description that no longer exists.
    const [before] = await db
      .select({ tools_drift: mcp_servers.tools_drift })
      .from(mcp_servers)
      .where(where);
    const rows = await db
      .update(mcp_servers)
      .set({ tool_fingerprints: null, tools_approved_at: null, tools_drift: null })
      .where(where)
      .returning();
    const row = rows[0];
    return row
      ? { server: toSummary(row), changed: before?.tools_drift?.changed ?? [] }
      : undefined;
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
   * KNOWN CONNECTORS ARE DELIBERATELY ABSENT (rows with `registry_key`): they
   * mount only on an @mention, when pinned or via the sticky thread scope. Prose routing fires on a
   * server NAME plus an action verb, and their names are ordinary German words —
   * "Erstelle einen Post: Das Wetter spielt verrückt" would scope a writing
   * order to the weather API, "Such Gesetze zur Kindergrundsicherung" a policy
   * question to the federal-law server, and an Austrian user naming "Gesetze"
   * would get German law. A user's own servers keep it: "Tally", "Brevo" and
   * "Typeform" name nothing else.
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
        registry_key: mcp_servers.registry_key,
      })
      .from(mcp_servers)
      .where(and(eq(mcp_servers.user_id, userId), eq(mcp_servers.enabled, true)));
    // Known connectors never enter name matching, whatever the SQL returns —
    // filtered here so the guard is visible next to the reason above.
    const own = rows.filter((row) => row.registry_key == null);
    const data: McpClassifierServer[] = own.map((row) => ({
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
    if (LOCKED_ON_KNOWN_CONNECTOR.some((field) => patch[field] !== undefined)) {
      const [target] = await db
        .select({ registry_key: mcp_servers.registry_key })
        .from(mcp_servers)
        .where(and(eq(mcp_servers.user_id, userId), eq(mcp_servers.id, id)));
      if (target?.registry_key != null) throw new RegistryConnectorPatchError();
    }
    const values: PgUpdateSetSource<typeof mcp_servers> = { updated_at: new Date() };
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.url !== undefined) {
      values.url = patch.url;
      // Another URL is another server: its tools were never approved here, and
      // keeping the old baseline would block it on the first load. Compared in
      // SQL so re-saving the form with the same URL approves nothing.
      const sameUrl = sql`${mcp_servers.url} = ${patch.url}`;
      values.tool_fingerprints = sql`CASE WHEN ${sameUrl} THEN ${mcp_servers.tool_fingerprints} END`;
      values.tools_approved_at = sql`CASE WHEN ${sameUrl} THEN ${mcp_servers.tools_approved_at} END`;
      values.tools_drift = sql`CASE WHEN ${sameUrl} THEN ${mcp_servers.tools_drift} END`;
    }
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
