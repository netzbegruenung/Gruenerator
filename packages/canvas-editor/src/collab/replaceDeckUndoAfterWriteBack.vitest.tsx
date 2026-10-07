/**
 * Verwerfen of a spec edit is the page-level undo of one replaceDeck. Right
 * after the replacement every mounted canvas — this client's and each
 * collaborator's — echoes the pages back (defaults filled, values
 * normalised); the undo must restore the pre-edit state through that echo,
 * but keep every real edit made since, whoever made it and however soon.
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { getPagesMap } from './pagesDoc';
import { useYjsPages, type NormalizeEcho } from './useYjsPages';
import { YDOC_KEYS } from './ydocKeys';

const PAGE_1 = {
  headline: 'Eins',
  texts: [{ id: 't', text: 'A' }],
  // A hand pan and zoom; the recomposed page leaves both out.
  imageOffset: { x: 12, y: -30 },
  imageScale: 1.2,
};

/** What the test canvas echoes for a page state: createInitialState's stand-in. */
const normalizeEcho: NormalizeEcho = (_configId, state) => ({
  headline: typeof state.headline === 'string' ? state.headline.trim() : state.headline,
  texts: ((state.texts as { id: string; text: string }[] | undefined) ?? []).map((t) => ({
    ...t,
    fontSize: 40,
  })),
  imageOffset: state.imageOffset ?? { x: 0, y: 0 },
  imageScale: state.imageScale ?? 1,
});

/** Two docs that exchange every update, like two clients on one Hocuspocus doc. */
function linkDocs(a: Y.Doc, b: Y.Doc): void {
  const REMOTE = 'remote';
  a.on('update', (u: Uint8Array, origin: unknown) => {
    if (origin !== REMOTE) Y.applyUpdate(b, u, REMOTE);
  });
  b.on('update', (u: Uint8Array, origin: unknown) => {
    if (origin !== REMOTE) Y.applyUpdate(a, u, REMOTE);
  });
}

function seededDeck(doc = new Y.Doc()) {
  const pages = renderHook(() => useYjsPages(doc, true, normalizeEcho));
  act(() =>
    pages.result.current!.seedIfEmpty([
      { configId: 'creator', state: PAGE_1 },
      { configId: 'creator', state: { headline: 'Zwei' } },
    ])
  );
  const before = pages.result.current!.pages.map((p) => ({ ...p.state }));
  const [first, second] = pages.result.current!.pages;
  const replace = () =>
    act(() => {
      pages.result.current!.replaceDeck({
        updates: [
          { pageId: first!.id, state: { headline: 'Neu', texts: [{ id: 't', text: 'B' }] } },
          { pageId: second!.id, state: { headline: 'Zwei neu ' } },
        ],
        inserts: [],
        removes: [],
      });
    });
  const states = () => pages.result.current!.pages.map((p) => p.state);
  return { doc, pages, before, first: first!, second: second!, replace, states };
}

const echo = (
  api: { updatePageState: (id: string, partial: Record<string, unknown>) => void },
  first: string,
  second: string
) => {
  api.updatePageState(first, {
    texts: [{ id: 't', text: 'B', fontSize: 40 }],
    imageOffset: { x: 0, y: 0 },
    imageScale: 1,
  });
  api.updatePageState(second, { headline: 'Zwei neu' });
};

function replacedDeck() {
  const deck = seededDeck();
  deck.replace();
  act(() => echo(deck.pages.result.current!, deck.first.id, deck.second.id));
  return deck;
}

describe('replaceDeck undo after a canvas echo', () => {
  it('restores the pre-edit state through the echo, pan and zoom included, and redoes it', () => {
    const { pages, before, states } = replacedDeck();
    act(() => pages.result.current!.undoPageOp());
    expect(states()).toEqual(before);

    act(() => pages.result.current!.redoPageOp());
    expect(states()).toEqual([
      { headline: 'Neu', texts: [{ id: 't', text: 'B' }] },
      { headline: 'Zwei neu ' },
    ]);
    act(() => pages.result.current!.undoPageOp());
    expect(states()).toEqual(before);
  });

  it('keeps the person’s own edit made after the echo', () => {
    const { pages, before, first, states } = replacedDeck();
    act(() => pages.result.current!.updatePageState(first.id, { headline: 'Von Hand' }));
    act(() => pages.result.current!.undoPageOp());
    expect(states()).toEqual([{ ...before[0], headline: 'Von Hand' }, before[1]]);
  });

  it('keeps the person’s own quick edit right after the banner', () => {
    const { pages, before, first, states } = replacedDeck();
    act(() => pages.result.current!.updatePageState(first.id, { imageOffset: { x: 5, y: 5 } }));
    act(() => pages.result.current!.undoPageOp());
    expect(states()).toEqual([{ ...before[0], imageOffset: { x: 5, y: 5 } }, before[1]]);
  });

  it('keeps a collaborator’s edit', () => {
    const { doc, pages, before, second, states } = replacedDeck();
    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(doc));
    const remoteState = getPagesMap(remote).get(second.id)!.get(YDOC_KEYS.state) as Y.Map<unknown>;
    remoteState.set('headline', 'Von woanders');
    act(() => Y.applyUpdate(doc, Y.encodeStateAsUpdate(remote)));
    act(() => pages.result.current!.undoPageOp());
    expect(states()).toEqual([before[0], { headline: 'Von woanders' }]);
  });

  it('redoes after a partial undo without touching the kept edit', () => {
    const { pages, first, states } = replacedDeck();
    act(() => pages.result.current!.updatePageState(first.id, { headline: 'Von Hand' }));
    act(() => pages.result.current!.undoPageOp());
    act(() => pages.result.current!.redoPageOp());
    expect(states()).toEqual([
      { headline: 'Von Hand', texts: [{ id: 't', text: 'B' }] },
      { headline: 'Zwei neu ' },
    ]);
  });

  it('restores through a collaborator’s canvas echo that lands before this client’s', () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    linkDocs(docA, docB);
    const deck = seededDeck(docA);
    const b = renderHook(() => useYjsPages(docB, true, normalizeEcho));
    deck.replace();
    // B's mounted canvas rebuilds the received pages and writes the defaults back first.
    act(() => echo(b.result.current!, deck.first.id, deck.second.id));
    act(() => echo(deck.pages.result.current!, deck.first.id, deck.second.id));
    act(() => deck.pages.result.current!.undoPageOp());
    expect(deck.states()).toEqual(deck.before);
  });

  it('undoes only its own replacement when two clients replace the deck', () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    linkDocs(docA, docB);
    const a = seededDeck(docA);
    const b = renderHook(() => useYjsPages(docB, true, normalizeEcho));
    // An older page op of A's, below the replacement on A's undo stack.
    act(() => a.pages.result.current!.addPage({ id: 'p3', configId: 'creator', state: {} }));
    const headlineOf = (api: typeof b) =>
      api.result.current!.pages.find((p) => p.id === a.first.id)!.state.headline;
    const replaceHeadline = (api: typeof b, headline: string) =>
      act(() => {
        api.result.current!.replaceDeck({
          updates: [{ pageId: a.first.id, state: { ...PAGE_1, headline } }],
          inserts: [],
          removes: [],
        });
      });
    replaceHeadline(a.pages, 'Von A');
    replaceHeadline(b, 'Von B');

    act(() => a.pages.result.current!.undoPageOp());
    // B's replacement stands, and A's older page op was not undone instead.
    expect(headlineOf(a.pages)).toBe('Von B');
    expect(a.pages.result.current!.pages.map((p) => p.id)).toContain('p3');

    act(() => b.result.current!.undoPageOp());
    expect(headlineOf(b)).toBe('Von A');
    expect(b.result.current!.pages.map((p) => p.id)).toContain('p3');
  });

  it('replaces the deck and keeps undo when the echo cannot be computed for the new state', () => {
    const doc = new Y.Doc();
    const throwing: NormalizeEcho = (configId, state) => {
      if (state.headline === 'Neu') throw new Error('config not loaded');
      return normalizeEcho(configId, state);
    };
    const pages = renderHook(() => useYjsPages(doc, true, throwing));
    act(() => pages.result.current!.seedIfEmpty([{ configId: 'creator', state: PAGE_1 }]));
    const [first] = pages.result.current!.pages;
    let ids: string[] | null = null;
    act(() => {
      ids = pages.result.current!.replaceDeck({
        updates: [{ pageId: first!.id, state: { headline: 'Neu' } }],
        inserts: [],
        removes: [],
      });
    });
    expect(ids).toEqual([]);
    expect(pages.result.current!.pages[0]!.state).toEqual({ headline: 'Neu' });
    act(() => pages.result.current!.undoPageOp());
    expect(pages.result.current!.pages[0]!.state).toEqual(PAGE_1);
  });
});
