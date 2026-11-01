// SPDX-License-Identifier: MPL-2.0
/**
 * Der ausgezeichnete Text eines nur ausgewählten Textes geht von der Leiste über die Seite zur
 * Aktion des Hosts: dieselbe, die auch ein getippter Text nimmt — sie passt ihn ein und
 * zeichnet den Schritt auf.
 */
import { act, cleanup, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { GenericCanvas, type GenericCanvasRef } from '@ggraphic/editor/components/GenericCanvas';
import { loadCanvasConfig } from '@ggraphic/editor/configs/configLoader';
import { AutoSaveStoreProvider } from '@ggraphic/editor/stores/AutoSaveStoreProvider';

import '../../testing/fixtureTemplates';

Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { check: () => true, load: async () => [], ready: Promise.resolve(), add() {} },
});

afterEach(cleanup);

let base: Awaited<ReturnType<typeof loadCanvasConfig>>;
beforeAll(async () => {
  base = await loadCanvasConfig('fixture-poster');
}, 120_000);

const TEXT = {
  id: 't1',
  text: 'Hallo',
  type: 'body',
  x: 100,
  y: 200,
  width: 600,
  fontSize: 48,
  fontFamily: 'PT Sans',
  fill: '#ffffff',
};

describe('the format of a selected text through the canvas', () => {
  it('reaches the host action for a free text, as one change of its text', async () => {
    const updateAdditionalText = vi.fn();
    const config = {
      ...base,
      createActions: (...args: unknown[]) => ({
        ...(base.createActions as (...a: unknown[]) => Record<string, unknown>)(...args),
        updateAdditionalText,
      }),
    };
    const ref = createRef<GenericCanvasRef>();
    await act(async () => {
      render(
        <AutoSaveStoreProvider>
          <GenericCanvas
            forwardedRef={ref}
            config={config as never}
            initialProps={{ additionalTexts: [TEXT] }}
            onExport={() => {}}
            onCancel={() => {}}
            autoSave={false}
          />
        </AutoSaveStoreProvider>
      );
    });
    await vi.waitFor(() => expect(ref.current?.handleTextFormatChange).toBeDefined());

    act(() => ref.current!.handleTextFormatChange!('t1', '**Hallo**'));
    expect(updateAdditionalText).toHaveBeenCalledExactlyOnceWith('t1', { text: '**Hallo**' });
  }, 90_000);
});
