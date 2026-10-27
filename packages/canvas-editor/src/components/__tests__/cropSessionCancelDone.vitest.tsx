/**
 * Abbrechen / Fertig im Zuschneide-Modus (Hintergrundfoto und eigenes Bild):
 * Abbrechen stellt den Zuschnitt vom Betreten her und hinterlässt keinen
 * Schritt, der ihn zurückbrächte; jedes andere Ende behält ihn als einen Schritt.
 */
import { GenericCanvas, type GenericCanvasRef } from '@ggraphic/editor/components/GenericCanvas';
import { loadCanvasConfig } from '@ggraphic/editor/configs/configLoader';
import { AutoSaveStoreProvider } from '@ggraphic/editor/stores/AutoSaveStoreProvider';
import { straightPhotoCovers, type StraightDraw } from '@ggraphic/editor/utils/straighten';
import { createCanvas } from '@napi-rs/canvas';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import Konva from 'konva';
import { createRef } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as StoreModule from '@ggraphic/editor/stores/createCanvasEditorStore';
import type { CanvasEditorStoreApi } from '@ggraphic/editor/stores/createCanvasEditorStore';
import type { UserImageInstance } from '@ggraphic/editor/utils/userImageUtils';

const stores = vi.hoisted(() => [] as unknown[]);
vi.mock('@ggraphic/editor/stores/createCanvasEditorStore', async (importOriginal) => {
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

async function mount(extra: Record<string, unknown> = {}) {
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
            ...extra,
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

describe('Zuschneide-Modus per Tastatur: Hintergrundfoto', () => {
  it('verschiebt und zoomt mit Pfeilen und Plus, als ein Schritt', async () => {
    const canvas = await mount();
    const before = { scale: canvas.live.state.imageScale, offset: canvas.live.state.imageOffset };
    await enterBackgroundCrop(canvas);
    const key = (k: string, shiftKey = false) =>
      canvas.run(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, cancelable: true }));
      });
    await key('+');
    expect(canvas.live.state.imageScale).not.toEqual(before.scale);
    const zoomed = canvas.live.state.imageOffset;
    await key('ArrowRight', true);
    await key('ArrowDown', true);
    expect(canvas.live.state.imageOffset).not.toEqual(zoomed);
    // Die Pfeile gehören dem Ausschnitt, nicht dem Verschieben des Elements.
    expect(canvas.store.getState().croppingElement).toBe('background-image');

    await canvas.run(() => canvas.ref.current!.handleFinishCrop!());
    expect(canvas.store.getState().history).toHaveLength(2);
    await canvas.run(() => canvas.ref.current!.undo!());
    expect(canvas.live.state.imageScale).toEqual(before.scale);
    expect(canvas.live.state.imageOffset).toEqual(before.offset);
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

describe('Zuschneide-Modus: Knopf „Zuschneiden"', () => {
  it('beginnt nur für ein zuschneidbares Element', async () => {
    const canvas = await mount();
    await canvas.fire(canvas.stage.findOne('#sunflower')!, 'touchstart');
    expect(canvas.store.getState().selectedElement).toBe('sunflower');
    await canvas.run(() => canvas.ref.current!.handleCropImage!());
    expect(canvas.store.getState().croppingElement).toBeNull();

    await canvas.fire(canvas.background(), 'touchstart');
    await canvas.run(() => canvas.ref.current!.handleCropImage!());
    expect(canvas.store.getState().croppingElement).toBe('background-image');
    await canvas.run(() => canvas.ref.current!.handleCropImage!());
    expect(canvas.store.getState().croppingElement).toBeNull();
  }, 90_000);
});

describe('Zuschneide-Modus: Seitenverhältnis (eigenes Bild)', () => {
  const cropTransformer = (canvas: Canvas) =>
    canvas.stage
      .find<Konva.Transformer>('Transformer')
      .find((t) => t.nodes()[0]?.name() === 'selection-chrome')!;

  it('setzt den Rahmen auf die Vorgabe, hält sie an den Ecken, Abbrechen nimmt sie zurück', async () => {
    const canvas = await mount();
    await enterUserImageCrop(canvas);
    await canvas.run(() => canvas.ref.current!.handleCropAspect!('1:1'));

    expect(canvas.store.getState().cropAspect).toBe('1:1');
    await waitFor(() =>
      expect(canvas.userImage()).toMatchObject({ x: 150, y: 80, width: 400, height: 400 })
    );
    expect(cropTransformer(canvas).keepRatio()).toBe(true);
    expect(cropTransformer(canvas).enabledAnchors()).toHaveLength(4);

    await canvas.run(() => canvas.ref.current!.handleCancelCrop!());
    expect(canvas.userImage()).toEqual(PHOTO);
    expect(canvas.store.getState().cropAspect).toBe('free');
  }, 90_000);

  it('Freiform löst das Verhältnis und lässt den Rahmen stehen', async () => {
    const canvas = await mount();
    await enterUserImageCrop(canvas);
    await canvas.run(() => canvas.ref.current!.handleCropAspect!('16:9'));
    await waitFor(() => expect(canvas.userImage().height).toBeCloseTo(337.5));
    await canvas.run(() => canvas.ref.current!.handleCropAspect!('free'));

    expect(cropTransformer(canvas).keepRatio()).toBe(false);
    expect(cropTransformer(canvas).enabledAnchors()).toHaveLength(8);
    expect(canvas.userImage().height).toBeCloseTo(337.5);
  }, 90_000);
});

const drawOf = (node: Konva.Node) => node.getAttr('straightDraw') as StraightDraw | undefined;

describe('Zuschneide-Modus: Begradigen', () => {
  const ghostOf = (canvas: Canvas) =>
    canvas.stage.find<Konva.Image>('.crop-ghost').find((node) => node.isVisible())!;

  it('Hintergrund: dreht das Foto im Rahmen, Abbrechen nimmt den Winkel ganz zurück', async () => {
    const canvas = await mount();
    expect('backgroundImageRotation' in canvas.live.state).toBe(false);
    const box = { width: canvas.background().width(), height: canvas.background().height() };
    await enterBackgroundCrop(canvas);
    await canvas.run(() => canvas.ref.current!.handleCropRotation!(15));

    expect(canvas.live.state.backgroundImageRotation).toBe(15);
    await waitFor(() => expect(canvas.background().getAttr('straightDraw')).toBeTruthy());
    // Der Knoten bleibt der achsparallele Rahmen; gedreht wird nur, was er zeichnet.
    expect(canvas.background().rotation()).toBe(0);
    expect(drawOf(canvas.background())?.rotation).toBe(15);
    expect(ghostOf(canvas).rotation()).toBe(15);

    await canvas.run(() => canvas.ref.current!.handleCancelCrop!());

    expect(canvas.store.getState().croppingElement).toBeNull();
    expect(canvas.live.state.backgroundImageRotation).toBeUndefined();
    expect(canvas.background().getAttr('straightDraw')).toBeUndefined();
    expect(canvas.background().width()).toBe(box.width);
    expect(canvas.background().height()).toBe(box.height);
    expect(canvas.store.getState().canRedo()).toBe(false);
    expect(historyValues(canvas, (c) => c.backgroundImageRotation)).not.toContain('15');
  }, 90_000);

  /** Das gezeichnete gedrehte Foto in Seitenkoordinaten. */
  const drawnPhoto = (node: Konva.Image) => {
    const draw = drawOf(node)!;
    const photo = {
      x: node.x() + draw.x - draw.width / 2,
      y: node.y() + draw.y - draw.height / 2,
      width: draw.width,
      height: draw.height,
    };
    const frame = { x: node.x(), y: node.y(), width: node.width(), height: node.height() };
    return { photo, frame, rotation: draw.rotation };
  };

  it('Hintergrund: Ziehen und Zoomen bleiben gedreht auf Deckung', async () => {
    const canvas = await mount();
    expect((canvas.background().attrs as Record<string, unknown>).sceneFunc).toBeUndefined();
    await enterBackgroundCrop(canvas);
    await canvas.run(() => canvas.ref.current!.handleCropRotation!(30));
    const turned = drawnPhoto(canvas.background());
    expect(straightPhotoCovers(turned.photo, 30, turned.frame, 1e-6)).toBe(true);

    // Weit über den Rand ziehen: das Foto bleibt am Rand der Deckung stehen.
    const node = canvas.background();
    const frameBefore = turned.frame;
    await canvas.fire(node, 'dragstart');
    node.x(node.x() + 5000);
    await canvas.fire(node, 'dragmove');
    expect(node.x()).toBe(frameBefore.x);
    await canvas.fire(node, 'dragend');
    const dragged = drawnPhoto(canvas.background());
    expect(dragged.photo.x).toBeGreaterThan(turned.photo.x);
    expect(straightPhotoCovers(dragged.photo, 30, dragged.frame, 1e-6)).toBe(true);

    await canvas.zoomBackground(0.5);
    const zoomedOut = drawnPhoto(canvas.background());
    expect(straightPhotoCovers(zoomedOut.photo, 30, zoomedOut.frame, 1e-6)).toBe(true);
    await canvas.zoomBackground(2);
    const zoomedIn = drawnPhoto(canvas.background());
    expect(zoomedIn.photo.width).toBeCloseTo(zoomedOut.photo.width * 2, 3);
    expect(straightPhotoCovers(zoomedIn.photo, 30, zoomedIn.frame, 1e-6)).toBe(true);
  }, 90_000);

  it('eigenes Bild: Ziehen bleibt gedreht auf Deckung', async () => {
    const canvas = await mount();
    await enterUserImageCrop(canvas);
    await canvas.run(() => canvas.ref.current!.handleCropRotation!(-25));
    await waitFor(() => expect(canvas.userImage().cropRotation).toBe(-25));
    const ghost = ghostOf(canvas);
    await canvas.fire(ghost, 'dragstart');
    ghost.y(ghost.y() - 4000);
    await canvas.fire(ghost, 'dragmove');
    await canvas.fire(ghost, 'dragend');
    // Bei gleichem Seitenverhältnis von Foto und Rahmen hat nur eine Fotoachse Spielraum.
    await waitFor(() => expect(canvas.userImage().panX).not.toBe(0));
    const pan = canvas.userImage();
    expect(Math.abs(pan.panX!)).toBeLessThanOrEqual(1);
    expect(Math.abs(pan.panY!)).toBeLessThanOrEqual(1);
    const shown = drawnPhoto(canvas.stage.findOne<Konva.Image>('.user-photo')!);
    expect(straightPhotoCovers(shown.photo, -25, shown.frame, 1e-6)).toBe(true);
  }, 90_000);

  it('Hintergrund: der Zoom-Regler wirkt gedreht ab 1, ohne toten Bereich', async () => {
    const widthAt = async (scale: number) => {
      const canvas = await mount({ imageScale: scale, backgroundImageRotation: 30 });
      const width = drawOf(canvas.background())!.width;
      cleanup();
      return width;
    };
    const one = await widthAt(1);
    const more = await widthAt(1.2);
    expect(more).toBeCloseTo(one * 1.2, 3);
  }, 90_000);

  it('Hintergrund: Fertig behält den Winkel als einen Schritt', async () => {
    const canvas = await mount();
    await enterBackgroundCrop(canvas);
    await canvas.run(() => canvas.ref.current!.handleCropRotation!(-20));
    await canvas.run(() => canvas.ref.current!.handleCropRotation!(-30));
    await canvas.run(() => canvas.ref.current!.handleFinishCrop!());

    expect(canvas.store.getState().croppingElement).toBeNull();
    expect(canvas.live.state.backgroundImageRotation).toBe(-30);
    expect(drawOf(canvas.background())?.rotation).toBe(-30);
    expect(canvas.store.getState().history).toHaveLength(2);
    await canvas.run(() => canvas.ref.current!.undo!());
    expect(canvas.live.state.backgroundImageRotation).toBeUndefined();
  }, 90_000);

  it('eigenes Bild: Abbrechen stellt den Zuschnitt ohne Winkel her', async () => {
    const canvas = await mount();
    await enterUserImageCrop(canvas);
    await canvas.run(() => canvas.ref.current!.handleCropRotation!(12));
    await waitFor(() => expect(canvas.userImage().cropRotation).toBe(12));
    expect(canvas.userImage().fit).toBe('cover');
    const photo = canvas.stage.findOne<Konva.Image>('.user-photo')!;
    expect(drawOf(photo)?.rotation).toBe(12);

    await canvas.run(() => canvas.ref.current!.handleCancelCrop!());

    expect(canvas.userImage()).toEqual(PHOTO);
    expect(
      canvas.stage.findOne<Konva.Image>('.user-photo')!.getAttr('straightDraw')
    ).toBeUndefined();
    expect(canvas.store.getState().canRedo()).toBe(false);
  }, 90_000);

  it('eigenes Bild: Fertig behält den Winkel, die Leiste zeigt ihn', async () => {
    const canvas = await mount();
    await enterUserImageCrop(canvas);
    await canvas.run(() => canvas.ref.current!.handleCropRotation!(45));
    await canvas.run(() => canvas.ref.current!.handleCropRotation!(60));
    await waitFor(() => expect(canvas.userImage().cropRotation).toBe(45));
    await canvas.run(() => canvas.ref.current!.handleFinishCrop!());

    expect(canvas.store.getState().croppingElement).toBeNull();
    expect(canvas.userImage()).toMatchObject({ cropRotation: 45, fit: 'cover' });
  }, 90_000);
});
