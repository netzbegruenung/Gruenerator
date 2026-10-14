/**
 * A deck may mix templates ("Seite hinzufügen" offers every template of the
 * category, "Vorlage ändern" converts a page, the creator's replaceDeck
 * inserts any configId). The host declares text-field callbacks for ONE
 * canvas type only, so a page of another template must still get a writer
 * for its own text fields — otherwise its edits never reach `pages[i].state`
 * and are gone on reload.
 *
 * GenericCanvas is stubbed: this checks what CanvasEditor hands each page.
 * That a real page calls `on<Key>Change` for its text fields is covered by
 * undoReachesTheDocument.
 */
import { act, render } from '@testing-library/react';
import { type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { CanvasEditor } from '../components/CanvasEditor';
import { HOST_CALLBACK_KEYS } from '../hostCallbackKeys';

import { readPages, seedPagesIfEmpty, setPageConfigById } from './pagesDoc';

type Callbacks = Record<string, (val: unknown) => void>;

window.matchMedia = (query: string) =>
  ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }) as unknown as MediaQueryList;

const pageCallbacks = new Map<string, Callbacks>();

vi.mock('../components/GenericCanvas', () => ({
  GenericCanvas: ({
    initialProps,
    callbacks,
  }: {
    initialProps: Record<string, unknown>;
    callbacks: Callbacks;
  }) => {
    pageCallbacks.set(initialProps.marker as string, callbacks);
    return null;
  },
}));

// Pulls react-query (a second React copy in this lane); irrelevant here.
vi.mock('../sidebar/UserUploadsProvider', () => ({
  UserUploadsProvider: ({ children }: { children: ReactNode }) => children,
}));

// The router's host callbacks for a dreizeilen deck.
const hostCallbacks: Callbacks = Object.fromEntries(
  HOST_CALLBACK_KEYS.dreizeilen.map((key) => [
    `on${key.charAt(0).toUpperCase()}${key.slice(1)}Change`,
    () => {},
  ])
);

const stateOf = (doc: Y.Doc, id: string) => readPages(doc).find((p) => p.id === id)!.state;

async function mountDeck(doc: Y.Doc) {
  await act(async () => {
    render(
      <CanvasEditor
        initialConfigId="dreizeilen"
        initialProps={{}}
        onExport={() => {}}
        onCancel={() => {}}
        callbacks={hostCallbacks}
        collaborative={{ ydoc: doc, isSynced: true }}
      />
    );
  });
  await vi.waitFor(() => expect(pageCallbacks.size).toBe(2), { timeout: 30_000 });
}

describe('text edits on a page of another template', () => {
  it('reach that page state in the document', async () => {
    pageCallbacks.clear();
    const doc = new Y.Doc();
    seedPagesIfEmpty(doc, [
      { id: 'p-drei', configId: 'dreizeilen', state: { marker: 'drei', line1: 'Eins' } },
      { id: 'p-zitat', configId: 'zitat', state: { marker: 'zitat', quote: 'Alt' } },
    ]);
    await mountDeck(doc);

    await act(async () => {
      pageCallbacks.get('zitat')!.onQuoteChange?.('Neu');
      pageCallbacks.get('drei')!.onLine1Change?.('Zwei');
    });

    expect(stateOf(doc, 'p-zitat').quote).toBe('Neu');
    expect(stateOf(doc, 'p-drei').line1).toBe('Zwei');
  }, 60_000);

  it('follow a page converted to another template', async () => {
    pageCallbacks.clear();
    const doc = new Y.Doc();
    seedPagesIfEmpty(doc, [
      { id: 'p-drei', configId: 'dreizeilen', state: { marker: 'drei', line1: 'Eins' } },
      { id: 'p-conv', configId: 'dreizeilen', state: { marker: 'conv', line1: 'Eins' } },
    ]);
    await mountDeck(doc);

    pageCallbacks.delete('conv');
    await act(async () => {
      setPageConfigById(doc, 'p-conv', 'zitat', { marker: 'conv', quote: 'Alt' });
    });
    await vi.waitFor(() => expect(pageCallbacks.has('conv')).toBe(true));

    await act(async () => {
      pageCallbacks.get('conv')!.onQuoteChange?.('Neu');
    });

    expect(stateOf(doc, 'p-conv').quote).toBe('Neu');
  }, 60_000);
});
