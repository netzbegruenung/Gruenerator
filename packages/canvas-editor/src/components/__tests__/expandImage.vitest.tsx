/**
 * „Erweitern" im Zuschneide-Modus: der Dienst des Hosts (hier gemockt) erweitert
 * das Foto auf das Rahmenformat, das Ergebnis wird wie bei „Ersetzen" hochgeladen
 * und als neue Quelle eingesetzt — mittig, Zoom 1, 0°, in einem Verlaufsschritt.
 * Ein Fehlschlag ändert nichts. Dazu: „Automatisch" verwirft seinen Vorschlag,
 * wenn das Foto während der Analyse ersetzt wurde.
 */
import { AutoSaveStoreProvider } from '@ggraphic/editor/stores/AutoSaveStoreProvider';
import { registerToast } from '@ggraphic/editor/utils/editorToast';
import { userFacingError } from '@ggraphic/editor/utils/userFacingError';
import { createCanvas } from '@napi-rs/canvas';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import Konva from 'konva';
import { createRef } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasEditorProvider } from '../../CanvasEditorProvider';
import { loadCanvasConfig } from '../../configs/configLoader';
import { plainImageUrls, type CanvasImageUrlService } from '../../hostServices';
import { GenericCanvas, type GenericCanvasRef, type ToolbarStateReport } from '../GenericCanvas';

import type { UserImageInstance } from '../../utils/userImageUtils';
import type * as StoreModule from '@ggraphic/editor/stores/createCanvasEditorStore';
import type { CanvasEditorStoreApi } from '@ggraphic/editor/stores/createCanvasEditorStore';

const mocks = vi.hoisted(() => ({
  stores: [] as unknown[],
  expand: vi.fn<(image: File, aspect: number) => Promise<File>>(),
  upload: vi.fn<(file: File, source?: string) => Promise<unknown>>(),
  fetchFile: vi.fn<(url: string, name: string, urls: unknown) => Promise<File>>(),
  crop: vi.fn<() => Promise<unknown>>(),
  toastError: vi.fn(),
}));

vi.mock('smartcrop', () => ({ default: { crop: mocks.crop } }));

// The editor reports through its toast seam; the host's registration is replaced by the spy.
registerToast(Object.assign(vi.fn(), { error: mocks.toastError }));

vi.mock('../../sidebar/UserUploadsProvider', () => ({
  useOptionalUserUploads: () => ({ upload: mocks.upload }),
}));

vi.mock('../../utils/mediaPlacement', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return { ...original, fetchShareImageFile: mocks.fetchFile };
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

const EXPANDED = new File(['x'], 'outpaint.jpg', { type: 'image/jpeg' });
/** A host that stores uploads as shares and places them from the share download link. */
const shareHost: CanvasImageUrlService = {
  ...plainImageUrls,
  placementUrl: (item) =>
    item.mediaUrl ||
    (item.shareToken ? `/api/share/${item.shareToken}/download` : item.thumbnailUrl),
};

const DURABLE = '/api/share/tok-1/download';
const CREDIT = {
  photographer: 'Ada',
  profileUrl: 'https://unsplash.com/@ada',
  photoUrl: 'https://unsplash.com/photos/1',
};

beforeEach(() => {
  mocks.expand.mockReset().mockResolvedValue(EXPANDED);
  mocks.upload.mockReset().mockResolvedValue({ id: 'm1', shareToken: 'tok-1' });
  mocks.fetchFile
    .mockReset()
    .mockImplementation(async (_url, name) => new File(['src'], name, { type: 'image/png' }));
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
  height: 160,
  rotation: 0,
  scale: 1,
  opacity: 1,
  attribution: CREDIT,
};

async function mount() {
  const ref = createRef<GenericCanvasRef>();
  const live = { state: {} as Record<string, unknown> };
  const report = { current: null as ToolbarStateReport | null };
  mocks.stores.length = 0;
  await act(async () => {
    render(
      <CanvasEditorProvider services={{ expandImage: mocks.expand, imageUrls: shareHost }}>
        <AutoSaveStoreProvider>
          <GenericCanvas
            forwardedRef={ref}
            config={config as never}
            initialProps={{
              line1: 'Klima',
              currentImageSrc: 'https://example.org/foto.png',
              imageAttribution: CREDIT,
              userImageInstances: [PHOTO],
            }}
            onExport={() => {}}
            onCancel={() => {}}
            autoSave={false}
            onLiveState={(state) => {
              live.state = state;
            }}
            onToolbarStateChange={(state) => {
              report.current = state;
            }}
          />
        </AutoSaveStoreProvider>
      </CanvasEditorProvider>
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
  const settle = async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };
  const background = () => stage.findOne<Konva.Image>('#background-image')!;
  const userImage = () => (live.state.userImageInstances as UserImageInstance[])[0]!;
  return { ref, live, report, store, stage, fire, run, settle, background, userImage };
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

describe('Zuschneide-Modus: Erweitern', () => {
  it('Hintergrund: erweitert aufs Seitenformat, setzt die dauerhafte URL mittig mit Zoom 1 und 0° ein, ein Schritt', async () => {
    const canvas = await mount();
    await enterBackgroundCrop(canvas);
    await canvas.run(() => canvas.ref.current!.handleCropRotation!(15));
    await canvas.run(() => canvas.ref.current!.handleExpandImage!());
    await canvas.settle();

    expect(mocks.fetchFile).toHaveBeenCalledWith(
      'https://example.org/foto.png',
      'hintergrund',
      shareHost
    );
    const [, aspect] = mocks.expand.mock.calls[0]!;
    expect(aspect).toBeCloseTo(
      (config as { canvas: { width: number; height: number } }).canvas.width /
        (config as { canvas: { width: number; height: number } }).canvas.height
    );
    expect(mocks.upload).toHaveBeenCalledWith(EXPANDED, 'canvas-element');
    expect(canvas.store.getState().croppingElement).toBeNull();
    expect(canvas.live.state).toMatchObject({
      currentImageSrc: DURABLE,
      imageOffset: { x: 0, y: 0 },
      imageScale: 1,
      backgroundImageRotation: 0,
      imageAttribution: CREDIT,
    });
    expect(mocks.toastError).not.toHaveBeenCalled();

    // Ein Rückgängig: das alte Foto mit dem Zuschnitt aus der Sitzung.
    await canvas.run(() => canvas.ref.current!.undo!());
    expect(canvas.live.state.currentImageSrc).toBe('https://example.org/foto.png');
    expect(canvas.live.state.backgroundImageRotation).toBe(15);
  }, 90_000);

  it('eigenes Bild: erweitert auf den Rahmen, behält den Nachweis, ein Schritt', async () => {
    const canvas = await mount();
    await enterUserImageCrop(canvas);
    await canvas.run(() => canvas.ref.current!.handleCropRotation!(-20));
    await canvas.run(() => canvas.ref.current!.handleExpandImage!());
    await canvas.settle();

    expect(mocks.expand.mock.calls[0]![1]).toBeCloseTo(200 / 160);
    expect(canvas.userImage()).toMatchObject({
      src: DURABLE,
      // Der Name bleibt erkennbar, die Endung folgt dem gelieferten Format.
      fileName: 'photo-erweitert.jpg',
      fit: 'cover',
      panX: 0,
      panY: 0,
      cropZoom: 1,
      cropRotation: 0,
      attribution: CREDIT,
    });
    expect(canvas.store.getState().croppingElement).toBeNull();

    await canvas.run(() => canvas.ref.current!.undo!());
    expect(canvas.userImage()).toMatchObject({ src: '/photo.jpg', cropRotation: -20 });
  }, 90_000);

  it('meldet einen Fehlschlag als Toast und ändert nichts', async () => {
    const canvas = await mount();
    await enterUserImageCrop(canvas);
    const before = canvas.userImage();
    const history = canvas.store.getState().history.length;
    mocks.expand.mockRejectedValue(userFacingError('Dein Bild-Budget für heute ist aufgebraucht.'));

    await canvas.run(() => canvas.ref.current!.handleExpandImage!());
    await canvas.settle();

    expect(mocks.toastError).toHaveBeenCalledWith('Dein Bild-Budget für heute ist aufgebraucht.');
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(canvas.userImage()).toEqual(before);
    expect(canvas.store.getState().croppingElement).toBe('photo');
    expect(canvas.store.getState().history).toHaveLength(history);
    expect(canvas.report.current?.isExpanding).toBe(false);
  }, 90_000);

  it('zeigt rohe Fehlermeldungen nicht, sondern den allgemeinen Text', async () => {
    const canvas = await mount();
    await enterUserImageCrop(canvas);
    mocks.fetchFile.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await canvas.run(() => canvas.ref.current!.handleExpandImage!());
    await canvas.settle();

    expect(mocks.toastError).toHaveBeenCalledWith(
      'Erweitern hat nicht geklappt. Bitte versuche es noch einmal.'
    );
    expect(mocks.toastError).not.toHaveBeenCalledWith('Failed to fetch');
    expect(canvas.userImage().src).toBe('/photo.jpg');
  }, 90_000);

  it('meldet den Ladezustand und startet kein zweites Erweitern', async () => {
    const canvas = await mount();
    await enterUserImageCrop(canvas);
    let finish: (file: File) => void = () => {};
    mocks.expand.mockReturnValue(new Promise((resolve) => (finish = resolve)));

    await canvas.run(() => canvas.ref.current!.handleExpandImage!());
    await canvas.settle();
    await waitFor(() => expect(canvas.report.current?.isExpanding).toBe(true));
    await canvas.run(() => canvas.ref.current!.handleExpandImage!());
    expect(mocks.expand).toHaveBeenCalledOnce();

    await act(async () => {
      finish(EXPANDED);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => expect(canvas.report.current?.isExpanding).toBe(false));
    expect(canvas.userImage().src).toBe(DURABLE);
  }, 90_000);
});

describe('Zuschneide-Modus: Erweitern endet während des Ladens', () => {
  async function startPending(canvas: Canvas) {
    let finish: (file: File) => void = () => {};
    mocks.expand.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await canvas.run(() => canvas.ref.current!.handleExpandImage!());
    await canvas.settle();
    return async () => {
      await act(async () => {
        finish(EXPANDED);
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    };
  }

  it('Abbrechen verwirft das Ergebnis und hinterlässt keinen Verlaufsschritt', async () => {
    const canvas = await mount();
    await enterUserImageCrop(canvas);
    const respond = await startPending(canvas);

    await canvas.run(() => canvas.ref.current!.handleCancelCrop!());
    const history = canvas.store.getState().history.length;
    await respond();

    expect(canvas.userImage()).toEqual(PHOTO);
    expect(canvas.store.getState().history).toHaveLength(history);
    expect(canvas.store.getState().canRedo()).toBe(false);
    await waitFor(() => expect(canvas.report.current?.isExpanding).toBe(false));
    expect(mocks.toastError).not.toHaveBeenCalled();
  }, 90_000);

  it('Abbrechen bei einem anderen Element verwirft das laufende Erweitern nicht', async () => {
    const canvas = await mount();
    await enterUserImageCrop(canvas);
    const respond = await startPending(canvas);

    // Wechsel zum Hintergrund (für das Bild heißt das „Fertig"), dort abbrechen.
    await enterBackgroundCrop(canvas);
    await canvas.run(() => canvas.ref.current!.handleCancelCrop!());
    await respond();

    await waitFor(() => expect(canvas.userImage().src).toBe(DURABLE));
    expect(mocks.toastError).not.toHaveBeenCalled();
  }, 90_000);

  it('Fertig übernimmt das Ergebnis trotzdem', async () => {
    const canvas = await mount();
    await enterBackgroundCrop(canvas);
    const respond = await startPending(canvas);

    await canvas.run(() => canvas.ref.current!.handleFinishCrop!());
    expect(canvas.store.getState().croppingElement).toBeNull();
    await respond();

    expect(canvas.live.state).toMatchObject({
      currentImageSrc: DURABLE,
      imageOffset: { x: 0, y: 0 },
      imageScale: 1,
    });
    await canvas.run(() => canvas.ref.current!.undo!());
    expect(canvas.live.state.currentImageSrc).toBe('https://example.org/foto.png');
  }, 90_000);
});

describe('Zuschneide-Modus: Automatisch nach Erweitern', () => {
  it('verwirft den Vorschlag, wenn das Foto während der Analyse ersetzt wurde', async () => {
    const canvas = await mount();
    await enterUserImageCrop(canvas);
    let answer: (value: unknown) => void = () => {};
    mocks.crop.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    await canvas.run(() => canvas.ref.current!.handleSmartCrop!());

    await canvas.run(() => canvas.ref.current!.handleExpandImage!());
    await canvas.settle();
    expect(canvas.userImage().src).toBe(DURABLE);
    // Wieder im Modus desselben Bildes — nur die Quelle ist eine andere.
    await enterUserImageCrop(canvas);
    const after = canvas.userImage();

    await act(async () => {
      answer({ topCrop: { x: 0, y: 0, width: 100, height: 100 } });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(canvas.userImage()).toEqual(after);
  }, 90_000);
});
