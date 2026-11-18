import {
  type ConventionArea,
  type ConventionStatsV1,
  type ConventionStatus,
  type GroupAudience,
  type SeatType,
  type SpeechAnalysis,
} from '@gruenerator/contracts';
import { type InferSelectModel } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

// See migrations/zz_20261117_parteitage.sql (CHECK constraints live there).
// No deleted_at: these tables are not part of the Papierkorb.
export const systemMedia = pgTable('system_media', {
  id: uuid('id').primaryKey().defaultRandom(),
  storage_key: text('storage_key').notNull().unique(),
  mime_type: text('mime_type').notNull(),
  size_bytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  duration_s: numeric('duration_s'),
  width: integer('width'),
  height: integer('height'),
  sha256: text('sha256').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const conventions = pgTable(
  'conventions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull().unique(),
    slug_suffix: text('slug_suffix').notNull().unique(),
    slug_name: text('slug_name').notNull(),
    title: text('title').notNull(),
    short_title: text('short_title').notNull(),
    organizer: text('organizer').notNull(),
    audience: text('audience').$type<GroupAudience>().notNull().default('all'),
    starts_on: date('starts_on').notNull(),
    ends_on: date('ends_on').notNull(),
    location: text('location').notNull(),
    status: text('status').$type<ConventionStatus>().notNull().default('draft'),
    // scrypt "salt:hash" (hex); null = open for all signed-in users of the audience.
    access_password_hash: text('access_password_hash'),
    stats: jsonb('stats').$type<ConventionStatsV1>().notNull(),
    stats_version: integer('stats_version').notNull().default(1),
    source_links: jsonb('source_links').$type<{ label: string; url: string }[]>().notNull(),
    report_media_id: uuid('report_media_id'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    published_at: timestamp('published_at', { withTimezone: true }),
  },
  (t) => [index('idx_conventions_status').on(t.status)]
);

export const conventionSpeeches = pgTable(
  'convention_speeches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    convention_id: uuid('convention_id').notNull(),
    speech_key: text('speech_key').notNull(),
    slug_suffix: text('slug_suffix').notNull().unique(),
    day: date('day').notNull(),
    day_label: text('day_label').notNull(),
    list_place: integer('list_place').notNull(),
    seat_type: text('seat_type').$type<SeatType>().notNull(),
    first_name: text('first_name').notNull(),
    last_name: text('last_name').notNull(),
    kv: text('kv').notNull(),
    area: text('area').$type<ConventionArea>().notNull(),
    contested: boolean('contested').notNull(),
    elected: boolean('elected'),
    result_percent: numeric('result_percent'),
    delivered_by: text('delivered_by'),
    topic: text('topic').notNull(),
    duration_s: numeric('duration_s').notNull(),
    word_count: integer('word_count').notNull(),
    transcript: text('transcript').notNull(),
    words: jsonb('words').$type<{ word: string; start: number; end: number }[]>().notNull(),
    analysis: jsonb('analysis').$type<SpeechAnalysis>().notNull(),
    reel_media_id: uuid('reel_media_id').notNull(),
    poster_media_id: uuid('poster_media_id').notNull(),
    moderation: text('moderation').$type<'ok' | 'hidden'>().notNull().default('ok'),
    hidden_reason: text('hidden_reason'),
  },
  (t) => [
    unique().on(t.convention_id, t.speech_key),
    index('idx_convention_speeches_place').on(t.convention_id, t.list_place),
  ]
);

export const conventionAccess = pgTable(
  'convention_access',
  {
    user_id: uuid('user_id').notNull(),
    convention_id: uuid('convention_id').notNull(),
    granted_at: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.user_id, t.convention_id] })]
);

// Block list against silently restoring a removed speech on re-import.
export const conventionDeletedSpeeches = pgTable(
  'convention_deleted_speeches',
  {
    convention_id: uuid('convention_id').notNull(),
    speech_key: text('speech_key').notNull(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.convention_id, t.speech_key] })]
);

export type SystemMediaRow = InferSelectModel<typeof systemMedia>;
export type ConventionRow = InferSelectModel<typeof conventions>;
export type ConventionSpeechRow = InferSelectModel<typeof conventionSpeeches>;
export type ConventionAccessRow = InferSelectModel<typeof conventionAccess>;
export type ConventionDeletedSpeechRow = InferSelectModel<typeof conventionDeletedSpeeches>;
