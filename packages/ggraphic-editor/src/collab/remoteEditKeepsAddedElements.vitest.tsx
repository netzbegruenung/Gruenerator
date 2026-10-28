// SPDX-License-Identifier: MPL-2.0
/**
 * Eine Fernbearbeitung darf nichts abräumen, was die Person selbst gebaut hat.
 *
 * `handleRemotePageState` mischt den eingehenden Ausschnitt in den lebenden
 * Zustand und baut ihn über `createInitialState` neu auf. Bis #3421 nahm es
 * dabei `balkenInstances` ganz aus der Eingabe, damit der abgeleitete Balken
 * der Vorlage dem neuen Text folgt — und riss jeden von Hand hinzugefügten
 * Balken mit heraus. Bis #3420 kam `layerOrder` auf den meisten Vorlagen gar
 * nicht erst aus den Props zurück, die Ebenen sprangen also zusätzlich in die
 * Standardreihenfolge.
 *
 * Geprüft wird an der echten Fläche: echte Vorlage, echtes Y.Doc, echter
 * Beobachter. Ein Test gegen `createInitialState` allein bliebe grün, wenn
 * `GenericCanvas` wieder anfinge, Schlüssel aus dem Ausschnitt zu entfernen.
 *
 * Genau zwei Montierungen, eine je Vorlage, und jede prüft alles, was an ihr
 * zu prüfen ist. Jede kostet in der jsdom-Lane eine echte Konva-Bühne — auf
 * einem ausgelasteten CI-Läufer zweistellige Sekunden —, und die Lane teilt
 * sich die Kerne mit `freeElementsReachTheDocument`, das dieselbe Bühne baut.
 */
import { pageElementStateKeys } from '@ggraphic/editor/collab/pageElementStateKeys';
import { readPages, seedPagesIfEmpty, updatePageStateById } from '@ggraphic/editor/collab/pagesDoc';
import { PAGES_STATE_ORIGIN } from '@ggraphic/editor/collab/useYjsPages';
import { createPageSyncedCallbacks } from '@ggraphic/editor/collab/wrapCallbacksWithPageSync';
import { GenericCanvas } from '@ggraphic/editor/components/GenericCanvas';
import { loadCanvasConfig } from '@ggraphic/editor/configs/configLoader';
import '../testing/fixtureTemplates';
import { AutoSaveStoreProvider } from '@ggraphic/editor/stores/AutoSaveStoreProvider';

import { act, render } from '@testing-library/react';
import React from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import * as Y from 'yjs';

// `useFontLoader` fragt `document.fonts`; jsdom laedt keine Schriften und
// kennt die FontFaceSet nicht, das Mounten stirbt sonst im Effekt.
Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { check: () => true, load: async () => [], ready: Promise.resolve(), add() {} },
});

const PAGE_ID = 'seed-0';

/** Kein `PAGES_*`-Ursprung: genau so sieht der Beobachter eine fremde Bearbeitung. */
const REMOTE_ORIGIN = Symbol('anderer-client');

/** Eine vollstaendige Form — der Renderer laeuft hier echt, ein `{id}` reicht ihm nicht. */
const shape = (id: string) => ({
  id,
  type: 'rect' as const,
  x: 100,
  y: 100,
  width: 200,
  height: 200,
  fill: '#808080',
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
});

type ConfigId = 'fixture-note';

// Einmal geladen und mit eigenem Budget: `loadCanvasConfig` zieht ueber einen
// dynamischen Import den ganzen Config-Graphen (konva, recharts, @iconify)
// herein. Im Test gemessen zaehlte das gegen dessen Zeitgrenze.
const configs = new Map<ConfigId, Awaited<ReturnType<typeof loadCanvasConfig>>>();

beforeAll(async () => {
  for (const id of ['fixture-note'] as ConfigId[]) {
    configs.set(id, await loadCanvasConfig(id));
  }
}, 120_000);

type Mounted = {
  state: () => Record<string, unknown>;
  actions: () => Record<string, unknown>;
  remoteEdit: (partial: Record<string, unknown>) => Promise<void>;
};

async function mount(configId: ConfigId, seed: Record<string, unknown>): Promise<Mounted> {
  const config = configs.get(configId)!;
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
            pageElementStateKeys()
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
  it('lässt Formen und ihre Ebenenreihenfolge stehen', async () => {
    const canvas = await mount('fixture-note', {
      primary: 'Alt',
      shapeInstances: [shape('form-a'), shape('form-b')],
      layerOrder: ['form-b', 'form-a'],
    });

    expect(canvas.state().layerOrder, 'layerOrder kam schon beim Mounten nicht an').toEqual([
      'form-b',
      'form-a',
    ]);

    await canvas.remoteEdit({ primary: 'Neu' });

    expect(canvas.state().primary).toBe('Neu');
    expect((canvas.state().shapeInstances as Array<{ id: string }>).map((s) => s.id)).toEqual([
      'form-a',
      'form-b',
    ]);
    expect(canvas.state().layerOrder).toEqual(['form-b', 'form-a']);
  }, 60_000);
});
