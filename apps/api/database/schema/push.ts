import { type InferSelectModel } from 'drizzle-orm';
import { customType, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

/**
 * Geräte mit App-Push (Opt-in). `key` verschlüsselt jeden Push für genau dieses
 * Gerät; die Zeile lebt nur so lange wie `session_id`.
 * DDL: `migrations/zz_20261109_push_devices.sql` (nicht in schema.sql).
 */
export const pushDevices = pgTable(
  'push_devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id').notNull(),
    session_id: text('session_id'),
    platform: text('platform').$type<'ios' | 'android'>().notNull(),
    token: text('token').notNull().unique(),
    key: bytea('key').notNull(),
    apns_environment: text('apns_environment').$type<'production' | 'sandbox'>(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    last_seen_at: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_push_devices_user').on(t.user_id)]
);
export type PushDeviceRow = InferSelectModel<typeof pushDevices>;
