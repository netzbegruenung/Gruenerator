import { type ModerationState } from '@gruenerator/contracts';
import { type InferSelectModel, sql } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const userSites = pgTable(
  'user_sites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id'),
    subdomain: text('subdomain').notNull(),
    is_published: boolean('is_published').default(false),
    site_title: text('site_title').notNull(),
    tagline: text('tagline'),
    contact_email: text('contact_email'),
    contact_phone: text('contact_phone'),
    contact_website: text('contact_website'),
    social_links: jsonb('social_links').$type<Record<string, unknown>>().default({}),
    theme: text('theme').default('gruene'),
    accent_color: text('accent_color').default('#46962b'),
    profile_image: text('profile_image'),
    background_image: text('background_image'),
    // Object keyed by section name ({ about, heroImage, themes, actions,
    // contact, socialFeed }) — canonical shape is siteSectionsSchema in
    // @gruenerator/contracts. Rich-text contents are ProseMirror JSON docs.
    sections: jsonb('sections').$type<Record<string, unknown>>().default({}),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
    last_published: timestamp('last_published', { withTimezone: true }),
    visit_count: integer('visit_count').default(0),
    meta_description: text('meta_description'),
    meta_keywords: text('meta_keywords').array(),
    published_snapshot: jsonb('published_snapshot').$type<Record<string, unknown>>(),
    legal: jsonb('legal').$type<Record<string, unknown>>(),
    moderation: text('moderation').$type<ModerationState>().notNull().default('ok'),
  },
  // Nur unter lebenden Zeilen: eine Website im Papierkorb blockiert ihre Subdomain nicht.
  (t) => [
    uniqueIndex('user_sites_subdomain_unique')
      .on(t.subdomain)
      .where(sql`deleted_at IS NULL`),
    uniqueIndex('user_sites_one_live_per_user')
      .on(t.user_id)
      .where(sql`deleted_at IS NULL`),
  ]
);

export type UserSiteRow = InferSelectModel<typeof userSites>;

type TimestampColumns = 'created_at' | 'updated_at' | 'deleted_at' | 'last_published';

/**
 * A `user_sites` row as raw SQL returns it. drizzle's node-postgres driver overrides pg's type
 * parsers, so `db.execute(sql\`... RETURNING *\`)` yields timestamptz as strings; only the query
 * builder and `PostgresService.query` map them to `Date`. Read raw rows through this type.
 */
export type UserSiteRawRow = Omit<UserSiteRow, TimestampColumns> & {
  [K in TimestampColumns]: UserSiteRow[K] extends Date | null
    ? string | Date | null
    : string | Date;
};
