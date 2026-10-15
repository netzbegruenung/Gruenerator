import { SHAREPIC_SOURCE_KEY } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { getPagesMap, readPages, replaceDeck, seedPagesIfEmpty } from './pagesDoc';
import { isDeckEmpty, vorlageDeckOps } from './vorlageDeck';

const blank = {
  configId: 'freeform',
  state: { backgroundMode: 'color', backgroundColor: '#005538' },
};

describe('isDeckEmpty', () => {
  it('is true for a fresh freeform page, also the AT one', () => {
    expect(isDeckEmpty([blank])).toBe(true);
    expect(isDeckEmpty([{ ...blank, configId: 'freeform-at' }])).toBe(true);
    expect(
      isDeckEmpty([{ configId: 'freeform', state: { additionalTexts: [], layerOrder: ['x'] } }])
    ).toBe(true);
  });

  it.each([
    ['a text', { additionalTexts: [{ id: 't1', text: 'Hallo' }] }],
    ['a shape', { shapeInstances: [{ id: 's1' }] }],
    ['an icon', { selectedIcons: ['leaf'] }],
    ['a placed picture', { userImageInstances: [{ id: 'u1' }] }],
    ['a background photo', { currentImageSrc: '/foto.jpg' }],
    ['stashed composer planes', { stashedComposerPlanes: [{ id: 'p' }] }],
    ['a composed spec', { [SHAREPIC_SOURCE_KEY]: { v: 1 } }],
  ])('is false with %s', (_, extra) => {
    expect(isDeckEmpty([{ ...blank, state: { ...blank.state, ...extra } }])).toBe(false);
  });

  it('is false for a second page or a template page', () => {
    expect(isDeckEmpty([blank, blank])).toBe(false);
    expect(isDeckEmpty([{ configId: 'dreizeilen', state: {} }])).toBe(false);
    expect(isDeckEmpty([])).toBe(false);
  });
});

describe('vorlageDeckOps', () => {
  const ids = (() => {
    let n = 0;
    return () => `neu-${++n}`;
  })();
  const page = (title: string) => ({ configId: 'freeform', state: { title } });

  it('rewrites a page of the same config in place', () => {
    const ops = vorlageDeckOps([{ id: 'a', configId: 'freeform' }], [page('Eins')], ids);
    expect(ops).toEqual({
      updates: [{ pageId: 'a', state: { title: 'Eins' } }],
      inserts: [],
      removes: [],
    });
  });

  it('drops the pages the Vorlage does not have', () => {
    const ops = vorlageDeckOps(
      [
        { id: 'a', configId: 'freeform' },
        { id: 'b', configId: 'freeform' },
      ],
      [page('Eins')],
      ids
    );
    expect(ops.removes).toEqual(['b']);
  });

  it('replaces a template page instead of rewriting it under the wrong config', () => {
    const ops = vorlageDeckOps([{ id: 'a', configId: 'dreizeilen' }], [page('Eins')], () => 'n1');
    expect(ops.updates).toEqual([]);
    expect(ops.inserts).toEqual([
      { afterPageId: null, configId: 'freeform', state: { title: 'Eins' }, pageId: 'n1' },
    ]);
    expect(ops.removes).toEqual(['a']);
  });

  it('builds the Vorlage page order on a real document, in one undo step', () => {
    const origin = Symbol('local');
    const doc = new Y.Doc();
    seedPagesIfEmpty(doc, [
      { id: 'a', configId: 'dreizeilen', state: { line1: 'Alt' } },
      { id: 'b', configId: 'freeform', state: { title: 'Alt B' } },
      { id: 'c', configId: 'freeform', state: { title: 'Alt C' } },
    ]);
    const undo = new Y.UndoManager(getPagesMap(doc), {
      trackedOrigins: new Set([origin]),
      captureTimeout: 0,
    });
    const before = readPages(doc).map((v) => ({ id: v.id, configId: v.configId, state: v.state }));

    replaceDeck(
      doc,
      vorlageDeckOps(before, [page('1'), page('2'), page('3'), page('4')], ids),
      origin
    );
    expect(readPages(doc).map((v) => v.state.title)).toEqual(['1', '2', '3', '4']);
    expect(readPages(doc).every((v) => v.configId === 'freeform')).toBe(true);
    expect(readPages(doc)[1]!.id).toBe('b');

    undo.undo();
    expect(readPages(doc).map((v) => ({ id: v.id, configId: v.configId, state: v.state }))).toEqual(
      before
    );
  });
});
