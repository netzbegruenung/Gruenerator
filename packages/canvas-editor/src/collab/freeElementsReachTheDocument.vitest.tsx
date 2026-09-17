/**
 * Freie Elemente muessen im gemeinsamen Dokument landen.
 *
 * Dekoratives, Formen, freie Texte, Diagramme, Rahmen, Badges, Balken und
 * hochgeladene Bilder aendert die Vorlage ueber ihre eigenen Aktionen
 * (`setState`) — kein Host erklaert dafuer ein `on<Key>Change`. Bis #3416 gab
 * es damit keinen einzigen Pfad aus dem Komponentenzustand in
 * `pages[i].state`: die Sonnenblume erschien auf der Flaeche, Hocuspocus sah
 * nie ein Update, und nach dem Neuladen war sie weg.
 *
 * Zwei Ebenen, weil keine allein reicht:
 *
 * 1. Die echte Flaeche (`GenericCanvas` mit der echten `zitat`-Vorlage und
 *    einem echten Y.Doc). Nur sie beweist, dass die Verdrahtung ueberhaupt
 *    haengt — eine Pruefung am Haken allein bliebe gruen, wenn `GenericCanvas`
 *    `useEmitHostStateChanges` nicht mehr riefe.
 * 2. Der zusammengesetzte Aufbau. Nur er erreicht JEDEN Schluessel der Liste:
 *    Illustrationen und Uploads laden im Browser nach, und jsdom rastert
 *    nichts, also fuehrt keine echte Aktion dort hin.
 */
import { act, render } from '@testing-library/react';
import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { GenericCanvas } from '../components/GenericCanvas';
import { loadCanvasConfig } from '../configs/configLoader';
import { AutoSaveStoreProvider } from '../stores/AutoSaveStoreProvider';

import { PAGE_ELEMENT_STATE_KEYS } from './pageElementStateKeys';
import { readPages, seedPagesIfEmpty, updatePageStateById } from './pagesDoc';
import { PAGES_STATE_ORIGIN } from './useYjsPages';
import { useEmitHostStateChanges } from './useEmitHostStateChanges';
import { createPageSyncedCallbacks } from './wrapCallbacksWithPageSync';

// `useFontLoader` fragt `document.fonts`; jsdom laedt keine Schriften und
// kennt die FontFaceSet nicht, das Mounten stirbt sonst im Effekt.
Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { check: () => true, load: async () => [], ready: Promise.resolve(), add() {} },
});

const PAGE_ID = 'seed-0';

function seedDoc(state: Record<string, unknown> = {}) {
  const doc = new Y.Doc();
  seedPagesIfEmpty(doc, [
    { id: PAGE_ID, configId: 'zitat', state: { quote: 'Grün wirkt', ...state } },
  ]);
  return doc;
}

const pageState = (doc: Y.Doc): Record<string, unknown> =>
  readPages(doc).find((p) => p.id === PAGE_ID)!.state;

/**
 * Die Seiten-Callbacks, wie `CanvasEditor` sie je Seite baut — samt
 * `PAGES_STATE_ORIGIN`. Der Ursprung ist nicht Beiwerk: ohne ihn liest
 * `useYjsPageStateSync` den eigenen Schreibvorgang als Fernbearbeitung zurueck
 * und `createInitialState` baut den Zustand mitten im Test neu auf.
 */
const pageCallbacks = (doc: Y.Doc, hostCallbacks: Record<string, (val: unknown) => void> = {}) =>
  createPageSyncedCallbacks(
    () => hostCallbacks,
    (partial) => doc.transact(() => updatePageStateById(doc, PAGE_ID, partial), PAGES_STATE_ORIGIN),
    PAGE_ELEMENT_STATE_KEYS
  );

describe('freie Elemente an der echten Flaeche', () => {
  it('traegt jedes hinzugefuegte Element in den Seitenzustand ein', async () => {
    const config = await loadCanvasConfig('zitat');
    const doc = seedDoc();
    const page = readPages(doc)[0];
    let actions: Record<string, unknown> = {};

    await act(async () => {
      render(
        <AutoSaveStoreProvider>
          <GenericCanvas
            config={config as never}
            initialProps={page.state}
            onExport={() => {}}
            onCancel={() => {}}
            callbacks={pageCallbacks(doc)}
            autoSave={false}
            onLiveState={(_state, liveActions) => {
              actions = liveActions;
            }}
            pageBinding={{ pageYMap: page.yMap, isSynced: true }}
          />
        </AutoSaveStoreProvider>
      );
    });

    const call = async (name: string, ...args: unknown[]) => {
      expect(actions[name], `Aktion ${name} fehlt`).toBeTypeOf('function');
      await act(async () => {
        (actions[name] as (...a: unknown[]) => void)(...args);
      });
    };

    await call('addAsset', 'sonnenblume-gelb');
    await call('addShape', 'rect');
    await call('addText');
    await call('addPillBadge');
    await call('addCircleBadge');
    await call('addChart', 'bar');
    await call('addFrame', 'circle');
    await call('addBalken', 'single');
    await call('toggleIcon', 'icon-1', true);

    const state = pageState(doc);
    expect(state.assetInstances).toHaveLength(1);
    expect(state.shapeInstances).toHaveLength(1);
    expect(state.additionalTexts).toHaveLength(1);
    expect(state.pillBadgeInstances).toHaveLength(1);
    expect(state.circleBadgeInstances).toHaveLength(1);
    expect(state.chartInstances).toHaveLength(1);
    expect(state.frameInstances).toHaveLength(1);
    expect(state.balkenInstances).toHaveLength(1);
    expect(state.selectedIcons).toEqual(['icon-1']);
    expect(state.iconStates).toBeDefined();
    // 30 s reichten, solange dies die einzige Datei der jsdom-Lane war, die
    // eine echte Konva-Buehne baut. Seit `remoteEditKeepsAddedElements` daneben
    // steht, teilen sich zwei Forks die Kerne mit 15 weiteren Turbo-Aufgaben:
    // gemessen 32 s auf dem CI-Laeufer, knapp darueber (Lauf 35150293497).
  }, 90_000);
});

/**
 * Steht fuer die Flaeche: haelt den Vorlagenzustand lokal und meldet
 * Aenderungen ueber dieselben je Seite umhuellten Callbacks nach aussen.
 */
function Page({
  doc,
  hostCallbacks,
  onReady,
}: {
  doc: Y.Doc;
  hostCallbacks?: Record<string, (val: unknown) => void>;
  onReady: (setState: React.Dispatch<React.SetStateAction<Record<string, unknown>>>) => void;
}) {
  const [state, setState] = useState<Record<string, unknown>>(() => pageState(doc));
  const [callbacks] = useState(() => pageCallbacks(doc, hostCallbacks));
  useEmitHostStateChanges(state, callbacks, PAGE_ELEMENT_STATE_KEYS);
  onReady(setState);
  return null;
}

function mount(doc: Y.Doc, hostCallbacks?: Record<string, (val: unknown) => void>) {
  let setState!: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  render(
    <Page
      doc={doc}
      hostCallbacks={hostCallbacks}
      onReady={(s) => {
        setState = s;
      }}
    />
  );
  return (partial: Record<string, unknown>) =>
    act(() => {
      setState((prev) => ({ ...prev, ...partial }));
    });
}

describe('freie Elemente im gemeinsamen Dokument', () => {
  it('hat fuer jeden Schluessel der Liste einen Schreibpfad', () => {
    const doc = seedDoc();
    const edit = mount(doc);

    // Ein neu aufgenommener Schluessel ohne Schreibpfad faellt hier auf, statt
    // still als Datenverlust im Editor zu enden.
    const edited: Record<string, unknown> = {
      assetInstances: [{ id: 'asset-1' }],
      selectedIcons: ['icon-1'],
      iconStates: { 'icon-1': { x: 1, y: 2, scale: 1, rotation: 0 } },
      shapeInstances: [{ id: 'shape-1', type: 'rect' }],
      illustrationInstances: [{ id: 'ill-1' }],
      additionalTexts: [{ id: 'text-1', text: 'frei' }],
      pillBadgeInstances: [{ id: 'pill-1' }],
      circleBadgeInstances: [{ id: 'circle-1' }],
      balkenInstances: [{ id: 'balken-1' }],
      frameInstances: [{ id: 'frame-1', clipType: 'circle' }],
      chartInstances: [{ id: 'chart-1', chartType: 'bar' }],
      userImageInstances: [{ id: 'img-1', src: 'blob:x' }],
      layerOrder: ['shape-1', 'asset-1'],
    };
    expect(Object.keys(edited)).toEqual([...PAGE_ELEMENT_STATE_KEYS]);

    edit(edited);

    expect(pageState(doc)).toMatchObject(edited);
  });

  it('traegt spaetere Bewegungen und das Loeschen nach', () => {
    const doc = seedDoc();
    const edit = mount(doc);

    edit({ assetInstances: [{ id: 'asset-1', x: 0, y: 0 }] });
    edit({ assetInstances: [{ id: 'asset-1', x: 540, y: 960 }] });
    expect(pageState(doc).assetInstances).toEqual([{ id: 'asset-1', x: 540, y: 960 }]);

    edit({ assetInstances: [] });
    expect(pageState(doc).assetInstances).toEqual([]);
  });

  it('schreibt den geladenen Zustand nicht beim Montieren zurueck', () => {
    const doc = seedDoc({ assetInstances: [{ id: 'asset-1', x: 10, y: 10 }] });
    let updates = 0;
    doc.on('update', () => {
      updates++;
    });

    mount(doc);

    expect(updates).toBe(0);
  });

  it('erzeugt kein Echo, wenn derselbe Wert erneut gesetzt wird', () => {
    const doc = seedDoc();
    const edit = mount(doc);
    edit({ assetInstances: [{ id: 'asset-1', x: 0, y: 0 }] });

    let updates = 0;
    doc.on('update', () => {
      updates++;
    });
    // Wie nach einer Fernbearbeitung: `createInitialState` baut den Zustand neu
    // auf, jede Sammlung bekommt eine frische Referenz bei gleichem Inhalt.
    edit({ assetInstances: [{ id: 'asset-1', x: 0, y: 0 }] });

    expect(updates).toBe(0);
  });

  it('laesst dem Host-Callback den Vortritt, wenn es eines gibt', () => {
    const doc = seedDoc();
    const onShapeInstancesChange = vi.fn();
    const edit = mount(doc, { onShapeInstancesChange });

    edit({ shapeInstances: [{ id: 'shape-1' }] });

    expect(onShapeInstancesChange).toHaveBeenCalledWith([{ id: 'shape-1' }]);
    expect(pageState(doc).shapeInstances).toEqual([{ id: 'shape-1' }]);
  });
});
