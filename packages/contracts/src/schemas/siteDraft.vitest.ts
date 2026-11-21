import { describe, expect, it } from 'vitest';

import { emptyRichTextDoc, richTextDocFromPlainText } from './richtext.js';
import {
  siteDraftFromSite,
  siteDraftToRowColumns,
  siteDraftToSnapshotSource,
  snapshotDiffers,
} from './siteDraft.js';
import {
  buildSiteSnapshot,
  buildSitePreviewSnapshot,
  type PublishedSiteSnapshot,
  type SiteBlock,
  type SiteSnapshotSource,
} from './sites.js';

const legal = {
  name: 'Anna Beispiel',
  street: 'Hauptstraße 1',
  postal_code: '10115',
  city: 'Berlin',
  email: 'anna@example.org',
};

const blocks = (): SiteBlock[] => [
  { id: 'hero', type: 'hero', layout: 'vollbild' },
  { id: 'about', type: 'about', title: 'Wer ich bin', content: richTextDocFromPlainText('Hallo') },
  { id: 'banner', type: 'heroImage', imageUrl: '', title: 'Gemeinsam', subtitle: 'Sub' },
  {
    id: 'themes',
    type: 'themes',
    items: [
      { id: 't1', imageUrl: '', title: 'Klima', content: richTextDocFromPlainText('Text') },
      { id: 't2', imageUrl: '', title: 'Verkehr', content: richTextDocFromPlainText('Mehr') },
    ],
  },
  {
    id: 'actions',
    type: 'actions',
    hidden: true,
    items: [{ id: 'a1', imageUrl: '', text: 'Mitmachen', link: '#kontakt' }],
  },
  { id: 'contact', type: 'contact', title: 'Kontakt', backgroundImageUrl: '' },
  { id: 'feed', type: 'socialFeed', title: 'Instagram', instagramUsername: 'anna', showFeed: true },
];

const row = (): SiteSnapshotSource => ({
  site_title: 'Anna Beispiel',
  tagline: 'Für eine lebenswerte Stadt',
  profile_image: '/api/share/abcdef123456/download',
  theme: 'hell',
  contact_email: 'anna@example.org',
  contact_phone: '+49 30 123',
  social_links: { mastodon: 'https://gruene.social/@a' },
  legal,
  sections: { header: 'farbig', blocks: blocks() },
});

const withBlock = (source: SiteSnapshotSource, id: string, patch: Partial<SiteBlock>) => ({
  ...source,
  sections: {
    blocks: (source.sections?.blocks ?? []).map((block) =>
      block.id === id ? ({ ...block, ...patch } as SiteBlock) : block
    ),
  },
});

describe('site draft', () => {
  it('keeps the phone, the header and the block list of the row (#5801)', () => {
    const draft = siteDraftFromSite(row());
    expect(draft.contact_phone).toBe('+49 30 123');
    expect(draft.header).toBe('farbig');
    expect(draft.blocks).toEqual(blocks());
    expect(siteDraftToRowColumns(draft).sections).toEqual({ header: 'farbig', blocks: blocks() });
  });

  it('round-trips row → draft → source without changing the snapshot', () => {
    const source = row();
    const back = siteDraftToSnapshotSource(siteDraftFromSite(source), source.legal);
    expect(buildSiteSnapshot(back, 'de-AT')).toEqual(buildSiteSnapshot(source, 'de-AT'));
  });

  it('keeps block and item ids from the row through the round trip', () => {
    const columns = siteDraftToRowColumns(siteDraftFromSite(row()));
    expect(siteDraftFromSite({ ...row(), sections: columns.sections }).blocks).toEqual(blocks());
  });

  it('leaves defaults out of the row', () => {
    const source = withBlock(row(), 'actions', { hidden: false });
    const out = siteDraftToRowColumns(
      siteDraftFromSite({ ...source, sections: { blocks: source.sections.blocks } })
    );
    expect(out.sections).not.toHaveProperty('header');
    expect(out.sections.blocks.find((b) => b.id === 'actions')).not.toHaveProperty('hidden');
  });

  it('fills the defaults of a row without sections', () => {
    const draft = siteDraftFromSite({ ...row(), sections: null, theme: null, contact_phone: null });
    expect(draft).toMatchObject({ variant: 'dunkel', contact_phone: '', header: 'weiss' });
    expect(draft.blocks.map((b) => b.type)).toEqual([
      'hero',
      'about',
      'heroImage',
      'themes',
      'actions',
      'socialFeed',
      'contact',
    ]);
    expect(siteDraftFromSite({ ...row(), sections: { blocks: [] } }).blocks).toHaveLength(7);
  });

  it('snapshotDiffers is false for the same source, true after a title change', () => {
    const source = row();
    const built = buildSiteSnapshot(source, 'de-DE');
    if (!built.ok) throw new Error('fixture must be valid');
    expect(snapshotDiffers(source, built.snapshot)).toBe(false);
    expect(snapshotDiffers({ ...source, site_title: 'Neu' }, built.snapshot)).toBe(true);
    expect(snapshotDiffers({ ...source, legal: null }, built.snapshot)).toBe(true);
  });

  describe('key order (jsonb reorders keys on storage)', () => {
    // Re-inserts every object's keys in reverse order at every level; arrays keep their order.
    const reorder = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(reorder);
      if (!value || typeof value !== 'object') return value;
      return Object.fromEntries(
        Object.entries(value)
          .reverse()
          .map(([k, v]) => [k, reorder(v)])
      );
    };
    const build = (source: SiteSnapshotSource): PublishedSiteSnapshot => {
      const built = buildSiteSnapshot(source, 'de-DE');
      if (!built.ok) throw new Error('fixture must be valid');
      return built.snapshot;
    };

    it('compares a key-reordered published snapshot as equal', () => {
      const source = row();
      const published = reorder(build(source)) as PublishedSiteSnapshot;
      expect(JSON.stringify(published)).not.toBe(JSON.stringify(build(source)));
      expect(snapshotDiffers(source, published)).toBe(false);
    });

    it('still detects a text change and a list order change', () => {
      const source = row();
      const published = reorder(build(source)) as PublishedSiteSnapshot;
      const changed = withBlock(row(), 'about', { content: richTextDocFromPlainText('Anders') });
      expect(snapshotDiffers(changed, published)).toBe(true);
      const swapped = row();
      const list = [...(swapped.sections?.blocks ?? [])];
      [list[1], list[2]] = [list[2] as SiteBlock, list[1] as SiteBlock];
      expect(snapshotDiffers({ ...swapped, sections: { blocks: list } }, published)).toBe(true);
    });
  });

  it('treats every spelling of an empty rich text as unchanged', () => {
    const source = withBlock(row(), 'about', { content: emptyRichTextDoc() });
    const built = buildSiteSnapshot(source, 'de-DE');
    if (!built.ok) throw new Error('fixture must be valid');
    const withAbout = (content: unknown): PublishedSiteSnapshot =>
      JSON.parse(
        JSON.stringify({
          ...built.snapshot,
          sections: {
            ...built.snapshot.sections,
            blocks: built.snapshot.sections.blocks.map((b) =>
              b.id === 'about' ? { ...b, content } : b
            ),
          },
        })
      );
    for (const content of [
      { type: 'doc' },
      { type: 'doc', content: [] },
      { type: 'doc', content: [{ type: 'paragraph' }] },
      { type: 'doc', content: [{ type: 'paragraph', content: [] }] },
    ]) {
      expect(snapshotDiffers(source, withAbout(content))).toBe(false);
    }
    expect(
      snapshotDiffers(
        source,
        withAbout({
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }],
        })
      )
    ).toBe(true);
  });

  it('previews a half-finished draft without throwing', () => {
    const draft = siteDraftFromSite(
      withBlock(row(), 'actions', {
        hidden: false,
        items: [{ id: 'a', imageUrl: '', text: 'Los', link: 'www.halb' }],
      } as Partial<SiteBlock>)
    );
    const preview = buildSitePreviewSnapshot(siteDraftToSnapshotSource(draft, legal), 'de-AT');
    const tiles = preview.sections.blocks.find((b) => b.type === 'actions');
    expect(tiles?.type === 'actions' && tiles.items[0]?.link).toBe('');
  });

  it('drops empty social links in the snapshot', () => {
    const draft = siteDraftFromSite(row());
    draft.social_links = { instagram: '', mastodon: 'https://gruene.social/@a' };
    expect(
      buildSitePreviewSnapshot(siteDraftToSnapshotSource(draft, legal), 'de-AT').social_links
    ).toEqual({ mastodon: 'https://gruene.social/@a' });
  });
});
