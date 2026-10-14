import {
  type GroupAudience,
  type StudioAssetKind,
  type StudioAssetModeration,
  type StudioAssetSource,
  type StudioAssetVisibility,
} from '@gruenerator/contracts';
import { type InferSelectModel, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// See migrations/zz_20261014_studio_assets.sql (CHECK constraints live there).
export const studioAssets = pgTable(
  'studio_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id').notNull(),
    kind: text('kind').$type<StudioAssetKind>().notNull(),
    title: text('title').notNull(),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    media_id: uuid('media_id').notNull(),
    src: text('src').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    source: text('source').$type<StudioAssetSource>().notNull(),
    visibility: text('visibility').$type<StudioAssetVisibility>().notNull().default('private'),
    was_public: boolean('was_public').notNull().default(false),
    audience: text('audience').$type<GroupAudience>().notNull().default('all'),
    moderation: text('moderation').$type<StudioAssetModeration>().notNull().default('ok'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_studio_assets_user_created')
      .on(t.user_id, t.created_at.desc())
      .where(sql`${t.deleted_at} IS NULL`),
    index('idx_studio_assets_shop')
      .on(t.kind, t.audience, t.created_at.desc())
      .where(
        sql`${t.visibility} = 'public' AND ${t.moderation} = 'ok' AND ${t.deleted_at} IS NULL`
      ),
    index('idx_studio_assets_trashed')
      .on(t.deleted_at)
      .where(sql`${t.deleted_at} IS NOT NULL`),
    uniqueIndex('uq_studio_assets_media').on(t.media_id),
  ]
);

export type StudioAssetRow = InferSelectModel<typeof studioAssets>;
