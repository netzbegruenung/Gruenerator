import {
  bigint,
  boolean,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uuid,
  index,
} from 'drizzle-orm/pg-core';

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

/**
 * Wolke folder watcher: files detected in an `auto_sync` notebook's Wolke
 * folders that are not yet imported, awaiting the user's "Hinzufügen" click.
 * The unique (collection_id, file_path) index makes hourly detection
 * idempotent — re-runs insert with ON CONFLICT DO NOTHING.
 */
export const wolkePendingFiles = pgTable(
  'wolke_pending_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    collectionId: uuid('collection_id').notNull(),
    userId: uuid('user_id').notNull(),
    shareLinkId: text('share_link_id').notNull(),
    folderPath: text('folder_path').notNull().default(''),
    filePath: text('file_path').notNull(),
    fileName: text('file_name').notNull(),
    etag: text('etag'),
    size: bigint('size', { mode: 'number' }),
    mimeType: text('mime_type'),
    status: text('status').notNull().default('pending'),
    detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [
    unique('uq_wolke_pending_collection_file').on(t.collectionId, t.filePath),
    index('idx_wolke_pending_collection_status').on(t.collectionId, t.status),
    index('idx_wolke_pending_user_status').on(t.userId, t.status),
  ]
);
export type WolkePendingFileRow = typeof wolkePendingFiles.$inferSelect;
export type WolkePendingFileInsert = typeof wolkePendingFiles.$inferInsert;

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

export const appPushDevices = pgTable(
  'app_push_devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    expoPushToken: text('expo_push_token').notNull(),
    deviceName: text('device_name'),
    deviceType: text('device_type').notNull().default('unknown'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('app_push_devices_user_token_unique').on(t.userId, t.expoPushToken),
    index('idx_app_push_devices_user').on(t.userId),
  ]
);
