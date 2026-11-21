import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { emptyRichTextDoc, type RichTextDoc } from '../schemas/richtext.js';
import {
  siteDraftFromSite,
  siteDraftToSnapshotSource,
  snapshotDiffers,
  type SiteDraft,
} from '../schemas/siteDraft.js';
import { buildSiteSnapshot, type SiteBlock, type SiteSnapshotSource } from '../schemas/sites.js';
import { SITE_META_KEYS, SITE_YDOC_KEYS } from '../siteYdoc.js';

import {
  addSiteBlock,
  addSiteItem,
  decodeSiteDraft,
  duplicateSiteBlock,
  encodeSiteSeed,
  getBlockFragment,
  getItemFragment,
  isSiteDocSeeded,
  moveSiteBlock,
  moveSiteItem,
  removeSiteBlock,
  removeSiteItem,
  seedSiteDoc,
  setSiteBlockField,
  setSiteBlockHidden,
  setSiteField,
  updateSiteItem,
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

const blocks = (): SiteBlock[] => [
  { id: 'hero', type: 'hero', layout: 'vollbild' },
  { id: 'about', type: 'about', title: 'Wer ich bin', content: rich },
  { id: 'banner', type: 'heroImage', imageUrl: '', title: 'Gemeinsam', subtitle: 'Sub' },
  {
    id: 'themes',
    type: 'themes',
    items: [
      { id: 't1', imageUrl: '', title: 'Klima', content: rich, imageFocus: { x: 25, y: 75 } },
      { id: 't2', imageUrl: '', title: 'Verkehr', content: rich },
    ],
  },
  {
    id: 'actions',
    type: 'actions',
    hidden: true,
    items: [{ id: 'a1', imageUrl: '', text: 'Mitmachen', link: '#kontakt' }],
  },
  { id: 'feed', type: 'socialFeed', title: 'Instagram', instagramUsername: 'anna', showFeed: true },
  { id: 'contact', type: 'contact', title: 'Kontakt', backgroundImageUrl: '' },
];

const row = (list: SiteBlock[] = blocks()): SiteSnapshotSource => ({
  site_title: 'Anna Beispiel',
  tagline: 'Für eine lebenswerte Stadt',
  profile_image: '/api/share/abcdef123456/download',
  theme: 'hell',
  contact_email: 'anna@example.org',
  contact_phone: '+49 30 123',
  social_links: { mastodon: 'https://gruene.social/@a' },
  legal,
  sections: { header: 'farbig', profileImageFocus: { x: 50, y: 25 }, blocks: list },
});

const SEEDED_AT = '2026-11-21T10:00:00.000Z';

const seeded = (list?: SiteBlock[]) => {
  const ydoc = new Y.Doc();
  seedSiteDoc(ydoc, siteDraftFromSite(row(list)), SEEDED_AT);
  return ydoc;
};

const types = (draft: SiteDraft) => draft.blocks.map((block) => block.type);
const block = (draft: SiteDraft, id: string) => draft.blocks.find((b) => b.id === id);

const sync = (a: Y.Doc, b: Y.Doc) => {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
};

describe('site ydoc codec', () => {
  it.each(Object.keys(goldenDocs))('round-trips rich text through the doc (%s)', (name) => {
    const doc = goldenDocs[name]!;
    const list = blocks().map((b) =>
      b.type === 'about'
        ? { ...b, content: doc }
        : b.type === 'themes'
          ? { ...b, items: b.items.map((item) => ({ ...item, content: doc })) }
          : b
    );
    const source = row(list);
    const back = siteDraftToSnapshotSource(decodeSiteDraft(seeded(list)), source.legal);
    const built = buildSiteSnapshot(source, 'de-DE');
    expect(built.ok).toBe(true);
    if (built.ok) expect(snapshotDiffers(back, built.snapshot)).toBe(false);
    if (!lossyForms.includes(name)) {
      expect(buildSiteSnapshot(back, 'de-DE')).toEqual(built);
    }
  });

  it('decodes the seeded draft unchanged', () => {
    expect(decodeSiteDraft(seeded())).toEqual(siteDraftFromSite(row()));
  });

  it('encodeSiteSeed applied to a blank doc decodes to the same draft', () => {
    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, encodeSiteSeed(siteDraftFromSite(row()), SEEDED_AT));
    expect(decodeSiteDraft(ydoc)).toEqual(siteDraftFromSite(row()));
  });

  it('a doc in the old layout counts as not seeded', () => {
    expect(isSiteDocSeeded(new Y.Doc())).toBe(false);
    expect(isSiteDocSeeded(seeded())).toBe(true);
    const old = new Y.Doc();
    old.getMap(SITE_YDOC_KEYS.meta).set(SITE_META_KEYS.schemaVersion, 1);
    old.getMap(SITE_YDOC_KEYS.meta).set(SITE_META_KEYS.seededAt, SEEDED_AT);
    old.getMap('siteThemes').set('t1', new Y.Map());
    expect(isSiteDocSeeded(old)).toBe(false);
  });

  it('stays seeded when an old editor tab writes its meta back', () => {
    // The old tab's meta entries are concurrent with the seed's, and Yjs may keep either.
    const ydoc = seeded();
    ydoc.getMap(SITE_YDOC_KEYS.meta).set(SITE_META_KEYS.schemaVersion, 1);
    expect(isSiteDocSeeded(ydoc)).toBe(true);
  });

  it('page fields round-trip and an unknown header reads as white', () => {
    const ydoc = seeded();
    setSiteField(ydoc, 'tagline', 'Neu');
    expect(decodeSiteDraft(ydoc).tagline).toBe('Neu');
    ydoc.getMap(SITE_YDOC_KEYS.fields).set('header', 'lila');
    expect(decodeSiteDraft(ydoc).header).toBe('weiss');
  });
});

describe('block operations', () => {
  it('adds a block at an index and refuses a second contact', () => {
    const ydoc = seeded();
    expect(addSiteBlock(ydoc, 'contact', 3)).toBeNull();
    const id = addSiteBlock(ydoc, 'themes', 3);
    expect(id).not.toBeNull();
    const draft = decodeSiteDraft(ydoc);
    expect(draft.blocks[3]).toMatchObject({ id, type: 'themes', items: [] });
  });

  it('refuses a block past the page limit', () => {
    const ydoc = seeded();
    for (let n = 0; n < 13; n += 1) expect(addSiteBlock(ydoc, 'about', 1)).not.toBeNull();
    expect(decodeSiteDraft(ydoc).blocks).toHaveLength(20);
    expect(addSiteBlock(ydoc, 'about', 1)).toBeNull();
  });

  it('never moves the hero and never moves a block above it', () => {
    const ydoc = seeded();
    expect(moveSiteBlock(ydoc, 'hero', 2)).toBe(false);
    expect(moveSiteBlock(ydoc, 'contact', 0)).toBe(true);
    expect(types(decodeSiteDraft(ydoc)).slice(0, 2)).toEqual(['hero', 'contact']);
  });

  it('refuses to hide, remove or duplicate the hero', () => {
    const ydoc = seeded();
    expect(setSiteBlockHidden(ydoc, 'hero', true)).toBe(false);
    expect(removeSiteBlock(ydoc, 'hero')).toBe(false);
    expect(duplicateSiteBlock(ydoc, 'hero')).toBeNull();
    expect(duplicateSiteBlock(ydoc, 'contact')).toBeNull();
  });

  it('hides and shows a block', () => {
    const ydoc = seeded();
    expect(setSiteBlockHidden(ydoc, 'about', true)).toBe(true);
    expect(block(decodeSiteDraft(ydoc), 'about')).toMatchObject({ hidden: true });
    expect(setSiteBlockHidden(ydoc, 'about', false)).toBe(true);
    expect(block(decodeSiteDraft(ydoc), 'about')).not.toHaveProperty('hidden');
  });

  it('sets a field only on a block of the named type', () => {
    const ydoc = seeded();
    expect(setSiteBlockField(ydoc, 'banner', 'heroImage', { title: 'Neu' })).toBe(true);
    expect(setSiteBlockField(ydoc, 'about', 'heroImage', { title: 'Falsch' })).toBe(false);
    expect(setSiteBlockField(ydoc, 'hero', 'hero', { layout: 'portrait' })).toBe(true);
    const draft = decodeSiteDraft(ydoc);
    expect(block(draft, 'banner')).toMatchObject({ title: 'Neu' });
    expect(block(draft, 'about')).toMatchObject({ title: 'Wer ich bin' });
    expect(block(draft, 'hero')).toMatchObject({ layout: 'portrait' });
  });

  it('duplicates a theme block with new ids right after the original', () => {
    const ydoc = seeded();
    const copyId = duplicateSiteBlock(ydoc, 'themes');
    expect(copyId).not.toBeNull();
    const draft = decodeSiteDraft(ydoc);
    const index = draft.blocks.findIndex((b) => b.id === 'themes');
    const copy = draft.blocks[index + 1];
    const original = draft.blocks[index];
    if (copy?.type !== 'themes' || original?.type !== 'themes') throw new Error('no copy');
    expect(copy.id).toBe(copyId);
    expect(copy.items.map((item) => item.title)).toEqual(['Klima', 'Verkehr']);
    expect(copy.items[0]?.imageFocus).toEqual({ x: 25, y: 75 });
    expect(copy.items[0]?.content).toEqual(original.items[0]?.content);
    const itemIds = copy.items.map((item) => item.id);
    expect(itemIds).not.toContain('t1');
    expect(new Set(itemIds).size).toBe(2);

    updateSiteItem(ydoc, copy.id, itemIds[0]!, { title: 'Kopie' });
    getItemFragment(ydoc, itemIds[0]!).delete(0, 1);
    const after = decodeSiteDraft(ydoc);
    const originalAfter = block(after, 'themes');
    expect(originalAfter?.type === 'themes' && originalAfter.items[0]?.title).toBe('Klima');
    expect(originalAfter?.type === 'themes' && originalAfter.items[0]?.content).toEqual(rich);
  });

  it('duplicates the about text', () => {
    const ydoc = seeded();
    const copyId = duplicateSiteBlock(ydoc, 'about');
    expect(block(decodeSiteDraft(ydoc), copyId!)).toMatchObject({ type: 'about', content: rich });
  });

  it('removing a block clears its text and the text of its cards', () => {
    const ydoc = seeded();
    expect(removeSiteBlock(ydoc, 'themes')).toBe(true);
    expect(getItemFragment(ydoc, 't1').length).toBe(0);
    expect(removeSiteBlock(ydoc, 'about')).toBe(true);
    expect(getBlockFragment(ydoc, 'about').length).toBe(0);
    expect(types(decodeSiteDraft(ydoc))).not.toContain('themes');
  });
});

describe('item operations', () => {
  it('adds, updates, moves and removes a card, capped at six', () => {
    const ydoc = seeded();
    const id = addSiteItem(ydoc, 'themes');
    expect(id).not.toBeNull();
    expect(updateSiteItem(ydoc, 'themes', id!, { title: 'Bildung' })).toBe(true);
    expect(moveSiteItem(ydoc, 'themes', id!, 0)).toBe(true);
    let themes = block(decodeSiteDraft(ydoc), 'themes');
    expect(themes?.type === 'themes' && themes.items.map((i) => i.title)).toEqual([
      'Bildung',
      'Klima',
      'Verkehr',
    ]);
    for (let n = 0; n < 3; n += 1) expect(addSiteItem(ydoc, 'themes')).not.toBeNull();
    expect(addSiteItem(ydoc, 'themes')).toBeNull();
    expect(removeSiteItem(ydoc, 'themes', 't1')).toBe(true);
    expect(getItemFragment(ydoc, 't1').length).toBe(0);
    themes = block(decodeSiteDraft(ydoc), 'themes');
    expect(themes?.type === 'themes' && themes.items).toHaveLength(5);
  });

  it('refuses items on a block without a list', () => {
    expect(addSiteItem(seeded(), 'about')).toBeNull();
  });

  it('sets and clears a focus on an action tile', () => {
    const ydoc = seeded();
    updateSiteItem(ydoc, 'actions', 'a1', { imageFocus: { x: 0, y: 100 } });
    let tiles = block(decodeSiteDraft(ydoc), 'actions');
    expect(tiles?.type === 'actions' && tiles.items[0]?.imageFocus).toEqual({ x: 0, y: 100 });
    updateSiteItem(ydoc, 'actions', 'a1', { imageFocus: null });
    tiles = block(decodeSiteDraft(ydoc), 'actions');
    expect(tiles?.type === 'actions' && tiles.items[0]).not.toHaveProperty('imageFocus');
  });
});

describe('concurrency and broken state', () => {
  it('two people moving the same block leave it on the page once', () => {
    const a = seeded();
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    moveSiteBlock(a, 'themes', 1);
    moveSiteBlock(b, 'themes', 6);
    sync(a, b);
    const left = decodeSiteDraft(a);
    expect(left.blocks.filter((x) => x.id === 'themes')).toHaveLength(1);
    expect(left).toEqual(decodeSiteDraft(b));
    expect(left.blocks).toHaveLength(7);
  });

  it('two people editing different blocks merge both edits', () => {
    const a = seeded();
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    setSiteBlockField(a, 'banner', 'heroImage', { title: 'A' });
    setSiteBlockField(b, 'contact', 'contact', { title: 'B' });
    sync(a, b);
    const draft = decodeSiteDraft(a);
    expect(block(draft, 'banner')).toMatchObject({ title: 'A' });
    expect(block(draft, 'contact')).toMatchObject({ title: 'B' });
  });

  it('puts a misplaced hero on top', () => {
    const ydoc = seeded();
    const order = ydoc.getArray<string>(SITE_YDOC_KEYS.blockOrder);
    order.delete(0, 1);
    order.push(['hero']);
    expect(types(decodeSiteDraft(ydoc))[0]).toBe('hero');
  });

  it('adds a hero when the doc has none', () => {
    const ydoc = seeded();
    ydoc.getArray<string>(SITE_YDOC_KEYS.blockOrder).delete(0, 1);
    ydoc.getMap(SITE_YDOC_KEYS.blocks).delete('hero');
    const draft = decodeSiteDraft(ydoc);
    expect(types(draft)[0]).toBe('hero');
    expect(draft.blocks.filter((b) => b.type === 'hero')).toHaveLength(1);
  });

  it('appends a block that lost its order entry instead of losing it', () => {
    const ydoc = seeded();
    const order = ydoc.getArray<string>(SITE_YDOC_KEYS.blockOrder);
    order.delete(order.toArray().indexOf('banner'), 1);
    expect(decodeSiteDraft(ydoc).blocks.at(-1)?.id).toBe('banner');
  });

  it('moves a block that a concurrent move left in the order twice', () => {
    const a = seeded();
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    moveSiteBlock(a, 'contact', 1);
    moveSiteBlock(b, 'contact', 2);
    sync(a, b);
    const last = decodeSiteDraft(a).blocks.length - 1;
    expect(moveSiteBlock(a, 'contact', last)).toBe(true);
    expect(decodeSiteDraft(a).blocks.at(-1)?.id).toBe('contact');
  });

  it('moves by page position even with dangling order entries', () => {
    const ydoc = seeded();
    ydoc.getArray<string>(SITE_YDOC_KEYS.blockOrder).insert(1, ['gone', 'gone2']);
    expect(moveSiteBlock(ydoc, 'contact', 2)).toBe(true);
    expect(decodeSiteDraft(ydoc).blocks[2]?.id).toBe('contact');
  });

  it('moves a block that lost its order entry', () => {
    const ydoc = seeded();
    const order = ydoc.getArray<string>(SITE_YDOC_KEYS.blockOrder);
    order.delete(order.toArray().indexOf('banner'), 1);
    expect(moveSiteBlock(ydoc, 'banner', 1)).toBe(true);
    expect(decodeSiteDraft(ydoc).blocks[1]?.id).toBe('banner');
  });

  it('counts only live cards against the card limit', () => {
    const ydoc = seeded();
    const themes = ydoc.getMap(SITE_YDOC_KEYS.blocks).get('themes') as Y.Map<unknown>;
    (themes.get('itemOrder') as Y.Array<string>).push(['x1', 'x2', 'x3', 'x4']);
    expect(addSiteItem(ydoc, 'themes')).not.toBeNull();
  });

  it('survives garbage in the maps', () => {
    const ydoc = seeded();
    ydoc.getMap(SITE_YDOC_KEYS.blocks).set('junk', 'not a map');
    ydoc.getArray<string>(SITE_YDOC_KEYS.blockOrder).push(['junk', 'missing']);
    const draft = decodeSiteDraft(ydoc);
    expect(draft.blocks.map((b) => b.id)).not.toContain('junk');
    expect(draft.blocks).toHaveLength(7);
  });
});
