import { describe, expect, it } from 'vitest';

import { isLockable, isLayerLocked, lockStateOf, toggledLocks } from './layerLock';
import { findElementRemover } from './removeElement';
import { selectionCapabilities } from './selectionCapabilities';

import type { CanvasItem } from './canvasLayerManager';
import type { BaseCanvasState } from '../configs/factory/baseTypes';
import type { CanvasElementConfig } from '../configs/types';

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
    expect(isLockable(element('bg', { type: 'background' }))).toBe(false);
    expect(isLockable(element('label', { draggable: false }))).toBe(false);
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
