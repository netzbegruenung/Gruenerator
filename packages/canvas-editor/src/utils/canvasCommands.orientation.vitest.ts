import Konva from 'konva';
import { describe, expect, it, vi } from 'vitest';

import { createCanvasEditorStore } from '../stores/createCanvasEditorStore';

import { createCanvasCommands } from './canvasCommands';
import { CANVAS_ITEM_ID_ATTR, CANVAS_ITEM_NAME } from './deepSelect';
import { centreOf, readNodeFrame } from './orientation';

import type { BaseCanvasState } from '../configs/factory/baseTypes';
import type { LayoutResult } from '../configs/types';

/**
 * Drehen & Spiegeln über die Befehls-Türen. Konva läuft in der Node-Lane ohne
 * Layer; die Seite ist deshalb eine Gruppe, die `getLayers()` als Ebene reicht.
 */

type State = Record<string, unknown>;

function page(state: State, opts: { readOnly?: boolean } = {}) {
  let current = state;
  const history: State[] = [];
  let depth = 0;
  const writesInBatch: boolean[] = [];
  const layer = new Konva.Group() as Konva.Group & { batchDraw: () => void };
  layer.batchDraw = vi.fn();
  const stage = { getLayers: () => [layer] } as unknown as Konva.Stage;

  const patchList = (key: string) => (id: string, patch: Record<string, unknown>) => {
    writesInBatch.push(depth > 0);
    const list = current[key] as Array<{ id: string }>;
    current = { ...current, [key]: list.map((i) => (i.id === id ? { ...i, ...patch } : i)) };
  };
  const actions = {
    updateShape: vi.fn(patchList('shapeInstances')),
    updateChart: vi.fn(patchList('chartInstances')),
    updateAdditionalText: vi.fn(patchList('additionalTexts')),
    updateBalken: vi.fn(patchList('balkenInstances')),
  };
  const runHistoryBatch = vi.fn((fn: () => void) => {
    history.push(current);
    depth++;
    fn();
    depth--;
  });
  const store = createCanvasEditorStore();
  const commands = createCanvasCommands<BaseCanvasState>({
    store,
    getState: () => current as unknown as BaseCanvasState,
    setState: vi.fn(),
    saveToHistory: vi.fn(),
    runHistoryBatch,
    getActions: () => actions,
    template: () => null,
    getRenderList: () => [],
    getStage: () => stage,
    logicalScale: () => 1,
    getElements: () => [],
    getLayout: () => ({}) as LayoutResult,
    isReadOnly: () => opts.readOnly === true,
  });

  const add = (id: string, node: Konva.Shape) => {
    const item = new Konva.Group({ name: CANVAS_ITEM_NAME, [CANVAS_ITEM_ID_ATTR]: id });
    node.draggable(true);
    item.add(node);
    layer.add(item);
    return node;
  };

  return {
    commands,
    actions,
    runHistoryBatch,
    layer,
    add,
    select: (ids: string[]) => store.getState().setSelectedLayers(ids),
    writesInBatch,
    undo: () => {
      current = history.pop()!;
    },
    get state() {
      return current;
    },
  };
}

/** Ein mittig gelagertes Rechteck — wie Formen, Icons, Assets. */
const centred = (x: number, y: number, w: number, h: number, rotation = 0) =>
  new Konva.Rect({ x, y, width: w, height: h, offsetX: w / 2, offsetY: h / 2, rotation });

/** Ein an der linken oberen Ecke gelagertes Rechteck — wie Text, Diagramm. */
const topLeft = (x: number, y: number, w: number, h: number) =>
  new Konva.Rect({ x, y, width: w, height: h });

describe('setRotation', () => {
  it('dreht ein Diagramm um seine Mitte, nicht um die Ecke', () => {
    const p = page({ chartInstances: [{ id: 'c', x: 10, y: 20 }] });
    p.add('c', topLeft(10, 20, 100, 50));
    p.select(['c']);
    p.commands.setRotation(90);
    expect(p.actions.updateChart).toHaveBeenCalledWith('c', { x: 85, y: -5, rotation: 90 });
    expect(p.runHistoryBatch).not.toHaveBeenCalled();
  });

  it('dreht kein gesperrtes Element', () => {
    const p = page({ shapeInstances: [{ id: 's' }], lockedLayerIds: ['s'] });
    p.add('s', centred(50, 50, 20, 20));
    p.select(['s']);
    p.commands.setRotation(45);
    expect(p.actions.updateShape).not.toHaveBeenCalled();
  });
});

describe('previewRotation', () => {
  it('dreht nur den Knoten und zeichnet neu — kein Zustand, kein Verlauf', () => {
    const p = page({ chartInstances: [{ id: 'c', x: 10, y: 20 }] });
    const node = p.add('c', topLeft(10, 20, 100, 50));
    p.select(['c']);
    p.commands.previewRotation(90);
    expect(node.rotation()).toBe(90);
    expect([node.x(), node.y()]).toEqual([85, -5]);
    expect(p.layer.batchDraw).toHaveBeenCalled();
    expect(p.actions.updateChart).not.toHaveBeenCalled();

    // Die weiteren Bilder suchen den Knoten nicht neu.
    const find = vi.spyOn(p.layer, 'find');
    p.commands.previewRotation(45);
    p.commands.previewRotation(90);
    expect(find).not.toHaveBeenCalled();
    expect([node.x(), node.y()]).toEqual([85, -5]);

    // Der Abschluss danach landet an derselben Stelle.
    p.commands.setRotation(90);
    expect(p.actions.updateChart).toHaveBeenCalledWith('c', { x: 85, y: -5, rotation: 90 });
  });
});

describe('commitRotationPreview', () => {
  it('schreibt die Vorschau dem Element zu, das sie zeigt — nicht der neuen Auswahl', () => {
    const p = page({ shapeInstances: [{ id: 'a' }, { id: 'b' }] });
    p.add('a', centred(50, 50, 20, 20));
    p.add('b', centred(150, 50, 20, 20));
    p.select(['a']);
    p.commands.previewRotation(45);
    p.select(['b']);
    p.commands.commitRotationPreview();
    expect(p.actions.updateShape).toHaveBeenCalledTimes(1);
    expect(p.actions.updateShape).toHaveBeenCalledWith('a', { x: 50, y: 50, rotation: 45 });
  });

  it('tut ohne offene Vorschau nichts, auch nicht nach einem Abschluss', () => {
    const p = page({ shapeInstances: [{ id: 'a' }] });
    p.add('a', centred(50, 50, 20, 20));
    p.select(['a']);
    p.commands.commitRotationPreview();
    p.commands.previewRotation(30);
    p.commands.setRotation(30);
    p.commands.commitRotationPreview();
    expect(p.actions.updateShape).toHaveBeenCalledTimes(1);
  });

  it('verwirft die Vorschau eines entfernten Elements', () => {
    const p = page({ shapeInstances: [{ id: 'a' }] });
    const node = p.add('a', centred(50, 50, 20, 20));
    p.select(['a']);
    p.commands.previewRotation(45);
    node.getParent()!.destroy();
    p.commands.commitRotationPreview();
    expect(p.actions.updateShape).not.toHaveBeenCalled();
  });

  it('stellt den Knoten zurück, wenn das Element inzwischen gesperrt ist', () => {
    const p = page({ chartInstances: [{ id: 'c', x: 10, y: 20 }] });
    const node = p.add('c', topLeft(10, 20, 100, 50));
    p.select(['c']);
    p.commands.previewRotation(90);
    (p.state as State).lockedLayerIds = ['c'];
    p.commands.commitRotationPreview();
    expect(p.actions.updateChart).not.toHaveBeenCalled();
    expect([node.x(), node.y(), node.rotation()]).toEqual([10, 20, 0]);
  });
});

describe('flip', () => {
  it('spiegelt eine gedrehte Form: Drehung wird −θ, die Mitte bleibt', () => {
    const p = page({ shapeInstances: [{ id: 's', rotation: 30 }] });
    p.add('s', centred(100, 100, 100, 50, 30));
    p.select(['s']);
    p.commands.flip('x');
    expect(p.actions.updateShape).toHaveBeenCalledWith('s', {
      x: 100,
      y: 100,
      rotation: -30,
      flipX: true,
    });
  });

  it('gleicht eine Form aus, deren Drehpunkt nicht in der Mitte liegt', () => {
    const p = page({ shapeInstances: [{ id: 's' }] });
    const node = p.add('s', topLeft(10, 20, 100, 50));
    const before = centreOf(readNodeFrame(node));
    p.select(['s']);
    p.commands.flip('x');
    expect(p.actions.updateShape).toHaveBeenCalledWith('s', {
      x: 110,
      y: 20,
      rotation: 0,
      flipX: true,
    });
    node.setAttrs({ x: 110, scaleX: -1 });
    expect(centreOf(readNodeFrame(node))).toEqual(before);
  });

  it('kippt vertikal über flipY und lässt ein schon gespiegeltes zurückspringen', () => {
    const p = page({ shapeInstances: [{ id: 's', flipY: true }] });
    p.add('s', centred(100, 100, 40, 40)).scaleY(-1);
    p.select(['s']);
    p.commands.flip('y');
    expect(p.actions.updateShape).toHaveBeenCalledWith('s', {
      x: 100,
      y: 100,
      rotation: 0,
      flipY: false,
    });
  });

  it('spiegelt keinen einzelnen Text', () => {
    const p = page({ additionalTexts: [{ id: 't', rotation: 20 }] });
    p.add('t', topLeft(10, 10, 40, 20));
    p.select(['t']);
    p.commands.flip('x');
    expect(p.actions.updateAdditionalText).not.toHaveBeenCalled();
  });

  it('tauscht in der Mehrfachauswahl die Mitten, Text bleibt lesbar, ein Rückgängig', () => {
    const p = page({
      shapeInstances: [{ id: 's' }],
      additionalTexts: [{ id: 't' }],
    });
    p.add('s', centred(50, 50, 20, 20));
    p.add('t', topLeft(150, 40, 40, 20));
    const before = p.state;
    p.select(['s', 't']);
    p.commands.flip('x');

    // Bounds 40…190, Mitte 115: die Form (50) geht nach 180, der Text (170) nach 60.
    expect(p.actions.updateShape).toHaveBeenCalledWith('s', {
      x: 180,
      y: 50,
      rotation: 0,
      flipX: true,
    });
    expect(p.actions.updateAdditionalText).toHaveBeenCalledWith('t', { x: 40, y: 40, rotation: 0 });
    expect(p.writesInBatch).toEqual([true, true]);
    expect(p.runHistoryBatch).toHaveBeenCalledTimes(1);

    p.undo();
    expect(p.state).toBe(before);
  });

  it('verschiebt einen Balken in der Mehrfachauswahl über seinen offset', () => {
    const p = page({
      shapeInstances: [{ id: 's' }],
      balkenInstances: [{ id: 'b', offset: { x: 5, y: 7 }, rotation: 20 }],
    });
    p.add('s', centred(50, 50, 20, 20));
    p.add('b', centred(150, 50, 20, 20, 20));
    p.select(['s', 'b']);
    p.commands.flip('x');

    const bar = (p.state.balkenInstances as Array<{ offset: { x: number; y: number } }>)[0]!;
    const shape = (p.state.shapeInstances as Array<{ x: number }>)[0]!;
    // Gespiegelt an der Mitte m der Auswahl: Form 50 → 2m − 50, Balken 150 → 2m − 150.
    // Der Balken wandert also um 2m − 300 = shape.x − 250, und das landet im offset.
    expect(p.actions.updateBalken).toHaveBeenCalledTimes(1);
    expect(p.actions.updateBalken.mock.calls[0]![1]).toMatchObject({ rotation: -20 });
    expect(p.actions.updateBalken.mock.calls[0]![1]).not.toHaveProperty('x');
    expect(bar.offset.x).toBeCloseTo(5 + shape.x - 250, 6);
    expect(bar.offset.y).toBeCloseTo(7, 6);
    expect(shape.x).toBeGreaterThan(150);
  });

  it('überspringt gesperrte Elemente', () => {
    const p = page({
      shapeInstances: [{ id: 'a' }, { id: 'b' }],
      lockedLayerIds: ['b'],
    });
    p.add('a', centred(50, 50, 20, 20));
    p.add('b', centred(150, 50, 20, 20));
    p.select(['a', 'b']);
    p.commands.flip('x');
    expect(p.actions.updateShape).toHaveBeenCalledTimes(1);
    expect(p.actions.updateShape).toHaveBeenCalledWith('a', expect.objectContaining({ x: 50 }));
  });
});

describe('Drehung zurücksetzen', () => {
  it('setzt die ganze Auswahl auf 0 — in einem Schritt', () => {
    const p = page({
      shapeInstances: [
        { id: 'a', rotation: 30 },
        { id: 'b', rotation: -45 },
      ],
    });
    p.add('a', centred(50, 50, 20, 20, 30));
    p.add('b', centred(150, 50, 20, 20, -45));
    p.select(['a', 'b']);
    p.commands.run('resetRotation', null);
    expect(p.runHistoryBatch).toHaveBeenCalledTimes(1);
    const rotations = (p.state.shapeInstances as Array<{ rotation: number }>).map(
      (s) => s.rotation
    );
    expect(rotations).toEqual([0, 0]);
  });
});

describe('Fähigkeiten', () => {
  it('meldet Drehen, Spiegeln und die Drehung der Einzelauswahl', () => {
    const p = page({ shapeInstances: [{ id: 's', rotation: 30 }], additionalTexts: [{ id: 't' }] });
    p.select(['s']);
    expect(p.commands.capabilities()).toMatchObject({
      canRotate: true,
      canFlip: true,
      rotation: 30,
    });
    p.select(['t']);
    expect(p.commands.capabilities()).toMatchObject({
      canRotate: true,
      canFlip: false,
      rotation: 0,
    });
    p.select(['s', 't']);
    expect(p.commands.capabilities()).toMatchObject({
      canRotate: true,
      canFlip: true,
      rotation: null,
    });
  });

  it('bietet im Lesemodus nichts an und tut nichts', () => {
    const p = page({ shapeInstances: [{ id: 's', rotation: 30 }] }, { readOnly: true });
    p.add('s', centred(50, 50, 20, 20, 30));
    p.select(['s']);
    expect(p.commands.capabilities()).toMatchObject({
      canRotate: false,
      canFlip: false,
      rotation: null,
    });
    p.commands.flip('x');
    p.commands.setRotation(0);
    p.commands.run('resetRotation', null);
    expect(p.actions.updateShape).not.toHaveBeenCalled();
  });

  it('dreht nichts, wenn ein Element der Auswahl gesperrt ist', () => {
    const p = page({ shapeInstances: [{ id: 'a' }, { id: 'b' }], lockedLayerIds: ['b'] });
    p.select(['a', 'b']);
    expect(p.commands.capabilities()).toMatchObject({ canRotate: false, canFlip: false });
    p.select([]);
    expect(p.commands.capabilities()).toMatchObject({ canRotate: false, canFlip: false });
  });
});
