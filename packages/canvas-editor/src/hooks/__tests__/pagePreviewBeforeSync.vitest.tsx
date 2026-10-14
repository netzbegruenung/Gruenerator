/**
 * A freshly minted canvas shows its initial pages before the collab doc has
 * synced; a reopened one (no `previewBeforeSync`) must not, its initial_state
 * may be stale. A reopened one shows its locally cached doc pages instead.
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { seedPagesIfEmpty } from '../../collab/pagesDoc';
import { usePageManager, type InitialPageDef } from '../usePageManager';

const initialPages: InitialPageDef[] = [
  { configId: 'freeform', state: { headline: 'Eins' } },
  { configId: 'freeform', state: { headline: 'Zwei' } },
];

function render(isSynced: boolean, previewBeforeSync: boolean, ydoc = new Y.Doc()) {
  return renderHook(
    (props: { isSynced: boolean }) =>
      usePageManager({
        initialConfigId: 'freeform',
        initialProps: {},
        initialPages,
        collaborative: { ydoc, isSynced: props.isSynced, previewBeforeSync },
      }),
    { initialProps: { isSynced } }
  );
}

describe('usePageManager preview before sync', () => {
  it('shows the initial pages, flagged as preview, while unsynced', () => {
    const { result } = render(false, true);
    expect(result.current.isPreview).toBe(true);
    expect(result.current.pages.map((p) => p.state.headline)).toEqual(['Eins', 'Zwei']);
  });

  it('shows nothing before sync without the flag', () => {
    const { result } = render(false, false);
    expect(result.current.isPreview).toBe(false);
    expect(result.current.pages).toEqual([]);
  });

  it('hands over to the doc pages once synced', () => {
    const { result, rerender } = render(false, true);
    rerender({ isSynced: true });
    expect(result.current.isPreview).toBe(false);
    expect(result.current.pages.map((p) => p.id)).toEqual(['seed-0', 'seed-1']);
    expect(result.current.pages.map((p) => p.state.headline)).toEqual(['Eins', 'Zwei']);
  });
});

describe('usePageManager preview from the local cache', () => {
  function cachedDoc() {
    const ydoc = new Y.Doc();
    seedPagesIfEmpty(ydoc, [{ id: 'p1', configId: 'freeform', state: { headline: 'Cache' } }]);
    return ydoc;
  }

  function renderCached(ydoc: Y.Doc, isLocalLoaded: boolean) {
    return renderHook(
      (props: { isSynced: boolean }) =>
        usePageManager({
          initialConfigId: 'freeform',
          initialProps: {},
          initialPages,
          collaborative: { ydoc, isSynced: props.isSynced, isLocalLoaded },
        }),
      { initialProps: { isSynced: false } }
    );
  }

  it('shows the cached pages read-only, without writing to the doc', () => {
    const ydoc = cachedDoc();
    const updates: Uint8Array[] = [];
    ydoc.on('update', (u: Uint8Array) => updates.push(u));
    const { result } = renderCached(ydoc, true);
    expect(result.current.isPreview).toBe(true);
    expect(result.current.pages.map((p) => [p.id, p.state.headline])).toEqual([
      ['preview-0', 'Cache'],
    ]);
    expect(result.current.getPageYMap(0)?.get('id')).toBe('p1');
    expect(result.current.replaceDeck).toBeNull();
    expect(updates).toEqual([]);
  });

  it('waits for the cache before showing anything', () => {
    const { result } = renderCached(cachedDoc(), false);
    expect(result.current.isPreview).toBe(false);
    expect(result.current.pages).toEqual([]);
  });

  it('hands over to the bound doc pages once synced', () => {
    const { result, rerender } = renderCached(cachedDoc(), true);
    rerender({ isSynced: true });
    expect(result.current.isPreview).toBe(false);
    expect(result.current.pages.map((p) => p.id)).toEqual(['p1']);
  });
});
