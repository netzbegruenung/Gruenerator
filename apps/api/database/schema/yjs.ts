import { type InferSelectModel } from 'drizzle-orm';
import { boolean, customType, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

export const yjsDocumentSnapshots = pgTable('yjs_document_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  document_id: uuid('document_id').notNull(),
  snapshot_data: bytea('snapshot_data').notNull(),
  version: integer('version').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  label: text('label'),
  is_auto_save: boolean('is_auto_save').default(true),
  created_by: uuid('created_by'),
});

export type YjsDocumentSnapshotRow = InferSelectModel<typeof yjsDocumentSnapshots>;
