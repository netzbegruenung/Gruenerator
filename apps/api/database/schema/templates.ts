import { type InferSelectModel } from 'drizzle-orm';
import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const userTemplates = pgTable(
  'user_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id'),
    type: text('type').notNull().default('template'),
    title: text('title').notNull(),
    description: text('description'),
    template_type: text('template_type').notNull().default('template'),
    external_url: text('external_url'),
    thumbnail_url: text('thumbnail_url'),
    images: jsonb('images').$type<Record<string, unknown>[]>().notNull().default([]),
    categories: jsonb('categories').$type<Record<string, unknown>[]>().notNull().default([]),
    tags: jsonb('tags').$type<Record<string, unknown>[]>().notNull().default([]),
    content_data: jsonb('content_data').$type<Record<string, unknown>>().notNull().default({}),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    is_private: boolean('is_private').notNull().default(true),
    is_example: boolean('is_example').notNull().default(false),
    status: text('status').notNull().default('published'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_user_templates_user_id').on(t.user_id),
    index('idx_user_templates_type').on(t.type),
    index('idx_user_templates_is_example').on(t.is_example),
    index('idx_user_templates_status').on(t.status),
    index('idx_user_templates_user_example').on(t.user_id, t.is_example),
    index('idx_user_templates_metadata').on(t.metadata),
    index('idx_user_templates_tags').on(t.tags),
    index('idx_user_templates_categories').on(t.categories),
  ]
);

export type UserTemplate = InferSelectModel<typeof userTemplates>;
