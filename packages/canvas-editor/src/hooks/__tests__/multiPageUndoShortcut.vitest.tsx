import { render } from '@testing-library/react';
import { act } from 'react';
import { describe, expect, it } from 'vitest';

import { CanvasStoreProvider, useCanvasStore } from '../../stores/CanvasStoreProvider';
import { useCanvasUndoRedo } from '../useCanvasUndoRedo';

import type { CanvasEditorStoreApi } from '../../stores/createCanvasEditorStore';

/**
 * Jede Seite des Mehrseiten-Editors hat ihren eigenen Store und hängt ihren
 * eigenen Strg+Z-Hörer an `window`. Ohne Schalter machte ein Tastendruck auf
 * allen Seiten zugleich einen Schritt zurück.
 */

function Page({
  active,
  onStore,
}: {
  active: boolean;
  onStore: (store: CanvasEditorStoreApi) => void;
}) {
  useCanvasUndoRedo(250, undefined, active);
  onStore(useCanvasStore());
  return null;
}

function withTwoEntries(store: CanvasEditorStoreApi) {
  store.getState().saveToHistory({ n: 1 });
  store.getState().saveToHistory({ n: 2 });
}

describe('Strg+Z im Mehrseiten-Editor', () => {
  it('trifft nur die aktive Seite', () => {
    let active: CanvasEditorStoreApi | null = null;
    let inactive: CanvasEditorStoreApi | null = null;
    render(
      <>
        <CanvasStoreProvider>
          <Page active onStore={(s) => (active = s)} />
        </CanvasStoreProvider>
        <CanvasStoreProvider>
          <Page active={false} onStore={(s) => (inactive = s)} />
        </CanvasStoreProvider>
      </>
    );
    if (!active || !inactive) throw new Error('stores not captured');
    const a: CanvasEditorStoreApi = active;
    const b: CanvasEditorStoreApi = inactive;
    withTwoEntries(a);
    withTwoEntries(b);
    const activeBefore = a.getState().historyIndex;
    const inactiveBefore = b.getState().historyIndex;

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, metaKey: true, bubbles: true })
      );
    });

    expect(a.getState().historyIndex).toBe(activeBefore - 1);
    expect(b.getState().historyIndex).toBe(inactiveBefore);
  });
});
