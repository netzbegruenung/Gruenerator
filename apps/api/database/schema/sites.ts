import { type InferSelectModel } from 'drizzle-orm';
import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const userSites = pgTable('user_sites', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id'),
  subdomain: text('subdomain').notNull(),
  is_published: boolean('is_published').default(false),
  site_title: text('site_title').notNull(),
  tagline: text('tagline'),
  bio: text('bio'),
  contact_email: text('contact_email'),
  contact_phone: text('contact_phone'),
  contact_website: text('contact_website'),
  social_links: jsonb('social_links').$type<Record<string, unknown>>().default({}),
  theme: text('theme').default('gruene'),
  accent_color: text('accent_color').default('#46962b'),
  profile_image: text('profile_image'),
  background_image: text('background_image'),
  // Object keyed by section name ({ heroImage, themes, actions, contact,
  // socialFeed }) — canonical shape is siteSectionsSchema in
  // @gruenerator/contracts. Historic rows may still hold a legacy array form.
  sections: jsonb('sections').$type<Record<string, unknown>>().default({}),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  last_published: timestamp('last_published', { withTimezone: true }),
  visit_count: integer('visit_count').default(0),
  meta_description: text('meta_description'),
  meta_keywords: text('meta_keywords').array(),
});

export type UserSiteRow = InferSelectModel<typeof userSites>;
