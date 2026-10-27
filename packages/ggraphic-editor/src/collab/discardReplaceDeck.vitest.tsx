// SPDX-License-Identifier: MPL-2.0
/**
 * "Vorlage verwerfen" / "Vorschlag verwerfen" after a replaced deck: the deck
 * returns to before the replacement and stays there — Redo must not re-apply
 * the discarded deck, and a page op made after the replacement must not be
 * what gets undone instead of it.
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { useYjsPages } from '@ggraphic/editor/collab/useYjsPages';

function setup() {
  const doc = new Y.Doc();
  const pages = renderHook(() => useYjsPages(doc, true));
  act(() =>
    pages.result.current!.seedIfEmpty([
      { configId: 'creator', state: { headline: 'Eins' } },
      { configId: 'creator', state: { headline: 'Zwei' } },
    ])
  );
  const api = () => pages.result.current!;
  const headlines = () => api().pages.map((p) => p.state.headline);
  const replace = () =>
    act(() => {
      const [first, second] = api().pages;
      api().replaceDeck({
        updates: [{ pageId: first!.id, state: { headline: 'Vorlage' } }],
        inserts: [],
        removes: [second!.id],
      });
    });
  return { api, headlines, replace };
}

describe('discardReplaceDeck', () => {
  it('restores the deck and leaves nothing to redo', () => {
    const { api, headlines, replace } = setup();
    replace();
    expect(headlines()).toEqual(['Vorlage']);

    act(() => api().discardReplaceDeck());
    expect(headlines()).toEqual(['Eins', 'Zwei']);
    expect(api().canRedoPageOp).toBe(false);

    act(() => api().redoPageOp());
    expect(headlines()).toEqual(['Eins', 'Zwei']);
  });

  it('takes page ops made after the replacement along', () => {
    const { api, headlines, replace } = setup();
    replace();
    act(() => {
      api().addPage({ id: 'Danach', configId: 'creator', state: { headline: 'Danach' } });
    });
    expect(headlines()).toEqual(['Vorlage', 'Danach']);

    act(() => api().discardReplaceDeck());
    expect(headlines()).toEqual(['Eins', 'Zwei']);
  });

  it('keeps the page ops from before the replacement undoable', () => {
    const { api, headlines, replace } = setup();
    act(() => {
      api().addPage({ id: 'Vorher', configId: 'creator', state: { headline: 'Vorher' } });
    });
    replace();
    act(() => api().discardReplaceDeck());
    expect(api().canUndoPageOp).toBe(true);

    act(() => api().undoPageOp());
    expect(headlines()).toEqual(['Eins', 'Zwei']);
  });

  it('does nothing without a replaced deck', () => {
    const { api, headlines } = setup();
    act(() => {
      api().addPage({ id: 'Drei', configId: 'creator', state: { headline: 'Drei' } });
    });
    act(() => api().discardReplaceDeck());
    expect(headlines()).toEqual(['Eins', 'Zwei', 'Drei']);
  });
});
