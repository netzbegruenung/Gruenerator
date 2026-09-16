import { describe, expect, it } from 'vitest';

import { buildCanvasItems, type CanvasItem } from './canvasLayerManager';
import {
  DUPLICABLE_TYPES,
  canDuplicateElement,
  duplicateElementInState,
  insertInstance,
  type DuplicableType,
} from './duplicateElement';

import type { BaseCanvasState } from '../configs/factory/baseTypes';
import type { FullCanvasConfig } from '../configs/types';

/**
 * Ein Zustand mit genau einem Eintrag je Instanz-Sammlung. Die Felder sind so
 * dünn wie möglich gehalten und über `as never` eingesetzt: geprüft wird das
 * Verschieben und Kopieren, nicht die Vollständigkeit der Instanztypen.
 */
function stateWithOneOfEach() {
  return {
    shapeInstances: [{ id: 'shape-1', x: 10, y: 20, dash: [4, 4] }],
    additionalTexts: [{ id: 'text-1', x: 10, y: 20 }],
    balkenInstances: [{ id: 'balken-1', offset: { x: 10, y: 20 }, texts: ['GRÜNE'] }],
    illustrationInstances: [{ id: 'ill-1', x: 10, y: 20 }],
    assetInstances: [{ id: 'asset-1', x: 10, y: 20 }],
    pillBadgeInstances: [{ id: 'pill-1', x: 10, y: 20 }],
    circleBadgeInstances: [{ id: 'circle-1', x: 10, y: 20, textLines: [{ text: 'A' }] }],
    frameInstances: [{ id: 'frame-1', x: 10, y: 20, imageSrc: 'blob:abc' }],
    userImageInstances: [{ id: 'img-1', x: 10, y: 20, src: 'blob:def' }],
    chartInstances: [
      { id: 'chart-1', x: 10, y: 20, data: [{ name: 'a', value: 1 }], colors: ['#005538'] },
    ],
  } as unknown as BaseCanvasState;
}

/** Sammlung und Original-ID je Art — hält die Fälle unten datengetrieben. */
const CASES: { type: DuplicableType; field: string; id: string }[] = [
  { type: 'shape', field: 'shapeInstances', id: 'shape-1' },
  { type: 'additional-text', field: 'additionalTexts', id: 'text-1' },
  { type: 'balken', field: 'balkenInstances', id: 'balken-1' },
  { type: 'illustration', field: 'illustrationInstances', id: 'ill-1' },
  { type: 'asset', field: 'assetInstances', id: 'asset-1' },
  { type: 'pill-badge', field: 'pillBadgeInstances', id: 'pill-1' },
  { type: 'circle-badge', field: 'circleBadgeInstances', id: 'circle-1' },
  { type: 'frame', field: 'frameInstances', id: 'frame-1' },
  { type: 'user-image', field: 'userImageInstances', id: 'img-1' },
  { type: 'chart', field: 'chartInstances', id: 'chart-1' },
];

const listOf = (state: BaseCanvasState, field: string) =>
  (state as unknown as Record<string, { id: string; x?: number; y?: number }[]>)[field];

describe('duplicateElementInState', () => {
  it.each(CASES)('legt die Kopie von $type in $field ab', ({ field, id }) => {
    const result = duplicateElementInState(stateWithOneOfEach(), id);

    expect(result).not.toBeNull();
    const list = listOf(result!.state, field);
    expect(list).toHaveLength(2);
    expect(list[1].id).toBe(result!.newId);
    expect(list[1].id).not.toBe(id);
    // Das Original bleibt unberührt.
    expect(list[0].id).toBe(id);
  });

  it('versetzt x/y um den Standardversatz', () => {
    const result = duplicateElementInState(stateWithOneOfEach(), 'shape-1');
    const copy = listOf(result!.state, 'shapeInstances')[1];
    expect(copy.x).toBe(30);
    expect(copy.y).toBe(40);
  });

  /**
   * Balken kennt kein `x`/`y` — seine Lage ist ein Versatz zur Layout-Basis.
   * Wer das übersieht, erzeugt eine Kopie, die exakt auf dem Original liegt.
   */
  it('versetzt beim Balken `offset` statt x/y', () => {
    const result = duplicateElementInState(stateWithOneOfEach(), 'balken-1');
    const copy = listOf(result!.state, 'balkenInstances')[1] as unknown as {
      offset: { x: number; y: number };
      x?: number;
    };
    expect(copy.offset).toEqual({ x: 30, y: 40 });
    expect(copy.x).toBeUndefined();
  });

  it('nimmt einen eigenen Versatz an', () => {
    const result = duplicateElementInState(stateWithOneOfEach(), 'shape-1', 0);
    const copy = listOf(result!.state, 'shapeInstances')[1];
    expect(copy.x).toBe(10);
  });

  it('gibt null für eine unbekannte ID zurück (Vorlagen-Element, Icon)', () => {
    expect(duplicateElementInState(stateWithOneOfEach(), 'quote-text')).toBeNull();
    expect(duplicateElementInState(stateWithOneOfEach(), 'sunflower')).toBeNull();
  });

  it('lässt den Ausgangszustand unverändert', () => {
    const state = stateWithOneOfEach();
    duplicateElementInState(state, 'shape-1');
    expect(state.shapeInstances).toHaveLength(1);
  });
});

/**
 * Ein flacher Spread teilt verschachtelte Arrays zwischen Original und Kopie:
 * das Umfärben der einen Reihe änderte dann still die andere mit. Von den vier
 * bisherigen Duplizier-Fassungen machte das nur `duplicateChart` richtig.
 */
describe('tiefe Kopien', () => {
  it.each([
    ['chart-1', 'chartInstances', 'data'],
    ['chart-1', 'chartInstances', 'colors'],
    ['balken-1', 'balkenInstances', 'texts'],
    ['circle-1', 'circleBadgeInstances', 'textLines'],
    ['shape-1', 'shapeInstances', 'dash'],
  ])('%s teilt %s.%s nicht mit dem Original', (id, field, key) => {
    const result = duplicateElementInState(stateWithOneOfEach(), id);
    const list = listOf(result!.state, field) as unknown as Record<string, unknown>[];
    expect(list[1][key]).toEqual(list[0][key]);
    expect(list[1][key]).not.toBe(list[0][key]);
  });

  it('kopiert auch die Objekte innerhalb der Arrays', () => {
    const result = duplicateElementInState(stateWithOneOfEach(), 'chart-1');
    const list = listOf(result!.state, 'chartInstances') as unknown as {
      data: { name: string }[];
    }[];
    expect(list[1].data[0]).not.toBe(list[0].data[0]);
  });
});

/**
 * Eine ID, die nicht in `layerOrder` steht, hängt `buildSortedRenderList` ganz
 * nach oben — und `moveLayer` gibt die Liste unverändert zurück, die
 * Ebenen-Knöpfe wären für die frische Kopie also wirkungslos.
 */
describe('layerOrder', () => {
  it('setzt die Kopie direkt über das Original', () => {
    const state = { ...stateWithOneOfEach(), layerOrder: ['bg', 'shape-1', 'text-1'] };
    const result = duplicateElementInState(state, 'shape-1');
    expect(result!.state.layerOrder).toEqual(['bg', 'shape-1', result!.newId, 'text-1']);
  });

  it('lässt eine Reihenfolge unangetastet, die das Original nicht führt', () => {
    const state = { ...stateWithOneOfEach(), layerOrder: ['bg', 'text-1'] };
    const result = duplicateElementInState(state, 'shape-1');
    expect(result!.state.layerOrder).toEqual(['bg', 'text-1']);
  });

  it('legt keine Reihenfolge an, wo noch keine ist', () => {
    const result = duplicateElementInState(stateWithOneOfEach(), 'shape-1');
    expect(result!.state.layerOrder).toBeUndefined();
  });

  it('führt die Kopie beim Einfügen aus der Zwischenablage nicht ein', () => {
    const state = { ...stateWithOneOfEach(), layerOrder: ['bg', 'shape-1'] };
    const result = insertInstance(state, {
      type: 'shape',
      data: { id: 'fremd', x: 0, y: 0 } as never,
    });
    expect(result.state.layerOrder).toEqual(['bg', 'shape-1']);
  });
});

describe('canDuplicateElement', () => {
  it.each(CASES)('bejaht $type', ({ id }) => {
    expect(canDuplicateElement(stateWithOneOfEach(), id)).toBe(true);
  });

  it('verneint Vorlagen-Elemente, Icons und eine leere Auswahl', () => {
    expect(canDuplicateElement(stateWithOneOfEach(), 'quote-text')).toBe(false);
    expect(canDuplicateElement(stateWithOneOfEach(), null)).toBe(false);
  });
});

/**
 * Drift-Wächter. `buildCanvasItems` ist die Liste dessen, was auf der Fläche
 * liegt; alles darin außer Vorlagen-Elementen (`element`) und Icons (`icon`,
 * ihre ID ist die Katalog-ID) muss duplizierbar sein. Eine neue Elementart, die
 * in `DUPLICABLE` vergessen wird, fällt hier auf statt still im Editor.
 */
describe('Vollständigkeit gegenüber buildCanvasItems', () => {
  const NOT_DUPLICABLE: CanvasItem['type'][] = ['element', 'icon'];

  it('deckt jede Instanz-Art der Renderliste ab', () => {
    const state = { ...stateWithOneOfEach(), selectedIcons: ['sonne'] };
    const config = { elements: [] } as unknown as FullCanvasConfig<BaseCanvasState, unknown>;
    const items = buildCanvasItems(config, state);

    const rendered = [...new Set(items.map((i) => i.type))].filter(
      (t) => !NOT_DUPLICABLE.includes(t)
    );
    expect(rendered.length).toBeGreaterThan(0);
    expect([...rendered].sort()).toEqual([...DUPLICABLE_TYPES].sort());
  });
});
