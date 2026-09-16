/**
 * Eine Fernbearbeitung darf nichts abräumen, was die Person selbst gebaut hat.
 *
 * `handleRemotePageState` mischt den eingehenden Ausschnitt in den lebenden
 * Zustand und baut ihn über `createInitialState` neu auf. Bis #3421 nahm es
 * dabei `balkenInstances` ganz aus der Eingabe, damit der abgeleitete Balken
 * der Vorlage dem neuen Text folgt — und riss jeden von Hand hinzugefügten
 * Balken mit heraus.
 *
 * Geprüft wird an der echten Fläche: echte Vorlage, echtes Y.Doc, echter
 * Beobachter. Ein Test gegen `createInitialState` allein bliebe grün, wenn
 * `GenericCanvas` wieder anfinge, Schlüssel aus dem Ausschnitt zu entfernen.
 */
import { act, render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { GenericCanvas } from '../components/GenericCanvas';
import { loadCanvasConfig } from '../configs/configLoader';
import { AutoSaveStoreProvider } from '../stores/AutoSaveStoreProvider';

import { PAGE_ELEMENT_STATE_KEYS } from './pageElementStateKeys';
import { readPages, seedPagesIfEmpty, updatePageStateById } from './pagesDoc';
import { PAGES_STATE_ORIGIN } from './useYjsPages';
import { createPageSyncedCallbacks } from './wrapCallbacksWithPageSync';

// `useFontLoader` fragt `document.fonts`; jsdom laedt keine Schriften und
// kennt die FontFaceSet nicht, das Mounten stirbt sonst im Effekt.
Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { check: () => true, load: async () => [], ready: Promise.resolve(), add() {} },
});

const PAGE_ID = 'seed-0';

/** Kein `PAGES_*`-Ursprung: genau so sieht der Beobachter eine fremde Bearbeitung. */
const REMOTE_ORIGIN = Symbol('anderer-client');

type Mounted = {
  doc: Y.Doc;
  state: () => Record<string, unknown>;
  actions: () => Record<string, unknown>;
  remoteEdit: (partial: Record<string, unknown>) => Promise<void>;
};

async function mount(
  configId: 'dreizeilen' | 'zitat',
  seed: Record<string, unknown>
): Promise<Mounted> {
  const config = await loadCanvasConfig(configId);
  const doc = new Y.Doc();
  seedPagesIfEmpty(doc, [{ id: PAGE_ID, configId, state: seed }]);
  const page = readPages(doc)[0];

  let live: Record<string, unknown> = {};
  let actions: Record<string, unknown> = {};

  await act(async () => {
    render(
      <AutoSaveStoreProvider>
        <GenericCanvas
          config={config as never}
          initialProps={page.state}
          onExport={() => {}}
          onCancel={() => {}}
          callbacks={createPageSyncedCallbacks(
            () => ({}),
            (partial) =>
              doc.transact(() => updatePageStateById(doc, PAGE_ID, partial), PAGES_STATE_ORIGIN),
            PAGE_ELEMENT_STATE_KEYS
          )}
          autoSave={false}
          onLiveState={(liveState, liveActions) => {
            live = liveState as Record<string, unknown>;
            actions = liveActions;
          }}
          pageBinding={{ pageYMap: page.yMap, isSynced: true }}
        />
      </AutoSaveStoreProvider>
    );
  });

  return {
    doc,
    state: () => live,
    actions: () => actions,
    remoteEdit: async (partial) => {
      await act(async () => {
        doc.transact(() => updatePageStateById(doc, PAGE_ID, partial), REMOTE_ORIGIN);
      });
    },
  };
}

describe('Fernbearbeitung an der echten Fläche', () => {
  it('lässt einen selbst hinzugefügten Balken stehen und zieht den eigenen nach', async () => {
    const canvas = await mount('dreizeilen', { line1: 'Alt', line2: 'Zwei', line3: 'Drei' });

    await act(async () => {
      (canvas.actions().addBalken as (mode: string) => void)('single');
    });

    const added = (canvas.state().balkenInstances as Array<{ id: string }>).filter(
      (b) => b.id !== 'dreizeilen-balken'
    );
    expect(added, 'addBalken hat nichts hinzugefügt').toHaveLength(1);

    await canvas.remoteEdit({ line1: 'Neu' });

    const after = canvas.state().balkenInstances as Array<{ id: string; texts: string[] }>;
    expect(after.map((b) => b.id)).toContain(added[0].id);
    const primary = after.find((b) => b.id === 'dreizeilen-balken')!;
    expect(primary.texts[0], 'der abgeleitete Balken folgt dem neuen Text nicht').toBe('Neu');
  });

  it('lässt eine selbst hinzugefügte Form stehen', async () => {
    const canvas = await mount('zitat', { quote: 'Alt' });

    await act(async () => {
      (canvas.actions().addShape as (kind: string) => void)('rect');
    });
    const shapeId = (canvas.state().shapeInstances as Array<{ id: string }>)[0].id;

    await canvas.remoteEdit({ quote: 'Neu' });

    expect((canvas.state().shapeInstances as Array<{ id: string }>).map((s) => s.id)).toEqual([
      shapeId,
    ]);
  });
});
