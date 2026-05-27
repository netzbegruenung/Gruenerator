/**
 * Drizzle schema for the Themen-Monitor tables.
 *
 * Runtime DDL lives in the raw migrations
 * (database/postgres/migrations/{create_monitor_*,add_monitor_*}.sql); this file
 * is the *type* source. JSONB column shapes reuse the Zod-inferred types from
 * `@gruenerator/contracts` so the contract stays the single source of truth.
 *
 * The trigram GIN indexes on `title`/`excerpt` are declared in the migration
 * (they need `gin_trgm_ops`) and are intentionally not modelled here.
 */
import {
  type EmotionScores,
  type MonitorArticle,
  type MonitorKeywordEntry,
  type MonitorLocale,
  type NounCount,
  type SocialTrend,
  type TopicCategory,
  type TopicScore,
} from '@gruenerator/contracts';
import { type InferSelectModel } from 'drizzle-orm';
import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/** Hourly topic-analysis snapshots (aggregates + keyword/social-trend caches). */
export const monitorSnapshots = pgTable('monitor_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .defaultNow(),
  total_articles: integer('total_articles').notNull(),
  sources: text('sources').array().notNull(),
  topic_scores: jsonb('topic_scores').$type<TopicScore[]>().notNull(),
  // Legacy blob, superseded by the normalized monitor_articles table.
  articles: jsonb('articles').$type<unknown[]>().notNull().default([]),
  keywords: jsonb('keywords').$type<MonitorKeywordEntry[]>().default([]),
  social_trends: jsonb('social_trends').$type<SocialTrend[]>().default([]),
});
export type MonitorSnapshotRow = InferSelectModel<typeof monitorSnapshots>;

/** Normalized, deduplicated article store backing watcher search. */
export const monitorArticles = pgTable(
  'monitor_articles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    url: text('url').notNull().unique(),
    title: text('title').notNull(),
    excerpt: text('excerpt').default(''),
    source: text('source').notNull(),
    locale: text('locale').$type<MonitorLocale>().notNull().default('de'),
    published_at: timestamp('published_at', { withTimezone: true, mode: 'string' }),
    primary_topic: text('primary_topic').$type<TopicCategory>(),
    topic_scores: jsonb('topic_scores').$type<MonitorArticle['topics']>().default({}),
    first_seen_at: timestamp('first_seen_at', { withTimezone: true, mode: 'string' }).defaultNow(),
    last_seen_at: timestamp('last_seen_at', { withTimezone: true, mode: 'string' }).defaultNow(),
    emotion_scores: jsonb('emotion_scores').$type<EmotionScores>().default({}),
    top_nouns: jsonb('top_nouns').$type<NounCount[]>().default([]),
    er_sentiment: doublePrecision('er_sentiment'),
  },
  (t) => [
    index('idx_monitor_articles_seen').on(t.last_seen_at),
    index('idx_monitor_articles_locale').on(t.locale),
    index('idx_monitor_articles_topic').on(t.primary_topic),
  ]
);
export type MonitorArticleRow = InferSelectModel<typeof monitorArticles>;
