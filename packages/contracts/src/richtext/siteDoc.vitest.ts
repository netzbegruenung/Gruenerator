import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { emptyRichTextDoc, type RichTextDoc } from '../schemas/richtext.js';
import {
  siteDraftFromSite,
  siteDraftToSnapshotSource,
  snapshotDiffers,
} from '../schemas/siteDraft.js';
import {
  buildSitePreviewSnapshot,
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
  removeSiteThemeCard,
  seedSiteDoc,
  setSiteField,
  updateSiteActionTile,
  updateSiteThemeCard,
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

const p = (...content: object[]) => ({ type: 'paragraph', content });
const t = (text: string, marks?: string[]) => ({
  type: 'text',
  text,
  ...(marks ? { marks: marks.map((type) => ({ type })) } : {}),
});
const li = (...content: object[]) => ({ type: 'listItem', content });

const lossyForms = ['orderedWithoutAttrs', 'orderedEditorForm'];

const goldenDocs: Record<string, RichTextDoc> = {
  inline: {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 3 }, content: [t('Drei')] },
      p(t('a', ['bold']), t('b', ['italic']), t('c', ['underline']), t('d', ['bold', 'italic'])),
      p(t('Zeile'), { type: 'hardBreak' }, t('Umbruch')),
      { type: 'paragraph' },
    ],
  },
  nestedList: {
    type: 'doc',
    content: [
      {
        type: 'bulletList',
        content: [li(p(t('oben')), { type: 'bulletList', content: [li(p(t('unten')))] })],
      },
    ],
  },
  orderedWithoutAttrs: {
    type: 'doc',
    content: [{ type: 'orderedList', content: [li(p(t('eins')))] }],
  },
  orderedStart3: {
    type: 'doc',
    content: [{ type: 'orderedList', attrs: { start: 3 }, content: [li(p(t('drei')))] }],
  },
  orderedStart1: {
    type: 'doc',
    content: [{ type: 'orderedList', attrs: { start: 1 }, content: [li(p(t('eins')))] }],
  },
  orderedEditorForm: {
    type: 'doc',
    content: [{ type: 'orderedList', attrs: { start: 1, type: null }, content: [li(p(t('x')))] }],
  },
  empty: emptyRichTextDoc(),
} as Record<string, RichTextDoc>;

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
  const goldenCases = (['de-DE', 'de-AT'] as const).flatMap((locale) =>
    Object.keys(goldenDocs).map((name) => [locale, name] as const)
  );

  it.each(goldenCases)(
    'golden rich text: row equals decode(seed(row)) (%s, %s)',
    (locale, name) => {
      const source = row();
      source.sections = {
        ...source.sections,
        about: { title: 'Wer ich bin', content: goldenDocs[name]! },
        themes: [{ imageUrl: '', title: 'T', content: goldenDocs[name]! }],
      };
      const ydoc = new Y.Doc();
      seedSiteDoc(ydoc, siteDraftFromSite(source), '2026-11-19T10:00:00.000Z');
      const back = siteDraftToSnapshotSource(decodeSiteDraft(ydoc), source.legal);
      const built = buildSiteSnapshot(source, locale);
      expect(built.ok).toBe(true);
      if (built.ok) expect(snapshotDiffers(back, built.snapshot)).toBe(false);
      if (!lossyForms.includes(name)) {
        expect(buildSiteSnapshot(back, locale)).toEqual(built);
      }
    }
  );

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

  it('concurrent moves of the same item leave no duplicate and keep the cap', () => {
    const a = seeded();
    for (let i = 0; i < SITE_THEMES_MAX - 2; i += 1) addSiteThemeCard(a);
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    const ids = decodeSiteDraft(a).themes.map((theme) => theme.id);
    moveSiteThemeCard(a, ids[0]!, 3);
    moveSiteThemeCard(b, ids[0]!, 1);
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    expect(a.getArray(SITE_YDOC_KEYS.themeOrder).length).toBeGreaterThan(SITE_THEMES_MAX);
    for (const doc of [a, b]) {
      const themes = decodeSiteDraft(doc).themes.map((theme) => theme.id);
      expect(new Set(themes).size).toBe(themes.length);
      expect([...themes].sort()).toEqual([...ids].sort());
      expect(themes.length).toBeLessThanOrEqual(SITE_THEMES_MAX);
    }
  });

  it('caps decoded themes and actions at the maximum', () => {
    const ydoc = new Y.Doc();
    for (let i = 0; i < SITE_THEMES_MAX; i += 1) addSiteThemeCard(ydoc);
    for (let i = 0; i < SITE_ACTIONS_MAX; i += 1) addSiteActionTile(ydoc);
    const extra = new Y.Doc();
    Y.applyUpdate(extra, Y.encodeStateAsUpdate(ydoc));
    addSiteThemeCard(extra);
    ydoc.transact(() => {
      ydoc.getArray<string>(SITE_YDOC_KEYS.themeOrder).push(['x1']);
      ydoc.getMap(SITE_YDOC_KEYS.themes).set('x1', new Y.Map());
    });
    expect(decodeSiteDraft(ydoc).themes).toHaveLength(SITE_THEMES_MAX);
  });

  it('skips non-map entries in the theme and action maps', () => {
    const ydoc = seeded();
    const [first] = decodeSiteDraft(ydoc).themes;
    ydoc.getMap(SITE_YDOC_KEYS.themes).set(first!.id, 'junk' as never);
    const actionId = decodeSiteDraft(ydoc).actions[0]!.id;
    ydoc.getMap(SITE_YDOC_KEYS.actions).set(actionId, 7 as never);
    const draft = decodeSiteDraft(ydoc);
    expect(draft.themes).toHaveLength(1);
    expect(draft.actions).toHaveLength(0);
  });

  it('removing a theme clears its fragment content', () => {
    const ydoc = seeded();
    const [first] = decodeSiteDraft(ydoc).themes;
    removeSiteThemeCard(ydoc, first!.id);
    expect(getThemeFragment(ydoc, first!.id).length).toBe(0);
    expect(decodeSiteDraft(ydoc).themes).toHaveLength(1);
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

describe('image focal point', () => {
  const focused = (): SiteSnapshotSource => {
    const source = row();
    source.sections = {
      ...source.sections,
      profileImageFocus: { x: 25, y: 0 },
      heroImage: { imageUrl: '', imageFocus: { x: 75, y: 100 }, title: 'Gemeinsam', subtitle: '' },
      themes: [{ imageUrl: '', imageFocus: { x: 0, y: 25 }, title: 'Klima', content: rich }],
      actions: [
        { imageUrl: '', imageFocus: { x: 100, y: 50 }, text: 'Mitmachen', link: '#kontakt' },
      ],
      contact: { title: 'Kontakt', backgroundImageUrl: '', backgroundFocus: { x: 50, y: 75 } },
    };
    return source;
  };

  it('codec round-trips a focus on a theme card', () => {
    const ydoc = new Y.Doc();
    seedSiteDoc(ydoc, siteDraftFromSite(focused()), '2026-11-19T10:00:00.000Z');
    const draft = decodeSiteDraft(ydoc);
    expect(draft.themes[0]?.imageFocus).toEqual({ x: 0, y: 25 });
    expect(draft.actions[0]?.imageFocus).toEqual({ x: 100, y: 50 });
    expect(draft.profileImageFocus).toEqual({ x: 25, y: 0 });
    expect(draft.heroImage.imageFocus).toEqual({ x: 75, y: 100 });
    expect(draft.contact.backgroundFocus).toEqual({ x: 50, y: 75 });
    const back = siteDraftToSnapshotSource(draft, legal);
    expect(buildSiteSnapshot(back, 'de-DE')).toEqual(buildSiteSnapshot(focused(), 'de-DE'));
  });

  it('mutators set and clear a focus on theme and action items', () => {
    const ydoc = seeded();
    const themeId = decodeSiteDraft(ydoc).themes[0]!.id;
    const actionId = decodeSiteDraft(ydoc).actions[0]!.id;
    updateSiteThemeCard(ydoc, themeId, { imageFocus: { x: 25, y: 25 } });
    updateSiteActionTile(ydoc, actionId, { imageFocus: { x: 75, y: 75 } });
    setSiteField(ydoc, 'profileImageFocus', { x: 0, y: 0 });
    let draft = decodeSiteDraft(ydoc);
    expect(draft.themes[0]?.imageFocus).toEqual({ x: 25, y: 25 });
    expect(draft.actions[0]?.imageFocus).toEqual({ x: 75, y: 75 });
    expect(draft.profileImageFocus).toEqual({ x: 0, y: 0 });
    updateSiteThemeCard(ydoc, themeId, { imageFocus: null });
    setSiteField(ydoc, 'profileImageFocus', null);
    draft = decodeSiteDraft(ydoc);
    expect(draft.themes[0]).not.toHaveProperty('imageFocus');
    expect(draft).not.toHaveProperty('profileImageFocus');
  });

  it('a site whose focus was never set does not differ, and a centred focus is left out', () => {
    const source = row();
    const built = buildSiteSnapshot(source, 'de-DE');
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const draft = decodeSiteDraft(seeded());
    expect(snapshotDiffers(siteDraftToSnapshotSource(draft, legal), built.snapshot)).toBe(false);
    draft.themes[0]!.imageFocus = { x: 50, y: 50 };
    draft.profileImageFocus = { x: 50, y: 50 };
    expect(snapshotDiffers(siteDraftToSnapshotSource(draft, legal), built.snapshot)).toBe(false);
    draft.themes[0]!.imageFocus = { x: 25, y: 50 };
    expect(snapshotDiffers(siteDraftToSnapshotSource(draft, legal), built.snapshot)).toBe(true);
  });

  it('the snapshot keeps a focus and drops an invalid one in preview', () => {
    const built = buildSiteSnapshot(focused(), 'de-DE');
    expect(built.ok && built.snapshot.sections.themes?.[0]?.imageFocus).toEqual({ x: 0, y: 25 });
    expect(built.ok && built.snapshot.sections.profileImageFocus).toEqual({ x: 25, y: 0 });
    const invalid = focused();
    // Boundary cast: a stored row can hold a value the schema does not allow.
    invalid.sections!.themes![0]!.imageFocus = { x: 30, y: 25 } as never;
    expect(buildSiteSnapshot(invalid, 'de-DE').ok).toBe(false);
    const preview = buildSitePreviewSnapshot(invalid, 'de-DE');
    expect(preview.sections.themes?.[0]?.imageFocus).toBeUndefined();
    expect(preview.sections.themes?.[0]?.title).toBe('Klima');
  });
});

describe('header style', () => {
  it('is white by default and left out of the row, so an untouched site does not differ', () => {
    const source = row();
    const built = buildSiteSnapshot(source, 'de-DE');
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const draft = decodeSiteDraft(seeded());
    expect(draft.header).toBe('weiss');
    const back = siteDraftToSnapshotSource(draft, legal);
    expect(back.sections).not.toHaveProperty('header');
    expect(snapshotDiffers(back, built.snapshot)).toBe(false);
  });

  it('round-trips the coloured header through the doc into the snapshot', () => {
    const ydoc = seeded();
    setSiteField(ydoc, 'header', 'farbig');
    const draft = decodeSiteDraft(ydoc);
    expect(draft.header).toBe('farbig');
    const built = buildSiteSnapshot(siteDraftToSnapshotSource(draft, legal), 'de-DE');
    expect(built.ok && built.snapshot.sections.header).toBe('farbig');
    const reseeded = new Y.Doc();
    seedSiteDoc(reseeded, siteDraftFromSite(siteDraftToSnapshotSource(draft, legal)), 'now');
    expect(decodeSiteDraft(reseeded).header).toBe('farbig');
  });

  it('reads an unknown stored value as white', () => {
    const ydoc = seeded();
    ydoc.getMap(SITE_YDOC_KEYS.fields).set('header', 'lila');
    expect(decodeSiteDraft(ydoc).header).toBe('weiss');
  });
});
