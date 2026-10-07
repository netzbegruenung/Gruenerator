import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';

import { getPagesMap, readPages, replaceDeck, seedPagesIfEmpty } from './pagesDoc';

const ORIGIN = Symbol('test-local');

function setup() {
  const doc = new Y.Doc();
  seedPagesIfEmpty(doc, [
    {
      id: 'p1',
      configId: 'creator',
      state: { headline: 'Eins', old: 'x', sharepicSource: { v: 1, a: { b: 1 } } },
    },
    { id: 'p2', configId: 'creator', state: { headline: 'Zwei' } },
    { id: 'p3', configId: 'creator', state: { headline: 'Drei' } },
  ]);
  const undo = new Y.UndoManager(getPagesMap(doc), {
    trackedOrigins: new Set([ORIGIN]),
    captureTimeout: 0,
  });
  return { doc, undo };
}

const snapshot = (doc: Y.Doc) =>
  readPages(doc).map((v) => ({ id: v.id, configId: v.configId, state: v.state }));

describe('replaceDeck', () => {
  it('replaces the whole state map of updated pages (absent keys removed)', () => {
    const { doc } = setup();
    replaceDeck(
      doc,
      {
        updates: [
          { pageId: 'p1', state: { headline: 'Neu', sharepicSource: { v: 1, a: { b: 2 } } } },
        ],
        inserts: [],
        removes: [],
      },
      ORIGIN
    );
    const p1 = readPages(doc).find((v) => v.id === 'p1')!;
    expect(p1.state).toEqual({ headline: 'Neu', sharepicSource: { v: 1, a: { b: 2 } } });
    expect(readPages(doc).find((v) => v.id === 'p2')!.state).toEqual({ headline: 'Zwei' });
  });

  it('inserts after a page / at the front and removes pages with correct order', () => {
    const { doc } = setup();
    replaceDeck(
      doc,
      {
        updates: [],
        inserts: [
          { afterPageId: null, configId: 'creator', state: { headline: 'Null' }, pageId: 'n0' },
          { afterPageId: 'p1', configId: 'creator', state: { headline: 'Eins-b' }, pageId: 'n1' },
        ],
        removes: ['p2'],
      },
      ORIGIN
    );
    expect(readPages(doc).map((v) => v.id)).toEqual(['n0', 'p1', 'n1', 'p3']);
  });

  it('chains inserts after an earlier insert', () => {
    const { doc } = setup();
    replaceDeck(
      doc,
      {
        updates: [],
        inserts: [
          { afterPageId: 'p3', configId: 'c', state: {}, pageId: 'a' },
          { afterPageId: 'a', configId: 'c', state: {}, pageId: 'b' },
        ],
        removes: [],
      },
      ORIGIN
    );
    expect(readPages(doc).map((v) => v.id)).toEqual(['p1', 'p2', 'p3', 'a', 'b']);
  });

  it('is one undo step restoring updates, inserts and removes', () => {
    const { doc, undo } = setup();
    const before = snapshot(doc);
    replaceDeck(
      doc,
      {
        updates: [{ pageId: 'p1', state: { headline: 'Neu' } }],
        inserts: [
          { afterPageId: 'p3', configId: 'creator', state: { headline: 'Vier' }, pageId: 'p4' },
        ],
        removes: ['p2'],
      },
      ORIGIN
    );
    expect(undo.undoStack.length).toBe(1);
    undo.undo();
    expect(snapshot(doc)).toEqual(before);
    undo.redo();
    expect(readPages(doc).map((v) => v.id)).toEqual(['p1', 'p3', 'p4']);
  });
});
