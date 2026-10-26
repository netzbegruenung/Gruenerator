/**
 * Restbild im Zuschneide-Modus: das ganze Foto, abgedunkelt, auch jenseits der
 * Seite. In Konva liegt es als `crop-ghost`-Knoten (Export blendet ihn als
 * selection-chrome aus), jenseits der Bühne zeichnet ihn `CropGhostOverlay`.
 * Es ist nur im Modus da und folgt Pan und Zoom, beim Ziehen ohne React-Zustand.
 */
import { createCanvas } from '@napi-rs/canvas';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import Konva from 'konva';
import { createRef } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadCanvasConfig } from '../../configs/configLoader';
import { AutoSaveStoreProvider } from '../../stores/AutoSaveStoreProvider';
import { withSelectionChromeHidden } from '../../utils/captureStage';
import { CROP_GHOST_NAME } from '../../utils/cropGhost';
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
  let container!: HTMLElement;
  await act(async () => {
    ({ container } = render(
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
    ));
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
  const ghosts = () => stage.find<Konva.Image>(`.${CROP_GHOST_NAME}`);
  const overlay = () => container.querySelector<HTMLCanvasElement>('[data-crop-ghost-overlay]');
  return { ref, live, store, stage, fire, background, ghosts, overlay };
}

type Canvas = Awaited<ReturnType<typeof mount>>;

/** Die Bildschirm-Box eines Knotens im Koordinatensystem des Bühnen-Containers. */
function screenBox(node: Konva.Node) {
  const box = node.getClientRect({ skipShadow: true, skipStroke: true });
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}

/** Wartet, bis das Overlay die aktuelle Lage des Restbilds zeigt (es zeichnet im nächsten Konva-Frame). */
async function overlayMatches(canvas: Canvas, ghost: Konva.Node) {
  await waitFor(() => {
    const el = canvas.overlay()!;
    const box = screenBox(ghost);
    expect(el.style.display).toBe('');
    expect(parseFloat(el.style.left)).toBe(Math.floor(box.x));
    expect(parseFloat(el.style.top)).toBe(Math.floor(box.y));
    expect(parseFloat(el.style.width)).toBeCloseTo(
      Math.ceil(box.x + box.width) - Math.floor(box.x),
      0
    );
  });
}

describe('Restbild beim Hintergrund-Ausschnitt', () => {
  it('gibt es nur im Ausschnitt-Modus, über die Seite hinaus und nie im Export', async () => {
    const canvas = await mount();
    expect(canvas.ghosts()).toHaveLength(0);
    expect(canvas.overlay()).toBeNull();

    await canvas.fire(canvas.background(), 'dbltap');
    expect(canvas.store.getState().croppingElement).toBe('background-image');

    const [ghost] = canvas.ghosts();
    expect(ghost).toBeTruthy();
    expect(ghost!.opacity()).toBe(0.35);
    expect(ghost!.listening()).toBe(false);
    // Ein Querformat-Foto auf einer Hochformat-Seite ragt links und rechts hinaus.
    const box = screenBox(ghost!);
    expect(box.x).toBeLessThan(0);
    expect(box.x + box.width).toBeGreaterThan(canvas.stage.width());
    await overlayMatches(canvas, ghost!);

    // Der Export blendet es aus wie jede Auswahl-Hülle.
    const shownInExport = withSelectionChromeHidden(canvas.stage, () => ghost!.visible());
    expect(shownInExport).toBe(false);
    expect(ghost!.visible()).toBe(true);

    await canvas.fire(canvas.background(), 'dblclick');
    expect(canvas.store.getState().croppingElement).toBeNull();
    expect(canvas.ghosts()).toHaveLength(0);
    expect(canvas.overlay()).toBeNull();
  }, 90_000);

  it('folgt dem Ziehen, bevor der Zustand übernommen ist', async () => {
    const canvas = await mount();
    await canvas.fire(canvas.background(), 'dbltap');
    const [ghost] = canvas.ghosts();
    const start = screenBox(ghost!);
    const offsetBefore = canvas.live.state.imageOffset;

    const node = canvas.background();
    await canvas.fire(node, 'dragstart');
    node.x(node.x() + 20);
    await canvas.fire(node, 'dragmove');

    // Noch kein Zustand geschrieben, das Restbild ist schon mitgegangen.
    expect(canvas.live.state.imageOffset).toEqual(offsetBefore);
    const moved = screenBox(canvas.ghosts()[0]!);
    expect(moved.x).toBeGreaterThan(start.x);
    expect(moved.width).toBeCloseTo(start.width, 5);
    await overlayMatches(canvas, canvas.ghosts()[0]!);

    await canvas.fire(node, 'dragend');
    expect(canvas.live.state.imageOffset).not.toEqual(offsetBefore);
    expect(screenBox(canvas.ghosts()[0]!).x).toBeCloseTo(moved.x, 5);
  }, 90_000);

  it('folgt dem Zoom und dem Abbrechen', async () => {
    const canvas = await mount();
    await canvas.fire(canvas.background(), 'dbltap');
    const start = screenBox(canvas.ghosts()[0]!);

    const node = canvas.background();
    node.scale({ x: 2, y: 2 });
    await canvas.fire(node, 'transform');
    expect(screenBox(canvas.ghosts()[0]!).width).toBeCloseTo(start.width * 2, 3);
    await canvas.fire(node, 'transformend');

    const zoomed = screenBox(canvas.ghosts()[0]!);
    expect(zoomed.width).toBeCloseTo(start.width * 2, 3);
    await overlayMatches(canvas, canvas.ghosts()[0]!);

    // Abbrechen stellt den Zuschnitt her und beendet den Modus: das Restbild geht mit.
    await act(async () => {
      canvas.ref.current!.handleCancelCrop!();
    });
    expect(canvas.ghosts()).toHaveLength(0);
    await canvas.fire(canvas.background(), 'dbltap');
    expect(screenBox(canvas.ghosts()[0]!)).toEqual(start);
  }, 90_000);
});

describe('Restbild eines eigenen Bildes', () => {
  it('läuft durch dieselbe Tür über die Seite hinaus', async () => {
    const canvas = await mount();
    const photo = canvas.stage.findOne('.user-photo')!;
    await canvas.fire(photo, 'touchstart');
    await canvas.fire(photo, 'dbltap');
    expect(canvas.store.getState().croppingElement).toBe('photo');

    const [ghost] = canvas.ghosts();
    expect(ghost?.hasName('selection-chrome')).toBe(true);
    await overlayMatches(canvas, ghost!);
  }, 90_000);
});
