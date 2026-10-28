// SPDX-License-Identifier: MPL-2.0
/**
 * A host element kind (`registerElementKind`) goes through the same doors as
 * the core's kinds: render list, delete, duplicate, orientation, toolbar,
 * layer name, AI list and update, PPTX, re-seed, page keys, tiles and drops.
 * The kind here is a probe: a stamp with a label and an `offset` instead of
 * x/y, the shape a host kind drawn around a layout point takes.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyOperation } from '../ai/applyOperation.js';
import { describeCanvasElements } from '../ai/describeCanvasElements.js';
import { hostEmittedStateKeys, pagePersistedStateKeys } from '../collab/pageElementStateKeys.js';
import {
  carriedInstanceKeys,
  carryInstanceState,
  CARRIED_INSTANCE_KEYS,
} from '../configs/factory/carryInstanceState.js';
import { injectFeatureProps } from '../configs/featureInjector.js';
import { buildPptxModel, pptxMappedPageKeys } from '../export/pptx/buildPptxModel.js';
import { floatingModuleFor } from '../hooks/useFloatingModuleState.js';
import { messages, registerHostMessages, registerMessages } from '../i18n/messages.js';
import { canRun } from '../sidebar/sections/assets/useElementCatalog.js';
import { registerStampKind, STAMP_KIND, type Stamp } from '../testing/stampKind.js';

import { buildCanvasItems, buildSortedRenderList } from './canvasLayerManager.js';
import { duplicateElementInState } from './duplicateElement.js';
import {
  addHostElement,
  findKindItem,
  hostElementKind,
  registerElementKind,
} from './elementKinds.js';
import { layerLabel } from './layerLabels.js';
import { readElementDrag } from './mediaDrop.js';
import { findOrientationDoor } from './orientElement.js';
import { findElementRemover } from './removeElement.js';

import type { FullCanvasConfig, LayoutResult } from '../configs/types.js';

beforeAll(registerStampKind);

const layout = { centerX: 500, centerY: 500 } as unknown as LayoutResult;
const config = { elements: [] } as unknown as FullCanvasConfig<Record<string, unknown>>;

function state(): Record<string, unknown> {
  return {
    stampInstances: [
      { id: 'stamp-1', label: 'Neu', offset: { x: 3, y: 4 }, rotation: 10, opacity: 0.5 },
    ],
    shapeInstances: [
      { id: 'shape-1', type: 'rect', x: 1, y: 2, width: 3, height: 4, scaleX: 1, scaleY: 1 },
    ],
    layerOrder: [],
  };
}

const stampActions = () => ({
  updateStamp: vi.fn(),
  removeStamp: vi.fn(),
  addStamp: vi.fn(),
  isTemplateBound: () => false,
});

describe('registerElementKind', () => {
  it('refuses a core kind', () => {
    expect(() => registerElementKind({ ...STAMP_KIND, kind: 'shape' } as never)).toThrow(/core/);
  });

  it('knows the kind by name', () => {
    expect(hostElementKind('stamp')?.stateKey).toBe('stampInstances');
    expect(hostElementKind('shape')).toBeNull();
  });
});

describe('a host kind on the page', () => {
  it('stacks after the config elements and before the core kinds', () => {
    const items = buildSortedRenderList(buildCanvasItems(config, state()), []);
    expect(items.map((i) => [i.id, i.type])).toEqual([
      ['stamp-1', 'stamp'],
      ['shape-1', 'shape'],
    ]);
    expect(findKindItem(state(), 'stamp-1')).toEqual(items[0]);
    expect(layerLabel(items[0]!, state())).toBe('Stempel: Neu');
  });

  it('is removed through its remove action', () => {
    const actions = stampActions();
    findElementRemover(state(), actions, 'stamp-1')!();
    expect(actions.removeStamp).toHaveBeenCalledWith('stamp-1');
    expect(findElementRemover(state(), {}, 'stamp-1')).toBeNull();
  });

  it('rides through a re-seed and the page keys', () => {
    const stamps = state().stampInstances;
    const carried: object = carryInstanceState({ stampInstances: stamps });
    expect((carried as { stampInstances?: unknown }).stampInstances).toEqual(stamps);
    expect(carriedInstanceKeys()).toEqual([...CARRIED_INSTANCE_KEYS, 'stampInstances']);
    expect(pagePersistedStateKeys()).toEqual(
      expect.arrayContaining(['stampInstances', 'stampColour'])
    );
    expect(hostEmittedStateKeys()).toEqual(
      expect.arrayContaining(['stampInstances', 'stampColour'])
    );
    // The same array until the next registration (hook dependencies).
    expect(pagePersistedStateKeys()).toBe(pagePersistedStateKeys());
  });
});

describe('a host kind selected', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    vi.spyOn(Math, 'random').mockReturnValue(0.123456789);
  });
  afterEach(() => vi.restoreAllMocks());

  it('duplicates through its copy', () => {
    const result = duplicateElementInState(state(), 'stamp-1')!;
    expect(result.newId).toBe('stamp-1700000000000-4fzzzxjyl');
    expect((result.state.stampInstances as Stamp[])[1]).toMatchObject({
      id: result.newId,
      offset: { x: 23, y: 24 },
    });
  });

  it('turns and moves through its orientation, never flips', () => {
    const actions = stampActions();
    const door = findOrientationDoor(
      {
        state: state(),
        actions,
        elements: [],
        layout,
        updateState: () => {},
        saveToHistory: () => {},
      },
      'stamp-1'
    )!;
    expect(door.kind).toBe('stamp');
    expect(door.canFlip).toBe(false);
    door.apply({ rotation: 90, translate: { x: 1, y: 1 }, flipX: true });
    expect(actions.updateStamp).toHaveBeenCalledWith('stamp-1', {
      rotation: 90,
      offset: { x: 4, y: 5 },
    });
  });

  it('opens its toolbar module', () => {
    expect(floatingModuleFor('stamp-1', config, state(), layout)).toEqual({
      type: 'stamp',
      data: { id: 'stamp-1', opacity: 0.5 },
    });
  });
});

describe('a host kind and the AI', () => {
  it('is listed by its description', () => {
    expect(describeCanvasElements(state() as never)[0]).toEqual({
      id: 'stamp-1',
      kind: 'stamp',
      label: 'Stempel "Neu" · Ebene 1/2',
    });
  });

  it('takes the fields it names, through its update', () => {
    const actions = stampActions();
    const update = (patch: object) =>
      applyOperation(
        { kind: 'update-element', elementId: 'stamp-1', patch } as never,
        actions as never,
        state,
        {} as never
      );
    expect(update({ x: 9, opacity: 0.2 })).toEqual({ ok: true });
    expect(update({ color: '#000000' })).toEqual({ ok: false, reason: 'stamp has no color' });
    expect(actions.updateStamp.mock.calls).toEqual([
      ['stamp-1', { opacity: 0.2, offset: { x: 9, y: 4 } }],
    ]);
  });
});

describe('a host kind on a slide', () => {
  it('goes onto the slide in its place, its list a known key', () => {
    const slide = buildPptxModel([state() as never], { width: 100, height: 200 } as never)
      .slides[0]!;
    expect(slide.items[0]).toEqual({
      kind: 'raster',
      elementId: 'stamp-1',
      box: { x: 0, y: 0, width: 100, height: 200 },
      rotation: 10,
      reason: 'stamp',
      boxExact: false,
    });
    expect(slide.unknownKeys).toEqual([]);
    expect(pptxMappedPageKeys()).toContain('stampInstances');
  });
});

describe('a host kind as a tile', () => {
  it('runs where the state holds its list and the config can add it', () => {
    const tile = { kind: 'stamp', label: 'Neu' } as never;
    expect(canRun(tile, injectFeatureProps(state(), stampActions()))).toBe(true);
    expect(canRun(tile, injectFeatureProps(state(), {}))).toBe(false);
    expect(canRun(tile, injectFeatureProps({}, stampActions()))).toBe(false);
  });

  it('adds through its action, a drop with its placement', () => {
    const actions = stampActions();
    expect(addHostElement({ kind: 'stamp', label: 'A' } as never, actions)).toBe(true);
    expect(addHostElement({ kind: 'stamp', label: 'B' } as never, actions, { x: 1 })).toBe(true);
    expect(addHostElement({ kind: 'stamp', label: 'C' } as never, {})).toBe(false);
    expect(actions.addStamp.mock.calls).toEqual([['A'], ['B', { x: 1 }]]);
  });

  it('is read back from a drag', () => {
    const drag = (payload: object) =>
      readElementDrag({ getData: () => JSON.stringify(payload) } as unknown as DataTransfer);
    expect(drag({ kind: 'stamp', label: 'Neu' })).toEqual({ kind: 'stamp', label: 'Neu' });
    expect(drag({ kind: 'nope' })).toBeNull();
  });
});

describe('host messages', () => {
  afterEach(() => registerMessages('de'));

  it('nest into the catalogue per locale, German as the fallback', () => {
    const before = messages().layers.icon;
    registerHostMessages({
      de: { layers: { stamp: 'Stempel' } },
      en: { layers: { stamp: 'Stamp' } },
    } as never);
    const read = () => (messages().layers as unknown as Record<string, string>).stamp;
    expect(read()).toBe('Stempel');
    expect(messages().layers.icon).toBe(before);
    registerMessages('en');
    expect(read()).toBe('Stamp');
    registerMessages({ ...messages() } as never);
    expect(read()).toBe('Stamp');
  });
});
