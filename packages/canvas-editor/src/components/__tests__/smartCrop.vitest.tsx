/**
 * „Automatisch" im Zuschneide-Modus (Hintergrundfoto und eigenes Bild): smartcrop
 * (hier gemockt) schlägt den Ausschnitt vor, die Bühne zeigt ihn, Abbrechen nimmt
 * ihn zurück, und ein Fehlschlag ändert nichts.
 */
import { AutoSaveStoreProvider } from '@ggraphic/editor/stores/AutoSaveStoreProvider';
import { createCanvas } from '@napi-rs/canvas';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import Konva from 'konva';
import { createRef } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadCanvasConfig } from '../../configs/configLoader';
import { GenericCanvas, type GenericCanvasRef } from '../GenericCanvas';

import type * as StoreModule from '@ggraphic/editor/stores/createCanvasEditorStore';
import type { CanvasEditorStoreApi } from '@ggraphic/editor/stores/createCanvasEditorStore';
import type { UserImageInstance } from '@ggraphic/editor/utils/userImageUtils';

const mocks = vi.hoisted(() => ({
  stores: [] as unknown[],
  crop: vi.fn<
    (
      source: HTMLCanvasElement,
      options: { width: number; height: number; minScale: number; maxScale: number }
    ) => Promise<unknown>
  >(),
  toastError: vi.fn(),
}));

vi.mock('smartcrop', () => ({ default: { crop: mocks.crop } }));

vi.mock('@gruenerator/ui', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return { ...original, toast: Object.assign(vi.fn(), { error: mocks.toastError }) };
});

vi.mock('@ggraphic/editor/stores/createCanvasEditorStore', async (importOriginal) => {
  const original = await importOriginal<typeof StoreModule>();
  return {
    ...original,
    createCanvasEditorStore: (...args: Parameters<typeof original.createCanvasEditorStore>) => {
      const store = original.createCanvasEditorStore(...args);
      mocks.stores.push(store);
      return store;
    },
  };
});

// Hintergrund: ein quadratisches 4×4-Foto auf der Hochkant-Seite — Überstand waagerecht.
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

// Eigenes Bild: 600×400 in einem quadratischen Rahmen.
beforeEach(() => {
  mocks.crop.mockReset();
  mocks.toastError.mockReset();
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
  width: 200,
  height: 200,
  rotation: 0,
  scale: 1,
  opacity: 1,
};

async function mount() {
  const ref = createRef<GenericCanvasRef>();
  const live = { state: {} as Record<string, unknown> };
  mocks.stores.length = 0;
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
  const store = mocks.stores[mocks.stores.length - 1] as CanvasEditorStoreApi;
  await vi.waitFor(() => expect(store.getState().history).toHaveLength(1));
  const stage = Konva.stages.at(-1)!;
  await waitFor(() => expect(stage.findOne('.user-photo')).toBeTruthy());
  const fire = async (node: Konva.Node, type: string) => {
    await act(async () => {
      node.fire(type, { evt: {} }, true);
    });
  };
  const run = async (fn: () => void) => {
    await act(async () => {
      fn();
    });
  };
  const background = () => stage.findOne<Konva.Image>('#background-image')!;
  const userImage = () => (live.state.userImageInstances as UserImageInstance[])[0]!;
  return { ref, live, store, stage, fire, run, background, userImage };
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

/** Klickt „Automatisch" und wartet, bis smartcrop geantwortet hat. */
async function smartCrop(canvas: Canvas) {
  await canvas.run(() => canvas.ref.current!.handleSmartCrop!());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('Zuschneide-Modus: Automatisch', () => {
  it('Hintergrund: zeigt den Vorschlag, setzt den Winkel auf 0, Abbrechen nimmt beides zurück', async () => {
    const canvas = await mount();
    const before = { scale: canvas.live.state.imageScale, offset: canvas.live.state.imageOffset };
    await enterBackgroundCrop(canvas);
    await canvas.run(() => canvas.ref.current!.handleCropRotation!(15));
    // Drei Viertel des 4×4-Fotos, Mitte bei 2.
    mocks.crop.mockResolvedValue({ topCrop: { x: 0.5, y: 0, width: 3, height: 4 } });

    await smartCrop(canvas);

    expect(mocks.crop).toHaveBeenCalledOnce();
    const [source, options] = mocks.crop.mock.calls[0]!;
    expect(source.width).toBe(4);
    // Gesucht wird genau der sichtbare Ausschnitt (Seite 4:5 auf dem Quadrat).
    expect(options.width / options.height).toBeCloseTo(0.8);
    expect(options.minScale).toBeCloseTo(1);
    expect(options.maxScale).toBe(options.minScale);
    expect(canvas.live.state.backgroundImageRotation).toBe(0);
    expect(canvas.live.state.imageScale).toBe(1);
    await waitFor(() => expect(canvas.background().getAttr('straightDraw')).toBeUndefined());
    // Mitte des Vorschlags (2) mittig im 3,2 breiten sichtbaren Teil.
    expect(canvas.background().cropX()).toBeCloseTo(0.4);
    expect(canvas.background().cropWidth()).toBeCloseTo(3.2);
    expect(mocks.toastError).not.toHaveBeenCalled();

    await canvas.run(() => canvas.ref.current!.handleCancelCrop!());

    expect(canvas.live.state.backgroundImageRotation).toBeUndefined();
    expect(canvas.live.state.imageScale).toBe(before.scale);
    expect(canvas.live.state.imageOffset).toEqual(before.offset);
    expect(canvas.store.getState().canRedo()).toBe(false);
  }, 90_000);

  it('eigenes Bild: verkleinert für smartcrop, zeigt den Vorschlag, Abbrechen stellt den Zuschnitt her', async () => {
    const canvas = await mount();
    await enterUserImageCrop(canvas);
    await canvas.run(() => canvas.ref.current!.handleCropRotation!(-20));
    expect(canvas.userImage().cropRotation).toBe(-20);
    // 512 px lange Seite: Faktor 512/600; die linke Bildhälfte.
    const f = 512 / 600;
    mocks.crop.mockResolvedValue({ topCrop: { x: 0, y: 0, width: 400 * f, height: 400 * f } });

    await smartCrop(canvas);

    const [source, options] = mocks.crop.mock.calls[0]!;
    expect(source.width).toBe(512);
    expect(options.width).toBeCloseTo(400 * f);
    expect(canvas.userImage()).toMatchObject({
      fit: 'cover',
      panX: 1,
      panY: 0,
      cropZoom: 1,
      cropRotation: 0,
    });

    await canvas.run(() => canvas.ref.current!.handleCancelCrop!());

    expect(canvas.userImage()).toEqual(PHOTO);
  }, 90_000);

  it('ein Fehlschlag (z. B. „tainted" Bild) ändert nichts und meldet sich kurz', async () => {
    const canvas = await mount();
    await enterUserImageCrop(canvas);
    const before = canvas.userImage();
    mocks.crop.mockRejectedValue(new DOMException('tainted', 'SecurityError'));

    await smartCrop(canvas);

    expect(mocks.toastError).toHaveBeenCalledOnce();
    expect(canvas.userImage()).toEqual(before);
    expect(canvas.store.getState().croppingElement).toBe('photo');

    await enterBackgroundCropAfterFailure(canvas);
  }, 90_000);

  it('schreibt nichts, wenn der Modus vor der Antwort endet', async () => {
    const canvas = await mount();
    await enterUserImageCrop(canvas);
    let answer: (value: unknown) => void = () => {};
    mocks.crop.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    await canvas.run(() => canvas.ref.current!.handleSmartCrop!());
    await canvas.run(() => canvas.ref.current!.handleFinishCrop!());
    await act(async () => {
      answer({ topCrop: { x: 0, y: 0, width: 100, height: 100 } });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(canvas.userImage()).toEqual(PHOTO);
  }, 90_000);
});

async function enterBackgroundCropAfterFailure(canvas: Canvas) {
  const before = { scale: canvas.live.state.imageScale, offset: canvas.live.state.imageOffset };
  await canvas.run(() => canvas.ref.current!.handleFinishCrop!());
  await enterBackgroundCrop(canvas);
  mocks.crop.mockRejectedValue(new Error('smartcrop broke'));
  await smartCrop(canvas);
  expect(mocks.toastError).toHaveBeenCalledTimes(2);
  expect(canvas.live.state.imageScale).toBe(before.scale);
  expect(canvas.live.state.imageOffset).toEqual(before.offset);
  expect('backgroundImageRotation' in canvas.live.state).toBe(false);
}
