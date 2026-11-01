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

type ConfigId = 'dreizeilen' | 'zitat';

// Einmal geladen und mit eigenem Budget: `loadCanvasConfig` zieht ueber einen
// dynamischen Import den ganzen Config-Graphen (konva, recharts, @iconify)
// herein. Im Test gemessen zaehlte das gegen dessen Zeitgrenze.
const configs = new Map<ConfigId, Awaited<ReturnType<typeof loadCanvasConfig>>>();

beforeAll(async () => {
  for (const id of ['dreizeilen', 'zitat'] as ConfigId[]) {
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
  }, 60_000);
});
