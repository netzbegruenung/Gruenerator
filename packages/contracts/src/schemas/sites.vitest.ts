import { describe, expect, it } from 'vitest';

import { emptyRichTextDoc } from './richtext.js';
import {
  buildSiteSnapshot,
  buildSitePreviewSnapshot,
  checkSiteHandle,
  readSiteVariant,
  updateUserSiteBodySchema,
  type SiteBlock,
  type SiteSnapshotSource,
} from './sites.js';

let cardCount = 0;
const card = () => ({
  id: `card-${(cardCount += 1)}`,
  imageUrl: '',
  title: 'Klima',
  content: emptyRichTextDoc(),
});
const hero: SiteBlock = { id: 'hero', type: 'hero' };
const page = (...blocks: SiteBlock[]) => ({ blocks: [hero, ...blocks] });
const about = (content: unknown): SiteBlock => ({
  id: 'about',
  type: 'about',
  title: 'Über mich',
  content: content as never,
});
const themes = (...items: ReturnType<typeof card>[]): SiteBlock => ({
  id: 'themes',
  type: 'themes',
  items,
});
const action = (link: string) => ({ id: 'tile', imageUrl: '', text: 'Mitmachen', link });
const actions = (...items: ReturnType<typeof action>[]): SiteBlock => ({
  id: 'actions',
  type: 'actions',
  items,
});
const feed = (instagramUsername: string): SiteBlock => ({
  id: 'feed',
  type: 'socialFeed',
  title: 'Feed',
  instagramUsername,
});

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
  sections: page(about(emptyRichTextDoc()), themes({ ...card(), id: 'klima' }), actions()),
  legal: validLegal(),
});

const withActionLink = (link: string): SiteSnapshotSource => ({
  ...validSource(),
  sections: page(actions(action(link))),
});

const actionLink = (snapshot: { sections: { blocks: readonly SiteBlock[] } }) => {
  const block = snapshot.sections.blocks.find((b) => b.type === 'actions');
  return block?.type === 'actions' ? block.items[0]?.link : undefined;
};

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
  it.each(['impressum', 'datenschutz', 'api', 'WWW', 'neu', 'erstellen'])(
    'rejects %s as reserved',
    (raw) => expect(checkSiteHandle(raw)).toEqual({ ok: false, reason: 'reserved' })
  );
});

describe('draft bounds', () => {
  it('rejects a title above the limit', () =>
    expect(updateUserSiteBodySchema.safeParse({ site_title: 'x'.repeat(121) }).success).toBe(
      false
    ));
  it('rejects a seventh theme card', () =>
    expect(
      updateUserSiteBodySchema.safeParse({
        sections: page(themes(...Array.from({ length: 7 }, card))),
      }).success
    ).toBe(false));
  it('accepts a half-typed link in a draft', () =>
    expect(
      updateUserSiteBodySchema.safeParse({
        sections: page(actions(action('www.example'))),
      }).success
    ).toBe(true));
});

describe('buildSiteSnapshot', () => {
  it('builds version 2 with the locale', () => {
    const result = buildSiteSnapshot(validSource(), 'de-AT');
    expect(result.ok && result.snapshot).toMatchObject({ version: 2, locale: 'de-AT' });
  });
  it.each(['javascript:alert(1)', 'data:text/html,x', 'www.example.org', '//evil.example'])(
    'reports the action link %s',
    (link) => expect(issuePaths(withActionLink(link))).toContain('blocks.actions.items.tile.link')
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
    expect(result.ok && actionLink(result.snapshot)).toBe(expected);
  });
  it.each(['https://gruene.de/mitmachen', 'https://example.org/mitglied-werden', '#kontakt'])(
    'keeps the other action link %s untouched under de-AT',
    (link) => {
      const result = buildSiteSnapshot(withActionLink(link), 'de-AT');
      expect(result.ok && actionLink(result.snapshot)).toBe(link);
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
    sections: page(about(content)),
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
    ).toContain('blocks.about.content'));
  it('reports text carried by a non-text node', () =>
    expect(
      issuePaths(
        aboutDoc({ type: 'doc', content: [{ type: 'paragraph', text: 'x'.repeat(5000) }] })
      )
    ).toContain('blocks.about.content'));
  it('reports a doc nested seven levels deep', () =>
    expect(issuePaths(aboutDoc({ type: 'doc', content: [nested(3)] }))).toContain(
      'blocks.about.content'
    ));
  it('accepts a doc nested at the depth limit', () =>
    expect(buildSiteSnapshot(aboutDoc({ type: 'doc', content: [nested(2)] }), 'de-DE').ok).toBe(
      true
    ));
  it('reports an unknown node type', () =>
    expect(
      issuePaths(aboutDoc({ type: 'doc', content: [{ type: 'image', attrs: { src: 'x' } }] }))
    ).toContain('blocks.about.content'));
  it('reports a mark with attrs', () =>
    expect(
      issuePaths(
        aboutDoc({ type: 'doc', content: [para('x', [{ type: 'bold', attrs: { a: 1 } }])] })
      )
    ).toContain('blocks.about.content'));
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
    ).toContain('blocks.about.content'));
  it('reports text above the length limit', () =>
    expect(issuePaths(aboutDoc({ type: 'doc', content: [para('x'.repeat(1001))] }))).toContain(
      'blocks.about.content'
    ));
  it('reports a theme card with foreign attrs', () =>
    expect(
      issuePaths({
        ...validSource(),
        sections: page(
          themes({
            ...card(),
            id: 'klima',
            content: { type: 'doc', content: [{ ...para('x'), attrs: { id: 'a' } }] } as never,
          })
        ),
      })
    ).toContain('blocks.themes.items.klima.content'));
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
        sections: page(feed('x/../evil')),
      })
    ).toContain('blocks.feed.instagramUsername'));
  it('accepts an instagram name', () =>
    expect(
      buildSiteSnapshot(
        {
          ...validSource(),
          sections: page(feed('anna.b_1')),
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
    expect(issuePaths(withActionLink(link))).toContain('blocks.actions.items.tile.link')
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

describe('page rules and hidden blocks', () => {
  it('a draft accepts a hidden block', () =>
    expect(
      updateUserSiteBodySchema.safeParse({
        sections: page({ ...about(emptyRichTextDoc()), hidden: true }),
      }).success
    ).toBe(true));
  it('a draft needs the hero on top', () =>
    expect(
      updateUserSiteBodySchema.safeParse({
        sections: { blocks: [about(emptyRichTextDoc()), hero] },
      }).success
    ).toBe(false));
  it('leaves a hidden block out of the published snapshot', () => {
    const src = validSource();
    const r = buildSiteSnapshot(
      { ...src, sections: page({ ...about(emptyRichTextDoc()), hidden: true }, themes(card())) },
      'de-DE'
    );
    expect(r.ok && r.snapshot.sections.blocks.map((b) => b.type)).toEqual(['hero', 'themes']);
  });
  it('keeps a hidden block in the editor preview when asked', () => {
    const src = {
      ...validSource(),
      sections: page({ ...about(emptyRichTextDoc()), hidden: true }),
    };
    expect(buildSitePreviewSnapshot(src, 'de-DE').sections.blocks.map((b) => b.type)).toEqual([
      'hero',
    ]);
    const kept = buildSitePreviewSnapshot(src, 'de-DE', { includeHidden: true });
    expect(kept.sections.blocks[1]).toMatchObject({ type: 'about', hidden: true });
  });
  it('reports a broken item link by block and item id, not by index', () => {
    const second: SiteBlock = {
      id: 'more',
      type: 'actions',
      items: [action('#a'), { ...action('javascript:x'), id: 'bad' }],
    };
    expect(issuePaths({ ...validSource(), sections: page(actions(), second) })).toContain(
      'blocks.more.items.bad.link'
    );
  });
});

describe('preview of a broken page', () => {
  it('blanks a broken field and keeps its block', () => {
    const broken = { id: 'x', type: 'heroImage', imageUrl: 5 } as unknown as SiteBlock;
    const s = buildSitePreviewSnapshot(
      { ...validSource(), sections: page(broken, about(emptyRichTextDoc())) },
      'de-DE'
    );
    expect(s.sections.blocks.map((b) => b.type)).toEqual(['hero', 'heroImage', 'about']);
    expect(s.sections.blocks[1]).toMatchObject({ imageUrl: '', title: '' });
  });
  it('drops a block with an unknown type or a bad id and keeps the others', () => {
    const unknown = { id: 'u', type: 'karussell' } as unknown as SiteBlock;
    const badId = { ...about(emptyRichTextDoc()), id: 'a b' };
    const s = buildSitePreviewSnapshot(
      { ...validSource(), sections: page(unknown, badId, about(emptyRichTextDoc())) },
      'de-DE'
    );
    expect(s.sections.blocks.map((b) => b.id)).toEqual(['hero', 'about']);
  });
  it('puts the hero on top or adds one', () => {
    const misplaced = { blocks: [about(emptyRichTextDoc()), hero] };
    expect(
      buildSitePreviewSnapshot({ ...validSource(), sections: misplaced }, 'de-DE').sections
        .blocks[0]
    ).toMatchObject({ id: 'hero', type: 'hero' });
    const none = { blocks: [about(emptyRichTextDoc())] };
    expect(
      buildSitePreviewSnapshot({ ...validSource(), sections: none }, 'de-DE').sections.blocks[0]
        ?.type
    ).toBe('hero');
  });
});

describe('buildSitePreviewSnapshot', () => {
  const aboutDoc = (content: unknown): SiteSnapshotSource => ({
    ...validSource(),
    sections: page(about(content)),
  });
  it('equals the published snapshot for a valid draft', () => {
    const r = buildSiteSnapshot(validSource(), 'de-AT');
    expect(r.ok && buildSitePreviewSnapshot(validSource(), 'de-AT')).toEqual(r.ok && r.snapshot);
  });
  it.each(['javascript:alert(1)', 'www.example.org'])('blanks the action link %s', (link) => {
    const s = buildSitePreviewSnapshot(withActionLink(link), 'de-DE');
    expect(actionLink(s)).toBe('');
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
      buildSitePreviewSnapshot(
        aboutDoc({ type: 'doc', content: [{ type: 'image' }] }),
        'de-DE'
      ).sections.blocks.find((b) => b.type === 'about')
    ).toHaveProperty('content', emptyRichTextDoc()));
  it('falls back to the default variant for an unknown theme', () =>
    expect(buildSitePreviewSnapshot({ ...validSource(), theme: 'pink' }, 'de-DE').variant).toBe(
      'dunkel'
    ));
});
