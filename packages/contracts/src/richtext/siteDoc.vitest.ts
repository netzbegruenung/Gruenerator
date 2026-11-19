import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { type RichTextDoc } from '../schemas/richtext.js';
import { siteDraftFromSite, siteDraftToSnapshotSource } from '../schemas/siteDraft.js';
import {
  buildSiteSnapshot,
  SITE_ACTIONS_MAX,
  SITE_THEMES_MAX,
  type SiteSnapshotSource,
} from '../schemas/sites.js';
import { SITE_YDOC_KEYS } from '../siteYdoc.js';

import {
  addSiteActionTile,
  addSiteThemeCard,
  decodeSiteDraft,
  encodeSiteSeed,
  getThemeFragment,
  isSiteDocSeeded,
  moveSiteThemeCard,
  seedSiteDoc,
  setSiteField,
} from './siteDoc.js';

const legal = {
  name: 'Anna Beispiel',
  street: 'Hauptstraße 1',
  postal_code: '10115',
  city: 'Berlin',
  email: 'anna@example.org',
};

const rich: RichTextDoc = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Titel' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Hallo ' },
        { type: 'text', text: 'Welt', marks: [{ type: 'bold' }] },
      ],
    },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Eins' }] }],
        },
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Zwei' }] }],
        },
      ],
    },
    {
      type: 'orderedList',
      attrs: { start: 1 },
      content: [
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Erstens' }] }],
        },
      ],
    },
  ],
};

const row = (): SiteSnapshotSource => ({
  site_title: 'Anna Beispiel',
  tagline: 'Für eine lebenswerte Stadt',
  profile_image: '/api/share/abcdef123456/download',
  theme: 'hell',
  contact_email: 'anna@example.org',
  contact_phone: '+49 30 123',
  social_links: { mastodon: 'https://gruene.social/@a' },
  legal,
  sections: {
    hidden: ['actions'],
    about: { title: 'Wer ich bin', content: rich },
    heroImage: { imageUrl: '', title: 'Gemeinsam', subtitle: 'Sub' },
    themes: [
      { imageUrl: '', title: 'Klima', content: rich },
      { imageUrl: '', title: 'Verkehr', content: rich },
    ],
    actions: [{ imageUrl: '', text: 'Mitmachen', link: '#kontakt' }],
    contact: { title: 'Kontakt', backgroundImageUrl: '' },
    socialFeed: { title: 'Instagram', instagramUsername: 'anna', showFeed: true },
  },
});

const seeded = () => {
  const ydoc = new Y.Doc();
  seedSiteDoc(ydoc, siteDraftFromSite(row()), '2026-11-19T10:00:00.000Z');
  return ydoc;
};

describe('site ydoc codec', () => {
  it.each(['de-DE', 'de-AT'] as const)(
    'golden: snapshot from the row equals snapshot from decode(seed(row)) (%s)',
    (locale) => {
      const source = row();
      const decoded = decodeSiteDraft(seeded());
      const back = siteDraftToSnapshotSource(decoded, source.legal);
      expect(buildSiteSnapshot(back, locale)).toEqual(buildSiteSnapshot(source, locale));
    }
  );

  it('isSiteDocSeeded is false on a blank doc and true after seedSiteDoc', () => {
    expect(isSiteDocSeeded(new Y.Doc())).toBe(false);
    expect(isSiteDocSeeded(seeded())).toBe(true);
  });

  it('encodeSiteSeed applied to a blank doc decodes to the same draft', () => {
    const draft = siteDraftFromSite(row());
    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, encodeSiteSeed(draft, '2026-11-19T10:00:00.000Z'));
    expect(decodeSiteDraft(ydoc)).toEqual(draft);
  });

  it('moveSiteThemeCard reorders only the order array; ids and fragments stay', () => {
    const ydoc = seeded();
    const [first, second] = decodeSiteDraft(ydoc).themes;
    moveSiteThemeCard(ydoc, first!.id, 1);
    const after = decodeSiteDraft(ydoc).themes;
    expect(after.map((theme) => theme.id)).toEqual([second!.id, first!.id]);
    expect(after[1]).toEqual(first);
    expect(getThemeFragment(ydoc, first!.id).length).toBeGreaterThan(0);
    expect(ydoc.getMap(SITE_YDOC_KEYS.themes).size).toBe(2);
  });

  it('addSiteThemeCard returns null at SITE_THEMES_MAX', () => {
    const ydoc = new Y.Doc();
    for (let i = 0; i < SITE_THEMES_MAX; i += 1) expect(addSiteThemeCard(ydoc)).not.toBeNull();
    expect(addSiteThemeCard(ydoc)).toBeNull();
    expect(decodeSiteDraft(ydoc).themes).toHaveLength(SITE_THEMES_MAX);
  });

  it('addSiteActionTile returns null at SITE_ACTIONS_MAX', () => {
    const ydoc = new Y.Doc();
    for (let i = 0; i < SITE_ACTIONS_MAX; i += 1) expect(addSiteActionTile(ydoc)).not.toBeNull();
    expect(addSiteActionTile(ydoc)).toBeNull();
  });

  it('two docs that edit different fields merge both edits', () => {
    const a = seeded();
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    setSiteField(a, 'site_title', 'Neu A');
    setSiteField(b, 'tagline', 'Neu B');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    for (const doc of [a, b]) {
      const draft = decodeSiteDraft(doc);
      expect(draft.site_title).toBe('Neu A');
      expect(draft.tagline).toBe('Neu B');
    }
  });

  it('decode survives garbage', () => {
    const ydoc = new Y.Doc();
    const fields = ydoc.getMap(SITE_YDOC_KEYS.fields);
    fields.set('hidden', 'x');
    fields.set('site_title', 42);
    fields.set('variant', 'bunt');
    const draft = decodeSiteDraft(ydoc);
    const blank = decodeSiteDraft(new Y.Doc());
    expect(draft.hidden).toEqual(blank.hidden);
    expect(draft.site_title).toBe('');
    expect(draft.variant).toBe(blank.variant);
  });
});
