import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';

import {
  appendPage,
  buildPage,
  normalizePositions,
  duplicatePageById,
  foldLegacyFormStateIntoFirstPage,
  getPagesMap,
  insertPageAt,
  migrateLegacyDoc,
  movePageById,
  posBetween,
  readPages,
  removePageById,
  seedPageId,
  seedPagesIfEmpty,
  serializeDeck,
  setPageConfigById,
  updatePageStateById,
} from './pagesDoc';
import { YDOC_KEYS } from './ydocKeys';

/** Two docs kept in sync by applying each other's updates (a fake network). */
function syncedPair(): [Y.Doc, Y.Doc] {
  const a = new Y.Doc();
  const b = new Y.Doc();
  a.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin !== 'remote') Y.applyUpdate(b, update, 'remote');
  });
  b.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin !== 'remote') Y.applyUpdate(a, update, 'remote');
  });
  return [a, b];
}

/** Two independent docs merged only when `merge` is called (offline pair). */
function offlinePair(): { a: Y.Doc; b: Y.Doc; merge: () => void } {
  const a = new Y.Doc();
  const b = new Y.Doc();
  return {
    a,
    b,
    merge: () => {
      const ua = Y.encodeStateAsUpdate(a);
      const ub = Y.encodeStateAsUpdate(b);
      Y.applyUpdate(a, ub);
      Y.applyUpdate(b, ua);
    },
  };
}

const seedThree = (doc: Y.Doc) =>
  seedPagesIfEmpty(doc, [
    { id: 'p1', configId: 'slider', state: { headline: 'Eins' } },
    { id: 'p2', configId: 'slider', state: { headline: 'Zwei' } },
    { id: 'p3', configId: 'slider', state: { headline: 'Drei' } },
  ]);

describe('posBetween', () => {
  it('produces keys strictly between the bounds', () => {
    const mid = posBetween(null, null);
    expect(posBetween(null, mid) < mid).toBe(true);
    expect(posBetween(mid, null) > mid).toBe(true);
  });

  it('never ends in the smallest digit', () => {
    let lo: string | null = null;
    for (let i = 0; i < 100; i++) {
      const key: string = posBetween(lo, null);
      expect(key.endsWith('0')).toBe(false);
      lo = key;
    }
  });

  it('always finds a midpoint between adjacent generated keys', () => {
    // Repeatedly bisect the same interval — the pathological case for
    // fractional indexing.
    let lo = posBetween(null, null);
    let hi = posBetween(lo, null);
    for (let i = 0; i < 50; i++) {
      const mid = posBetween(lo, hi);
      expect(lo < mid && mid < hi).toBe(true);
      if (i % 2 === 0) lo = mid;
      else hi = mid;
    }
  });

  it('throws on inverted bounds', () => {
    expect(() => posBetween('b', 'a')).toThrow();
  });
});

describe('tied pos keys (concurrent op collisions)', () => {
  it('normalizePositions re-spaces tied keys deterministically', () => {
    const doc = new Y.Doc();
    seedPagesIfEmpty(doc, [
      { id: 'a', configId: 'slider', state: {} },
      { id: 'b', configId: 'slider', state: {} },
    ]);
    // Force a tie.
    const [first, second] = readPages(doc);
    second.yMap.set('pos', first.pos);

    normalizePositions(doc);
    const [na, nb] = readPages(doc);
    expect(na.pos < nb.pos).toBe(true);
    expect(readPages(doc).map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('insert and move recover from tied keys instead of throwing', () => {
    const doc = new Y.Doc();
    seedThree(doc);
    const views = readPages(doc);
    views[1].yMap.set('pos', views[0].pos);
    views[2].yMap.set('pos', views[0].pos);

    expect(() => insertPageAt(doc, 1, { id: 'x', configId: 'slider', state: {} })).not.toThrow();
    expect(() => movePageById(doc, 'p3', 'up')).not.toThrow();
    const ids = readPages(doc).map((p) => p.id);
    expect([...ids].sort()).toEqual(['p1', 'p2', 'p3', 'x']);
  });
});

describe('page operations', () => {
  it('seeds pages in order and is idempotent', () => {
    const doc = new Y.Doc();
    expect(seedThree(doc)).toBe(true);
    expect(readPages(doc).map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    expect(seedThree(doc)).toBe(false);
  });

  it('append/insert/remove keep canonical order', () => {
    const doc = new Y.Doc();
    seedThree(doc);
    appendPage(doc, { id: 'p4', configId: 'slider', state: {} });
    insertPageAt(doc, 1, { id: 'p1b', configId: 'slider', state: {} });
    removePageById(doc, 'p2');
    expect(readPages(doc).map((p) => p.id)).toEqual(['p1', 'p1b', 'p3', 'p4']);
  });

  it('duplicate clones state and config right after the source', () => {
    const doc = new Y.Doc();
    seedPagesIfEmpty(doc, [
      {
        id: 'p1',
        configId: 'dreizeilen',
        state: { line1: 'Grün' },
        config: { snapping: true, width: 1080 },
      },
      { id: 'p2', configId: 'dreizeilen', state: {} },
    ]);

    expect(duplicatePageById(doc, 'p1', 'copy')).toBe(true);
    const pages = readPages(doc);
    expect(pages.map((p) => p.id)).toEqual(['p1', 'copy', 'p2']);

    const copy = pages[1].yMap;
    expect(pages[1].state).toEqual({ line1: 'Grün' });
    const config = copy.get(YDOC_KEYS.config) as Y.Map<unknown>;
    expect(config.get('snapping')).toBe(true);
    expect(config.get('width')).toBe(1080);

    // Deep clone: mutating the copy's config leaves the original untouched.
    config.set('width', 99);
    const origConfig = pages[0].yMap.get(YDOC_KEYS.config) as Y.Map<unknown>;
    expect(origConfig.get('width')).toBe(1080);
  });

  it('move preserves the Y.Map identity and concurrent remote edits survive', () => {
    const [a, b] = syncedPair();
    seedThree(a);

    const pageOnA = readPages(a).find((p) => p.id === 'p2')!.yMap;
    movePageById(a, 'p2', 'up');
    expect(readPages(a).map((p) => p.id)).toEqual(['p2', 'p1', 'p3']);
    // Same Y.Map instance — no clone-delete-insert.
    expect(readPages(a).find((p) => p.id === 'p2')!.yMap).toBe(pageOnA);

    // A remote edit landing on the moved page is not lost.
    updatePageStateById(b, 'p2', { headline: 'Editiert' });
    expect(readPages(a).find((p) => p.id === 'p2')!.state.headline).toBe('Editiert');
  });

  it('concurrent reorders converge without duplicating or dropping pages', () => {
    const { a, b, merge } = offlinePair();
    seedThree(a);
    const ua = Y.encodeStateAsUpdate(a);
    Y.applyUpdate(b, ua);

    movePageById(a, 'p3', 'up');
    movePageById(b, 'p1', 'down');
    merge();

    const idsA = readPages(a).map((p) => p.id);
    const idsB = readPages(b).map((p) => p.id);
    expect(idsA).toEqual(idsB);
    expect([...idsA].sort()).toEqual(['p1', 'p2', 'p3']);
  });

  it('double-seed race with deterministic ids converges to one page set', () => {
    const { a, b, merge } = offlinePair();
    const defs = (headline: string) => [
      { id: seedPageId(0), configId: 'slider', state: { headline } },
      { id: seedPageId(1), configId: 'slider', state: { headline } },
    ];
    seedPagesIfEmpty(a, defs('von A'));
    seedPagesIfEmpty(b, defs('von B'));
    merge();

    expect(readPages(a)).toHaveLength(2);
    expect(readPages(b)).toHaveLength(2);
    expect(readPages(a).map((p) => p.id)).toEqual(readPages(b).map((p) => p.id));
  });

  it('updatePageState guards structurally equal object values', () => {
    const doc = new Y.Doc();
    seedThree(doc);
    updatePageStateById(doc, 'p1', { imageOffset: { x: 1, y: 2 } });

    let fired = 0;
    getPagesMap(doc).observeDeep(() => {
      fired += 1;
    });
    updatePageStateById(doc, 'p1', { imageOffset: { x: 1, y: 2 } });
    expect(fired).toBe(0);
    updatePageStateById(doc, 'p1', { imageOffset: { x: 3, y: 2 } });
    expect(fired).toBe(1);
  });

  it('setPageConfig replaces configId and state but keeps id and pos', () => {
    const doc = new Y.Doc();
    seedPagesIfEmpty(doc, [{ id: 'p1', configId: 'zitat', state: { quote: 'Hallo' } }]);
    const before = readPages(doc)[0];
    setPageConfigById(doc, 'p1', 'info', { header: 'Neu' });

    const after = readPages(doc)[0];
    expect(after.configId).toBe('info');
    expect(after.state).toEqual({ header: 'Neu' });
    expect(after.pos).toBe(before.pos);
    expect(after.yMap).toBe(before.yMap);
  });

  it('serializeDeck returns pages in order with config', () => {
    const doc = new Y.Doc();
    seedPagesIfEmpty(doc, [
      { id: 'p1', configId: 'slider', state: { headline: 'A' }, config: { width: 1080 } },
      { id: 'p2', configId: 'slider', state: { headline: 'B' } },
    ]);
    movePageById(doc, 'p2', 'up');

    const deck = serializeDeck(doc);
    expect(deck.map((p) => p.id)).toEqual(['p2', 'p1']);
    expect(deck[1].config).toEqual({ width: 1080 });
    expect(deck[0].config).toEqual({});
  });
});

describe('legacy migration', () => {
  it('lifts a legacy pages Y.Array into pagesById preserving order and config', () => {
    const doc = new Y.Doc();
    const legacy = doc.getArray<Y.Map<unknown>>(YDOC_KEYS.pages);
    doc.transact(() => {
      const p1 = buildPage(
        { id: 'a', configId: 'slider', state: { headline: '1' }, config: { width: 1080 } },
        'ignored'
      );
      p1.delete(YDOC_KEYS.pos);
      const p2 = buildPage({ id: 'b', configId: 'slider', state: { headline: '2' } }, 'ignored');
      p2.delete(YDOC_KEYS.pos);
      legacy.push([p1, p2]);
    });

    doc.transact(() => migrateLegacyDoc(doc));

    expect(legacy.length).toBe(0);
    const pages = readPages(doc);
    expect(pages.map((p) => p.id)).toEqual(['a', 'b']);
    const config = pages[0].yMap.get(YDOC_KEYS.config) as Y.Map<unknown>;
    expect(config.get('width')).toBe(1080);

    // Idempotent.
    doc.transact(() => migrateLegacyDoc(doc));
    expect(readPages(doc)).toHaveLength(2);
  });

  it('promotes legacy_root config into a single page', () => {
    const doc = new Y.Doc();
    doc.transact(() => {
      doc.getMap<unknown>(YDOC_KEYS.legacyRoot).set('marker', true);
      doc.getMap<unknown>(YDOC_KEYS.config).set('width', 1080);
    });

    doc.transact(() => migrateLegacyDoc(doc));
    const pages = readPages(doc);
    expect(pages).toHaveLength(1);
    const config = pages[0].yMap.get(YDOC_KEYS.config) as Y.Map<unknown>;
    expect(config.get('width')).toBe(1080);
    // Der alte Top-Level-Typ ist danach leer.
    expect(doc.getMap<unknown>(YDOC_KEYS.config).size).toBe(0);
  });

  it('folds legacy formState into a single page once', () => {
    const doc = new Y.Doc();
    seedPagesIfEmpty(doc, [{ id: 'p1', configId: 'zitat', state: { quote: 'Alt' } }]);
    doc.getMap<unknown>(YDOC_KEYS.formState).set('quote', 'Editiert');
    doc.getMap<unknown>(YDOC_KEYS.formState).set('_seeded', true);

    doc.transact(() => foldLegacyFormStateIntoFirstPage(doc));
    expect(readPages(doc)[0].state.quote).toBe('Editiert');
    // Internal markers stay out of page state.
    expect('_seeded' in readPages(doc)[0].state).toBe(false);

    // One-shot: later formState garbage is not re-applied.
    doc.getMap<unknown>(YDOC_KEYS.formState).set('quote', 'Später');
    doc.transact(() => foldLegacyFormStateIntoFirstPage(doc));
    expect(readPages(doc)[0].state.quote).toBe('Editiert');
  });

  it('does not fold formState into multi-page docs (but marks them folded)', () => {
    const doc = new Y.Doc();
    seedThree(doc);
    doc.getMap<unknown>(YDOC_KEYS.formState).set('headline', 'Gemischt');
    doc.transact(() => foldLegacyFormStateIntoFirstPage(doc));
    expect(readPages(doc)[0].state.headline).toBe('Eins');
    expect(doc.getMap<unknown>(YDOC_KEYS.meta).get(YDOC_KEYS.formStateFolded)).toBe(true);
  });

  it('does NOT mark 0-page docs folded — the fold must still run after the seed', () => {
    const doc = new Y.Doc();
    doc.getMap<unknown>(YDOC_KEYS.formState).set('quote', 'Chat');
    doc.transact(() => foldLegacyFormStateIntoFirstPage(doc));
    expect(doc.getMap<unknown>(YDOC_KEYS.meta).get(YDOC_KEYS.formStateFolded)).toBeUndefined();

    // Seed later (client fallback) → fold applies the chat content.
    seedPagesIfEmpty(doc, [{ id: 'seed-0', configId: 'zitat', state: { quote: 'Default' } }]);
    doc.transact(() => foldLegacyFormStateIntoFirstPage(doc));
    expect(readPages(doc)[0].state.quote).toBe('Chat');
  });
});
