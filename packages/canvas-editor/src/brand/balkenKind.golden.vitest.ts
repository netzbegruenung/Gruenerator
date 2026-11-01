/**
 * What the editor does with a Balken (`balkenInstances`), pinned from the code
 * of the time the kind still lived in the core: the render list, the layer
 * name, selection capabilities, duplicate, delete, orientation, the floating
 * module, the PPTX model, the AI description and the AI update. Moving the
 * kind into the Grünerator must leave every expectation unchanged, the file
 * included. The keyboard nudge has its own file in the render lane
 * (`balkenNudge.golden.vitest.tsx`).
 */

import { applyOperation } from '@ggraphic/editor/ai/applyOperation';
import { describeCanvasElements } from '@ggraphic/editor/ai/describeCanvasElements';
import { carryInstanceState } from '@ggraphic/editor/configs/factory/carryInstanceState';
import { injectFeatureProps } from '@ggraphic/editor/configs/featureInjector';
import { buildPptxModel } from '@ggraphic/editor/export/pptx/buildPptxModel';
import { floatingModuleFor } from '@ggraphic/editor/hooks/useFloatingModuleState';
import { messages } from '@ggraphic/editor/i18n/messages';
import { canRun } from '@ggraphic/editor/sidebar/sections/assets/useElementCatalog';
import { buildCanvasItems, buildSortedRenderList } from '@ggraphic/editor/utils/canvasLayerManager';
import { duplicateElementInState } from '@ggraphic/editor/utils/duplicateElement';
import { findKindItem } from '@ggraphic/editor/utils/elementKinds';
import { layerLabel } from '@ggraphic/editor/utils/layerLabels';
import { readElementDrag } from '@ggraphic/editor/utils/mediaDrop';
import { findOrientationDoor } from '@ggraphic/editor/utils/orientElement';
import { findElementRemover, isTemplateBound } from '@ggraphic/editor/utils/removeElement';
import { selectionCapabilities } from '@ggraphic/editor/utils/selectionCapabilities';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FullCanvasConfig, LayoutResult } from '@ggraphic/editor/configs/types';

const layout = { centerX: 540, centerY: 675 } as unknown as LayoutResult;
const config = { elements: [] } as unknown as FullCanvasConfig<Record<string, unknown>>;
const format = { id: 'probe', width: 1080, height: 1350 } as never;

function state(): Record<string, unknown> {
  return {
    balkenInstances: [
      {
        id: 'balken-1',
        mode: 'triple',
        colorSchemeId: 'tanne-sand',
        widthScale: 1.1,
        offset: { x: 12, y: -30 },
        scale: 0.9,
        texts: ['Klima', ' ', 'schützen'],
        rotation: 8,
        opacity: 0.6,
        barOffsets: [4, -2, 6],
      },
      {
        id: 'dreizeilen-balken',
        mode: 'single',
        colorSchemeId: 'tanne-sand',
        widthScale: 1,
        offset: { x: 0, y: 0 },
        scale: 1,
        texts: ['Vorlage'],
        rotation: 0,
      },
    ],
    shapeInstances: [
      {
        id: 'shape-1',
        type: 'rect',
        x: 10,
        y: 20,
        width: 100,
        height: 50,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        fill: '#123456',
      },
    ],
    layerOrder: [],
  };
}

function balkenActions() {
  return {
    updateBalken: vi.fn(),
    removeBalken: vi.fn(),
    setBalkenText: vi.fn(),
    isTemplateBound: (id: string) => id === 'dreizeilen-balken',
  };
}

const items = () => buildSortedRenderList(buildCanvasItems(config, state()), []);

describe('balken render list', () => {
  it('stacks the balken first, after the config elements', () => {
    expect(items().map((i) => [i.id, i.type])).toEqual([
      ['balken-1', 'balken'],
      ['dreizeilen-balken', 'balken'],
      ['shape-1', 'shape'],
    ]);
  });

  it('finds a balken by id with its instance', () => {
    expect(findKindItem(state(), 'balken-1')).toEqual(items()[0]);
  });
});

describe('balken layer label', () => {
  it('names the kind and its non-blank lines', () => {
    expect(layerLabel(items()[0]!, state())).toBe('Balken: Klima / schützen');
    expect(layerLabel(items()[0]!, { ...state(), lockedLayerIds: ['balken-1'] })).toBe(
      'Balken: Klima / schützen, gesperrt'
    );
  });

  it('keeps the message keys of the bar texts', () => {
    const t = messages();
    expect(t.layers.bar).toBe('Balken');
    expect(t.sidebar.bars).toEqual({
      duplicate: 'Balken duplizieren',
      remove: 'Balken entfernen',
      colorScheme: 'Farbschema',
      width: 'Balkenbreite',
      fineTune: 'Feinabstimmung',
      selected: 'Ausgewählter Balken',
      colorHint:
        'Wähle ein Farbschema, das die Lesbarkeit deiner Balken optimiert. Die Vorschau zeigt dir, wie die drei Balken eingefärbt werden. Achte auf guten Kontrast zwischen Balkenfarbe und Text.',
    });
    expect([
      t.sidebar.badges.addBar,
      t.sidebar.badges.oneBar,
      t.sidebar.badges.addTripleBar,
      t.sidebar.badges.threeBars,
    ]).toEqual([
      'Einzelnen Balken hinzufügen',
      '1 Balken',
      'Dreifach-Balken hinzufügen',
      '3 Balken',
    ]);
  });
});

describe('balken selection', () => {
  const caps = (id: string) => {
    const s = state();
    const actions = balkenActions();
    return selectionCapabilities({
      ids: [id],
      state: s,
      actions,
      renderList: items(),
      orient: (target) =>
        findOrientationDoor(
          {
            state: s,
            actions,
            elements: [],
            layout,
            updateState: () => {},
            saveToHistory: () => {},
          },
          target
        ),
      readOnly: false,
    });
  };

  it('a hand-added balken', () => {
    expect(caps('balken-1')).toEqual({
      count: 1,
      canCopy: true,
      canDelete: true,
      canBringForward: true,
      canSendBackward: false,
      lock: 'none',
      canLock: true,
      canRotate: true,
      canFlip: false,
      rotation: 8,
      canAlign: true,
      canDistribute: false,
      canUngroup: false,
      canEditText: true,
    });
  });

  it('the template balken cannot be deleted', () => {
    expect(caps('dreizeilen-balken').canDelete).toBe(false);
  });
});

describe('balken delete', () => {
  it('removes through removeBalken', () => {
    const actions = balkenActions();
    findElementRemover(state(), actions, 'balken-1')!();
    expect(actions.removeBalken).toHaveBeenCalledWith('balken-1');
  });

  it('keeps the template balken and a locked one', () => {
    const actions = balkenActions();
    expect(findElementRemover(state(), actions, 'dreizeilen-balken')).toBeNull();
    expect(
      findElementRemover({ ...state(), lockedLayerIds: ['balken-1'] }, actions, 'balken-1')
    ).toBeNull();
    expect(isTemplateBound(state(), actions, items(), 'dreizeilen-balken')).toBe(true);
    expect(isTemplateBound(state(), actions, items(), 'balken-1')).toBe(false);
  });

  it('needs the action', () => {
    expect(findElementRemover(state(), {}, 'balken-1')).toBeNull();
  });
});

describe('balken duplicate', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    vi.spyOn(Math, 'random').mockReturnValue(0.123456789);
  });
  afterEach(() => vi.restoreAllMocks());

  it('copies deep, shifts the offset and stacks the copy over the original', () => {
    const s: Record<string, unknown> = { ...state(), layerOrder: ['balken-1', 'shape-1'] };
    const result = duplicateElementInState(s, 'balken-1')!;
    expect(result.newId).toBe('balken-1700000000000-4fzzzxjyl');
    const bars = result.state.balkenInstances as Array<Record<string, unknown>>;
    expect(bars[2]).toEqual({
      ...(state().balkenInstances as object[])[0],
      id: 'balken-1700000000000-4fzzzxjyl',
      offset: { x: 32, y: -10 },
    });
    expect(bars[2]!.texts).not.toBe((bars[0] as { texts: unknown }).texts);
    expect(bars[2]!.barOffsets).not.toBe((bars[0] as { barOffsets: unknown }).barOffsets);
    expect(result.state.layerOrder).toEqual([
      'balken-1',
      'balken-1700000000000-4fzzzxjyl',
      'shape-1',
    ]);
  });

  it('takes a given offset', () => {
    const result = duplicateElementInState(state(), 'balken-1', {
      offset: { x: 5, y: 7 },
    })!;
    const bars = result.state.balkenInstances as Array<{ offset: unknown }>;
    expect(bars[2]!.offset).toEqual({ x: 17, y: -23 });
  });
});

describe('balken orientation', () => {
  it('rotates about the centre and moves the offset, never x/y or flips', () => {
    const actions = balkenActions();
    const door = findOrientationDoor(
      {
        state: state(),
        actions,
        elements: [],
        layout,
        updateState: () => {},
        saveToHistory: () => {},
      },
      'balken-1'
    )!;
    const { apply, ...info } = door;
    expect(info).toEqual({
      kind: 'balken',
      rotation: 8,
      flipX: false,
      flipY: false,
      canFlip: false,
    });
    apply({ x: 100, y: 200, rotation: 90, flipX: true, translate: { x: 5, y: 6 } });
    apply({ rotation: 45 });
    expect(actions.updateBalken.mock.calls).toEqual([
      ['balken-1', { rotation: 90, offset: { x: 17, y: -24 } }],
      ['balken-1', { rotation: 45 }],
    ]);
  });

  it('needs updateBalken', () => {
    const door = findOrientationDoor(
      {
        state: state(),
        actions: {},
        elements: [],
        layout,
        updateState: () => {},
        saveToHistory: () => {},
      },
      'balken-1'
    );
    expect(door).toBeNull();
  });
});

describe('balken floating module', () => {
  it('carries the opacity only', () => {
    expect(floatingModuleFor('balken-1', config, state(), layout)).toEqual({
      type: 'balken',
      data: { id: 'balken-1', opacity: 0.6 },
    });
    expect(floatingModuleFor('dreizeilen-balken', config, state(), layout)).toEqual({
      type: 'balken',
      data: { id: 'dreizeilen-balken', opacity: 1 },
    });
  });
});

describe('balken pptx', () => {
  it('rasters each balken over the page, first, with an estimated box', () => {
    const slide = buildPptxModel([state() as never], format).slides[0]!;
    expect(slide.unknownKeys).toEqual([]);
    expect(slide.items.slice(0, 2)).toEqual([
      {
        kind: 'raster',
        elementId: 'balken-1',
        box: { x: 0, y: 0, width: 1080, height: 1350 },
        rotation: 8,
        reason: 'balken',
        boxExact: false,
      },
      {
        kind: 'raster',
        elementId: 'dreizeilen-balken',
        box: { x: 0, y: 0, width: 1080, height: 1350 },
        rotation: 0,
        reason: 'balken',
        boxExact: false,
      },
    ]);
  });
});

describe('balken ai', () => {
  it('describes each balken by its lines and offset', () => {
    const summary = describeCanvasElements(state() as never);
    expect(summary.slice(0, 2)).toEqual([
      {
        id: 'balken-1',
        kind: 'balken',
        label: 'Balken "Klima / / schützen" · Versatz x=12 y=-30 · gedreht 8° · Ebene 1/3',
      },
      {
        id: 'dreizeilen-balken',
        kind: 'balken',
        label: 'Balken "Vorlage" · Versatz x=0 y=0 · Ebene 2/3',
      },
    ]);
  });

  const update = (patch: Record<string, unknown>, actions: object = balkenActions()) =>
    applyOperation(
      { kind: 'update-element', elementId: 'balken-1', patch } as never,
      actions as never,
      state,
      {} as never
    );

  it('updates geometry: scale multiplies, x/y set the offset', () => {
    const actions = balkenActions();
    expect(update({ scale: 2, x: 50, opacity: 0.3 }, actions)).toEqual({ ok: true });
    expect(update({ y: 70 }, actions)).toEqual({ ok: true });
    expect(actions.updateBalken.mock.calls).toEqual([
      ['balken-1', { opacity: 0.3, scale: 1.8, offset: { x: 50, y: -30 } }],
      ['balken-1', { offset: { x: 12, y: 70 } }],
    ]);
  });

  it('rejects colour and needs updateBalken', () => {
    expect(update({ color: '#ff0000' })).toEqual({ ok: false, reason: 'balken has no color' });
    expect(update({ x: 1 }, {})).toEqual({
      ok: false,
      reason: 'template does not support updating balken',
    });
  });

  it('removes through the same door as the Entf key', () => {
    const actions = balkenActions();
    const remove = (elementId: string) =>
      applyOperation(
        { kind: 'remove-element', elementId } as never,
        actions as never,
        state,
        {} as never
      );
    expect(remove('balken-1')).toEqual({ ok: true });
    expect(actions.removeBalken).toHaveBeenCalledWith('balken-1');
    expect(remove('dreizeilen-balken')).toEqual({
      ok: false,
      reason: 'element "dreizeilen-balken" not found',
    });
  });
});

describe('balken state', () => {
  it('rides through a re-seed', () => {
    const bars = state().balkenInstances;
    expect(carryInstanceState({ balkenInstances: bars }).balkenInstances).toEqual(bars);
    expect(carryInstanceState({}).balkenInstances).toEqual([]);
  });
});

describe('balken tiles', () => {
  const single = { kind: 'balken', mode: 'single' } as const;

  it('a tile runs where the config can add a balken', () => {
    const can = (s: object, actions: object) =>
      canRun(single as never, injectFeatureProps(s, actions));
    expect(can(state(), { addBalken: () => {} })).toBe(true);
    expect(can(state(), {})).toBe(false);
    expect(can({}, { addBalken: () => {} })).toBe(false);
  });

  it('a dragged tile is read back', () => {
    const drag = (payload: object) =>
      readElementDrag({ getData: () => JSON.stringify(payload) } as unknown as DataTransfer);
    expect(drag({ kind: 'balken', mode: 'triple' })).toEqual({ kind: 'balken', mode: 'triple' });
  });
});
