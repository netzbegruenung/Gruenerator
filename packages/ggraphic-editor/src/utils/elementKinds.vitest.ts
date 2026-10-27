// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it, vi } from 'vitest';

import { CARRIED_INSTANCE_KEYS } from '@ggraphic/editor/configs/factory/carryInstanceState';
import { buildCanvasItems } from '@ggraphic/editor/utils/canvasLayerManager';
import { ELEMENT_KINDS } from '@ggraphic/editor/utils/elementKinds';
import { findElementRemover } from '@ggraphic/editor/utils/removeElement';

import type { FullCanvasConfig } from '@ggraphic/editor/configs/types';
import type { OptionalCanvasActions } from '@ggraphic/editor/hooks/useCanvasElementHandlers';

/** One instance of every kind; ids are unique, as `createInstanceId` makes them. */
const STATE = {
  balkenInstances: [{ id: 'b' }],
  selectedIcons: ['i'],
  shapeInstances: [{ id: 's' }],
  frameInstances: [{ id: 'f' }],
  additionalTexts: [{ id: 't' }],
  illustrationInstances: [{ id: 'il' }],
  assetInstances: [{ id: 'a' }],
  circleBadgeInstances: [{ id: 'c' }],
  pillBadgeInstances: [{ id: 'p' }],
  userImageInstances: [{ id: 'u' }],
  chartInstances: [{ id: 'ch' }],
};

describe('element kinds', () => {
  it('stack in a fixed order after the config elements', () => {
    const config = { elements: [{ id: 'el', order: 0 }] } as unknown as FullCanvasConfig;
    const items = buildCanvasItems(config, STATE as never);
    expect(items.map((i) => `${i.type}:${i.id}`)).toEqual([
      'element:el',
      'balken:b',
      'icon:i',
      'shape:s',
      'frame:f',
      'additional-text:t',
      'illustration:il',
      'asset:a',
      'circle-badge:c',
      'pill-badge:p',
      'user-image:u',
      'chart:ch',
    ]);
  });

  it.each([
    ['b', 'removeBalken'],
    ['s', 'removeShape'],
    ['f', 'removeFrame'],
    ['t', 'removeAdditionalText'],
    ['il', 'removeIllustration'],
    ['a', 'removeAsset'],
    ['c', 'removeCircleBadge'],
    ['p', 'removePillBadge'],
    ['u', 'removeUserImage'],
    ['ch', 'removeChart'],
  ] as const)('delete %s through %s', (id, action) => {
    const remove = vi.fn();
    findElementRemover(STATE as never, { [action]: remove }, id)?.();
    expect(remove).toHaveBeenCalledWith(id);
  });

  it('deletes an icon by switching it off', () => {
    const toggleIcon = vi.fn();
    findElementRemover(STATE as never, { toggleIcon } as OptionalCanvasActions, 'i')?.();
    expect(toggleIcon).toHaveBeenCalledWith('i', false);
  });

  it('are all carried across a re-seed, icons with their states', () => {
    // A kind missing here would lose its elements on the next remote re-seed.
    const carried: readonly string[] = CARRIED_INSTANCE_KEYS;
    for (const { stateKey } of ELEMENT_KINDS) expect(carried).toContain(stateKey);
    expect(carried).toContain('iconStates');
  });

  it('offers no delete when the kind has no remove action, or the id is unknown', () => {
    expect(findElementRemover(STATE as never, {}, 's')).toBeNull();
    expect(findElementRemover(STATE as never, { removeShape: vi.fn() }, 'x')).toBeNull();
  });
});
