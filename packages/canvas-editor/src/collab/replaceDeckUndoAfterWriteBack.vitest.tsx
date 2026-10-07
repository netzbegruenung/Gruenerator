/**
 * Verwerfen of a spec edit is the page-level undo of one replaceDeck. A mounted
 * canvas writes normalised keys back under the untracked state origin right
 * after the replacement; the undo must still restore the whole pre-edit state.
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { useYjsPages } from './useYjsPages';

describe('replaceDeck undo after a canvas write-back', () => {
  it('restores the pre-edit state of every page', () => {
    const doc = new Y.Doc();
    const pages = renderHook(() => useYjsPages(doc, true));
    act(() =>
      pages.result.current!.seedIfEmpty([
        { configId: 'creator', state: { headline: 'Eins', texts: [{ id: 't', text: 'A' }] } },
        { configId: 'creator', state: { headline: 'Zwei' } },
      ])
    );
    const before = pages.result.current!.pages.map((p) => ({ ...p.state }));
    const [first, second] = pages.result.current!.pages;

    act(() => {
      pages.result.current!.replaceDeck({
        updates: [
          { pageId: first!.id, state: { headline: 'Neu', texts: [{ id: 't', text: 'B' }] } },
          { pageId: second!.id, state: { headline: 'Zwei neu' } },
        ],
        inserts: [],
        removes: [],
      });
    });
    // The mounted canvases echo what they render: the same key, normalised, plus defaults.
    act(() => {
      pages.result.current!.updatePageState(first!.id, {
        texts: [{ id: 't', text: 'B', fontSize: 40 }],
        imageOffset: { x: 0, y: 0 },
      });
      pages.result.current!.updatePageState(second!.id, { headline: 'Zwei neu ' });
    });

    act(() => pages.result.current!.undoPageOp());
    expect(pages.result.current!.pages.map((p) => p.state)).toEqual(before);

    act(() => pages.result.current!.redoPageOp());
    expect(pages.result.current!.pages.map((p) => p.state)).toEqual([
      { headline: 'Neu', texts: [{ id: 't', text: 'B' }] },
      { headline: 'Zwei neu' },
    ]);
    act(() => pages.result.current!.undoPageOp());
    expect(pages.result.current!.pages.map((p) => p.state)).toEqual(before);
  });
});
