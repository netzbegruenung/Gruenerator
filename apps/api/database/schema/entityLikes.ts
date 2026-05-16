import { type InferSelectModel } from 'drizzle-orm';
import { index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

export const entityLikes = pgTable(
  'entity_likes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id').notNull(),
    entity_type: text('entity_type').notNull(),
    entity_id: text('entity_id').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('entity_likes_user_entity_unique').on(t.user_id, t.entity_type, t.entity_id),
    index('idx_entity_likes_entity').on(t.entity_type, t.entity_id),
    index('idx_entity_likes_user_type').on(t.user_id, t.entity_type),
    index('idx_entity_likes_popularity').on(t.entity_type, t.entity_id, t.created_at),
  ]
);

export type EntityLike = InferSelectModel<typeof entityLikes>;

export type EntityLikeType = 'notebook' | 'template';
