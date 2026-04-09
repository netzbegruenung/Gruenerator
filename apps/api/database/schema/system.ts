import { bigint, boolean, pgTable, serial, text, timestamp, uuid, index } from 'drizzle-orm/pg-core';

export const wolkeSyncStatus = pgTable(
  'wolke_sync_status',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id'),
    shareLinkId: text('share_link_id').notNull(),
    folderPath: text('folder_path').notNull(),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    filesProcessed: bigint('files_processed', { mode: 'number' }).notNull().default(0),
    filesFailed: bigint('files_failed', { mode: 'number' }).notNull().default(0),
    autoSyncEnabled: boolean('auto_sync_enabled').notNull().default(false),
    syncStatus: text('sync_status').notNull().default('idle'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    contextType: text('context_type').notNull().default('personal'),
    contextId: uuid('context_id'),
    syncedByUserId: uuid('synced_by_user_id'),
  },
  (t) => [
    index('idx_wolke_sync_status_user_share_folder').on(t.userId, t.shareLinkId, t.folderPath),
  ]
);

export const routeUsageStats = pgTable(
  'route_usage_stats',
  {
    id: serial('id').primaryKey(),
    routePattern: text('route_pattern').notNull(),
    method: text('method').notNull(),
    requestCount: bigint('request_count', { mode: 'number' }).notNull().default(0),
    lastAccessed: timestamp('last_accessed', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_route_usage_stats_pattern_method').on(t.routePattern, t.method)]
);

export const appRefreshTokens = pgTable(
  'app_refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    deviceName: text('device_name'),
    deviceType: text('device_type').notNull().default('unknown'),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    pushToken: text('push_token'),
    pushTokenUpdatedAt: timestamp('push_token_updated_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_app_refresh_tokens_user').on(t.userId),
    index('idx_app_refresh_tokens_hash').on(t.tokenHash),
    index('idx_app_refresh_tokens_expires').on(t.expiresAt),
  ]
);
