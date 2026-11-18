import { type InferSelectModel } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Antragsgrün-Seiten einer Person auf antragsgruen.de: vom Grünerator angelegt
 * (`kind: 'created'`) oder von der Person mit ihm verbunden (`'connected'`, #5690).
 * DDL: `migrations/zz_20261116_antragsgruen_hosted_sites.sql`,
 * `zz_20261118_antragsgruen_hosted_sites_kind.sql`.
 */
export const antragsgruenHostedSites = pgTable(
  'antragsgruen_hosted_sites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id'),
    subdomain: text('subdomain').notNull().unique(),
    title: text('title').notNull(),
    url: text('url').notNull(),
    kind: text('kind', { enum: ['created', 'connected'] })
      .notNull()
      .default('created'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_antragsgruen_hosted_sites_user').on(t.user_id)]
);
export type AntragsgruenHostedSiteRow = InferSelectModel<typeof antragsgruenHostedSites>;
