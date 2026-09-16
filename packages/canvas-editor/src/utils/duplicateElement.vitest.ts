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
    // Ein Icon steht in KEINER Liste: seine ID in `selectedIcons`, sein Zustand
    // unter derselben ID in `iconStates`. Hier in der Altform ohne `iconId`.
    selectedIcons: ['tabler-sun'],
    iconStates: { 'tabler-sun': { x: 10, y: 20, scale: 1, rotation: 0 } },
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

  it('bejaht ein Icon', () => {
    expect(canDuplicateElement(stateWithOneOfEach(), 'tabler-sun')).toBe(true);
  });

  it('verneint Vorlagen-Elemente und eine leere Auswahl', () => {
    expect(canDuplicateElement(stateWithOneOfEach(), 'quote-text')).toBe(false);
    expect(canDuplicateElement(stateWithOneOfEach(), null)).toBe(false);
  });
});

/**
 * Icons, der Fall aus #3404. Bis dahin WAR die Instanz-ID die Katalog-ID, unter
 * der `CanvasRenderLayer` die Definition nachschlägt — eine Kopie mit frischer
 * ID fand nichts und zeichnete nichts. Die Kopie trägt deshalb `iconId`.
 */
describe('Icons', () => {
  const iconStatesOf = (state: BaseCanvasState) => state.iconStates;

  it('legt die Kopie als zweite Instanz mit Katalog-Verweis ab', () => {
    const result = duplicateElementInState(stateWithOneOfEach(), 'tabler-sun');

    expect(result).not.toBeNull();
    const { state, newId } = result!;
    expect(state.selectedIcons).toEqual(['tabler-sun', newId]);
    expect(iconStatesOf(state)[newId]).toEqual({
      x: 30,
      y: 40,
      scale: 1,
      rotation: 0,
      iconId: 'tabler-sun',
    });
  });

  it('lässt das Original unberührt', () => {
    const before = stateWithOneOfEach();
    const result = duplicateElementInState(before, 'tabler-sun')!;
    expect(iconStatesOf(result.state)['tabler-sun']).toEqual({
      x: 10,
      y: 20,
      scale: 1,
      rotation: 0,
    });
    expect(before.selectedIcons).toEqual(['tabler-sun']);
  });

  it('hält die Kopie einer Kopie am selben Katalog-Icon', () => {
    const first = duplicateElementInState(stateWithOneOfEach(), 'tabler-sun')!;
    const second = duplicateElementInState(first.state, first.newId)!;

    expect(iconStatesOf(second.state)[second.newId].iconId).toBe('tabler-sun');
    expect(second.state.selectedIcons).toHaveLength(3);
  });

  it('setzt die Kopie in der Ebenenfolge direkt über das Original', () => {
    const state = { ...stateWithOneOfEach(), layerOrder: ['tabler-sun', 'shape-1'] };
    const result = duplicateElementInState(state, 'tabler-sun')!;
    expect(result.state.layerOrder).toEqual(['tabler-sun', result.newId, 'shape-1']);
  });

  it('verneint ein Icon ohne gespeicherten Zustand', () => {
    // Ohne Eintrag in `iconStates` stünde die Lage erst im Renderer fest (Mitte
    // der Fläche) — die Kopie läge dann exakt auf dem Original.
    const state = { ...stateWithOneOfEach(), iconStates: {} } as unknown as BaseCanvasState;
    expect(duplicateElementInState(state, 'tabler-sun')).toBeNull();
    expect(canDuplicateElement(state, 'tabler-sun')).toBe(false);
  });
});

/**
 * Drift-Wächter. `buildCanvasItems` ist die Liste dessen, was auf der Fläche
 * liegt; alles darin außer Vorlagen-Elementen (`element`) muss duplizierbar
 * sein. Eine neue Elementart, die in `DUPLICABLE` vergessen wird, fällt hier
 * auf statt still im Editor.
 */
describe('Vollständigkeit gegenüber buildCanvasItems', () => {
  const NOT_DUPLICABLE: CanvasItem['type'][] = ['element'];

  it('deckt jede Instanz-Art der Renderliste ab', () => {
    const state = stateWithOneOfEach();
    const config = { elements: [] } as unknown as FullCanvasConfig<BaseCanvasState, unknown>;
    const items = buildCanvasItems(config, state);

    const rendered = [...new Set(items.map((i) => i.type))].filter(
      (t) => !NOT_DUPLICABLE.includes(t)
    );
    expect(rendered.length).toBeGreaterThan(0);
    expect([...rendered].sort()).toEqual([...DUPLICABLE_TYPES].sort());
  });
});
