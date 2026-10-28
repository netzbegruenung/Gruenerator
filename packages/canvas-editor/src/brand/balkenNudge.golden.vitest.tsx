/**
 * The arrow keys move a selected Balken by its `offset`, through
 * `updateBalken`, pinned from the time the kind lived in the core (see
 * `balkenKind.golden.vitest.ts`).
 */
import { useCanvasKeyboardHandlers } from '@ggraphic/editor/hooks/useCanvasKeyboardHandlers';
import { createCanvasEditorStore } from '@ggraphic/editor/stores/createCanvasEditorStore';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const press = (key: string, shiftKey = false) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, cancelable: true }));

function setup(offset: { x: number; y: number } | undefined, locked = false) {
  const store = createCanvasEditorStore();
  store.getState().setSelectedElement('balken-1');
  const actions = { updateBalken: vi.fn() };
  const state = {
    balkenInstances: [{ id: 'balken-1', mode: 'single', texts: ['A'], offset }],
    ...(locked ? { lockedLayerIds: ['balken-1'] } : {}),
  };
  const hook = renderHook(() =>
    useCanvasKeyboardHandlers({
      store,
      state: state as never,
      actions,
      setState: () => {},
      setSelectedElement: (id) => store.getState().setSelectedElement(id),
      commands: {} as never,
    })
  );
  return { actions, hook };
}

describe('balken nudge', () => {
  let unmount: (() => void) | null = null;
  afterEach(() => unmount?.());

  it('moves the offset by 1, with Shift by 10', () => {
    const { actions, hook } = setup({ x: 3, y: 4 });
    unmount = hook.unmount;
    press('ArrowRight');
    press('ArrowUp', true);
    expect(actions.updateBalken.mock.calls).toEqual([
      ['balken-1', { offset: { x: 4, y: 4 } }],
      ['balken-1', { offset: { x: 3, y: -6 } }],
    ]);
  });

  it('starts from 0/0 without a stored offset', () => {
    const { actions, hook } = setup(undefined);
    unmount = hook.unmount;
    press('ArrowLeft');
    expect(actions.updateBalken.mock.calls).toEqual([['balken-1', { offset: { x: -1, y: 0 } }]]);
  });

  it('leaves a locked balken', () => {
    const { actions, hook } = setup({ x: 0, y: 0 }, true);
    unmount = hook.unmount;
    press('ArrowDown');
    expect(actions.updateBalken).not.toHaveBeenCalled();
  });
});
