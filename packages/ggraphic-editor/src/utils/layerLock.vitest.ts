// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';

import {
  isLockable,
  isLayerLocked,
  lockedIdsOf,
  lockStateOf,
  toggledLocks,
} from '@ggraphic/editor/utils/layerLock';
import { findElementRemover } from '@ggraphic/editor/utils/removeElement';
import { selectionCapabilities } from '@ggraphic/editor/utils/selectionCapabilities';

import type { BaseCanvasState } from '@ggraphic/editor/configs/factory/baseTypes';
import type { CanvasElementConfig } from '@ggraphic/editor/configs/types';
import type { CanvasItem } from '@ggraphic/editor/utils/canvasLayerManager';

const element = (id: string, extra: Record<string, unknown>): CanvasItem => ({
  id,
  type: 'element',
  data: { id, type: 'text', x: 0, y: 0, ...extra } as unknown as CanvasElementConfig,
});
const shape = (id: string): CanvasItem => ({ id, type: 'shape', data: { id } as never });

describe('isLockable', () => {
  it('sperrt eigene Elemente und ziehbare Vorlagen-Elemente', () => {
    expect(isLockable(shape('s'))).toBe(true);
    expect(isLockable(element('headline', { draggable: true }))).toBe(true);
  });

  it('sperrt keine Hintergrund-Ebene und nichts, was ohnehin feststeht', () => {
    expect(
      isLockable(element('background-image', { type: 'image', order: -1, draggable: true }))
    ).toBe(false);
    expect(
      isLockable(element('background-image', { type: 'image', order: 0, draggable: true }))
    ).toBe(false);
    expect(isLockable(element('bg', { type: 'background' }))).toBe(false);
    expect(isLockable(element('label', { draggable: false }))).toBe(false);
  });
});

describe('lockedIdsOf', () => {
  it('überliest eine gespeicherte Sperre des Hintergrundfotos (früher in headline sperrbar)', () => {
    const state = { lockedLayerIds: ['background-image', 'headline'] };
    expect(lockedIdsOf(state)).toEqual(['headline']);
    expect(isLayerLocked(state, 'background-image')).toBe(false);
    expect(isLayerLocked(state, 'headline')).toBe(true);
  });
});

describe('toggledLocks', () => {
  it('sperrt eine teilweise gesperrte Auswahl ganz', () => {
    expect(lockStateOf(['a'], ['a', 'b'])).toBe('some');
    expect(toggledLocks(['a'], ['a', 'b'])).toEqual(['a', 'b']);
  });

  it('entsperrt eine ganz gesperrte Auswahl und lässt fremde Sperren stehen', () => {
    expect(toggledLocks(['x', 'a', 'b'], ['a', 'b'])).toEqual(['x']);
  });
});

describe('gesperrt', () => {
  const state = {
    shapeInstances: [{ id: 's1' }, { id: 's2' }],
    lockedLayerIds: ['s1'],
  } as unknown as BaseCanvasState;
  const actions = { removeShape: () => {} };

  it('lässt sich nicht löschen — dieselbe Tür für Entf, Pille, Leiste und Menü', () => {
    expect(isLayerLocked(state, 's1')).toBe(true);
    expect(findElementRemover(state, actions, 's1')).toBeNull();
    expect(findElementRemover(state, actions, 's2')).not.toBeNull();
  });

  it('meldet der Leiste, was mit einer gemischten Auswahl geht', () => {
    const caps = selectionCapabilities({
      ids: ['s1', 's2'],
      state,
      actions,
      renderList: [shape('s1'), shape('s2')],
      orient: () => null,
      readOnly: false,
    });
    expect(caps).toMatchObject({ lock: 'some', canLock: true, canDelete: true, canCopy: true });
  });
});
