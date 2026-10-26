/**
 * Abbrechen / Fertig im Zuschneide-Modus (Hintergrundfoto und eigenes Bild):
 * Abbrechen stellt den Zuschnitt vom Betreten her und hinterlässt keinen
 * Schritt, der ihn zurückbrächte; jedes andere Ende behält ihn als einen Schritt.
 */
import { createCanvas } from '@napi-rs/canvas';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import Konva from 'konva';
import { createRef } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadCanvasConfig } from '../../configs/configLoader';
import { AutoSaveStoreProvider } from '../../stores/AutoSaveStoreProvider';
import { GenericCanvas, type GenericCanvasRef } from '../GenericCanvas';

import type * as StoreModule from '../../stores/createCanvasEditorStore';
import type { CanvasEditorStoreApi } from '../../stores/createCanvasEditorStore';
import type { UserImageInstance } from '../../utils/userImageUtils';

const stores = vi.hoisted(() => [] as unknown[]);
vi.mock('../../stores/createCanvasEditorStore', async (importOriginal) => {
  const original = await importOriginal<typeof StoreModule>();
  return {
    ...original,
    createCanvasEditorStore: (...args: Parameters<typeof original.createCanvasEditorStore>) => {
      const store = original.createCanvasEditorStore(...args);
      stores.push(store);
      return store;
    },
  };
});

vi.mock('use-image', async () => {
  const { Image, createCanvas: create } = await import('@napi-rs/canvas');
  const bitmap = new Image();
  bitmap.src = create(4, 4).toBuffer('image/png');
  return { default: (url: string) => (url ? [bitmap, 'loaded'] : [undefined, 'loading']) };
});

vi.spyOn(Konva.Node.prototype, 'cache').mockReturnThis();

Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { check: () => true, load: async () => [], ready: Promise.resolve(), add() {} },
});

beforeEach(() => {
  vi.spyOn(window, 'Image').mockImplementation(function () {
    const image = Object.assign(createCanvas(600, 400), {
      naturalWidth: 600,
      naturalHeight: 400,
      onload: null as (() => void) | null,
    });
    Object.defineProperty(image, 'src', { set: () => queueMicrotask(() => image.onload?.()) });
    return image as unknown as HTMLImageElement;
  });
});

let config: Awaited<ReturnType<typeof loadCanvasConfig>>;
beforeAll(async () => {
  config = await loadCanvasConfig('dreizeilen');
}, 120_000);

afterEach(() => {
  cleanup();
  vi.mocked(window.Image).mockRestore();
});

const PHOTO: UserImageInstance = {
  id: 'photo',
  src: '/photo.jpg',
  fileName: 'photo.jpg',
  x: 50,
  y: 80,
  width: 600,
  height: 400,
  rotation: 0,
  scale: 1,
  opacity: 1,
};

async function mount() {
  const ref = createRef<GenericCanvasRef>();
  const live = { state: {} as Record<string, unknown> };
  stores.length = 0;
  await act(async () => {
    render(
      <AutoSaveStoreProvider>
        <GenericCanvas
          forwardedRef={ref}
          config={config as never}
          initialProps={{
            line1: 'Klima',
            currentImageSrc: 'https://example.org/foto.png',
            userImageInstances: [PHOTO],
          }}
          onExport={() => {}}
          onCancel={() => {}}
          autoSave={false}
          onLiveState={(state) => {
            live.state = state;
          }}
        />
      </AutoSaveStoreProvider>
    );
  });
  const store = stores[stores.length - 1] as CanvasEditorStoreApi;
  await vi.waitFor(() => expect(store.getState().history).toHaveLength(1));
  const stage = Konva.stages.at(-1)!;
  await waitFor(() => expect(stage.findOne('.user-photo')).toBeTruthy());
  const fire = async (node: Konva.Node, type: string) => {
    await act(async () => {
      node.fire(type, { evt: {} }, true);
    });
  };
  const background = () => stage.findOne<Konva.Image>('#background-image')!;
  // Zoom über die Griffe, wie der Transformer ihn meldet.
  const zoomBackground = async (factor: number) => {
    background().scale({ x: factor, y: factor });
    await fire(background(), 'transformend');
  };
  const cropUserImage = async () => {
    const transformer = stage
      .find<Konva.Transformer>('Transformer')
      .find((t) => t.nodes()[0]?.name() === 'selection-chrome')!;
    const frame = transformer.nodes()[0]!;
    frame.position({ x: 100, y: 50 });
    frame.scale({ x: 0.5, y: 0.5 });
    await fire(frame, 'transformend');
  };
  const userImage = () => (live.state.userImageInstances as UserImageInstance[])[0];
  const run = async (fn: () => void) => {
    await act(async () => {
      fn();
    });
  };
  return {
    ref,
    live,
    store,
    stage,
    fire,
    background,
    zoomBackground,
    cropUserImage,
    userImage,
    run,
  };
}

type Canvas = Awaited<ReturnType<typeof mount>>;

async function enterBackgroundCrop(canvas: Canvas) {
  await canvas.fire(canvas.background(), 'dbltap');
  expect(canvas.store.getState().croppingElement).toBe('background-image');
}

async function enterUserImageCrop(canvas: Canvas) {
  const photo = canvas.stage.findOne('.user-photo')!;
  await canvas.fire(photo, 'touchstart');
  await canvas.fire(photo, 'dbltap');
  expect(canvas.store.getState().croppingElement).toBe('photo');
}

/** Kein Schritt im Verlauf bringt den Wert zurück, nach dem `read` fragt. */
function historyValues(canvas: Canvas, read: (s: Record<string, unknown>) => unknown) {
  return canvas.store
    .getState()
    .history.map((e) => JSON.stringify(read(e.componentState as Record<string, unknown>)));
}

describe('Zuschneide-Modus: Abbrechen', () => {
  it('stellt Zoom und Versatz des Hintergrundfotos her, ohne Schritt dafür', async () => {
    const canvas = await mount();
    const before = { scale: canvas.live.state.imageScale, offset: canvas.live.state.imageOffset };
    await enterBackgroundCrop(canvas);
    await canvas.zoomBackground(2);
    expect(canvas.live.state.imageScale).not.toBe(before.scale);

    await canvas.run(() => canvas.ref.current!.handleCancelCrop!());

    expect(canvas.store.getState().croppingElement).toBeNull();
    expect(canvas.live.state.imageScale).toBe(before.scale);
    expect(canvas.live.state.imageOffset).toEqual(before.offset);
    const s = canvas.store.getState();
    expect(s.canRedo()).toBe(false);
    expect(new Set(historyValues(canvas, (c) => c.imageScale))).toEqual(
      new Set([JSON.stringify(before.scale)])
    );
  }, 90_000);

  it('stellt den Zuschnitt eines eigenen Bildes her', async () => {
    const canvas = await mount();
    await enterUserImageCrop(canvas);
    await canvas.cropUserImage();
    expect(canvas.userImage().cropZoom).toBe(2);

    await canvas.run(() => canvas.ref.current!.handleCancelCrop!());

    expect(canvas.store.getState().croppingElement).toBeNull();
    expect(canvas.userImage()).toEqual(PHOTO);
    expect(canvas.store.getState().canRedo()).toBe(false);
    expect(
      historyValues(canvas, (c) => (c.userImageInstances as UserImageInstance[])[0]?.cropZoom)
    ).not.toContain(JSON.stringify(2));
  }, 90_000);
});

describe('Zuschneide-Modus: Abbrechen nach Rückgängig', () => {
  it('lässt den Stand beim Verlauf, wenn hinter den Beginn zurückgenommen wurde', async () => {
    const canvas = await mount();
    const initial = canvas.live.state.imageScale;
    await enterBackgroundCrop(canvas);
    await canvas.zoomBackground(2);
    await canvas.run(() => canvas.ref.current!.handleFinishCrop!());
    const zoomed = canvas.live.state.imageScale;
    expect(zoomed).not.toBe(initial);

    await enterBackgroundCrop(canvas);
    await canvas.zoomBackground(1.5);
    await canvas.run(() => canvas.ref.current!.undo!());
    await canvas.run(() => canvas.ref.current!.undo!());
    const s = canvas.store.getState();
    const atIndex = (s.history[s.historyIndex]!.componentState as Record<string, unknown>)
      .imageScale;
    expect(canvas.live.state.imageScale).toBe(atIndex);

    await canvas.run(() => canvas.ref.current!.handleCancelCrop!());

    expect(canvas.store.getState().croppingElement).toBeNull();
    // Ohne die Prüfung käme hier der Schnappschuss (`zoomed`) zurück, fern vom Verlauf.
    const after = canvas.store.getState();
    expect(canvas.live.state.imageScale).toBe(
      (after.history[after.historyIndex]!.componentState as Record<string, unknown>).imageScale
    );
    expect(canvas.live.state.imageScale).toBe(initial);
  }, 90_000);
});

describe('Zuschneide-Modus: jedes andere Ende ist Fertig', () => {
  it('Fertig behält den Zuschnitt als einen Schritt, Rückgängig nimmt ihn ganz zurück', async () => {
    const canvas = await mount();
    const before = canvas.live.state.imageScale;
    await enterBackgroundCrop(canvas);
    await canvas.zoomBackground(2);
    await canvas.zoomBackground(1.5);
    const after = canvas.live.state.imageScale;

    await canvas.run(() => canvas.ref.current!.handleFinishCrop!());

    expect(canvas.store.getState().croppingElement).toBeNull();
    expect(canvas.live.state.imageScale).toBe(after);
    expect(canvas.store.getState().history).toHaveLength(2);
    await canvas.run(() => canvas.ref.current!.undo!());
    expect(canvas.live.state.imageScale).toBe(before);
  }, 90_000);

  it('Escape behält den Zuschnitt', async () => {
    const canvas = await mount();
    await enterUserImageCrop(canvas);
    await canvas.cropUserImage();
    await canvas.run(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(canvas.store.getState().croppingElement).toBeNull();
    expect(canvas.userImage().cropZoom).toBe(2);
  }, 90_000);

  it('ein Auswahlwechsel behält den Zuschnitt', async () => {
    const canvas = await mount();
    await enterBackgroundCrop(canvas);
    await canvas.zoomBackground(2);
    const after = canvas.live.state.imageScale;
    await canvas.fire(canvas.stage.findOne('#sunflower')!, 'touchstart');
    expect(canvas.store.getState().croppingElement).toBeNull();
    expect(canvas.live.state.imageScale).toBe(after);
    // Ein späteres Abbrechen gehört zu keiner Sitzung mehr und nimmt nichts zurück.
    await canvas.run(() => canvas.ref.current!.handleCancelCrop!());
    expect(canvas.live.state.imageScale).toBe(after);
  }, 90_000);

  it('ein erneuter Doppelklick behält den Zuschnitt', async () => {
    const canvas = await mount();
    await enterBackgroundCrop(canvas);
    await canvas.zoomBackground(2);
    const after = canvas.live.state.imageScale;
    await canvas.fire(canvas.background(), 'dblclick');
    expect(canvas.store.getState().croppingElement).toBeNull();
    expect(canvas.live.state.imageScale).toBe(after);
  }, 90_000);
});
