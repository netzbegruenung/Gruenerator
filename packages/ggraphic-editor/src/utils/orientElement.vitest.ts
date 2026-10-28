// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it, vi } from 'vitest';

import { findOrientationDoor } from '@ggraphic/editor/utils/orientElement';

import type { LayoutResult } from '@ggraphic/editor/configs/types';

const layout = { centerX: 500, centerY: 500 } as unknown as LayoutResult;

function setup(state: Record<string, unknown>, elements: unknown[] = []) {
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
  const door = (id: string | null) =>
    findOrientationDoor(
      {
        state: current,
        actions,
        elements: elements as never,
        layout,
        updateState,
        saveToHistory,
      },
      id
    );
  return {
    actions,
    door,
    updateState,
    saveToHistory,
    get state() {
      return current;
    },
  };
}

const item = (id: string, extra: Record<string, unknown> = {}) => ({ id, rotation: 10, ...extra });

describe('findOrientationDoor', () => {
  it('returns null for null, unknown and locked ids', () => {
    const t = setup({ shapeInstances: [item('s')], lockedLayerIds: ['s'] });
    expect(t.door(null)).toBeNull();
    expect(t.door('nope')).toBeNull();
    expect(t.door('s')).toBeNull();
  });

  it.each([
    ['shapeInstances', 'updateShape', 'shape', true],
    ['illustrationInstances', 'updateIllustration', 'illustration', true],
    ['assetInstances', 'updateAsset', 'asset', true],
    ['frameInstances', 'updateFrame', 'frame', false],
    ['pillBadgeInstances', 'updatePillBadge', 'pill-badge', false],
    ['circleBadgeInstances', 'updateCircleBadge', 'circle-badge', false],
    ['userImageInstances', 'updateUserImage', 'user-image', true],
    ['chartInstances', 'updateChart', 'chart', false],
    ['additionalTexts', 'updateAdditionalText', 'text', false],
  ] as const)('%s dispatches to %s', (key, action, kind, canFlip) => {
    const t = setup({ [key]: [item('a', { flipX: true })] });
    const door = t.door('a')!;
    expect(door.kind).toBe(kind);
    expect(door.rotation).toBe(10);
    expect(door.canFlip).toBe(canFlip);
    door.apply({ x: 1, y: 2, rotation: 90, flipY: true });
    expect(t.actions[action]).toHaveBeenCalledWith('a', { x: 1, y: 2, rotation: 90, flipY: true });
  });

  it('reads flip flags', () => {
    const t = setup({ shapeInstances: [item('a', { flipX: true })] });
    const door = t.door('a')!;
    expect(door.flipX).toBe(true);
    expect(door.flipY).toBe(false);
  });

  it('dispatches icons', () => {
    const t = setup({ selectedIcons: ['i'], iconStates: { i: { rotation: 5, flipY: true } } });
    const door = t.door('i')!;
    expect(door.kind).toBe('icon');
    expect(door.rotation).toBe(5);
    expect(door.flipY).toBe(true);
    door.apply({ rotation: 90 });
    expect(t.actions.updateIcon).toHaveBeenCalledWith('i', { rotation: 90 });
  });

  it('returns null when the action is missing', () => {
    const t = setup({ shapeInstances: [item('a')] });
    delete (t.actions as Record<string, unknown>).updateShape;
    expect(t.door('a')).toBeNull();
  });

  it('template text writes position and templateRotations', () => {
    const t = setup({ templateRotations: { other: 30 } }, [
      { id: 'h', type: 'text', positionStateKey: 'primaryPosition' },
    ]);
    const door = t.door('h')!;
    expect(door.kind).toBe('template-text');
    expect(door.canFlip).toBe(false);
    expect(door.rotation).toBe(0);
    door.apply({ x: 10, y: 20, rotation: 270 });
    expect(t.state).toMatchObject({
      primaryPosition: { x: 10, y: 20 },
      templateRotations: { other: 30, h: -90 },
    });
    expect(t.saveToHistory).toHaveBeenCalledTimes(1);
  });

  it('template image with offsetKey converts relative to the layout base', () => {
    const t = setup({}, [
      {
        id: 'logo',
        type: 'image',
        x: (_s: unknown, l: LayoutResult) => l.centerX,
        y: 100,
        offsetKey: 'logoOffset',
      },
    ]);
    const door = t.door('logo')!;
    expect(door.kind).toBe('template-image');
    expect(door.canFlip).toBe(false);
    door.apply({ x: 520, y: 130, rotation: 45 });
    expect(t.state).toMatchObject({
      logoOffset: { x: 20, y: 30 },
      templateRotations: { logo: 45 },
    });
  });

  it('two template doors in one batch both land', () => {
    const elements = [
      { id: 'a', type: 'text', positionStateKey: 'pa' },
      { id: 'b', type: 'text', positionStateKey: 'pb' },
    ];
    const t = setup({}, elements);
    const da = t.door('a')!;
    const db = t.door('b')!;
    da.apply({ x: 1, y: 1, rotation: 90 });
    db.apply({ x: 2, y: 2, rotation: 45 });
    expect(t.state).toMatchObject({
      pa: { x: 1, y: 1 },
      pb: { x: 2, y: 2 },
      templateRotations: { a: 90, b: 45 },
    });
  });

  it('returns null for non-rotatable template elements, locked ones and backgrounds', () => {
    const t = setup({ lockedLayerIds: ['l'] }, [
      { id: 'plain', type: 'text' },
      { id: 'bg', type: 'background' },
      { id: 'cover', type: 'image', coverFit: true, positionStateKey: 'p' },
      { id: 'l', type: 'text', positionStateKey: 'p' },
    ]);
    for (const id of ['plain', 'bg', 'cover', 'l']) expect(t.door(id)).toBeNull();
  });
});
