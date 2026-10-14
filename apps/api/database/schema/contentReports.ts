import {
  type ContentReportKind,
  type ContentReportReason,
  type ContentReportResolution,
  type ContentReportStatus,
} from '@gruenerator/contracts';
import { type InferSelectModel, sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

// See migrations/zz_20261014b_content_reports.sql (FKs and CHECK constraints live there).
export const contentReports = pgTable(
  'content_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').$type<ContentReportKind>().notNull(),
    target_id: text('target_id').notNull(),
    reporter_id: uuid('reporter_id').notNull(),
    reason: text('reason').$type<ContentReportReason>().notNull(),
    note: text('note'),
    excerpt: text('excerpt'),
    group_id: uuid('group_id'),
    thread_id: text('thread_id'),
    status: text('status').$type<ContentReportStatus>().notNull().default('open'),
    resolution: text('resolution').$type<ContentReportResolution>(),
    resolved_by: uuid('resolved_by'),
    resolved_at: timestamp('resolved_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_content_reports_open_reporter_target')
      .on(t.reporter_id, t.kind, t.target_id)
      .where(sql`${t.status} = 'open'`),
    index('idx_content_reports_status_created').on(t.status, t.created_at.desc()),
    index('idx_content_reports_target').on(t.kind, t.target_id),
  ]
);

export type ContentReportRow = InferSelectModel<typeof contentReports>;
