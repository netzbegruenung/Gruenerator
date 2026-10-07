/**
 * runHistoryBatch: every save inside a batch becomes ONE history entry, a
 * nested batch does not end the outer one early, and a batch that changes
 * nothing leaves no entry behind for a later, unrelated commit.
 */
import { act, render } from '@testing-library/react';
import { useCallback, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CanvasStoreProvider, useCanvasStore } from '../../stores/CanvasStoreProvider';
import { useCanvasHistorySetup } from '../useCanvasHistorySetup';

import type { CanvasEditorStoreApi } from '../../stores/createCanvasEditorStore';

type S = { n: number };

interface Harness {
  store: CanvasEditorStoreApi;
  /** Like a template action: setState, then save the render-time state. */
  bump: () => void;
  /** A save with a distinct snapshot, so a leaked save shows up as -1. */
  saveMarker: () => void;
  /** An action that saves but whose setState bails out (nothing changed). */
  saveOnly: () => void;
  /** A commit without a history save (remote edit, restore). */
  setSilently: (n: number) => void;
  runHistoryBatch: (fn: () => void) => void;
  state: () => S;
}

function Page({ onReady }: { onReady: (h: Harness) => void }) {
  const [state, setState] = useState<S>({ n: 0 });
  const collectState = useCallback(() => state, [state]);
  const { saveToHistory, runHistoryBatch } = useCanvasHistorySetup<S>(
    collectState,
    (restored) => setState(restored),
    500,
    false
  );
  onReady({
    store: useCanvasStore(),
    bump: () => {
      setState((prev) => ({ n: prev.n + 1 }));
      saveToHistory(state);
    },
    saveMarker: () => saveToHistory({ n: -1 }),
    saveOnly: () => {
      setState((prev) => prev);
      saveToHistory(state);
    },
    setSilently: (n) => setState({ n }),
    runHistoryBatch,
    state: () => state,
  });
  return null;
}

async function mount(): Promise<() => Harness> {
  let h!: Harness;
  await act(async () => {
    render(
      <CanvasStoreProvider>
        <Page onReady={(x) => (h = x)} />
      </CanvasStoreProvider>
    );
  });
  // The hook's initial snapshot is deferred by a timer; wait for it, or it
  // lands later as a stray entry.
  await vi.waitFor(() => expect(h.store.getState().history).toHaveLength(1));
  return () => h;
}

const entries = (store: CanvasEditorStoreApi) =>
  store.getState().history.map((e) => (e.componentState as S | undefined)?.n);

describe('runHistoryBatch', () => {
  it('records one entry for a nested batch, taken after both finished', async () => {
    const h = await mount();
    await act(async () => {
      h().runHistoryBatch(() => {
        h().bump();
        h().runHistoryBatch(() => h().bump());
        // Still inside the outer batch: must not become its own entry.
        h().saveMarker();
        h().bump();
      });
    });

    expect(h().state().n).toBe(3);
    expect(entries(h().store)).toEqual([0, 3]);
  });

  it('leaves nothing pending when the batch changed no state', async () => {
    const h = await mount();
    await act(async () => {
      h().runHistoryBatch(() => h().saveOnly());
    });
    const before = entries(h().store);

    // An unrelated commit (a remote edit) must not be taken as the batch's entry.
    await act(async () => {
      h().setSilently(42);
    });

    expect(entries(h().store)).toEqual(before);
  });
});
