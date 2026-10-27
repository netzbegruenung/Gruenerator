import { createCanvasEditorStore } from '@ggraphic/editor/stores/createCanvasEditorStore';
import { CANVAS_ITEM_ID_ATTR, CANVAS_ITEM_NAME } from '@ggraphic/editor/utils/deepSelect';
import { axisAlignedBounds, readNodeFrame } from '@ggraphic/editor/utils/orientation';
import Konva from 'konva';
import { describe, expect, it, vi } from 'vitest';

import { createCanvasCommands } from './canvasCommands';

import type { BaseCanvasState } from '../configs/factory/baseTypes';
import type { LayoutResult } from '../configs/types';

/**
 * Ausrichten, Verteilen und Position über die Befehls-Türen — dieselbe
 * Seiten-Attrappe wie `canvasCommands.orientation.vitest.ts`.
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
    getPageSize: () => ({ width: 1000, height: 500 }),
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
    add,
    select: (ids: string[]) => store.getState().setSelectedLayers(ids),
    writesInBatch,
    undo: () => {
      current = history.pop()!;
    },
    item: (key: string, id: string) =>
      (current[key] as Array<Record<string, unknown>>).find((i) => i.id === id)!,
  };
}

/** Ein mittig gelagertes Rechteck — wie Formen, Icons, Assets. */
const centred = (x: number, y: number, w: number, h: number, rotation = 0) =>
  new Konva.Rect({ x, y, width: w, height: h, offsetX: w / 2, offsetY: h / 2, rotation });

/** Ein an der linken oberen Ecke gelagertes Rechteck — wie Text, Diagramm. */
const topLeft = (x: number, y: number, w: number, h: number, rotation = 0) =>
  new Konva.Rect({ x, y, width: w, height: h, rotation });

/** Der Knoten nach dem Neuzeichnen: liest x/y aus dem geschriebenen Zustand. */
const rerender = (node: Konva.Node, item: Record<string, unknown>) =>
  node.position({ x: item.x as number, y: item.y as number });

describe('align', () => {
  it('legt ein um 45° gedrehtes Element mit seinem gedrehten Umriss an den linken Seitenrand', () => {
    const p = page({ shapeInstances: [{ id: 's', x: 300, y: 200 }] });
    const node = p.add('s', centred(300, 200, 100, 100, 45));
    p.select(['s']);
    p.commands.run('alignLeft', null);
    rerender(node, p.item('shapeInstances', 's'));
    const box = axisAlignedBounds(readNodeFrame(node));
    expect(box.x).toBeCloseTo(0);
    expect(node.y()).toBe(200);
    expect(p.runHistoryBatch).not.toHaveBeenCalled();
  });

  it.each([
    ['alignCenterH', { x: 500, y: 200 }],
    ['alignRight', { x: 950, y: 200 }],
    ['alignTop', { x: 300, y: 50 }],
    ['alignMiddle', { x: 300, y: 250 }],
    ['alignBottom', { x: 300, y: 450 }],
  ] as const)('%s richtet ein einzelnes Element an der Seite aus', (id, expected) => {
    const p = page({ shapeInstances: [{ id: 's', x: 300, y: 200 }] });
    p.add('s', centred(300, 200, 100, 100));
    p.select(['s']);
    p.commands.run(id, null);
    expect(p.actions.updateShape).toHaveBeenCalledWith('s', expected);
  });

  it('richtet mehrere an der Auswahl aus — ein Schritt im Verlauf', () => {
    const p = page({
      chartInstances: [
        { id: 'a', x: 100, y: 0 },
        { id: 'b', x: 300, y: 100 },
      ],
    });
    p.add('a', topLeft(100, 0, 50, 50));
    p.add('b', topLeft(300, 100, 50, 50));
    p.select(['a', 'b']);
    p.commands.run('alignMiddle', null);
    expect(p.runHistoryBatch).toHaveBeenCalledTimes(1);
    expect(p.writesInBatch).toEqual([true, true]);
    expect(p.item('chartInstances', 'a')).toMatchObject({ x: 100, y: 50 });
    expect(p.item('chartInstances', 'b')).toMatchObject({ x: 300, y: 50 });
    p.undo();
    expect(p.item('chartInstances', 'b')).toMatchObject({ x: 300, y: 100 });
  });

  it('lässt gesperrte Elemente stehen; sie zählen aber zum Umriss der Auswahl', () => {
    const p = page({
      chartInstances: [
        { id: 'a', x: 100, y: 0 },
        { id: 'b', x: 300, y: 100 },
      ],
      lockedLayerIds: ['a'],
    });
    p.add('a', topLeft(100, 0, 50, 50));
    p.add('b', topLeft(300, 100, 50, 50));
    p.select(['a', 'b']);
    p.commands.run('alignLeft', null);
    expect(p.actions.updateChart).toHaveBeenCalledTimes(1);
    expect(p.actions.updateChart).toHaveBeenCalledWith('b', { x: 100, y: 100 });
  });

  it('verschiebt einen Balken über seinen Offset', () => {
    const p = page({
      balkenInstances: [{ id: 'k', offset: { x: 0, y: 0 } }],
      chartInstances: [{ id: 'c', x: 0, y: 0 }],
    });
    p.add('k', topLeft(200, 100, 50, 50));
    p.add('c', topLeft(0, 0, 50, 50));
    p.select(['k', 'c']);
    p.commands.run('alignTop', null);
    expect(p.item('balkenInstances', 'k')).toMatchObject({ offset: { x: 0, y: -100 } });
  });

  it('tut im Lesemodus nichts und bietet nichts an', () => {
    const p = page({ shapeInstances: [{ id: 's' }] }, { readOnly: true });
    p.add('s', centred(300, 200, 100, 100));
    p.select(['s']);
    p.commands.run('alignLeft', null);
    expect(p.actions.updateShape).not.toHaveBeenCalled();
    expect(p.commands.capabilities()).toMatchObject({ canAlign: false, canDistribute: false });
  });
});

describe('distribute', () => {
  it('verteilt drei Elemente mit gleichen Abständen', () => {
    const p = page({
      chartInstances: [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 100, y: 0 },
        { id: 'c', x: 400, y: 0 },
      ],
    });
    const nodes = [
      p.add('a', topLeft(0, 0, 100, 50)),
      p.add('b', topLeft(100, 0, 50, 50)),
      p.add('c', topLeft(400, 0, 100, 50)),
    ];
    p.select(['a', 'b', 'c']);
    expect(p.commands.capabilities().canDistribute).toBe(true);
    p.commands.run('distributeHorizontal', null);
    expect(p.runHistoryBatch).not.toHaveBeenCalled();
    ['a', 'b', 'c'].forEach((id, i) => rerender(nodes[i]!, p.item('chartInstances', id)));
    const boxes = nodes.map((n) => axisAlignedBounds(readNodeFrame(n)));
    expect(boxes[1]!.x - (boxes[0]!.x + boxes[0]!.width)).toBeCloseTo(
      boxes[2]!.x - (boxes[1]!.x + boxes[1]!.width)
    );
    expect(p.actions.updateChart).toHaveBeenCalledTimes(1);
  });

  it('braucht drei bewegliche Elemente', () => {
    const p = page({
      chartInstances: [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 100, y: 0 },
        { id: 'c', x: 400, y: 0 },
      ],
      lockedLayerIds: ['b'],
    });
    p.add('a', topLeft(0, 0, 100, 50));
    p.add('b', topLeft(100, 0, 50, 50));
    p.add('c', topLeft(400, 0, 100, 50));
    p.select(['a', 'b', 'c']);
    expect(p.commands.capabilities()).toMatchObject({ canAlign: true, canDistribute: false });
  });
});

describe('position', () => {
  it('X auf einem gedrehten, oben links gelagerten Element verschiebt dessen x um genau die Differenz', () => {
    const p = page({ chartInstances: [{ id: 'c', x: 200, y: 100 }] });
    const node = p.add('c', topLeft(200, 100, 100, 50, 30));
    p.select(['c']);
    const before = p.commands.geometry()!;
    p.commands.setPosition({ x: before.x + 40 });
    expect(p.actions.updateChart).toHaveBeenCalledTimes(1);
    rerender(node, p.item('chartInstances', 'c'));
    expect(node.x()).toBe(240);
    expect(node.y()).toBe(100);
    expect(p.commands.geometry()!.x).toBeCloseTo(before.x + 40);
  });

  it('liest den gedrehten Umriss als X/Y und die eigene Größe als B/H', () => {
    const p = page({ shapeInstances: [{ id: 's', x: 300, y: 200 }] });
    p.add('s', centred(300, 200, 100, 50, 90));
    p.select(['s']);
    expect(p.commands.geometry()).toEqual({
      x: 275,
      y: 150,
      width: 100,
      height: 50,
      resize: 'free',
    });
  });

  it('gibt für Mehrfachauswahl und gesperrte Elemente nichts zurück', () => {
    const p = page({
      shapeInstances: [{ id: 's' }, { id: 't' }],
      lockedLayerIds: ['t'],
    });
    p.add('s', centred(0, 0, 10, 10));
    p.add('t', centred(0, 0, 10, 10));
    p.select(['s', 't']);
    expect(p.commands.geometry()).toBeNull();
    p.select(['t']);
    expect(p.commands.geometry()).toBeNull();
    p.commands.setPosition({ x: 5 });
    expect(p.actions.updateShape).not.toHaveBeenCalled();
  });
});

describe('setSize', () => {
  it('skaliert eine Form je Achse und lässt den Abschluss des Primitivs schreiben', () => {
    const p = page({ shapeInstances: [{ id: 's' }] });
    const node = p.add('s', centred(300, 200, 100, 50));
    const committed = vi.fn(() => [node.scaleX(), node.scaleY()]);
    node.on('transformend', committed);
    p.select(['s']);
    p.commands.setSize({ height: 100 });
    expect(committed).toHaveReturnedWith([1, 2]);
  });

  it('ändert bei Text nur die Breite', () => {
    const p = page({ additionalTexts: [{ id: 't', x: 0, y: 0 }] });
    const node = p.add('t', topLeft(0, 0, 200, 40));
    const committed = vi.fn(() => [node.width(), node.scaleX(), node.scaleY()]);
    node.on('transformend', committed);
    p.select(['t']);
    expect(p.commands.geometry()?.resize).toBe('width');
    p.commands.setSize({ width: 205 });
    expect(committed).toHaveReturnedWith([205, 1, 1]);
  });

  it('hält bei Diagramm, Icon, Bild das Seitenverhältnis', () => {
    const p = page({ chartInstances: [{ id: 'c', x: 0, y: 0 }] });
    const node = p.add('c', topLeft(0, 0, 100, 50));
    const committed = vi.fn(() => [node.scaleX(), node.scaleY()]);
    node.on('transformend', committed);
    p.select(['c']);
    p.commands.setSize({ width: 200 });
    expect(committed).toHaveReturnedWith([2, 2]);
  });

  it('verwirft Unsinn', () => {
    const p = page({ shapeInstances: [{ id: 's' }] });
    const node = p.add('s', centred(300, 200, 100, 50));
    const committed = vi.fn();
    node.on('transformend', committed);
    p.select(['s']);
    p.commands.setSize({ width: Number.NaN });
    p.commands.setSize({ width: 0 });
    expect(committed).not.toHaveBeenCalled();
  });
});
