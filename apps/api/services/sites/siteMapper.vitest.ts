import { buildSiteSnapshot } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { type UserSiteRawRow, type UserSiteRow } from '../../database/schema/sites.js';

import { toSite } from './siteMapper.js';

function row(overrides: Partial<UserSiteRow> = {}): UserSiteRow {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    user_id: '11111111-1111-4111-8111-111111111111',
    group_id: null,
    subdomain: 'anna',
    is_published: false,
    site_title: 'Anna Beispiel',
    tagline: 'Für unsere Stadt',
    contact_email: 'anna@example.org',
    contact_phone: null,
    contact_website: null,
    social_links: {},
    theme: 'gruene',
    accent_color: '#46962b',
    profile_image: null,
    background_image: null,
    sections: { blocks: [{ id: 'hero', type: 'hero' }] },
    created_at: new Date('2026-11-19T10:00:00Z'),
    updated_at: new Date('2026-11-19T11:00:00Z'),
    deleted_at: null,
    last_published: null,
    visit_count: 0,
    meta_description: null,
    meta_keywords: null,
    published_snapshot: null,
    legal: {
      name: 'Anna Beispiel',
      street: 'Hauptstraße 1',
      postal_code: '10115',
      city: 'Berlin',
      email: 'anna@example.org',
    },
    moderation: 'ok',
    ...overrides,
  };
}

function publishedRow(): UserSiteRow {
  const draft = row({ is_published: true });
  const built = buildSiteSnapshot(toSite(draft), 'de-DE');
  if (!built.ok) throw new Error('fixture draft must be valid');
  return { ...draft, published_snapshot: built.snapshot };
}

describe('toSite', () => {
  it('maps timestamps as drizzle raw execute returns them (strings)', () => {
    const raw: UserSiteRawRow = {
      ...row(),
      created_at: '2026-11-19 10:20:36.123+00',
      updated_at: '2026-11-19 11:20:36.123+00',
      last_published: '2026-11-19 12:20:36+00',
    };
    const site = toSite(raw);
    expect(site.created_at).toBe('2026-11-19T10:20:36.123Z');
    expect(site.updated_at).toBe('2026-11-19T11:20:36.123Z');
    expect(site.last_published).toBe('2026-11-19T12:20:36.000Z');
  });
  it('serialises timestamps as ISO strings', () =>
    expect(toSite(row({ created_at: new Date('2026-11-19T10:00:00Z') })).created_at).toBe(
      '2026-11-19T10:00:00.000Z'
    ));
  it('reads an unpublished row as having no pending changes', () =>
    expect(
      toSite(row({ is_published: false, published_snapshot: null })).has_unpublished_changes
    ).toBe(false));
  it('reads a published row whose draft equals the snapshot as clean', () =>
    expect(toSite(publishedRow()).has_unpublished_changes).toBe(false));
  it('reads a published row with an edited title as changed', () =>
    expect(toSite({ ...publishedRow(), site_title: 'Neu' }).has_unpublished_changes).toBe(true));
  it('reads a published row whose draft no longer validates as changed', () =>
    expect(toSite({ ...publishedRow(), legal: null }).has_unpublished_changes).toBe(true));
  it('exposes the parsed published snapshot', () => {
    const published = publishedRow();
    expect(toSite(published).published_snapshot).toEqual(published.published_snapshot);
  });
  it('exposes null for no snapshot and for a stored value that is not one', () => {
    expect(toSite(row()).published_snapshot).toBeNull();
    expect(toSite(row({ published_snapshot: { foo: 1 } })).published_snapshot).toBeNull();
  });
});
