// SPDX-License-Identifier: MPL-2.0
/**
 * Characterization of the per-kind selection lookups — the floating module,
 * the orientation door and duplication — for every kind in `ELEMENT_KINDS`
 * plus the config's own elements. Recorded from the code before these lookups
 * followed the registry; a refactor must leave every expectation unchanged.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { floatingModuleFor } from '@ggraphic/editor/hooks/useFloatingModuleState';
import { duplicateElementInState } from '@ggraphic/editor/utils/duplicateElement';
import { ELEMENT_KINDS } from '@ggraphic/editor/utils/elementKinds';
import { findOrientationDoor } from '@ggraphic/editor/utils/orientElement';

import type { BaseCanvasState } from '@ggraphic/editor/configs/factory/baseTypes';
import type { FullCanvasConfig, LayoutResult } from '@ggraphic/editor/configs/types';

const layout = { centerX: 500, centerY: 500 } as unknown as LayoutResult;

/** One instance per kind, with the fields each lookup reads. */
function everyKindState(): Record<string, unknown> {
  return {
    selectedIcons: ['tabler-sun'],
    iconStates: {
      'tabler-sun': { x: 10, y: 20, scale: 2, rotation: 15, flipY: true, color: '#ff0000' },
    },
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
        rotation: 30,
        fill: '#1D3557',
        opacity: 0.8,
        dash: [4, 4],
        flipX: true,
      },
    ],
    frameInstances: [
      {
        id: 'frame-1',
        x: 10,
        y: 20,
        width: 200,
        height: 100,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        clipType: 'circle',
        imageSrc: 'blob:abc',
      },
    ],
    additionalTexts: [
      {
        id: 'text-1',
        text: 'Klimaschutz',
        x: 10,
        y: 20,
        width: 300,
        fontSize: 40,
        fill: '#ffffff',
        opacity: 0.9,
        stroke: '#000000',
        strokeWidth: 2,
        shadowColor: '#111111',
        shadowBlur: 3,
        shadowOffsetX: 1,
        shadowOffsetY: 2,
        shadowOpacity: 0.5,
        fillGradient: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#fff' }] },
        align: 'center',
        rotation: 12,
      },
    ],
    illustrationInstances: [
      { id: 'ill-1', illustrationId: 'undraw-x', x: 10, y: 20, scale: 1, rotation: 5, flipX: true },
    ],
    assetInstances: [
      { id: 'asset-1', assetId: 'sunflower', x: 10, y: 20, scale: 1, rotation: 0, opacity: 0.7 },
    ],
    circleBadgeInstances: [
      {
        id: 'circle-1',
        x: 10,
        y: 20,
        radius: 50,
        scale: 1,
        rotation: 0,
        backgroundColor: '#e6007e',
        textLines: [{ text: 'Neu' }],
      },
    ],
    pillBadgeInstances: [
      {
        id: 'pill-1',
        x: 10,
        y: 20,
        text: 'Jetzt',
        fontSize: 20,
        scale: 1,
        rotation: 2,
        backgroundColor: '#ffee00',
        opacity: 0.6,
      },
    ],
    userImageInstances: [
      {
        id: 'img-1',
        x: 10,
        y: 20,
        width: 300,
        height: 200,
        scale: 1,
        rotation: 0,
        src: 'blob:def',
        fileName: 'foto.jpg',
      },
    ],
    chartInstances: [
      {
        id: 'chart-1',
        chartType: 'bar',
        title: 'Zahlen',
        x: 10,
        y: 20,
        width: 400,
        height: 300,
        scale: 1,
        rotation: 0,
        opacity: 0.5,
        data: [{ name: 'a', value: 1 }],
        colors: ['#1D3557'],
      },
    ],
    headlineText: 'Hallo',
    headlineFontSize: 60,
    headlineFill: '#123456',
    currentImageSrc: 'blob:photo',
    bgColor: '#abcdef',
  };
}

/** The id of the single instance each kind holds in `everyKindState`. */
const KIND_IDS = {
  icon: 'tabler-sun',
  shape: 'shape-1',
  frame: 'frame-1',
  'additional-text': 'text-1',
  illustration: 'ill-1',
  asset: 'asset-1',
  'circle-badge': 'circle-1',
  'pill-badge': 'pill-1',
  'user-image': 'img-1',
  chart: 'chart-1',
} as const satisfies Record<(typeof ELEMENT_KINDS)[number]['kind'], string>;

const ELEMENTS = [
  {
    id: 'headline',
    type: 'text',
    textKey: 'headlineText',
    fontSize: 30,
    fontSizeStateKey: 'headlineFontSize',
    fillStateKey: 'headlineFill',
    positionStateKey: 'headlinePosition',
  },
  {
    id: 'background-image',
    type: 'image',
    srcKey: 'currentImageSrc',
    coverFit: true,
    opacity: 0.75,
  },
  {
    id: 'logo',
    type: 'image',
    src: 'https://assets.test/logo.svg',
    x: 10,
    y: 10,
    offsetKey: 'logoOffset',
  },
  { id: 'bg', type: 'background', colorKey: 'bgColor' },
  { id: 'plane', type: 'rect', x: 0, y: 0, width: 10, height: 10 },
];

const config = { elements: ELEMENTS } as unknown as FullCanvasConfig<Record<string, unknown>>;

describe('every ELEMENT_KINDS kind has a fixture here', () => {
  it('lists the same kinds', () => {
    expect(Object.keys(KIND_IDS).sort()).toEqual(ELEMENT_KINDS.map((k) => k.kind).sort());
  });
});

describe('floatingModuleFor per kind', () => {
  it.each(Object.entries(KIND_IDS))('%s', (_kind, id) => {
    expect(floatingModuleFor(id, config, everyKindState(), layout)).toMatchSnapshot();
  });

  it.each(ELEMENTS.map((e) => e.id))('config element %s', (id) => {
    expect(floatingModuleFor(id, config, everyKindState(), layout)).toMatchSnapshot();
  });

  it('an icon without stored state still opens the icon module', () => {
    const state = { selectedIcons: ['bare'] };
    expect(floatingModuleFor('bare', config, state, layout)).toEqual({
      type: 'icon',
      data: { id: 'bare' },
    });
  });

  it('a config element wins over an instance with the same id', () => {
    const state = { ...everyKindState(), additionalTexts: [{ id: 'headline', text: 'x' }] };
    expect(floatingModuleFor('headline', config, state, layout)?.data.isInstanceText).toBe(
      undefined
    );
  });

  it('null for unknown ids and no selection', () => {
    expect(floatingModuleFor('nope', config, everyKindState(), layout)).toBeNull();
    expect(floatingModuleFor(null, config, everyKindState(), layout)).toBeNull();
  });
});

function orientSetup(state: Record<string, unknown>) {
  let current = state;
  const actions = {
    updateShape: vi.fn(),
    updateIcon: vi.fn(),
    updateIllustration: vi.fn(),
    updateAsset: vi.fn(),
    updateFrame: vi.fn(),
    updateChart: vi.fn(),
    updateCircleBadge: vi.fn(),
    updatePillBadge: vi.fn(),
    updateUserImage: vi.fn(),
    updateAdditionalText: vi.fn(),
  };
  const updateState = vi.fn((fn: (p: Record<string, unknown>) => Record<string, unknown>) => {
    current = fn(current);
  });
  const saveToHistory = vi.fn();
  const door = (id: string) =>
    findOrientationDoor(
      { state: current, actions, elements: ELEMENTS as never, layout, updateState, saveToHistory },
      id
    );
  return {
    actions,
    door,
    get state() {
      return current;
    },
  };
}

describe('findOrientationDoor per kind', () => {
  it.each([...Object.entries(KIND_IDS), ['template', 'headline'], ['template', 'logo']])(
    '%s %s',
    (_kind, id) => {
      const t = orientSetup(everyKindState());
      const door = t.door(id);
      expect(door).not.toBeNull();
      const { apply: _apply, ...info } = door!;
      door!.apply({ x: 100, y: 200, rotation: 90, flipX: true, translate: { x: 5, y: 6 } });
      const calls = Object.fromEntries(
        Object.entries(t.actions)
          .filter(([, fn]) => fn.mock.calls.length > 0)
          .map(([name, fn]) => [name, fn.mock.calls])
      );
      const { headlinePosition, logoOffset, templateRotations } = t.state;
      expect({ info, calls, headlinePosition, logoOffset, templateRotations }).toMatchSnapshot();
    }
  );

  it.each(['bg', 'plane', 'background-image', 'nope'])('null for %s', (id) => {
    expect(orientSetup(everyKindState()).door(id)).toBeNull();
  });

  it('an instance wins over a template element with the same id', () => {
    const t = orientSetup({ ...everyKindState(), shapeInstances: [{ id: 'headline' }] });
    expect(t.door('headline')?.kind).toBe('shape');
  });
});

describe('duplicateElementInState per kind', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    vi.spyOn(Math, 'random').mockReturnValue(0.123456789);
  });
  afterEach(() => vi.restoreAllMocks());

  it.each(Object.entries(KIND_IDS))('%s', (_kind, id) => {
    const state = { ...everyKindState(), layerOrder: Object.values(KIND_IDS) };
    const before = everyKindState();
    const result = duplicateElementInState(state as unknown as BaseCanvasState, id);
    expect(result).not.toBeNull();
    // Only what the copy changed: the keys whose value differs from the original.
    const changed = Object.fromEntries(
      Object.entries(result!.state).filter(
        ([key, value]) =>
          key !== 'layerOrder' &&
          JSON.stringify(value) !== JSON.stringify((before as Record<string, unknown>)[key])
      )
    );
    expect({
      newId: result!.newId,
      changed,
      layerOrder: result!.state.layerOrder,
    }).toMatchSnapshot();
  });

  it('an icon without stored state is not duplicable', () => {
    const state = { selectedIcons: ['bare'] } as unknown as BaseCanvasState;
    expect(duplicateElementInState(state, 'bare')).toBeNull();
  });

  it.each(ELEMENTS.map((e) => e.id))(
    'config element %s is not duplicable without a template lookup',
    (id) => {
      expect(
        duplicateElementInState(everyKindState() as unknown as BaseCanvasState, id)
      ).toBeNull();
    }
  );
});
