import { type InferSelectModel } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * 1:1 sidecar for video editor projects. ACL/Yjs/sharing reuse the
 * `collaborative_documents` pipeline (document_subtype='video'); only
 * video-specific columns live here. Mirrors the runtime DDL in
 * `database/postgres/migrations/zz_20261121_video_projects.sql`.
 * `source_ref` format: `ki:<videoAiProjectId>:<version>`.
 */
export const videoProjects = pgTable(
  'video_projects',
  {
    document_id: uuid('document_id').primaryKey(), // FK → collaborative_documents.id (ON DELETE CASCADE)
    slug_suffix: varchar('slug_suffix', { length: 12 }).notNull().unique(),
    aspect_ratio: text('aspect_ratio').notNull().default('9:16'),
    source_ref: text('source_ref'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_video_projects_source_ref').on(t.source_ref)]
);

export type VideoProjectSidecarRow = InferSelectModel<typeof videoProjects>;
