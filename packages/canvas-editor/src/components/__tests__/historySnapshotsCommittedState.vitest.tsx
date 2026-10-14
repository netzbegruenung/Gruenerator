/**
 * A template action's history entry is the state AFTER the action (#4246).
 * The actions hand `saveToHistory` their render-time `getState()`, which
 * misses the change they just made; the entry must come from the committed
 * state instead, so one undo lands exactly on the state before the action.
 */
import { act, render } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { loadCanvasConfig } from '../../configs/configLoader';
import { AutoSaveStoreProvider } from '../../stores/AutoSaveStoreProvider';
import { GenericCanvas, type GenericCanvasRef } from '../GenericCanvas';

import type * as StoreModule from '../../stores/createCanvasEditorStore';
import type { CanvasEditorStoreApi } from '../../stores/createCanvasEditorStore';

const stores = vi.hoisted(() => [] as unknown[]);
vi.mock('../../stores/createCanvasEditorStore', async (importOriginal) => {
  const original = await importOriginal<typeof StoreModule>();
  return {
    ...original,
    createCanvasEditorStore: (...args: Parameters<typeof original.createCanvasEditorStore>) => {
      const store = original.createCanvasEditorStore(...args);
      stores.push(store);
      return store;
    },
  };
});

Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { check: () => true, load: async () => [], ready: Promise.resolve(), add() {} },
});

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Record<string, unknown>;

async function mountCanvas(configId: 'freeform' | 'dreizeilen', seed: Record<string, unknown>) {
  const config = await loadCanvasConfig(configId);
  const live: { state: Record<string, unknown>; actions: Record<string, unknown> } = {
    state: {},
    actions: {},
  };
  const ref = createRef<GenericCanvasRef>();
  stores.length = 0;

  await act(async () => {
    render(
      <AutoSaveStoreProvider>
        <GenericCanvas
          forwardedRef={ref}
          config={config as never}
          initialProps={seed}
          onExport={() => {}}
          onCancel={() => {}}
          autoSave={false}
          onLiveState={(state, actions) => {
            live.state = state;
            live.actions = actions;
          }}
        />
      </AutoSaveStoreProvider>
    );
  });

  const store = stores[stores.length - 1] as CanvasEditorStoreApi;
  // The initial snapshot is deferred by a timer; an action before it would
  // otherwise be recorded by that timer instead of by its own save.
  await vi.waitFor(() => expect(store.getState().history).toHaveLength(1));
  const top = () => {
    const s = store.getState();
    return s.history[s.historyIndex]?.componentState as Record<string, unknown>;
  };
  return { ref, live, store, top };
}

describe('history snapshots the committed state', () => {
  it('dreizeilen setBackgroundColor: the entry is the new colour, one undo restores the rest', async () => {
    const { ref, live, top } = await mountCanvas('dreizeilen', {
      line1: 'Eins',
      line2: 'Zwei',
      line3: 'Drei',
    });
    const before = json(live.state);

    await act(async () => {
      (live.actions.setBackgroundColor as (c: string) => void)('#123456');
    });
    expect(live.state.backgroundColor).toBe('#123456');
    expect(top().backgroundColor).toBe('#123456');

    await act(async () => {
      ref.current!.undo!();
    });
    expect(json(live.state)).toEqual(before);

    await act(async () => {
      ref.current!.redo!();
    });
    expect(live.state.backgroundColor).toBe('#123456');
  }, 90_000);

  it('dreizeilen setLine1 (debounced): an undo before the timer fires reverts the typing', async () => {
    const { ref, live, top } = await mountCanvas('dreizeilen', {
      line1: 'alt',
      line2: 'Zwei',
      line3: 'Drei',
    });
    const before = json(live.state);

    await act(async () => {
      (live.actions.setLine1 as (t: string) => void)('neu');
    });
    await act(async () => {
      ref.current!.undo!();
    });
    expect(json(live.state)).toEqual(before);

    await act(async () => {
      ref.current!.redo!();
    });
    expect(live.state.line1).toBe('neu');
    expect(top().line1).toBe('neu');
  }, 90_000);

  it('freeform addAsset: the entry holds the asset, one undo removes exactly it', async () => {
    const { ref, live, top } = await mountCanvas('freeform', {
      backgroundMode: 'color',
      backgroundColor: '#005538',
    });
    const before = json(live.state);

    await act(async () => {
      (live.actions.addAsset as (id: string) => void)('sonnenblume-gelb');
    });
    expect(live.state.assetInstances).toHaveLength(1);
    expect(top().assetInstances).toHaveLength(1);

    await act(async () => {
      ref.current!.undo!();
    });
    expect(json(live.state)).toEqual(before);
  }, 90_000);

  it('freeform setBackgroundColor out of image mode keeps the pre-state as its own step', async () => {
    const { ref, live, top } = await mountCanvas('freeform', {
      backgroundMode: 'color',
      backgroundColor: '#005538',
    });

    await act(async () => {
      (live.actions.addAsset as (id: string) => void)('sonnenblume-gelb');
    });
    const afterAsset = json(live.state);
    await act(async () => {
      (live.actions.setBackgroundMode as (m: string) => void)('image');
    });
    await act(async () => {
      (live.actions.setBackgroundColor as (c: string) => void)('#F5F1E9');
    });
    expect(top().backgroundColor).toBe('#F5F1E9');
    expect(top().backgroundMode).toBe('color');

    await act(async () => {
      ref.current!.undo!();
    });
    expect(live.state.backgroundMode).toBe('image');
    await act(async () => {
      ref.current!.undo!();
    });
    expect(json(live.state)).toEqual(afterAsset);
  }, 90_000);
});
