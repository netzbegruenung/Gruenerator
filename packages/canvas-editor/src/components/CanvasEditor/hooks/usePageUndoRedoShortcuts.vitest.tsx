import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EDITOR_KEY_SHIELD_ATTRIBUTE, usePageUndoRedoShortcuts } from './usePageUndoRedoShortcuts';

function setup() {
  const undoPageOp = vi.fn();
  const redoPageOp = vi.fn();
  renderHook(() =>
    usePageUndoRedoShortcuts({
      activePageCanUndo: false,
      activePageCanRedo: false,
      canUndoPageOp: true,
      canRedoPageOp: true,
      undoPageOp,
      redoPageOp,
    })
  );
  return { undoPageOp, redoPageOp };
}

const press = (target: HTMLElement, init: KeyboardEventInit) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));

const mods = () =>
  navigator.platform.toLowerCase().includes('mac') ? { metaKey: true } : { ctrlKey: true };

afterEach(() => {
  document.body.innerHTML = '';
});

describe('usePageUndoRedoShortcuts', () => {
  it('undoes and redoes page operations from the editor', () => {
    const { undoPageOp, redoPageOp } = setup();
    press(document.body, { key: 'z', ...mods() });
    press(document.body, { key: 'y', ...mods() });
    expect(undoPageOp).toHaveBeenCalledTimes(1);
    expect(redoPageOp).toHaveBeenCalledTimes(1);
  });

  it('ignores keys from a shielded overlay such as the present mode', () => {
    const { undoPageOp, redoPageOp } = setup();
    const overlay = document.createElement('div');
    overlay.setAttribute(EDITOR_KEY_SHIELD_ATTRIBUTE, '');
    overlay.tabIndex = -1;
    const button = document.createElement('button');
    overlay.appendChild(button);
    document.body.appendChild(overlay);

    press(overlay, { key: 'z', ...mods() });
    press(button, { key: 'z', shiftKey: true, ...mods() });
    press(overlay, { key: 'y', ...mods() });
    expect(undoPageOp).not.toHaveBeenCalled();
    expect(redoPageOp).not.toHaveBeenCalled();
  });
});
