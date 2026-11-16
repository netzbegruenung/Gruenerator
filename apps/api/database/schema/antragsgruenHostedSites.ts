import { type InferSelectModel } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Antragsgrün-Seiten, die der Grünerator auf antragsgruen.de für eine Person
 * angelegt hat. DDL: `migrations/zz_20261116_antragsgruen_hosted_sites.sql`.
 */
export const antragsgruenHostedSites = pgTable(
  'antragsgruen_hosted_sites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id'),
    subdomain: text('subdomain').notNull().unique(),
    title: text('title').notNull(),
    url: text('url').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_antragsgruen_hosted_sites_user').on(t.user_id)]
);
export type AntragsgruenHostedSiteRow = InferSelectModel<typeof antragsgruenHostedSites>;
