import { SHAREPIC_SOURCE_KEY } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { getPagesMap, readPages, replaceDeck, seedPagesIfEmpty } from './pagesDoc';
import {
  carryImpressum,
  isDeckEmpty,
  pageSwapOps,
  seiteDeckOps,
  vorlageDeckOps,
} from './vorlageDeck';

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
    // Eine Sperre auf einem längst gelöschten Element ist kein Inhalt.
    expect(isDeckEmpty([{ configId: 'freeform', state: { lockedLayerIds: ['x'] } }])).toBe(true);
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

  it('keeps speaker notes per position, rewritten or replaced', () => {
    const current = [
      { id: 'a', configId: 'freeform', state: { notes: 'Begrüßung' } },
      { id: 'b', configId: 'dreizeilen', state: { notes: 'Drei Gründe' } },
      { id: 'c', configId: 'freeform', state: { notes: '  ' } },
    ];
    const ops = vorlageDeckOps(current, [page('Eins'), page('Zwei'), page('Drei')], ids);
    expect(ops.updates).toEqual([
      { pageId: 'a', state: { title: 'Eins', notes: 'Begrüßung' } },
      { pageId: 'c', state: { title: 'Drei' } },
    ]);
    expect(ops.inserts[0]!.state).toEqual({ title: 'Zwei', notes: 'Drei Gründe' });
  });

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

describe('carryImpressum', () => {
  const imprint = (text: string) => ({ id: 'impressum', text, x: 10 });
  const poster = (configId: string, text: string | null) => ({
    configId,
    state: {
      additionalTexts: [{ id: 'headline', text: 'Botschaft' }, ...(text ? [imprint(text)] : [])],
    },
  });
  const VORLAGE_DE = 'V.i.S.d.P.: Vorname Nachname, Straße Nr., PLZ Ort';
  const textsOf = (page: { state: Record<string, unknown> }) =>
    page.state.additionalTexts as { id: string; text: string }[];

  it('writes the filled-in line of the design into the Vorlage', () => {
    const [page] = carryImpressum(
      [poster('freeform', 'V.i.S.d.P.: Anna Muster, Hauptstr. 1, 12345 Stadt')],
      [poster('freeform', VORLAGE_DE)]
    );
    expect(textsOf(page!)).toEqual([
      { id: 'headline', text: 'Botschaft' },
      { id: 'impressum', text: 'V.i.S.d.P.: Anna Muster, Hauptstr. 1, 12345 Stadt', x: 10 },
    ]);
  });

  it('keeps the Vorlage placeholder while the design has no filled-in line', () => {
    const next = [poster('freeform', VORLAGE_DE)];
    expect(carryImpressum([poster('freeform', VORLAGE_DE)], next)).toEqual(next);
    expect(carryImpressum([poster('freeform', null)], next)).toEqual(next);
  });

  it('takes the first filled-in page and speaks the Vorlage country', () => {
    const [page] = carryImpressum(
      [
        poster('freeform', 'V.i.S.d.P.: '),
        poster('freeform', 'V.i.S.d.P.: Anna Muster, Hauptstr. 1, 12345 Stadt'),
      ],
      [poster('freeform-at', 'Impressum: Name/Organisation, Straße Nr., PLZ Ort')]
    );
    expect(textsOf(page!)[1]!.text).toBe('Impressum: Anna Muster, Hauptstr. 1, 12345 Stadt');
  });

  it('leaves pages without an impressum alone', () => {
    const card = { configId: 'freeform', state: { additionalTexts: [{ id: 'name', text: 'X' }] } };
    expect(
      carryImpressum([poster('freeform', 'V.i.S.d.P.: Anna Muster, Hauptstr. 1, Stadt')], [card])
    ).toEqual([card]);
  });
});

describe('seiteDeckOps', () => {
  const ids = () => 'neu';
  const seite = {
    configId: 'freeform',
    state: { title: 'Seite', [SHAREPIC_SOURCE_KEY]: { v: 1, deck: 'eigenes', slide: {} } },
  };
  const page = (id: string, deck?: string) => ({
    id,
    configId: 'freeform',
    state: {
      additionalTexts: [{ id: 't', text: id }],
      ...(deck ? { [SHAREPIC_SOURCE_KEY]: { v: 1, deck, slide: {} } } : {}),
    },
  });

  it('inserts the Seite after the active page', () => {
    expect(seiteDeckOps([page('a'), page('b'), page('c')], 'b', seite, ids)).toEqual({
      updates: [],
      inserts: [{ afterPageId: 'b', configId: 'freeform', state: seite.state, pageId: 'neu' }],
      removes: [],
    });
  });

  it('appends without an active page', () => {
    expect(seiteDeckOps([page('a'), page('b')], null, seite, ids).inserts[0]?.afterPageId).toBe(
      'b'
    );
  });

  it('fills an empty design instead of adding a page to it', () => {
    const empty = [{ id: 'leer', ...blank }];
    expect(seiteDeckOps(empty, 'leer', seite, ids)).toEqual({
      updates: [{ pageId: 'leer', state: seite.state }],
      inserts: [],
      removes: [],
    });
  });

  it('joins the carousel of the page it follows, so the chat edits them together', () => {
    const ops = seiteDeckOps([page('a', 'karussell'), page('b')], 'a', seite, ids);
    expect(ops.inserts[0]?.state[SHAREPIC_SOURCE_KEY]).toEqual({
      v: 1,
      deck: 'karussell',
      slide: {},
    });
    // After a hand-made page, the Seite keeps its own deck.
    const own = seiteDeckOps([page('a', 'karussell'), page('b')], 'b', seite, ids);
    expect(own.inserts[0]?.state[SHAREPIC_SOURCE_KEY]).toEqual(seite.state[SHAREPIC_SOURCE_KEY]);
  });
});

describe('pageSwapOps', () => {
  const deck = [
    { id: 'a', configId: 'freeform' },
    { id: 'b', configId: 'freeform' },
    { id: 'c', configId: 'dreizeilen' },
  ];
  const page = { configId: 'freeform', state: { title: 'Rückseite' } };

  it('rewrites the target page in place under the same config', () => {
    expect(pageSwapOps(deck, 'b', page, () => 'n')).toEqual({
      updates: [{ pageId: 'b', state: page.state }],
      inserts: [],
      removes: [],
    });
  });

  it('replaces a page of another config at its position', () => {
    expect(pageSwapOps(deck, 'c', page, () => 'n')).toEqual({
      updates: [],
      inserts: [{ afterPageId: 'b', configId: 'freeform', state: page.state, pageId: 'n' }],
      removes: ['c'],
    });
  });

  it('keeps the speaker notes of the page it replaces', () => {
    const noted = [
      { id: 'a', configId: 'freeform', state: { notes: 'Begrüßung' } },
      { id: 'c', configId: 'dreizeilen', state: { notes: 'Schluss' } },
    ];
    expect(pageSwapOps(noted, 'a', page, () => 'n').updates[0]!.state).toEqual({
      title: 'Rückseite',
      notes: 'Begrüßung',
    });
    expect(pageSwapOps(noted, 'c', page, () => 'n').inserts[0]!.state).toEqual({
      title: 'Rückseite',
      notes: 'Schluss',
    });
  });

  it('takes the last page when the target is gone', () => {
    expect(pageSwapOps(deck, 'weg', page, () => 'n').removes).toEqual(['c']);
  });

  it('keeps the page order on a real document', () => {
    const doc = new Y.Doc();
    seedPagesIfEmpty(doc, [
      { id: 'a', configId: 'freeform', state: { title: 'Vorne' } },
      { id: 'b', configId: 'dreizeilen', state: { title: 'Hinten' } },
    ]);
    replaceDeck(
      doc,
      pageSwapOps(readPages(doc), 'a', { configId: 'x', state: {} }, () => 'n'),
      'local'
    );
    expect(readPages(doc).map((p) => p.id)).toEqual(['n', 'b']);
  });
});
