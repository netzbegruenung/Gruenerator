/**
 * The history-synced capture (pixelRatio-2 PNG, 1500 ms after each history
 * step) only feeds auto-save. With `autoSave={false}` — collab and multi-page
 * decks — it used to run anyway: a wasted main-thread encode after every edit.
 */
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadCanvasConfig } from '../../configs/configLoader';
import { AutoSaveStoreProvider } from '../../stores/AutoSaveStoreProvider';
import { captureStageImage } from '../../utils/captureStage';
import { GenericCanvas } from '../GenericCanvas';

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
vi.mock('../../utils/captureStage', () => ({
  captureStageImage: vi.fn(() => 'data:image/png;base64,AAAA'),
}));
// Das eigentliche Speichern (Share-Store, Netz) ist nicht Gegenstand hier.
vi.mock('../../hooks/useCanvasAutoSave', () => ({
  useCanvasAutoSave: () => ({ status: 'idle', shareToken: null, retry: async () => {} }),
}));

Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { check: () => true, load: async () => [], ready: Promise.resolve(), add() {} },
});

const capture = vi.mocked(captureStageImage);

async function mountAndEdit(autoSave: boolean) {
  const config = await loadCanvasConfig('dreizeilen');
  const live: { actions: Record<string, unknown> } = { actions: {} };
  stores.length = 0;

  await act(async () => {
    render(
      <AutoSaveStoreProvider>
        <GenericCanvas
          config={config as never}
          initialProps={{ line1: 'Eins', line2: 'Zwei', line3: 'Drei' }}
          onExport={() => {}}
          onCancel={() => {}}
          autoSave={autoSave}
          onLiveState={(_state, actions) => {
            live.actions = actions;
          }}
        />
      </AutoSaveStoreProvider>
    );
  });
  const store = stores[stores.length - 1] as CanvasEditorStoreApi;
  await vi.waitFor(() => expect(store.getState().history).toHaveLength(1));
  // Erst-Snapshot (historyIndex 0) samt seinem Capture-Timer abwarten.
  await act(async () => {
    vi.advanceTimersByTime(2000);
  });
  const callsBeforeEdit = capture.mock.calls.length;

  await act(async () => {
    (live.actions.setBackgroundColor as (c: string) => void)('#123456');
  });
  expect(store.getState().historyIndex).toBeGreaterThan(0);
  await act(async () => {
    vi.advanceTimersByTime(2000);
  });
  return { callsBeforeEdit };
}

describe('History-Capture für Auto-Save', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    capture.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it('nimmt ohne Auto-Save nach einem History-Schritt kein Bild auf', async () => {
    await mountAndEdit(false);
    expect(capture).not.toHaveBeenCalled();
  }, 90_000);

  it('nimmt mit Auto-Save 1500 ms nach dem History-Schritt ein Bild auf', async () => {
    const { callsBeforeEdit } = await mountAndEdit(true);
    expect(capture.mock.calls.length).toBeGreaterThan(callsBeforeEdit);
  }, 90_000);
});
