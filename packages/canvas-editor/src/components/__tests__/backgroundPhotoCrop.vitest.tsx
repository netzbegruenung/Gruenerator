/**
 * Das Hintergrundfoto steht fest wie in Canva: ausgewählt zeigt es keine
 * Griffe und zieht nicht; erst der Ausschnitt-Modus (Doppelklick/Doppeltipp)
 * gibt Verschieben und Zoomen frei.
 */
import { GenericCanvas, type GenericCanvasRef } from '@ggraphic/editor/components/GenericCanvas';
import { loadCanvasConfig } from '@ggraphic/editor/configs/configLoader';
import { AutoSaveStoreProvider } from '@ggraphic/editor/stores/AutoSaveStoreProvider';
import { findDragNodes } from '@ggraphic/editor/utils/multiSelect';
import { act, cleanup, render } from '@testing-library/react';
import Konva from 'konva';
import { createRef } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('use-image', async () => {
  const { Image, createCanvas } = await import('@napi-rs/canvas');
  const bitmap = new Image();
  bitmap.src = createCanvas(4, 4).toBuffer('image/png');
  return { default: (url: string) => (url ? [bitmap, 'loaded'] : [undefined, 'loading']) };
});

vi.spyOn(Konva.Node.prototype, 'cache').mockReturnThis();

Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { check: () => true, load: async () => [], ready: Promise.resolve(), add() {} },
});

let config: Awaited<ReturnType<typeof loadCanvasConfig>>;

beforeAll(async () => {
  config = await loadCanvasConfig('dreizeilen');
}, 120_000);

afterEach(cleanup);

async function mount(extra: Record<string, unknown> = {}) {
  const ref = createRef<GenericCanvasRef>();
  await act(async () => {
    render(
      <AutoSaveStoreProvider>
        <GenericCanvas
          forwardedRef={ref}
          config={config as never}
          initialProps={{
            line1: 'Klima',
            currentImageSrc: 'https://example.org/foto.png',
            ...extra,
          }}
          onExport={() => {}}
          onCancel={() => {}}
          autoSave={false}
        />
      </AutoSaveStoreProvider>
    );
  });
  const stage = Konva.stages.at(-1)!;
  const photo = () => stage.findOne<Konva.Image>('#background-image')!;
  const transformer = () =>
    stage.find<Konva.Transformer>('Transformer').find((t) => t.nodes().includes(photo()));
  const fire = async (node: Konva.Node, type: string) => {
    await act(async () => {
      node.fire(type, { evt: {} }, true);
    });
  };
  return { stage, photo, transformer, fire };
}

describe('Hintergrundfoto: Ausschnitt-Modus', () => {
  it('ausgewählt: kein Ziehen, keine Griffe', async () => {
    const canvas = await mount();
    expect(canvas.photo()).toBeTruthy();
    await canvas.fire(canvas.photo(), 'touchstart');
    expect(canvas.transformer()).toBeTruthy();
    expect(canvas.transformer()!.enabledAnchors()).toEqual([]);
    expect(canvas.photo().draggable()).toBe(false);
  }, 90_000);

  it('Doppelklick schaltet den Modus ein und wieder aus', async () => {
    const canvas = await mount();
    await canvas.fire(canvas.photo(), 'touchstart');
    await canvas.fire(canvas.photo(), 'dblclick');
    expect(canvas.photo().draggable()).toBe(true);
    expect(canvas.transformer()!.enabledAnchors()).toHaveLength(4);

    await canvas.fire(canvas.photo(), 'dblclick');
    expect(canvas.photo().draggable()).toBe(false);
    expect(canvas.transformer()!.enabledAnchors()).toEqual([]);
  }, 90_000);

  it('Doppeltipp auf das nicht ausgewählte Foto führt trotzdem in den Modus', async () => {
    const canvas = await mount();
    await canvas.fire(canvas.photo(), 'dbltap');
    expect(canvas.transformer()).toBeTruthy();
    expect(canvas.photo().draggable()).toBe(true);
  }, 90_000);

  it('eine andere Auswahl beendet den Modus', async () => {
    const canvas = await mount();
    await canvas.fire(canvas.photo(), 'dbltap');
    expect(canvas.photo().draggable()).toBe(true);
    await canvas.fire(canvas.stage.findOne('#sunflower')!, 'touchstart');
    expect(canvas.photo().draggable()).toBe(false);
  }, 90_000);

  it('wandert im Gruppenzug nicht mit', async () => {
    const canvas = await mount();
    const nodes = findDragNodes(canvas.stage.getLayers()[0]!, ['background-image', 'sunflower']);
    expect(nodes).toHaveLength(1);
    expect(nodes).not.toContain(canvas.photo());
  }, 90_000);

  it('eine gespeicherte Sperre des Fotos lähmt den Modus nicht', async () => {
    const canvas = await mount({ lockedLayerIds: ['background-image'] });
    await canvas.fire(canvas.photo(), 'dbltap');
    expect(canvas.photo().draggable()).toBe(true);
    expect(canvas.transformer()!.enabledAnchors()).toHaveLength(4);
  }, 90_000);
});
