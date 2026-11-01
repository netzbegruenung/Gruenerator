/**
 * ggraphic's shell keeps a few page keys the host templates never read back
 * (brand bindings, template origin, element groups). They must survive the
 * host's save → reload path: written into the page state, encoded as a Yjs
 * update, applied to a fresh doc, handed to the page on mount, and still there
 * after an ordinary text edit. A dropped key would be silent data loss.
 */
import { readPages, seedPagesIfEmpty } from '@ggraphic/editor/collab/pagesDoc';
import { act, render } from '@testing-library/react';
import { type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { CanvasEditor } from '../components/CanvasEditor';
import { HOST_CALLBACK_KEYS } from '../hostCallbackKeys';

type Callbacks = Record<string, (val: unknown) => void>;

window.matchMedia = (query: string) =>
  ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }) as unknown as MediaQueryList;

const mounted = new Map<string, { initialProps: Record<string, unknown>; callbacks: Callbacks }>();

vi.mock('@ggraphic/editor/components/GenericCanvas', () => ({
  GenericCanvas: ({
    initialProps,
    callbacks,
  }: {
    initialProps: Record<string, unknown>;
    callbacks: Callbacks;
  }) => {
    mounted.set(initialProps.marker as string, { initialProps, callbacks });
    return null;
  },
}));

vi.mock('@ggraphic/editor/sidebar/UserUploadsProvider', () => ({
  UserUploadsProvider: ({ children }: { children: ReactNode }) => children,
}));

const hostCallbacks: Callbacks = Object.fromEntries(
  HOST_CALLBACK_KEYS.dreizeilen.map((key) => [
    `on${key.charAt(0).toUpperCase()}${key.slice(1)}Change`,
    () => {},
  ])
);

const SHELL_KEYS = {
  bind: { backgroundColor: 'primary' },
  brandScheme: { id: 'gruene-de' },
  brandStamp: 'stamp-1',
  templateRef: { id: 'vorlage-1' },
  groups: [{ id: 'g1', ids: ['a', 'b'] }],
};

describe('shell page keys across save and reload', () => {
  it('survive the Yjs round trip, the mount and a text edit', async () => {
    mounted.clear();
    const saved = new Y.Doc();
    seedPagesIfEmpty(saved, [
      {
        id: 'p1',
        configId: 'dreizeilen',
        state: { marker: 'm', line1: 'Eins', ...SHELL_KEYS },
      },
    ]);

    // reload: a fresh doc built from the stored update
    const doc = new Y.Doc();
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(saved));
    expect(readPages(doc)[0].state).toMatchObject(SHELL_KEYS);

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
    await vi.waitFor(() => expect(mounted.has('m')).toBe(true), { timeout: 30_000 });

    // the page receives them on mount
    expect(mounted.get('m')!.initialProps).toMatchObject(SHELL_KEYS);

    // an ordinary edit leaves them in the stored page
    await act(async () => {
      mounted.get('m')!.callbacks.onLine1Change?.('Zwei');
    });
    const state = readPages(doc)[0].state;
    expect(state.line1).toBe('Zwei');
    expect(state).toMatchObject(SHELL_KEYS);
  }, 60_000);
});
