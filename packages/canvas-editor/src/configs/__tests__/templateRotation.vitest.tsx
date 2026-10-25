/**
 * Vorlagen-Text und Vorlagen-Grafiken drehen: der Griff schreibt Position und
 * Drehung in EINEM Schritt (`templateRotations`, je Element-ID), ein Undo nimmt
 * beides zurück, und der Wiederaufbau über `createInitialState` behält die
 * Drehung. Hintergrundfoto und cover-gefüllte Bilder bekommen keinen Drehgriff.
 */
import { act, cleanup, render } from '@testing-library/react';
import Konva from 'konva';
import { createRef } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { GenericCanvas, type GenericCanvasRef } from '../../components/GenericCanvas';
import { AutoSaveStoreProvider } from '../../stores/AutoSaveStoreProvider';
import { templateElementToEntry } from '../../utils/templateElementInstance';
import { isTemplateElementRotatable } from '../../utils/templateRotation';
import { loadCanvasConfig } from '../configLoader';
import { carryInstanceState } from '../factory/carryInstanceState';

import type { ImageElementConfig, TextElementConfig } from '../types';

vi.mock('use-image', async () => {
  // Der 2D-Kontext kommt von @napi-rs/canvas (vitest.setup.ts); ein jsdom-<img>
  // lädt nie, ohne Bild zeichnet CanvasImage nichts.
  const { Image, createCanvas } = await import('@napi-rs/canvas');
  const bitmap = new Image();
  bitmap.src = createCanvas(4, 4).toBuffer('image/png');
  return { default: (url: string) => (url ? [bitmap, 'loaded'] : [undefined, 'loading']) };
});

// Konva cacht gefärbte Bilder auf einem jsdom-Canvas, den der napi-Kontext ablehnt.
vi.spyOn(Konva.Node.prototype, 'cache').mockReturnThis();

Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { check: () => true, load: async () => [], ready: Promise.resolve(), add() {} },
});

type ConfigId = 'dreizeilen-overlay-at' | 'info' | 'zitat' | 'dreizeilen';
const CONFIG_IDS: ConfigId[] = ['dreizeilen-overlay-at', 'info', 'zitat', 'dreizeilen'];
const configs = new Map<ConfigId, Awaited<ReturnType<typeof loadCanvasConfig>>>();

beforeAll(async () => {
  for (const id of CONFIG_IDS) configs.set(id, await loadCanvasConfig(id));
}, 120_000);

afterEach(cleanup);

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Record<string, unknown>;

async function mount(configId: ConfigId, seed: Record<string, unknown>) {
  const live = { state: {} as Record<string, unknown> };
  const ref = createRef<GenericCanvasRef>();
  await act(async () => {
    render(
      <AutoSaveStoreProvider>
        <GenericCanvas
          forwardedRef={ref}
          config={configs.get(configId) as never}
          initialProps={seed}
          onExport={() => {}}
          onCancel={() => {}}
          autoSave={false}
          onLiveState={(state) => {
            live.state = state as Record<string, unknown>;
          }}
        />
      </AutoSaveStoreProvider>
    );
  });
  const stage = Konva.stages.at(-1)!;

  const select = async (id: string) => {
    const node = stage.findOne(`#${id}`)!;
    expect(node, `Knoten ${id}`).toBeTruthy();
    await act(async () => {
      node.fire('touchstart', { evt: {} }, true);
    });
    const transformer = stage
      .find<Konva.Transformer>('Transformer')
      .find((t) => t.nodes().includes(node));
    return { node, transformer };
  };

  const turn = async (node: Konva.Node, rotation: number, x: number, y: number) => {
    await act(async () => {
      node.rotation(rotation);
      node.position({ x, y });
      node.fire('transformend');
    });
  };

  return { ref, live, stage, select, turn };
}

const rotations = (state: Record<string, unknown>) =>
  (state.templateRotations ?? {}) as Record<string, number>;

describe('carryInstanceState: templateRotations', () => {
  it('carries the record', () => {
    expect(
      carryInstanceState({ templateRotations: { 'primary-text': 12 } }).templateRotations
    ).toEqual({ 'primary-text': 12 });
  });

  it('turns a non-object into an empty record', () => {
    expect(carryInstanceState({ templateRotations: 'quer' }).templateRotations).toEqual({});
    expect(carryInstanceState({ templateRotations: [1, 2] }).templateRotations).toEqual({});
    expect(carryInstanceState({}).templateRotations).toEqual({});
  });
});

describe('isTemplateElementRotatable', () => {
  const element = (id: ConfigId, elementId: string) =>
    configs.get(id)!.elements.find((e) => e.id === elementId)!;

  it('text with a position key turns, text without does not', () => {
    expect(isTemplateElementRotatable(element('dreizeilen-overlay-at', 'line1-text'))).toBe(true);
    const loose = {
      ...(element('dreizeilen-overlay-at', 'line1-text') as TextElementConfig),
      positionStateKey: undefined,
    } as TextElementConfig;
    expect(isTemplateElementRotatable(loose)).toBe(false);
  });

  it('images turn with a position or offset key, never the background or a cover fit', () => {
    expect(isTemplateElementRotatable(element('info', 'arrow'))).toBe(true);
    expect(isTemplateElementRotatable(element('zitat', 'quote-mark'))).toBe(true);
    expect(isTemplateElementRotatable(element('dreizeilen', 'background-image'))).toBe(false);
    const cover = { ...(element('info', 'arrow') as ImageElementConfig), coverFit: true };
    expect(isTemplateElementRotatable(cover)).toBe(false);
    const fixed = {
      ...(element('info', 'arrow') as ImageElementConfig),
      positionStateKey: undefined,
    } as ImageElementConfig;
    expect(isTemplateElementRotatable(fixed)).toBe(false);
  });
});

describe('Vorlagen-Text dreht', () => {
  it('a handle turn writes position and rotation; one undo restores both', async () => {
    const canvas = await mount('dreizeilen-overlay-at', {
      line1: 'Klima',
      line2: 'schützen',
      line3: 'jetzt',
    });
    const before = json(canvas.live.state);
    const { node, transformer } = await canvas.select('line1-text');
    expect(transformer?.rotateEnabled()).toBe(true);

    await canvas.turn(node, 30, 100, 120);

    expect(canvas.live.state.primaryPosition).toEqual({ x: 100, y: 120 });
    expect(rotations(canvas.live.state)['line1-text']).toBe(30);
    expect(canvas.stage.findOne('#line1-text')!.rotation()).toBe(30);

    await act(async () => {
      canvas.ref.current!.undo!();
    });
    expect(json(canvas.live.state)).toEqual(before);
  }, 90_000);
});

describe('Vorlagen-Grafiken drehen', () => {
  it('the info arrow (positionStateKey) persists rotation with its position', async () => {
    const canvas = await mount('info', { header: 'Kopf', body: 'Text' });
    const { node, transformer } = await canvas.select('arrow');
    expect(transformer?.rotateEnabled()).toBe(true);
    const size = { w: node.width(), h: node.height() };

    await canvas.turn(node, -45, 90, 300);

    expect(canvas.live.state.arrowPosition).toEqual({ x: 90, y: 300 });
    expect(canvas.live.state.arrowSize).toEqual(size);
    expect(rotations(canvas.live.state).arrow).toBe(-45);
    expect(canvas.stage.findOne('#arrow')!.rotation()).toBe(-45);
  }, 90_000);

  it('the zitat quote mark (offsetKey) writes its offset against the layout base', async () => {
    const canvas = await mount('zitat', { quote: 'Grün wirkt', name: 'Jemand' });
    const { node, transformer } = await canvas.select('quote-mark');
    expect(transformer?.rotateEnabled()).toBe(true);
    const base = { x: node.x(), y: node.y() };

    await canvas.turn(node, 90, base.x + 10, base.y + 20);

    expect(canvas.live.state.quoteMarkOffset).toEqual({ x: 10, y: 20 });
    expect(rotations(canvas.live.state)['quote-mark']).toBe(90);
    const drawn = canvas.stage.findOne('#quote-mark')!;
    expect([drawn.x(), drawn.y(), drawn.rotation()]).toEqual([base.x + 10, base.y + 20, 90]);
  }, 90_000);

  it('the background photo offers no rotation handle', async () => {
    const canvas = await mount('dreizeilen', {
      line1: 'Eins',
      line2: 'Zwei',
      line3: 'Drei',
      currentImageSrc: '/foto.jpg',
      hasBackgroundImage: true,
    });
    const { transformer } = await canvas.select('background-image');
    expect(transformer, 'Transformer des Fotos').toBeTruthy();
    expect(transformer!.rotateEnabled()).toBe(false);
  }, 90_000);
});

describe('Duplizieren und Wiederaufbau', () => {
  it('templateElementToEntry copies the rotation and keeps the drawn centre', () => {
    const quote = configs.get('zitat')!.elements.find((e) => e.id === 'quote-mark')!;
    const layout = { 'quote-mark': { x: 100, y: 200, width: 300, height: 300 } };
    const entry = templateElementToEntry(
      quote,
      { templateRotations: { 'quote-mark': 90 } },
      layout as never
    );
    expect(entry?.type).toBe('asset');
    const data = entry!.data as { x: number; y: number; rotation: number };
    expect(data.rotation).toBe(90);
    // Oben links bei (100,200) um 90° gedreht: die Mitte liegt bei (-50, 350).
    expect(data.x).toBeCloseTo(-50);
    expect(data.y).toBeCloseTo(350);
  });

  it.each(CONFIG_IDS)('%s keeps templateRotations through createInitialState', (id) => {
    const config = configs.get(id)!;
    const previous = config.createInitialState({}) as Record<string, unknown>;
    const reseeded = config.createInitialState({
      ...previous,
      templateRotations: { 'line1-text': 12 },
    }) as Record<string, unknown>;
    expect(reseeded.templateRotations).toEqual({ 'line1-text': 12 });
  });
});
