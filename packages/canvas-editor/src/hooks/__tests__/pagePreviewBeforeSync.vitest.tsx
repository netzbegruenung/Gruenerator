/**
 * A freshly minted canvas shows its initial pages before the collab doc has
 * synced; a reopened one (no `previewBeforeSync`) must not, its initial_state
 * may be stale.
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

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
