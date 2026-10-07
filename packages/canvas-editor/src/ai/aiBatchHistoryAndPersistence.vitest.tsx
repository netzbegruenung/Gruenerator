/**
 * One AI op batch on the real freeform canvas (the template every minted
 * sharepic opens in): it must land in the page's Y.Map — otherwise a reload
 * loses it — and one undo (the banner's "Verwerfen") must revert all of it.
 */
import { act, render } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { PAGE_PERSISTED_STATE_KEYS } from '../collab/pageElementStateKeys';
import { readPages, seedPagesIfEmpty, updatePageStateById } from '../collab/pagesDoc';
import { PAGES_STATE_ORIGIN } from '../collab/useYjsPages';
import { createPageSyncedCallbacks } from '../collab/wrapCallbacksWithPageSync';
import { GenericCanvas, type GenericCanvasRef } from '../components/GenericCanvas';
import { loadCanvasConfig } from '../configs/configLoader';
import { AutoSaveStoreProvider } from '../stores/AutoSaveStoreProvider';

import type { CanvasAiEditBridge } from '../CanvasEditorProvider';
import type { CanvasAiOperation } from '@gruenerator/contracts';

Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { check: () => true, load: async () => [], ready: Promise.resolve(), add() {} },
});

const PAGE_ID = 'seed-0';
const TANNE = '#005538';
const SAND = '#F5F1E9';

const pageState = (doc: Y.Doc): Record<string, unknown> =>
  readPages(doc).find((p) => p.id === PAGE_ID)!.state;

async function mountFreeform() {
  const config = await loadCanvasConfig('freeform');
  const doc = new Y.Doc();
  seedPagesIfEmpty(doc, [
    {
      id: PAGE_ID,
      configId: 'freeform',
      state: { backgroundMode: 'color', backgroundColor: TANNE },
    },
  ]);
  const page = readPages(doc)[0];
  // Mirrors CanvasEditor's per-page callbacks: the freeform host declares only
  // backgroundMode + the image keys (CanvasEditorRouter).
  const callbacks = createPageSyncedCallbacks(
    () => ({ onBackgroundModeChange: () => {} }),
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
    // useCanvasHistorySetup defers its initial snapshot by one tick.
    await new Promise((r) => setTimeout(r, 0));
  });

  // The bridge exactly as the chat sidebar gets it.
  const bridge = (): CanvasAiEditBridge => {
    const props = config.sections.chat!.propsFactory(live.state, live.actions, {
      selectedElement: null,
    }) as { aiEdit: CanvasAiEditBridge };
    return props.aiEdit;
  };

  return { doc, ref, live, bridge };
}

describe('AI op batch on the freeform canvas', () => {
  it('writes the batch into the page state and reverts it with ONE undo', async () => {
    const { doc, ref, live, bridge } = await mountFreeform();

    await act(async () => {
      (live.actions.addHeader as () => void)();
    });
    const texts = live.state.additionalTexts as Array<{ id: string; text: string }>;
    expect(texts).toHaveLength(1);
    const textId = texts[0].id;

    const ops: CanvasAiOperation[] = [
      { kind: 'set-background-color', color: SAND },
      { kind: 'set-text', field: textId, label: 'Überschrift', value: 'Mehr Bus und Bahn' },
      { kind: 'add-asset', assetId: 'sonnenblume-gelb' },
    ];
    let results: unknown[] = [];
    await act(async () => {
      results = bridge().applyOperations(ops);
    });
    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);

    expect(live.state.backgroundColor).toBe(SAND);
    // Persistence: the reload path mounts from exactly this map.
    const persisted = pageState(doc);
    expect(persisted.backgroundColor).toBe(SAND);
    expect((persisted.additionalTexts as Array<{ text: string }>)[0].text).toBe(
      'Mehr Bus und Bahn'
    );
    expect(persisted.assetInstances).toHaveLength(1);

    await act(async () => {
      ref.current!.undo!();
    });

    expect(live.state.backgroundColor).toBe(TANNE);
    expect((live.state.additionalTexts as Array<{ text: string }>)[0].text).toBe('Überschrift');
    expect(live.state.assetInstances).toEqual([]);
    // The revert is persisted too.
    expect(pageState(doc).backgroundColor).toBe(TANNE);
  }, 90_000);
});
