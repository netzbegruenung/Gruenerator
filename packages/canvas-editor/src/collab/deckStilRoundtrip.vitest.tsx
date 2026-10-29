/**
 * Wo trägt eine Folie ihren Stil? Ruling: in `page.state.deckStil`.
 *
 * Der Schlüssel ist dem Editor unbekannt. Geprüft wird, ob er zwei Schritte
 * überlebt: (a) eine Seite wird in die echte Fläche geladen, ein Text
 * bearbeitet (lokal wie fremd), die Seiten werden zurückgelesen; (b) die
 * Yjs-Serialisierung der Kollaboration (Deck-Ersetzung, Update-Übertragung,
 * `serializeDeck`). Wer `deckStil` je aus dem Zustand entfernt, macht diese
 * Datei rot.
 */
import { pageElementStateKeys } from '@ggraphic/editor/collab/pageElementStateKeys';
import {
  readPages,
  replaceDeck,
  seedPagesIfEmpty,
  serializeDeck,
  updatePageStateById,
} from '@ggraphic/editor/collab/pagesDoc';
import { PAGES_STATE_ORIGIN } from '@ggraphic/editor/collab/useYjsPages';
import { createPageSyncedCallbacks } from '@ggraphic/editor/collab/wrapCallbacksWithPageSync';
import { GenericCanvas } from '@ggraphic/editor/components/GenericCanvas';
import { loadCanvasConfig } from '@ggraphic/editor/configs/configLoader';
import { AutoSaveStoreProvider } from '@ggraphic/editor/stores/AutoSaveStoreProvider';
import { act, render } from '@testing-library/react';
import React from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { vorlageDeckOps } from './vorlageDeck';

// `useFontLoader` fragt `document.fonts`; jsdom kennt die FontFaceSet nicht.
Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { check: () => true, load: async () => [], ready: Promise.resolve(), add() {} },
});

const PAGE_ID = 'seed-0';
const REMOTE_ORIGIN = Symbol('anderer-client');

let config: Awaited<ReturnType<typeof loadCanvasConfig>>;
beforeAll(async () => {
  config = await loadCanvasConfig('dreizeilen');
}, 120_000);

describe('deckStil auf der Seite', () => {
  it('überlebt Laden, lokale und fremde Textänderung an der echten Fläche', async () => {
    const doc = new Y.Doc();
    seedPagesIfEmpty(doc, [
      {
        id: PAGE_ID,
        configId: 'dreizeilen',
        state: { line1: 'Alt', line2: 'Zwei', line3: 'Drei', deckStil: 'band' },
      },
    ]);
    const page = readPages(doc)[0];
    const callbacks = createPageSyncedCallbacks(
      () => ({ onLine1Change: () => {} }),
      (partial) =>
        doc.transact(() => updatePageStateById(doc, PAGE_ID, partial), PAGES_STATE_ORIGIN),
      pageElementStateKeys()
    );

    await act(async () => {
      render(
        <AutoSaveStoreProvider>
          <GenericCanvas
            config={config as never}
            initialProps={page.state}
            onExport={() => {}}
            onCancel={() => {}}
            callbacks={callbacks}
            autoSave={false}
            pageBinding={{ pageYMap: page.yMap, isSynced: true }}
          />
        </AutoSaveStoreProvider>
      );
    });

    // Lokale Bearbeitung: der Host schreibt nur den geänderten Text.
    await act(async () => {
      (callbacks as unknown as Record<string, (v: string) => void>).onLine1Change('Neu');
    });
    // Fremde Bearbeitung: die Fläche baut sich über createInitialState neu auf.
    await act(async () => {
      doc.transact(() => updatePageStateById(doc, PAGE_ID, { line2: 'Fremd' }), REMOTE_ORIGIN);
    });

    const state = readPages(doc)[0]!.state;
    expect(state.line1).toBe('Neu');
    expect(state.line2).toBe('Fremd');
    expect(state.deckStil).toBe('band');
  }, 60_000);

  it('überlebt die Yjs-Serialisierung: Übertragung, Deck-Ersetzung, serializeDeck', () => {
    const doc = new Y.Doc();
    seedPagesIfEmpty(doc, [
      { id: 'a', configId: 'freeform', state: { title: 'Eins', deckStil: 'kacheln' } },
    ]);
    // Übertragung an einen zweiten Client.
    const other = new Y.Doc();
    Y.applyUpdate(other, Y.encodeStateAsUpdate(doc));
    expect(readPages(other)[0]!.state.deckStil).toBe('kacheln');

    // Textänderung beim zweiten Client, zurück zum ersten.
    other.transact(() => updatePageStateById(other, 'a', { title: 'Zwei' }), PAGES_STATE_ORIGIN);
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(other));
    expect(readPages(doc)[0]!.state).toMatchObject({ title: 'Zwei', deckStil: 'kacheln' });
    expect(serializeDeck(doc)[0]!.state.deckStil).toBe('kacheln');

    // Die Deck-Ersetzung des Servers/der Vorlagen: der Stil wandert mit dem State.
    replaceDeck(
      doc,
      vorlageDeckOps(
        readPages(doc),
        [{ configId: 'freeform', state: { title: 'Drei', deckStil: 'aussage' } }],
        () => 'neu'
      ),
      PAGES_STATE_ORIGIN
    );
    expect(serializeDeck(doc)[0]!.state).toMatchObject({ title: 'Drei', deckStil: 'aussage' });
  });
});
