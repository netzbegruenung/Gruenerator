/**
 * A page op rewrites the carousel chrome of the pages that stay (k/n, arrow);
 * the mounted canvas of such a page must hear about it, or its next
 * dual-write puts the stale chrome straight back.
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { updatePageStateById } from './pagesDoc';
import { useYjsPages, PAGES_STATE_ORIGIN } from './useYjsPages';
import { useYjsPageStateSync } from './useYjsPageStateSync';

const label = (text: string) => ({
  id: 'sc-seite',
  text,
  type: 'body',
  x: 900,
  y: 44,
  width: 60,
  fontSize: 30,
  fontFamily: 'PT Sans',
  fontStyle: 'bold',
  fill: '#FFFFFF',
  align: 'right',
});
const page = (k: number) => ({
  configId: 'freeform',
  state: { additionalTexts: [label(`${k}/3`)], layerOrder: ['sc-seite'] },
});

describe('page ops reach the mounted canvas', () => {
  it('hands the rewritten page number to the page that stayed, not its own dual-writes', () => {
    const doc = new Y.Doc();
    const pages = renderHook(() => useYjsPages(doc, true));
    act(() => pages.result.current!.seedIfEmpty([page(1), page(2), page(3)]));
    const first = pages.result.current!.pages[0]!;
    const onRemoteState = vi.fn();
    renderHook(() => useYjsPageStateSync({ pageYMap: first.yMap, isSynced: true, onRemoteState }));

    doc.transact(
      () => updatePageStateById(doc, first.id, { layerOrder: ['sc-seite', 'x'] }),
      PAGES_STATE_ORIGIN
    );
    expect(onRemoteState).not.toHaveBeenCalled();

    act(() => pages.result.current!.removePage(pages.result.current!.pages[2]!.id));
    expect(onRemoteState).toHaveBeenCalledTimes(1);
    const partial = onRemoteState.mock.calls[0]![0] as { additionalTexts: { text: string }[] };
    expect(partial.additionalTexts[0]!.text).toBe('1/2');
  });
});
