/**
 * An undone text edit must be written back to the page's Y.Map (#4247).
 * Text fields reach the document only through their `on<Key>Change`
 * callback; a restore that only set the component state left the document
 * on the undone value, so a reload (or another client) showed it again.
 */
import { act, render } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { GenericCanvas, type GenericCanvasRef } from '../components/GenericCanvas';
import { loadCanvasConfig } from '../configs/configLoader';
import { AutoSaveStoreProvider } from '../stores/AutoSaveStoreProvider';

import { PAGE_PERSISTED_STATE_KEYS } from './pageElementStateKeys';
import { readPages, seedPagesIfEmpty, updatePageStateById } from './pagesDoc';
import { PAGES_STATE_ORIGIN } from './useYjsPages';
import { createPageSyncedCallbacks } from './wrapCallbacksWithPageSync';

Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { check: () => true, load: async () => [], ready: Promise.resolve(), add() {} },
});

const PAGE_ID = 'seed-0';

const pageState = (doc: Y.Doc): Record<string, unknown> =>
  readPages(doc).find((p) => p.id === PAGE_ID)!.state;

async function mountCanvas(
  configId: 'dreizeilen' | 'zitat',
  seed: Record<string, unknown>,
  hostKeys: string[]
) {
  const config = await loadCanvasConfig(configId);
  const doc = new Y.Doc();
  seedPagesIfEmpty(doc, [{ id: PAGE_ID, configId, state: seed }]);
  const page = readPages(doc)[0];
  const hostCalls: Array<[string, unknown]> = [];
  const hostCallbacks = Object.fromEntries(
    hostKeys.map((name) => [name, (val: unknown) => hostCalls.push([name, val])])
  );
  const callbacks = createPageSyncedCallbacks(
    () => hostCallbacks,
    (partial) => doc.transact(() => updatePageStateById(doc, PAGE_ID, partial), PAGES_STATE_ORIGIN),
    PAGE_PERSISTED_STATE_KEYS
  );
  const live: { state: Record<string, unknown>; actions: Record<string, unknown> } = {
    state: {},
    actions: {},
  };
  const ref = createRef<GenericCanvasRef>();

  await act(async () => {
    render(
      <AutoSaveStoreProvider>
        <GenericCanvas
          forwardedRef={ref}
          config={config as never}
          initialProps={page.state}
          onExport={() => {}}
          onCancel={() => {}}
          callbacks={callbacks}
          autoSave={false}
          onLiveState={(state, actions) => {
            live.state = state;
            live.actions = actions;
          }}
          pageBinding={{ pageYMap: page.yMap, isSynced: true }}
        />
      </AutoSaveStoreProvider>
    );
  });
  // The initial history snapshot is deferred by a timer.
  await vi.waitFor(() => expect(ref.current?.undo).toBeTypeOf('function'));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });

  return { doc, ref, live, hostCalls };
}

describe('undo writes text fields back to the document', () => {
  it('dreizeilen line1', async () => {
    const { doc, ref, live, hostCalls } = await mountCanvas(
      'dreizeilen',
      { line1: 'alt', line2: 'Zwei', line3: 'Drei' },
      ['onLine1Change', 'onLine2Change', 'onLine3Change']
    );

    await act(async () => {
      (live.actions.setLine1 as (t: string) => void)('neu');
    });
    expect(pageState(doc).line1).toBe('neu');

    await act(async () => {
      ref.current!.undo!();
    });
    expect(live.state.line1).toBe('alt');
    expect(pageState(doc).line1).toBe('alt');
    // Only the field that changed is written; untouched ones stay quiet.
    expect(hostCalls.filter(([name]) => name !== 'onLine1Change')).toEqual([]);

    await act(async () => {
      ref.current!.redo!();
    });
    expect(pageState(doc).line1).toBe('neu');
  }, 90_000);

  it('zitat quote', async () => {
    const { doc, ref, live } = await mountCanvas('zitat', { quote: 'Altes Zitat', name: 'Anna' }, [
      'onQuoteChange',
      'onNameChange',
    ]);

    await act(async () => {
      (live.actions.setPrimary as (t: string) => void)('Neues Zitat');
    });
    expect(pageState(doc).quote).toBe('Neues Zitat');

    await act(async () => {
      ref.current!.undo!();
    });
    expect(live.state.quote).toBe('Altes Zitat');
    expect(pageState(doc).quote).toBe('Altes Zitat');
  }, 90_000);
});
