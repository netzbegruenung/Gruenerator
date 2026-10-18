import { type EntityCommentType, type ModerationState } from '@gruenerator/contracts';
import { type InferSelectModel } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// See migrations/zz_20261020_entity_comments.sql (CHECK constraints and the
// self-FK on parent_id live there). `entity_id` is the marketplace ref, no FK.
export const entityComments = pgTable(
  'entity_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entity_type: text('entity_type').$type<EntityCommentType>().notNull(),
    entity_id: text('entity_id').notNull(),
    user_id: uuid('user_id'),
    body: text('body').notNull(),
    parent_id: uuid('parent_id'),
    moderation: text('moderation').$type<ModerationState>().notNull().default('ok'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_entity_comments_entity').on(t.entity_type, t.entity_id, t.created_at)]
);

export type EntityCommentRow = InferSelectModel<typeof entityComments>;
