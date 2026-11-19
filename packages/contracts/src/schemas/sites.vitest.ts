import { describe, expect, it } from 'vitest';

import { emptyRichTextDoc } from './richtext.js';
import {
  buildSiteSnapshot,
  checkSiteHandle,
  updateUserSiteBodySchema,
  type SiteSnapshotSource,
} from './sites.js';

const card = () => ({ imageUrl: '', title: 'Klima', content: emptyRichTextDoc() });

const validLegal = () => ({
  name: 'Max Mustermann',
  street: 'Musterstraße 1',
  postal_code: '10115',
  city: 'Berlin',
  email: 'max@example.org',
});

const validSource = (): SiteSnapshotSource => ({
  site_title: 'Max Mustermann',
  tagline: 'Für Berlin',
  profile_image: null,
  contact_email: 'max@example.org',
  contact_phone: null,
  social_links: null,
  sections: {
    about: { title: 'Über mich', content: emptyRichTextDoc() },
    themes: [card()],
    actions: [],
  },
  legal: validLegal(),
});

const withActionLink = (link: string): SiteSnapshotSource => ({
  ...validSource(),
  sections: { actions: [{ imageUrl: '', text: 'Mitmachen', link }] },
});

const issuePaths = (source: SiteSnapshotSource): string[] => {
  const result = buildSiteSnapshot(source, 'de-DE');
  return result.ok ? [] : result.issues.map((issue) => issue.path);
};

describe('checkSiteHandle', () => {
  it('normalises case and whitespace', () =>
    expect(checkSiteHandle('  Max-Mustermann ')).toEqual({ ok: true, handle: 'max-mustermann' }));
  it.each(['ab', 'a'.repeat(31), '-abc', 'abc-', 'a--b', 'max mustermann', 'müller', 'a.b'])(
    'rejects %s as invalid',
    (raw) => expect(checkSiteHandle(raw)).toEqual({ ok: false, reason: 'invalid' })
  );
  it.each(['impressum', 'datenschutz', 'api', 'WWW'])('rejects %s as reserved', (raw) =>
    expect(checkSiteHandle(raw)).toEqual({ ok: false, reason: 'reserved' })
  );
});

describe('draft bounds', () => {
  it('rejects a title above the limit', () =>
    expect(updateUserSiteBodySchema.safeParse({ site_title: 'x'.repeat(121) }).success).toBe(
      false
    ));
  it('rejects a seventh theme card', () =>
    expect(
      updateUserSiteBodySchema.safeParse({ sections: { themes: Array.from({ length: 7 }, card) } })
        .success
    ).toBe(false));
  it('accepts a half-typed link in a draft', () =>
    expect(
      updateUserSiteBodySchema.safeParse({
        sections: { actions: [{ imageUrl: '', text: 'Mitmachen', link: 'www.example' }] },
      }).success
    ).toBe(true));
});

describe('buildSiteSnapshot', () => {
  it('builds version 1 with the locale', () => {
    const result = buildSiteSnapshot(validSource(), 'de-AT');
    expect(result.ok && result.snapshot).toMatchObject({ version: 1, locale: 'de-AT' });
  });
  it.each(['javascript:alert(1)', 'data:text/html,x', 'www.example.org', '//evil.example'])(
    'reports the action link %s',
    (link) => expect(issuePaths(withActionLink(link))).toContain('sections.actions.0.link')
  );
  it.each(['https://gruene.de/mitmachen', 'mailto:hallo@example.org', '#kontakt'])(
    'accepts the action link %s',
    (link) => expect(buildSiteSnapshot(withActionLink(link), 'de-DE').ok).toBe(true)
  );
  it('reports an image from a foreign origin', () =>
    expect(issuePaths({ ...validSource(), profile_image: 'https://evil.example/x.png' })).toContain(
      'profile_image'
    ));
  it('rewrites a media-library download URL to the preview URL', () => {
    const result = buildSiteSnapshot(
      { ...validSource(), profile_image: '/api/share/abc123/download' },
      'de-DE'
    );
    expect(result.ok && result.snapshot.profile_image).toBe('/api/share/abc123/preview');
  });
  it('accepts a stock image path', () =>
    expect(
      buildSiteSnapshot(
        { ...validSource(), profile_image: '/api/image-picker/stock-image/wald-01.jpg' },
        'de-DE'
      ).ok
    ).toBe(true));
  it('drops empty social links and reports a non-http one', () => {
    const ok = buildSiteSnapshot(
      { ...validSource(), social_links: { instagram: '', mastodon: 'https://gruene.social/@x' } },
      'de-DE'
    );
    expect(ok.ok && ok.snapshot.social_links).toEqual({ mastodon: 'https://gruene.social/@x' });
    expect(
      issuePaths({ ...validSource(), social_links: { facebook: 'javascript:alert(1)' } })
    ).toContain('social_links.facebook');
  });
  it.each(['name', 'street', 'postal_code', 'city', 'email'] as const)(
    'reports a missing legal.%s',
    (field) =>
      expect(issuePaths({ ...validSource(), legal: { ...validLegal(), [field]: '' } })).toContain(
        `legal.${field}`
      )
  );
  it('reports a missing legal block as a whole', () =>
    expect(issuePaths({ ...validSource(), legal: null })).toContain('legal'));
});
