/**
 * Before the sync a page previews the locally cached doc: its stored config
 * reaches the store, but nothing flows back into the doc.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { CanvasStoreProvider, useCanvasStore } from '../stores/CanvasStoreProvider';

import { useYjsCanvasBinding } from './useYjsCanvasBinding';

import type { CanvasEditorStoreApi } from '../stores/createCanvasEditorStore';

let captured: CanvasEditorStoreApi | null = null;

function Page({ parent }: { parent: Y.Map<unknown> }) {
  captured = useCanvasStore();
  useYjsCanvasBinding({ parent, isSynced: false });
  return null;
}

describe('useYjsCanvasBinding before the sync', () => {
  it('seeds the store from the cached config and never writes the doc', () => {
    const doc = new Y.Doc();
    const page = new Y.Map<unknown>();
    doc.getMap('pagesById').set('p1', page);
    const config = new Y.Map<unknown>();
    config.set('width', 1080);
    config.set('height', 1920);
    page.set('config', config);

    const updates: Uint8Array[] = [];
    doc.on('update', (u: Uint8Array) => updates.push(u));

    render(
      <CanvasStoreProvider>
        <Page parent={page} />
      </CanvasStoreProvider>
    );

    expect(captured?.getState().config.height).toBe(1920);
    captured?.getState().setConfig({ height: 1350 });
    expect(config.get('height')).toBe(1920);
    expect(updates).toEqual([]);
  });

  it('leaves a page without stored config untouched', () => {
    const doc = new Y.Doc();
    const page = new Y.Map<unknown>();
    doc.getMap('pagesById').set('p1', page);
    const updates: Uint8Array[] = [];
    doc.on('update', (u: Uint8Array) => updates.push(u));

    render(
      <CanvasStoreProvider>
        <Page parent={page} />
      </CanvasStoreProvider>
    );

    expect(page.has('config')).toBe(false);
    expect(updates).toEqual([]);
  });
});
