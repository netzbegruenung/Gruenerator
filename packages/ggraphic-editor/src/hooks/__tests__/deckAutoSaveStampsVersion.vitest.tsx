// SPDX-License-Identifier: MPL-2.0
/**
 * The gallery deck autosave writes a canvas document, so it carries the
 * document format version beside its pages (additive: `pages` is unchanged).
 */
import { CANVAS_DOCUMENT_VERSION } from '@ggraphic/schema';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { CanvasEditorProvider } from '@ggraphic/editor/CanvasEditorProvider';
import { seedPagesIfEmpty, updatePageStateById } from '@ggraphic/editor/collab/pagesDoc';
import { useDeckAutoSave } from '@ggraphic/editor/hooks/useDeckAutoSave';
import { AutoSaveStoreProvider } from '@ggraphic/editor/stores/AutoSaveStoreProvider';

import type { CanvasCreateImageShareParams } from '@ggraphic/editor/hostServices';
import type { ReactNode } from 'react';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useDeckAutoSave', () => {
  it('stamps the saved deck with the document version', async () => {
    const created: CanvasCreateImageShareParams[] = [];
    const services = {
      imageShares: {
        createImageShare: (params: CanvasCreateImageShareParams) => {
          created.push(params);
          return Promise.resolve({ shareToken: 't1' });
        },
        updateImageShare: () => Promise.resolve({ shareToken: 't1' }),
        publishShare: () => Promise.resolve(null),
      },
    };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <CanvasEditorProvider services={services}>
        <AutoSaveStoreProvider>{children}</AutoSaveStoreProvider>
      </CanvasEditorProvider>
    );
    const ydoc = new Y.Doc();
    seedPagesIfEmpty(ydoc, [{ id: 'p1', configId: 'freeform', state: { headline: 'Eins' } }]);
    renderHook(
      () =>
        useDeckAutoSave({
          ydoc,
          enabled: true,
          deckType: 'freeform',
          captureImage: () => Promise.resolve('data:image/png;base64,AA=='),
        }),
      { wrapper }
    );

    updatePageStateById(ydoc, 'p1', { headline: 'Zwei' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(created).toHaveLength(1);
    expect(created[0]!.metadata).toMatchObject({
      content: {
        schemaVersion: CANVAS_DOCUMENT_VERSION,
        pages: [{ id: 'p1', configId: 'freeform', state: { headline: 'Zwei' }, config: {} }],
      },
    });
  });
});
