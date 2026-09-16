/**
 * Der Store-Reset einer Flaeche darf das gemeinsame Dokument nicht anfassen.
 *
 * `bindCanvasStoreToYMap` schreibt `layers` und `config` aus dem Store in die
 * Y.Map der Seite zurueck — der Echo-Schutz (`applyingRemote`) unterdrueckt
 * nur FREMDE Updates, ein lokales `set` laeuft also durch. `resetStore()`
 * setzte beide auf den Anfangswert, und `reconcileLayers([])` loeschte daraufhin
 * jeden Eintrag aus dem Y.Doc: unter `LOCAL_ORIGIN`, also bei allen
 * Mitarbeitenden und in Hocuspocus persistiert (#3413).
 *
 * Ausgeloest wurde das von genau den zwei Faellen, die dieser Test nachstellt:
 * dem Vorlagenwechsel (`resetKey` wechselt, die Seite bleibt montiert, weil
 * `PageWrapper` nach `page.id` verschluesselt ist) und dem Aushaengen der
 * Flaeche. Die Bindung haengt dabei in einem Kind-Effekt; React raeumt den
 * Eltern-Effekt zuerst ab, die Subscription lebt also noch.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { useCanvasStoreReset } from '../hooks/useCanvasStoreReset';
import { CanvasStoreProvider, useCanvasStore } from '../stores/CanvasStoreProvider';

import { useYjsCanvasBinding } from './useYjsCanvasBinding';

import type { CanvasEditorStoreApi } from '../stores/createCanvasEditorStore';

/** Bindung sitzt wie in `GenericCanvas` unter dem Reset, nicht daneben. */
function BoundPage({ resetKey, parent }: { resetKey: string | null; parent: Y.Map<unknown> }) {
  useCanvasStoreReset(resetKey);
  return <Binding parent={parent} />;
}

function Binding({ parent }: { parent: Y.Map<unknown> }) {
  useYjsCanvasBinding({ parent, isSynced: true });
  return null;
}

let captured: CanvasEditorStoreApi | null = null;
function CaptureStore() {
  captured = useCanvasStore();
  return null;
}

/** Eine Seite, wie `seedPagesIfEmpty` sie anlegt: mit freiem Element und Format. */
function seedPage() {
  const doc = new Y.Doc();
  const page = new Y.Map<unknown>();
  doc.getMap('pagesById').set('p1', page);

  const layers = new Y.Array<Y.Map<unknown>>();
  const layer = new Y.Map<unknown>();
  layer.set('id', 'free-1');
  layer.set('type', 'shape');
  layers.push([layer]);
  page.set('layers', layers);

  const config = new Y.Map<unknown>();
  config.set('width', 1080);
  config.set('height', 1920);
  page.set('config', config);

  return { doc, page };
}

const layerIds = (page: Y.Map<unknown>) =>
  (page.get('layers') as Y.Array<Y.Map<unknown>>).toArray().map((m) => m.get('id'));

const docConfig = (page: Y.Map<unknown>) => (page.get('config') as Y.Map<unknown>).toJSON();

describe('store reset vs. shared document', () => {
  it('laesst freie Elemente und Format beim Vorlagenwechsel stehen', () => {
    const { page } = seedPage();

    const { rerender } = render(
      <CanvasStoreProvider>
        <BoundPage resetKey="zitat" parent={page} />
      </CanvasStoreProvider>
    );
    expect(layerIds(page)).toEqual(['free-1']);

    rerender(
      <CanvasStoreProvider>
        <BoundPage resetKey="dreizeilen" parent={page} />
      </CanvasStoreProvider>
    );

    expect(layerIds(page)).toEqual(['free-1']);
    expect(docConfig(page)).toMatchObject({ width: 1080, height: 1920 });
  });

  it('laesst sie auch beim Aushaengen der Flaeche stehen', () => {
    const { page } = seedPage();

    const { unmount } = render(
      <CanvasStoreProvider>
        <BoundPage resetKey="zitat" parent={page} />
      </CanvasStoreProvider>
    );
    expect(layerIds(page)).toEqual(['free-1']);

    unmount();

    expect(layerIds(page)).toEqual(['free-1']);
    expect(docConfig(page)).toMatchObject({ width: 1080, height: 1920 });
  });

  it('raeumt dabei weiterhin auf, was zur einzelnen Vorlage gehoert', () => {
    const { page } = seedPage();

    const { rerender } = render(
      <CanvasStoreProvider>
        <CaptureStore />
        <BoundPage resetKey="zitat" parent={page} />
      </CanvasStoreProvider>
    );
    const store = captured;
    if (!store) throw new Error('store not captured');

    store.getState().setSelectedElement('quote-text');
    store.getState().saveToHistory();
    expect(store.getState().selectedElement).toBe('quote-text');
    expect(store.getState().history.length).toBeGreaterThan(0);

    rerender(
      <CanvasStoreProvider>
        <CaptureStore />
        <BoundPage resetKey="dreizeilen" parent={page} />
      </CanvasStoreProvider>
    );

    // Auswahl und Verlauf gehoeren zur alten Vorlage und muessen weg sein …
    expect(store.getState().selectedElement).toBeNull();
    expect(store.getState().history).toEqual([]);
    // … die Dokument-Daten aber nicht.
    expect(store.getState().layers.map((l) => l.id)).toEqual(['free-1']);
  });
});
