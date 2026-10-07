/**
 * Verwerfen of a spec edit is the page-level undo of one replaceDeck. Right
 * after the replacement the mounted canvases echo the pages back under the
 * untracked state origin (defaults filled, values normalised); the undo must
 * restore the pre-edit state through that echo — but keep a real edit made
 * since, the person's own (after the echo) or a collaborator's.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { getPagesMap } from './pagesDoc';
import { DECK_ECHO_WINDOW_MS, useYjsPages } from './useYjsPages';
import { YDOC_KEYS } from './ydocKeys';

let now = 1_000_000;
beforeEach(() => {
  vi.spyOn(Date, 'now').mockImplementation(() => now);
});
afterEach(() => vi.restoreAllMocks());

const PAGE_1 = {
  headline: 'Eins',
  texts: [{ id: 't', text: 'A' }],
  // A hand pan and zoom; the recomposed page leaves both out.
  imageOffset: { x: 12, y: -30 },
  imageScale: 1.2,
};

function replacedDeck() {
  const doc = new Y.Doc();
  const pages = renderHook(() => useYjsPages(doc, true));
  act(() =>
    pages.result.current!.seedIfEmpty([
      { configId: 'creator', state: PAGE_1 },
      { configId: 'creator', state: { headline: 'Zwei' } },
    ])
  );
  const before = pages.result.current!.pages.map((p) => ({ ...p.state }));
  const [first, second] = pages.result.current!.pages;
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
  // The echo: defaults for the persisted keys, normalised values.
  act(() => {
    pages.result.current!.updatePageState(first!.id, {
      texts: [{ id: 't', text: 'B', fontSize: 40 }],
      imageOffset: { x: 0, y: 0 },
      imageScale: 1,
    });
    pages.result.current!.updatePageState(second!.id, { headline: 'Zwei neu' });
  });
  const states = () => pages.result.current!.pages.map((p) => p.state);
  return { doc, pages, before, first: first!, second: second!, states };
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
    now += DECK_ECHO_WINDOW_MS + 1;
    act(() => pages.result.current!.updatePageState(first.id, { headline: 'Von Hand' }));
    act(() => pages.result.current!.undoPageOp());
    expect(states()).toEqual([{ ...before[0], headline: 'Von Hand' }, before[1]]);
  });

  it('keeps a collaborator’s edit, even inside the echo window', () => {
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
    now += DECK_ECHO_WINDOW_MS + 1;
    act(() => pages.result.current!.updatePageState(first.id, { headline: 'Von Hand' }));
    act(() => pages.result.current!.undoPageOp());
    act(() => pages.result.current!.redoPageOp());
    expect(states()).toEqual([
      { headline: 'Von Hand', texts: [{ id: 't', text: 'B' }] },
      { headline: 'Zwei neu ' },
    ]);
  });
});
