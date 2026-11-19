import { describe, expect, it } from 'vitest';

import { emptyRichTextDoc } from './richtext.js';
import {
  buildSiteSnapshot,
  buildSitePreviewSnapshot,
  checkSiteHandle,
  publishedSiteSnapshotSchema,
  readSiteVariant,
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
  theme: null,
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
  it.each([
    ['de-AT', 'https://www.gruene.de/mitglied-werden', 'https://www.gruene.at/mitmachen'],
    ['de-DE', 'https://www.gruene.at/mitmachen', 'https://www.gruene.de/mitglied-werden'],
    ['de-AT', 'https://gruene.de/mitglied-werden/', 'https://www.gruene.at/mitmachen'],
  ] as const)('swaps the known member URL for %s (%s)', (locale, link, expected) => {
    const result = buildSiteSnapshot(withActionLink(link), locale);
    expect(result.ok && result.snapshot.sections.actions?.[0]?.link).toBe(expected);
  });
  it.each(['https://gruene.de/mitmachen', 'https://example.org/mitglied-werden', '#kontakt'])(
    'keeps the other action link %s untouched under de-AT',
    (link) => {
      const result = buildSiteSnapshot(withActionLink(link), 'de-AT');
      expect(result.ok && result.snapshot.sections.actions?.[0]?.link).toBe(link);
    }
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

describe('snapshot rich text', () => {
  const aboutDoc = (content: unknown): SiteSnapshotSource => ({
    ...validSource(),
    sections: { about: { title: 'Über mich', content: content as never } },
  });
  const para = (text: string, marks?: unknown[]) => ({
    type: 'paragraph',
    content: [{ type: 'text', text, ...(marks ? { marks } : {}) }],
  });
  const nested = (depth: number): unknown =>
    depth === 0
      ? para('x')
      : { type: 'bulletList', content: [{ type: 'listItem', content: [nested(depth - 1)] }] };

  it('reports attrs on a paragraph', () =>
    expect(
      issuePaths(
        aboutDoc({
          type: 'doc',
          content: [{ ...para('x'), attrs: { style: 'x', onclick: 'alert(1)' } }],
        })
      )
    ).toContain('sections.about.content'));
  it('reports text carried by a non-text node', () =>
    expect(
      issuePaths(
        aboutDoc({ type: 'doc', content: [{ type: 'paragraph', text: 'x'.repeat(5000) }] })
      )
    ).toContain('sections.about.content'));
  it('reports a doc nested seven levels deep', () =>
    expect(issuePaths(aboutDoc({ type: 'doc', content: [nested(3)] }))).toContain(
      'sections.about.content'
    ));
  it('accepts a doc nested at the depth limit', () =>
    expect(buildSiteSnapshot(aboutDoc({ type: 'doc', content: [nested(2)] }), 'de-DE').ok).toBe(
      true
    ));
  it('reports an unknown node type', () =>
    expect(
      issuePaths(aboutDoc({ type: 'doc', content: [{ type: 'image', attrs: { src: 'x' } }] }))
    ).toContain('sections.about.content'));
  it('reports a mark with attrs', () =>
    expect(
      issuePaths(
        aboutDoc({ type: 'doc', content: [para('x', [{ type: 'bold', attrs: { a: 1 } }])] })
      )
    ).toContain('sections.about.content'));
  it('reports a heading level the editor does not offer', () =>
    expect(
      issuePaths(
        aboutDoc({
          type: 'doc',
          content: [
            { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'x' }] },
          ],
        })
      )
    ).toContain('sections.about.content'));
  it('reports text above the length limit', () =>
    expect(issuePaths(aboutDoc({ type: 'doc', content: [para('x'.repeat(1001))] }))).toContain(
      'sections.about.content'
    ));
  it('reports a theme card with foreign attrs', () =>
    expect(
      issuePaths({
        ...validSource(),
        sections: {
          themes: [
            {
              imageUrl: '',
              title: 'Klima',
              content: { type: 'doc', content: [{ ...para('x'), attrs: { id: 'a' } }] } as never,
            },
          ],
        },
      })
    ).toContain('sections.themes.0.content'));
  it('accepts bold text, a heading, a bullet list and an ordered list', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Titel' }] },
        para('fett', [{ type: 'bold' }, { type: 'italic' }]),
        {
          type: 'bulletList',
          content: [{ type: 'listItem', content: [para('Punkt')] }],
        },
        {
          type: 'orderedList',
          attrs: { start: 1, type: null },
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'hardBreak' }] }],
            },
          ],
        },
      ],
    };
    expect(buildSiteSnapshot(aboutDoc(doc), 'de-DE').ok).toBe(true);
  });
});

describe('snapshot charsets and links', () => {
  it('accepts a phone number and reports markup in it', () => {
    expect(
      buildSiteSnapshot({ ...validSource(), contact_phone: '+49 30 123-45' }, 'de-DE').ok
    ).toBe(true);
    expect(issuePaths({ ...validSource(), contact_phone: '123<script>' })).toContain(
      'contact_phone'
    );
  });
  it('reports markup in the legal phone', () =>
    expect(issuePaths({ ...validSource(), legal: { ...validLegal(), phone: '1<b>' } })).toContain(
      'legal.phone'
    ));
  it('reports an instagram name with path characters', () =>
    expect(
      issuePaths({
        ...validSource(),
        sections: { socialFeed: { title: 'Feed', instagramUsername: 'x/../evil', showFeed: true } },
      })
    ).toContain('sections.socialFeed.instagramUsername'));
  it('accepts an instagram name', () =>
    expect(
      buildSiteSnapshot(
        {
          ...validSource(),
          sections: {
            socialFeed: { title: 'Feed', instagramUsername: 'anna.b_1', showFeed: true },
          },
        },
        'de-DE'
      ).ok
    ).toBe(true));
  it('reports an unknown social platform without throwing', () => {
    const key = '"><img src=x>';
    expect(
      issuePaths({ ...validSource(), social_links: { [key]: 'https://example.org' } })
    ).toContain(`social_links.${key}`);
    const dotted = buildSiteSnapshot(
      { ...validSource(), social_links: { 'a.b': 'https://example.org' } },
      'de-DE'
    );
    expect(dotted.ok).toBe(false);
  });
  it('keeps an unknown social key in a draft', () =>
    expect(updateUserSiteBodySchema.safeParse({ social_links: { whatever: 'www' } }).success).toBe(
      true
    ));
  it.each([
    'https://gruene.de@evil.example',
    'mailto:a@b.de?bcc=x@evil.example',
    'mailto:a b@c.de',
  ])('reports the action link %s', (link) =>
    expect(issuePaths(withActionLink(link))).toContain('sections.actions.0.link')
  );
  it('reports credentials in a social link', () =>
    expect(
      issuePaths({ ...validSource(), social_links: { facebook: 'https://a:b@evil.example' } })
    ).toContain('social_links.facebook'));
  it('reports a stock image path with dots only', () =>
    expect(
      issuePaths({ ...validSource(), profile_image: '/api/image-picker/stock-image/..' })
    ).toContain('profile_image'));
});

describe('site variant', () => {
  it.each([
    ['dunkel', 'dunkel'],
    ['hell', 'hell'],
    ['leuchtend', 'leuchtend'],
    ['gruene', 'dunkel'],
    ['', 'dunkel'],
    [null, 'dunkel'],
  ] as const)('readSiteVariant(%s) is %s', (theme, variant) =>
    expect(readSiteVariant(theme)).toBe(variant)
  );
  it('update body accepts a variant and rejects the legacy value', () => {
    expect(updateUserSiteBodySchema.safeParse({ theme: 'hell' }).success).toBe(true);
    expect(updateUserSiteBodySchema.safeParse({ theme: 'gruene' }).success).toBe(false);
  });
  it('the snapshot takes the variant from theme', () => {
    const r = buildSiteSnapshot({ ...validSource(), theme: 'leuchtend' }, 'de-DE');
    expect(r.ok && r.snapshot.variant).toBe('leuchtend');
  });
});

describe('hidden sections', () => {
  it('a draft accepts optional section ids', () =>
    expect(
      updateUserSiteBodySchema.safeParse({ sections: { hidden: ['themes', 'socialFeed'] } }).success
    ).toBe(true));
  it('a draft cannot hide the hero', () =>
    expect(updateUserSiteBodySchema.safeParse({ sections: { hidden: ['hero'] } }).success).toBe(
      false
    ));
  it('the snapshot lists them once, in page order, outside sections', () => {
    const src = validSource();
    const r = buildSiteSnapshot(
      { ...src, sections: { ...src.sections, hidden: ['contact', 'themes', 'contact'] } },
      'de-DE'
    );
    expect(r.ok && r.snapshot.hidden_sections).toEqual(['themes', 'contact']);
    expect(r.ok && 'hidden' in r.snapshot.sections).toBe(false);
  });
  it('a snapshot stored before this change parses with defaults', () => {
    const r = buildSiteSnapshot(validSource(), 'de-DE');
    if (!r.ok) throw new Error('fixture');
    const { variant: _v, hidden_sections: _h, ...stored } = r.snapshot;
    expect(publishedSiteSnapshotSchema.parse(stored)).toMatchObject({
      variant: 'dunkel',
      hidden_sections: [],
    });
  });
});

describe('buildSitePreviewSnapshot', () => {
  const aboutDoc = (content: unknown): SiteSnapshotSource => ({
    ...validSource(),
    sections: { about: { title: 'Über mich', content: content as never } },
  });
  it('equals the published snapshot for a valid draft', () => {
    const r = buildSiteSnapshot(validSource(), 'de-AT');
    expect(r.ok && buildSitePreviewSnapshot(validSource(), 'de-AT')).toEqual(r.ok && r.snapshot);
  });
  it.each(['javascript:alert(1)', 'www.example.org'])('blanks the action link %s', (link) => {
    const s = buildSitePreviewSnapshot(withActionLink(link), 'de-DE');
    expect(s.sections.actions?.[0]).toMatchObject({ text: 'Mitmachen', link: '' });
  });
  it('blanks a foreign image', () =>
    expect(
      buildSitePreviewSnapshot(
        { ...validSource(), profile_image: 'https://evil.example/x.png' },
        'de-DE'
      ).profile_image
    ).toBe(''));
  it('drops unsafe and unknown social links and keeps the rest', () =>
    expect(
      buildSitePreviewSnapshot(
        {
          ...validSource(),
          social_links: {
            instagram: 'javascript:x',
            tiktok: 'https://tiktok.com/@x',
            mastodon: 'https://gruene.social/@x',
          },
        },
        'de-DE'
      ).social_links
    ).toEqual({ mastodon: 'https://gruene.social/@x' }));
  it('fills a missing legal block with empty fields', () =>
    expect(buildSitePreviewSnapshot({ ...validSource(), legal: null }, 'de-DE').legal).toEqual({
      name: '',
      street: '',
      postal_code: '',
      city: '',
      email: '',
    }));
  it('keeps an empty title', () =>
    expect(buildSitePreviewSnapshot({ ...validSource(), site_title: '' }, 'de-DE').site_title).toBe(
      ''
    ));
  it('replaces rich text with an unsupported node by an empty doc', () =>
    expect(
      buildSitePreviewSnapshot(aboutDoc({ type: 'doc', content: [{ type: 'image' }] }), 'de-DE')
        .sections.about?.content
    ).toEqual(emptyRichTextDoc()));
  it('falls back to the default variant for an unknown theme', () =>
    expect(buildSitePreviewSnapshot({ ...validSource(), theme: 'pink' }, 'de-DE').variant).toBe(
      'dunkel'
    ));
});
