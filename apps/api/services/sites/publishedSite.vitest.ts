import { drizzle } from 'drizzle-orm/node-postgres';
import { describe, expect, it } from 'vitest';

import { parsePublishedSnapshot, publishedSiteQuery } from './publishedSite.js';

const MINIMAL = {
  version: 2,
  locale: 'de-DE',
  site_title: 'Anna Beispiel',
  tagline: '',
  profile_image: '',
  contact_email: '',
  contact_phone: '',
  social_links: {},
  sections: { blocks: [{ id: 'hero', type: 'hero' }] },
  legal: {
    name: 'Anna Beispiel',
    street: 'Musterstraße 1',
    postal_code: '10115',
    city: 'Berlin',
    email: 'anna@example.org',
    phone: '+49 30 123456',
  },
};

const db = drizzle.mock();

describe('publishedSite', () => {
  it('filters one live, published, unmoderated handle', () => {
    const { sql, params } = publishedSiteQuery(db, 'anna').toSQL();
    expect(sql).toMatch(/^select "published_snapshot" from "user_sites"/);
    for (const clause of [
      '"user_sites"."subdomain" = $1',
      '"user_sites"."is_published" = $2',
      '"user_sites"."moderation" = $3',
      '"user_sites"."published_snapshot" is not null',
      '"user_sites"."deleted_at" is null',
    ])
      expect(sql).toContain(clause);
    expect(params).toEqual(['anna', true, 'ok', 1]);
  });

  it('hides a project site while its project is in the trash', () => {
    const { sql } = publishedSiteQuery(db, 'anna').toSQL();
    expect(sql).toContain('"user_sites"."group_id" IS NULL OR EXISTS');
    expect(sql).toMatch(
      /FROM groups g WHERE g\.id = "user_sites"\."group_id" AND g\.deleted_at IS NULL/
    );
  });

  it('a stored snapshot that no longer parses is not served', () =>
    expect(parsePublishedSnapshot({ published_snapshot: { version: 1 } })).toBeNull());

  it('no row is no site', () => expect(parsePublishedSnapshot(null)).toBeNull());

  it('parses a valid snapshot', () =>
    expect(parsePublishedSnapshot({ published_snapshot: MINIMAL })?.site_title).toBe(
      'Anna Beispiel'
    ));
});
