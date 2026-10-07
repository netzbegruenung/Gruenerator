/**
 * replaceDeck through the hook: one undo step, and a mounted page canvas hears
 * the whole-state replacement (changed keys with values, dropped keys as
 * undefined — GenericCanvas merges `{...prev, ...partial}`, so they clear).
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { useYjsPages } from './useYjsPages';
import { useYjsPageStateSync } from './useYjsPageStateSync';

const seed = (headline: string, extra: Record<string, unknown> = {}) => ({
  configId: 'creator',
  state: { headline, ...extra },
});

describe('replaceDeck via useYjsPages', () => {
  it('is one undo step and notifies a mounted page of replaced and dropped keys', () => {
    const doc = new Y.Doc();
    const pages = renderHook(() => useYjsPages(doc, true));
    act(() =>
      pages.result.current!.seedIfEmpty([
        seed('Eins', { stale: 1, sharepicSource: { v: 1 } }),
        seed('Zwei'),
      ])
    );
    const [first, second] = pages.result.current!.pages;
    const onRemoteState = vi.fn();
    renderHook(() => useYjsPageStateSync({ pageYMap: first!.yMap, isSynced: true, onRemoteState }));

    act(() => {
      pages.result.current!.replaceDeck({
        updates: [
          { pageId: first!.id, state: { headline: 'Neu', sharepicSource: { v: 1, n: 2 } } },
        ],
        inserts: [{ afterPageId: second!.id, configId: 'creator', state: { headline: 'Drei' } }],
        removes: [],
      });
    });

    const partial = onRemoteState.mock.calls[0]![0] as Record<string, unknown>;
    expect(partial.headline).toBe('Neu');
    expect(partial.sharepicSource).toEqual({ v: 1, n: 2 });
    expect('stale' in partial && partial.stale === undefined).toBe(true);
    expect(pages.result.current!.pages.map((p) => p.state.headline)).toEqual([
      'Neu',
      'Zwei',
      'Drei',
    ]);

    act(() => pages.result.current!.undoPageOp());
    expect(pages.result.current!.pages.map((p) => p.state.headline)).toEqual(['Eins', 'Zwei']);
    expect(pages.result.current!.pages[0]!.state.stale).toBe(1);
  });
});
